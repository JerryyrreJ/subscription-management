#!/usr/bin/env node
// MCP server for the SteadyRenew public API (with local zero-knowledge E2EE support).
//
// Single source of truth: it loads docs-site/api/ai-tools.json (or an embedded
// copy in the single-file bundle) and exposes every tool over the Model Context
// Protocol.
//
// Required environment:
//   SUBSCRIPTION_MANAGER_BASE_URL   e.g. https://steadyrenew.com
//   SUBSCRIPTION_MANAGER_API_KEY    a key minted in Settings -> API & MCP (subm_...)
// Optional:
//   SUBSCRIPTION_MANAGER_VAULT_KEY  local E2EE vault key (`vk1_...`). When provided
//                                   (or appended as `#vk1_...` on API_KEY), encryption
//                                   and decryption run 100% locally in this Node process
//                                   against `/api/v1/vault/*`; the vault key is never
//                                   transmitted over HTTP.
//   SUBSCRIPTION_MANAGER_TOOLS_SCHEMA   path to an ai-tools.json override

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { webcrypto, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rawBaseUrl = process.env.SUBSCRIPTION_MANAGER_BASE_URL;
const rawApiKey = process.env.SUBSCRIPTION_MANAGER_API_KEY;
const rawVaultKeyEnv = process.env.SUBSCRIPTION_MANAGER_VAULT_KEY;

if (!rawBaseUrl || !rawApiKey) {
  console.error(
    'Missing configuration. Set SUBSCRIPTION_MANAGER_BASE_URL and SUBSCRIPTION_MANAGER_API_KEY.'
  );
  process.exit(1);
}

// Support local fragment syntax `subm_<id>.<secret>#vk1_<vaultKey>` and defensively strip
// `.vk1_<vaultKey>` if a remote bridge key is pasted into SUBSCRIPTION_MANAGER_API_KEY,
// so the local stdio MCP server NEVER transmits the raw vault DEK over HTTP Authorization.
let apiKey = rawApiKey.trim();
let extractedVaultKey = '';
const hashSplitIndex = apiKey.indexOf('#');
if (hashSplitIndex !== -1) {
  extractedVaultKey = apiKey.slice(hashSplitIndex + 1).trim();
  apiKey = apiKey.slice(0, hashSplitIndex).trim();
} else {
  const dotVaultIndex = apiKey.indexOf('.vk1_');
  if (dotVaultIndex !== -1) {
    extractedVaultKey = apiKey.slice(dotVaultIndex + 1).trim();
    apiKey = apiKey.slice(0, dotVaultIndex).trim();
  }
}
const localVaultKeyToken = rawVaultKeyEnv?.trim() || extractedVaultKey;

const loadSchemaAndVersion = () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, '..', 'package.json');
  let version = globalThis.__STEADYRENEW_MCP_VERSION__ || '0.2.0';
  if (!globalThis.__STEADYRENEW_MCP_VERSION__ && existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg?.name === 'subscription-manager-mcp' && typeof pkg.version === 'string') {
        version = pkg.version;
      }
    } catch {
      // Fall back to default version when running outside package layout.
    }
  }

  if (process.env.SUBSCRIPTION_MANAGER_TOOLS_SCHEMA) {
    return {
      schema: JSON.parse(readFileSync(process.env.SUBSCRIPTION_MANAGER_TOOLS_SCHEMA, 'utf8')),
      version,
    };
  }

  if (globalThis.__STEADYRENEW_AI_TOOLS_SCHEMA__) {
    return {
      schema: globalThis.__STEADYRENEW_AI_TOOLS_SCHEMA__,
      version,
    };
  }

  const bundledSchemaPath = join(here, '..', 'schema', 'ai-tools.json');
  const schemaPath = existsSync(bundledSchemaPath)
    ? bundledSchemaPath
    : join(here, '..', '..', 'docs-site', 'api', 'ai-tools.json');

  return {
    schema: JSON.parse(readFileSync(schemaPath, 'utf8')),
    version,
  };
};

const { schema, version: serverVersion } = loadSchemaAndVersion();
const defs = schema.$defs ?? {};

let normalizedBase;
try {
  const url = new URL(rawBaseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Expected an HTTPS site origin (HTTP is allowed for localhost).');
  }
  normalizedBase = url.origin;
} catch {
  console.error(
    'Invalid SUBSCRIPTION_MANAGER_BASE_URL. Use the HTTPS site origin without /api/v1; HTTP is allowed for localhost.'
  );
  process.exit(1);
}

// --- Local Zero-Knowledge AES-256-GCM Helpers (Node WebCrypto) ---------------
const subtle = webcrypto.subtle;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const DEK_SUBKEY_SALT = textEncoder.encode('steadyrenew-e2ee-dek-subkey-v1');
const DEK_AEAD_SUBKEY_INFO = textEncoder.encode('steadyrenew-e2ee-aead-v1');
const DEK_PUSH_HMAC_SUBKEY_INFO = textEncoder.encode('steadyrenew-e2ee-push-hmac-v1');

const decodeVaultKey = (token) => {
  const payload = token.startsWith('vk1_') ? token.slice(4) : token;
  const bytes = Buffer.from(payload, 'base64url');
  if (bytes.byteLength !== 32 || !bytes.some(byte => byte !== 0)) {
    throw new Error('SUBSCRIPTION_MANAGER_VAULT_KEY must decode to 32 non-zero bytes.');
  }
  return new Uint8Array(bytes);
};

const deriveLocalDekBaseKey = async (dekBytes) =>
  subtle.importKey('raw', dekBytes, 'HKDF', false, ['deriveKey']);

const deriveLocalAeadKey = async (dekBytes) => {
  const baseKey = await deriveLocalDekBaseKey(dekBytes);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: DEK_SUBKEY_SALT, info: DEK_AEAD_SUBKEY_INFO },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const sealLocalJson = async (dek, value, aadParts) => {
  const nonce = webcrypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(value));
  const aad = textEncoder.encode(JSON.stringify(aadParts));
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 },
    dek,
    plaintext
  );
  return {
    version: 1,
    nonce: Buffer.from(nonce).toString('base64'),
    ciphertext: Buffer.from(ciphertext).toString('base64'),
  };
};

const openLocalJson = async (dek, envelope, aadParts) => {
  const nonce = new Uint8Array(Buffer.from(envelope.nonce, 'base64'));
  const ciphertext = new Uint8Array(Buffer.from(envelope.ciphertext, 'base64'));
  const aad = textEncoder.encode(JSON.stringify(aadParts));
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 },
    dek,
    ciphertext
  );
  return JSON.parse(textDecoder.decode(new Uint8Array(decrypted)));
};

const computePushSubHash = async (dekBytes, subId) => {
  const baseKey = await deriveLocalDekBaseKey(dekBytes);
  const hmacKey = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: DEK_SUBKEY_SALT, info: DEK_PUSH_HMAC_SUBKEY_INFO },
    baseKey,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign']
  );
  const sig = await subtle.sign('HMAC', hmacKey, textEncoder.encode(`push-sub:v1:${subId}`));
  return Buffer.from(sig).toString('hex');
};

const formatDateUtc = (d) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

const parseDateUtc = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const addPeriodUtc = (dateStr, period, customDate, anchorDay) => {
  const dt = parseDateUtc(dateStr);
  const anchor = anchorDay || dt.getUTCDate();
  if (period === 'monthly') {
    const nextMonth = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1));
    const maxDay = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate();
    return formatDateUtc(new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), Math.min(anchor, maxDay))));
  }
  if (period === 'yearly') {
    const maxDay = new Date(Date.UTC(dt.getUTCFullYear() + 1, dt.getUTCMonth() + 1, 0)).getUTCDate();
    return formatDateUtc(new Date(Date.UTC(dt.getUTCFullYear() + 1, dt.getUTCMonth(), Math.min(anchor, maxDay))));
  }
  const days = Math.max(1, parseInt(customDate || '30', 10) || 30);
  const next = new Date(dt.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return formatDateUtc(next);
};

const subPeriodUtc = (dateStr, period, customDate, anchorDay) => {
  const dt = parseDateUtc(dateStr);
  const anchor = anchorDay || dt.getUTCDate();
  if (period === 'monthly') {
    const prevMonth = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() - 1, 1));
    const maxDay = new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth() + 1, 0)).getUTCDate();
    return formatDateUtc(new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth(), Math.min(anchor, maxDay))));
  }
  if (period === 'yearly') {
    const maxDay = new Date(Date.UTC(dt.getUTCFullYear() - 1, dt.getUTCMonth() + 1, 0)).getUTCDate();
    return formatDateUtc(new Date(Date.UTC(dt.getUTCFullYear() - 1, dt.getUTCMonth(), Math.min(anchor, maxDay))));
  }
  const days = Math.max(1, parseInt(customDate || '30', 10) || 30);
  const prev = new Date(dt.getTime());
  prev.setUTCDate(prev.getUTCDate() - days);
  return formatDateUtc(prev);
};

const resolveEffectiveSubscription = (id, content, createdAt, updatedAt) => {
  const today = formatDateUtc(new Date());
  const isTrial = Boolean(content.isTrial);
  const status = content.status || 'active';
  let nextDate = isTrial ? (content.trialEndsOn || content.nextPaymentDate) : content.nextPaymentDate;
  const anchor = content.period === 'monthly' ? (content.billingAnchorDay || parseDateUtc(nextDate).getUTCDate()) : null;

  if (!isTrial && status === 'active') {
    while (nextDate < today) {
      const adv = addPeriodUtc(nextDate, content.period, content.customDate, anchor);
      if (adv === nextDate) break;
      nextDate = adv;
    }
  }
  const lastDate = subPeriodUtc(nextDate, content.period, content.customDate, anchor);
  return {
    id,
    name: content.name,
    category: content.category,
    amount: Number(content.amount),
    currency: content.currency,
    period: content.period,
    lastPaymentDate: lastDate,
    nextPaymentDate: nextDate,
    ...(anchor ? { billingAnchorDay: anchor } : {}),
    ...(content.customDate ? { customDate: content.customDate } : {}),
    notificationEnabled: content.notificationEnabled !== false,
    isTrial,
    ...(isTrial ? { trialEndsOn: content.trialEndsOn || nextDate } : {}),
    status,
    createdAt,
    updatedAt,
  };
};

let cachedLocalVaultContext = null;

const getLocalVaultContext = async () => {
  if (!localVaultKeyToken) return null;
  if (cachedLocalVaultContext) return cachedLocalVaultContext;

  const dekBytes = decodeVaultKey(localVaultKeyToken);
  const dek = await deriveLocalAeadKey(dekBytes);

  const res = await fetch(`${normalizedBase}/api/v1/vault/state`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(
      `Refusing to fall back to plaintext: /api/v1/vault/state returned HTTP ${res.status}.`
    );
  }
  const state = await res.json();
  if (!state?.enabled || !state?.account) {
    throw new Error(
      'Refusing to fall back to plaintext: SUBSCRIPTION_MANAGER_VAULT_KEY is configured, but the server reports end-to-end encryption is disabled. Remove SUBSCRIPTION_MANAGER_VAULT_KEY only if you intentionally disabled encryption.'
    );
  }

  const check = await openLocalJson(dek, state.account.dekCheck, [
    'e2ee-dek-check',
    1,
    state.account.userId,
    state.account.keyEpoch,
  ]);
  if (check?.purpose !== 'dek-check' || check?.userId !== state.account.userId) {
    throw new Error('Local SUBSCRIPTION_MANAGER_VAULT_KEY does not match this encrypted account.');
  }

  cachedLocalVaultContext = {
    userId: state.account.userId,
    keyEpoch: state.account.keyEpoch,
    dek,
    dekBytes,
  };
  return cachedLocalVaultContext;
};

const fetchVaultJson = async (method, path, body) => {
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${normalizedBase}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, json: text ? JSON.parse(text) : null };
};

const executeLocalE2eeTool = async (tool, args, vaultCtx) => {
  const loadAllDecrypted = async () => {
    const resp = await fetchVaultJson('GET', '/api/v1/vault/subscriptions');
    if (!resp.ok) return { errorResp: resp };
    const items = [];
    for (const row of resp.json.data ?? []) {
      const content = await openLocalJson(vaultCtx.dek, row.envelope, [
        'e2ee-subscription',
        1,
        vaultCtx.userId,
        row.id,
        vaultCtx.keyEpoch,
      ]);
      items.push({
        raw: content,
        resolved: resolveEffectiveSubscription(row.id, content, row.createdAt, row.updatedAt),
      });
    }
    return { items };
  };

  if (tool.name === 'list_subscriptions') {
    const loaded = await loadAllDecrypted();
    if (loaded.errorResp) return loaded.errorResp;
    let list = loaded.items.map(x => x.resolved);
    if (args.status) list = list.filter(s => s.status === args.status);
    if (args.category) list = list.filter(s => s.category === args.category);
    if (args.period) list = list.filter(s => s.period === args.period);
    if (args.isTrial !== undefined) list = list.filter(s => Boolean(s.isTrial) === Boolean(args.isTrial));
    if (args.q) {
      const q = String(args.q).toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }
    if (args.expiringBefore) {
      list = list.filter(s => s.nextPaymentDate <= String(args.expiringBefore));
    }
    const limit = Math.min(100, Math.max(1, Number(args.limit ?? 50)));
    const offset = Math.max(0, Number(args.offset ?? 0));
    const hasMore = list.length > offset + limit;
    const data = list.slice(offset, offset + limit);
    return { ok: true, status: 200, text: JSON.stringify({ data, pagination: { limit, offset, hasMore } }) };
  }

  if (tool.name === 'get_subscription') {
    const resp = await fetchVaultJson('GET', `/api/v1/vault/subscriptions/${encodeURIComponent(args.id)}`);
    if (!resp.ok) return resp;
    const row = resp.json.data;
    const content = await openLocalJson(vaultCtx.dek, row.envelope, [
      'e2ee-subscription',
      1,
      vaultCtx.userId,
      row.id,
      vaultCtx.keyEpoch,
    ]);
    const resolved = resolveEffectiveSubscription(row.id, content, row.createdAt, row.updatedAt);
    return { ok: true, status: 200, text: JSON.stringify({ data: resolved }) };
  }

  if (tool.name === 'create_subscription') {
    const id = randomUUID();
    const isTrial = Boolean(args.isTrial);
    const nextPaymentDate = args.nextPaymentDate || args.trialEndsOn;
    const period = args.period || 'monthly';
    const billingAnchorDay = period === 'monthly'
      ? (args.billingAnchorDay ?? parseDateUtc(nextPaymentDate).getUTCDate())
      : null;
    const content = {
      name: String(args.name),
      category: String(args.category || 'Other'),
      amount: Number(args.amount),
      currency: String(args.currency || 'USD').toUpperCase(),
      period,
      lastPaymentDate: subPeriodUtc(nextPaymentDate, period, args.customDate, billingAnchorDay),
      nextPaymentDate,
      billingAnchorDay,
      ...(args.customDate ? { customDate: String(args.customDate) } : {}),
      notificationEnabled: args.notificationEnabled !== false,
      isTrial,
      ...(isTrial ? { trialEndsOn: args.trialEndsOn || nextPaymentDate } : {}),
      status: 'active',
    };
    const envelope = await sealLocalJson(vaultCtx.dek, content, [
      'e2ee-subscription',
      1,
      vaultCtx.userId,
      id,
      vaultCtx.keyEpoch,
    ]);
    const preview = resolveEffectiveSubscription(id, content, new Date().toISOString(), new Date().toISOString());
    const auditId = randomUUID();
    const auditEnvelope = await sealLocalJson(vaultCtx.dek, { after: preview }, [
      'e2ee-audit',
      1,
      vaultCtx.userId,
      auditId,
      vaultCtx.keyEpoch,
    ]);
    const subscriptionHash = await computePushSubHash(vaultCtx.dekBytes, id);

    const resp = await fetchVaultJson('POST', '/api/v1/vault/subscriptions', {
      id,
      envelope,
      auditId,
      auditEnvelope,
      subscriptionHash,
    });
    if (!resp.ok) return resp;
    const row = resp.json.data;
    return {
      ok: true,
      status: 201,
      text: JSON.stringify({ data: resolveEffectiveSubscription(row.id, content, row.createdAt, row.updatedAt) }),
    };
  }

  if (tool.name === 'update_subscription') {
    const id = String(args.id);
    const existingResp = await fetchVaultJson('GET', `/api/v1/vault/subscriptions/${encodeURIComponent(id)}`);
    if (!existingResp.ok) return existingResp;
    const existingRow = existingResp.json.data;
    const beforeContent = await openLocalJson(vaultCtx.dek, existingRow.envelope, [
      'e2ee-subscription',
      1,
      vaultCtx.userId,
      id,
      vaultCtx.keyEpoch,
    ]);
    const patch = args.patch && typeof args.patch === 'object' ? args.patch : (() => {
      const copy = { ...args };
      delete copy.id;
      return copy;
    })();
    const merged = { ...beforeContent, ...patch };
    if (merged.period === 'monthly') {
      merged.billingAnchorDay = patch.billingAnchorDay ?? merged.billingAnchorDay ?? parseDateUtc(merged.nextPaymentDate).getUTCDate();
    } else {
      merged.billingAnchorDay = null;
    }
    merged.lastPaymentDate = subPeriodUtc(merged.nextPaymentDate, merged.period, merged.customDate, merged.billingAnchorDay);

    const envelope = await sealLocalJson(vaultCtx.dek, merged, [
      'e2ee-subscription',
      1,
      vaultCtx.userId,
      id,
      vaultCtx.keyEpoch,
    ]);
    const beforeResolved = resolveEffectiveSubscription(id, beforeContent, existingRow.createdAt, existingRow.updatedAt);
    const afterPreview = resolveEffectiveSubscription(id, merged, existingRow.createdAt, new Date().toISOString());
    const auditId = randomUUID();
    const auditEnvelope = await sealLocalJson(
      vaultCtx.dek,
      { before: beforeResolved, after: afterPreview, patch },
      ['e2ee-audit', 1, vaultCtx.userId, auditId, vaultCtx.keyEpoch]
    );
    const subscriptionHash = await computePushSubHash(vaultCtx.dekBytes, id);
    const shouldClearPushSchedules =
      merged.notificationEnabled === false || (merged.status && merged.status !== 'active');

    const resp = await fetchVaultJson('PATCH', `/api/v1/vault/subscriptions/${encodeURIComponent(id)}`, {
      envelope,
      auditId,
      auditEnvelope,
      subscriptionHash,
      ...(shouldClearPushSchedules ? { pushSchedules: [] } : {}),
    });
    if (!resp.ok) return resp;
    const row = resp.json.data;
    return {
      ok: true,
      status: 200,
      text: JSON.stringify({ data: resolveEffectiveSubscription(row.id, merged, row.createdAt, row.updatedAt) }),
    };
  }

  if (tool.name === 'delete_subscription') {
    const id = String(args.id);
    const existingResp = await fetchVaultJson('GET', `/api/v1/vault/subscriptions/${encodeURIComponent(id)}`);
    if (!existingResp.ok) return existingResp;
    const existingRow = existingResp.json.data;
    const beforeContent = await openLocalJson(vaultCtx.dek, existingRow.envelope, [
      'e2ee-subscription',
      1,
      vaultCtx.userId,
      id,
      vaultCtx.keyEpoch,
    ]);
    const beforeResolved = resolveEffectiveSubscription(id, beforeContent, existingRow.createdAt, existingRow.updatedAt);
    const auditId = randomUUID();
    const auditEnvelope = await sealLocalJson(
      vaultCtx.dek,
      { before: beforeResolved },
      ['e2ee-audit', 1, vaultCtx.userId, auditId, vaultCtx.keyEpoch]
    );
    const subscriptionHash = await computePushSubHash(vaultCtx.dekBytes, id);

    const resp = await fetchVaultJson('DELETE', `/api/v1/vault/subscriptions/${encodeURIComponent(id)}`, {
      auditId,
      auditEnvelope,
      subscriptionHash,
    });
    if (!resp.ok) return resp;
    return { ok: true, status: 200, text: JSON.stringify({ deleted: true }) };
  }

  if (
    tool.name === 'get_spend_summary'
    || tool.name === 'find_duplicate_subscriptions'
    || tool.name === 'get_optimization_suggestions'
  ) {
    const loaded = await loadAllDecrypted();
    if (loaded.errorResp) return loaded.errorResp;
    const active = loaded.items.map(x => x.resolved).filter(s => s.status === 'active');

    if (tool.name === 'get_spend_summary') {
      const allSubs = loaded.items.map(x => x.resolved);
      const horizonDays = Math.min(365, Math.max(1, Number(args.horizonDays ?? 30)));
      const horizonDate = new Date();
      horizonDate.setUTCDate(horizonDate.getUTCDate() + horizonDays);
      const horizonStr = formatDateUtc(horizonDate);
      const currencyMap = new Map();
      const categoryMap = new Map();
      const upcomingRenewals = [];
      for (const s of active) {
        if (!s.isTrial) {
          const monthlyEq =
            s.period === 'monthly'
              ? s.amount
              : s.period === 'yearly'
                ? s.amount / 12
                : (s.amount * 30) / Math.max(1, parseInt(s.customDate || '30', 10) || 30);
          const cBucket = currencyMap.get(s.currency) || {
            currency: s.currency,
            activeSubscriptions: 0,
            monthlyTotal: 0,
            yearlyTotal: 0,
          };
          cBucket.activeSubscriptions += 1;
          cBucket.monthlyTotal = Number((cBucket.monthlyTotal + monthlyEq).toFixed(2));
          cBucket.yearlyTotal = Number((cBucket.yearlyTotal + monthlyEq * 12).toFixed(2));
          currencyMap.set(s.currency, cBucket);

          const catBucket = categoryMap.get(s.category) || {
            category: s.category,
            activeSubscriptions: 0,
            monthlyTotalsByCurrency: {},
          };
          catBucket.activeSubscriptions += 1;
          catBucket.monthlyTotalsByCurrency[s.currency] = Number(
            ((catBucket.monthlyTotalsByCurrency[s.currency] || 0) + monthlyEq).toFixed(2)
          );
          categoryMap.set(s.category, catBucket);
        }
        if (s.nextPaymentDate <= horizonStr) {
          upcomingRenewals.push(s);
        }
      }
      return {
        ok: true,
        status: 200,
        text: JSON.stringify({
          summary: {
            asOf: formatDateUtc(new Date()),
            horizonDays,
            counts: {
              total: allSubs.length,
              active: active.filter(s => !s.isTrial).length,
              trials: active.filter(s => s.isTrial).length,
              paused: allSubs.filter(s => s.status === 'paused').length,
              cancelled: allSubs.filter(s => s.status === 'cancelled').length,
            },
            byCurrency: [...currencyMap.values()],
            byCategory: [...categoryMap.values()],
            upcomingRenewals,
          },
        }),
      };
    }

    if (tool.name === 'find_duplicate_subscriptions') {
      const byKey = new Map();
      for (const s of active) {
        const norm = s.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
        const list = byKey.get(norm) || [];
        list.push(s);
        byKey.set(norm, list);
      }
      const duplicates = [...byKey.values()].filter(group => group.length > 1);
      return { ok: true, status: 200, text: JSON.stringify({ duplicates }) };
    }

    const optimizations = active
      .filter(s => s.period === 'monthly' && !s.isTrial)
      .map(s => ({
        subscriptionId: s.id,
        name: s.name,
        suggestion: 'Consider checking if an annual plan offers a discount.',
        currentPeriod: s.period,
        amount: s.amount,
        currency: s.currency,
      }));
    return { ok: true, status: 200, text: JSON.stringify({ optimizations }) };
  }

  if (tool.name === 'list_audit_log') {
    const qs = new URLSearchParams();
    if (args.limit !== undefined) qs.set('limit', String(args.limit));
    if (args.offset !== undefined) qs.set('offset', String(args.offset));
    if (args.subscriptionId) qs.set('subscriptionId', String(args.subscriptionId));
    const resp = await fetchVaultJson('GET', `/api/v1/vault/audit${qs.toString() ? `?${qs.toString()}` : ''}`);
    if (!resp.ok) return resp;
    const entries = [];
    for (const row of resp.json.data ?? []) {
      const metadata = await openLocalJson(vaultCtx.dek, row.envelope, [
        'e2ee-audit',
        1,
        vaultCtx.userId,
        row.id,
        vaultCtx.keyEpoch,
      ]);
      entries.push({
        id: row.id,
        action: row.action,
        subscriptionId: row.subscriptionId,
        apiKeyId: row.apiKeyId,
        requestId: row.requestId,
        metadata,
        createdAt: row.createdAt,
      });
    }
    return {
      ok: true,
      status: 200,
      text: JSON.stringify({ data: entries, pagination: resp.json.pagination }),
    };
  }

  return null;
};

// Recursively inline #/$defs/* references so every tool inputSchema is a clean,
// self-contained JSON Schema object without carrying redundant $defs payloads.
const inlineSchemaRefs = (node, seen = new Set()) => {
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => inlineSchemaRefs(item, seen));
  }
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/$defs/')) {
    const defName = node.$ref.slice('#/$defs/'.length);
    if (seen.has(defName) || !defs[defName]) {
      return { type: 'object' };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(defName);
    const resolved = inlineSchemaRefs(defs[defName], nextSeen);
    const siblings = { ...node };
    delete siblings.$ref;
    return { ...resolved, ...inlineSchemaRefs(siblings, nextSeen) };
  }
  const output = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$defs') continue;
    output[key] = inlineSchemaRefs(value, seen);
  }
  return output;
};

const buildInputSchema = (tool) => {
  const params = tool.parameters ?? {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };
  return inlineSchemaRefs(params);
};

const describeTool = (tool) => {
  const lines = [tool.purpose];
  if (tool.requiresConfirmation) {
    lines.push(`Confirm with the user before calling (riskLevel: ${tool.riskLevel}).`);
  }
  if (tool.requiredScope) {
    lines.push(`Requires the '${tool.requiredScope}' API key scope.`);
  }
  if (tool.requiresPremium && !String(tool.purpose).toLowerCase().includes('premium')) {
    lines.push('Requires SteadyRenew Premium.');
  }
  if (Array.isArray(tool.useWhen) && tool.useWhen.length > 0) {
    lines.push(`Use when: ${tool.useWhen.join(' ')}`);
  }
  if (Array.isArray(tool.doNotUseWhen) && tool.doNotUseWhen.length > 0) {
    lines.push(`Do not use when: ${tool.doNotUseWhen.join(' ')}`);
  }
  if (schema.globalConventions?.outOfScope) {
    lines.push(schema.globalConventions.outOfScope);
  }
  return lines.join(' ');
};

const tools = schema.tools.map((tool) => ({
  name: tool.name,
  description: describeTool(tool),
  inputSchema: buildInputSchema(tool),
  annotations: {
    readOnlyHint: tool.method === 'GET',
    destructiveHint: tool.method !== 'GET' && tool.method !== 'POST',
    openWorldHint: false,
  },
}));

const toolByName = new Map(schema.tools.map((tool) => [tool.name, tool]));

const buildRequest = (tool, args = {}) => {
  const safeArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const usedPathParams = new Set();
  const path = tool.path.replace(/\{(\w+)\}/g, (_, key) => {
    const raw = safeArgs[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      throw new Error(`Missing required path parameter: ${key}`);
    }
    usedPathParams.add(key);
    return encodeURIComponent(String(raw));
  });

  const rest = {};
  for (const [key, value] of Object.entries(safeArgs)) {
    if (!usedPathParams.has(key)) {
      rest[key] = value;
    }
  }

  let body;
  let queryString = '';

  if (tool.fixedBody) {
    body = tool.fixedBody;
  } else if (tool.method === 'POST') {
    body = rest;
  } else if (tool.method === 'PATCH') {
    body = rest.patch ?? rest;
  }

  if (tool.method === 'GET') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    }
    queryString = params.toString();
  }

  return {
    method: tool.method,
    url: `${normalizedBase}${path}${queryString ? `?${queryString}` : ''}`,
    body,
  };
};

const callTool = async (tool, args) => {
  if (localVaultKeyToken && !tool.path.startsWith('/api/v1/notification-settings')) {
    const vaultCtx = await getLocalVaultContext();
    const localResult = await executeLocalE2eeTool(tool, args, vaultCtx);
    if (!localResult) {
      throw new Error(
        `Refusing to send plaintext for unsupported E2EE tool '${tool.name}' while SUBSCRIPTION_MANAGER_VAULT_KEY is configured.`
      );
    }
    return localResult;
  }

  const request = buildRequest(tool, args);
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (request.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(request.url, {
    method: request.method,
    headers,
    body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  if (!response.headers.get('content-type')?.includes('application/json')) {
    return {
      ok: false,
      status: response.status,
      text: `Expected a JSON API response, received HTTP ${response.status}. Check the site URL and that Netlify Functions are deployed (locally use npm run dev:full).`,
    };
  }
  try {
    JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: response.status,
      text: `Invalid JSON API response (HTTP ${response.status}).`,
    };
  }
  return { ok: response.ok, status: response.status, text };
};

const mcpServer = new McpServer(
  { name: 'subscription-manager', title: 'SteadyRenew', version: serverVersion },
  { capabilities: { tools: {} } }
);

mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = toolByName.get(request.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
    };
  }

  try {
    const result = await callTool(tool, request.params.arguments ?? {});
    return {
      isError: !result.ok,
      content: [{ type: 'text', text: result.text || `HTTP ${result.status}` }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
console.error(`SteadyRenew MCP server ready (${tools.length} tools, base ${normalizedBase}).`);
