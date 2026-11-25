import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import {
  BARK_NOTIFICATION_ICON_URL,
  buildBarkCiphertextRequest,
  buildBarkNotificationRequestUrl,
  isPublicBarkIpAddress,
  validateBarkConfig,
  type BarkPushOptions,
} from '../../../src/utils/barkPush';
import { DEFAULT_BARK_REQUEST_TIMEOUT_MS } from '../../../src/utils/barkSettings';

export type DnsAddressLookup = (hostname: string) => Promise<Array<{ address: string }>>;

export interface ValidatedBarkAddress {
  address: string;
  family: 4 | 6;
}

export type HttpsRequestFn = typeof https.request;

const MAX_BARK_RESPONSE_BYTES = 64 * 1024;

export const defaultDnsLookup: DnsAddressLookup = async (hostname: string) =>
  dnsLookup(hostname, { all: true, verbatim: true });

const normalizeHostLiteral = (hostname: string): string =>
  hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');

const parseValidatedPublicAddress = (rawAddress: string): ValidatedBarkAddress | null => {
  const normalized = normalizeHostLiteral(rawAddress);
  if (!isPublicBarkIpAddress(normalized)) {
    return null;
  }
  const family = isIP(normalized);
  if (family !== 4 && family !== 6) {
    return null;
  }
  return { address: normalized, family };
};

export async function resolveValidatedBarkAddresses(
  serverUrl: string,
  resolveAddresses: DnsAddressLookup = defaultDnsLookup
): Promise<{ hostname: string; addresses: ValidatedBarkAddress[] } | null> {
  let rawHostname: string;
  try {
    rawHostname = new URL(serverUrl.trim()).hostname;
  } catch {
    return null;
  }

  const normalizedHost = normalizeHostLiteral(rawHostname);
  const literalAddress = parseValidatedPublicAddress(normalizedHost);
  if (literalAddress) {
    return { hostname: normalizedHost, addresses: [literalAddress] };
  }

  let records: Array<{ address: string }>;
  try {
    records = await resolveAddresses(rawHostname);
  } catch (error) {
    console.error(`[Scheduled Notifications] Failed to resolve Bark server host ${rawHostname}:`, error);
    return null;
  }

  if (!Array.isArray(records) || records.length === 0) {
    console.error(`[Scheduled Notifications] Blocked Bark server host with empty DNS response: ${rawHostname}`);
    return null;
  }

  const validated: ValidatedBarkAddress[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const parsed = parseValidatedPublicAddress(record.address);
    if (!parsed) {
      console.error(`[Scheduled Notifications] Blocked Bark server host resolving to non-public IP: ${rawHostname}`);
      return null;
    }
    if (!seen.has(parsed.address)) {
      seen.add(parsed.address);
      validated.push(parsed);
    }
  }

  return { hostname: normalizedHost, addresses: validated };
}

/**
 * Returns a socket lookup function pinned exclusively to already-validated public IP
 * addresses so Node never performs a second DNS lookup susceptible to DNS rebinding.
 */
export function createPinnedLookup(
  expectedHostname: string,
  addresses: readonly ValidatedBarkAddress[]
): LookupFunction {
  const expectedNormalized = normalizeHostLiteral(expectedHostname);

  return (hostname, options, callback) => {
    const cb = (typeof options === 'function' ? options : callback) as (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number
    ) => void;
    const opts: LookupOptions = typeof options === 'object' && options !== null ? options : {};

    if (normalizeHostLiteral(hostname) !== expectedNormalized) {
      const err = new Error(
        `Blocked unexpected DNS lookup for ${hostname} (expected ${expectedNormalized})`
      ) as NodeJS.ErrnoException;
      err.code = 'ERR_BARK_HOST_MISMATCH';
      queueMicrotask(() => cb(err, ''));
      return;
    }

    const requestedFamily = opts.family === 4 || opts.family === 6 ? opts.family : 0;
    const matching = requestedFamily
      ? addresses.filter(entry => entry.family === requestedFamily)
      : addresses;

    if (matching.length === 0) {
      const err = new Error(
        `No validated public IP matches requested address family for ${expectedNormalized}`
      ) as NodeJS.ErrnoException;
      err.code = 'ENOTFOUND';
      queueMicrotask(() => cb(err, ''));
      return;
    }

    if (opts.all) {
      const result: LookupAddress[] = matching.map(entry => ({
        address: entry.address,
        family: entry.family,
      }));
      queueMicrotask(() => cb(null, result));
      return;
    }

    const chosen = matching[0];
    queueMicrotask(() => cb(null, chosen.address, chosen.family));
  };
}

export async function dispatchPinnedBarkHttpsRequest(params: {
  url: URL;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  addresses: readonly ValidatedBarkAddress[];
  timeoutMs?: number;
  requestImpl?: HttpsRequestFn;
  logLabel?: string;
}): Promise<boolean> {
  const {
    url,
    method,
    headers = {},
    body,
    addresses,
    timeoutMs = DEFAULT_BARK_REQUEST_TIMEOUT_MS,
    requestImpl = https.request,
    logLabel = 'Bark push',
  } = params;

  if (url.protocol !== 'https:' || addresses.length === 0) {
    return false;
  }

  const normalizedHost = normalizeHostLiteral(url.hostname);
  const pinnedLookup = createPinnedLookup(normalizedHost, addresses);
  const bodyBuffer = body !== undefined ? Buffer.from(body, 'utf8') : undefined;

  const requestHeaders: Record<string, string> = {
    Connection: 'close',
    ...headers,
    ...(bodyBuffer !== undefined ? { 'Content-Length': String(bodyBuffer.byteLength) } : {}),
  };

  return new Promise<boolean>(resolve => {
    let settled = false;
    let timedOut = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(ok);
    };

    const requestOptions: https.RequestOptions = {
      method,
      headers: requestHeaders,
      agent: false,
      lookup: pinnedLookup,
      rejectUnauthorized: true,
      ...(isIP(normalizedHost) === 0 ? { servername: normalizedHost } : {}),
    };

    const req = requestImpl(url, requestOptions, res => {
      const statusCode = res.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        res.resume();
        console.error(`${logLabel} failed:`, statusCode, res.statusMessage || '');
        finish(false);
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;

      res.on('data', (chunk: Buffer | string) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.byteLength;
        if (totalBytes > MAX_BARK_RESPONSE_BYTES) {
          res.destroy(new Error(`${logLabel} response exceeded ${MAX_BARK_RESPONSE_BYTES} bytes`));
          return;
        }
        chunks.push(buf);
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            code?: unknown;
            message?: unknown;
          };
          if (parsed.code === 200) {
            finish(true);
            return;
          }
          console.error(`${logLabel} failed:`, parsed.message);
          finish(false);
        } catch (error) {
          console.error(`${logLabel} invalid JSON response:`, error);
          finish(false);
        }
      });

      res.on('error', error => {
        console.error(`${logLabel} response error:`, error);
        finish(false);
      });
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      req.destroy(new Error(`${logLabel} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on('error', error => {
      if (timedOut) {
        console.error(`${logLabel} timed out after ${timeoutMs}ms`);
      } else {
        console.error(`${logLabel} error:`, error);
      }
      finish(false);
    });

    if (bodyBuffer !== undefined) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

export async function sendPinnedBarkNotification(
  serverUrl: string,
  deviceKey: string,
  title: string,
  body: string,
  addresses: readonly ValidatedBarkAddress[],
  options?: BarkPushOptions,
  timeoutMs: number = DEFAULT_BARK_REQUEST_TIMEOUT_MS,
  requestImpl: HttpsRequestFn = https.request
): Promise<boolean> {
  const validation = validateBarkConfig(serverUrl, deviceKey);
  if (!validation.valid) {
    console.error('Bark: Invalid configuration:', validation.error);
    return false;
  }

  const { url } = buildBarkNotificationRequestUrl(serverUrl, deviceKey, title, body, options);
  return dispatchPinnedBarkHttpsRequest({
    url,
    method: 'GET',
    addresses,
    timeoutMs,
    requestImpl,
    logLabel: 'Bark push',
  });
}

export async function sendPinnedBarkCiphertextNotification(
  serverUrl: string,
  deviceKey: string,
  ciphertext: string,
  iv: string,
  addresses: readonly ValidatedBarkAddress[],
  iconUrl: string = BARK_NOTIFICATION_ICON_URL,
  timeoutMs: number = DEFAULT_BARK_REQUEST_TIMEOUT_MS,
  requestImpl: HttpsRequestFn = https.request
): Promise<boolean> {
  const validation = validateBarkConfig(serverUrl, deviceKey);
  if (!validation.valid) {
    console.error('Bark: Invalid configuration:', validation.error);
    return false;
  }
  if (!ciphertext || !iv || !/^[A-Za-z0-9]{16}$/.test(iv)) {
    console.error('Bark: Invalid encrypted payload or IV');
    return false;
  }

  const { url, body } = buildBarkCiphertextRequest(serverUrl, deviceKey, ciphertext, iv, iconUrl);
  return dispatchPinnedBarkHttpsRequest({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
    addresses,
    timeoutMs,
    requestImpl,
    logLabel: 'Bark encrypted push',
  });
}
