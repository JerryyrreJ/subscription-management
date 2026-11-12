import { Subscription } from '../types';
import { buildSubscriptionReminderContent, buildTestNotificationContent } from './notificationContent';
import { DEFAULT_BARK_REQUEST_TIMEOUT_MS } from './barkSettings';

/** Public PNG used for Bark push icons (must be an absolute URL). */
export const BARK_NOTIFICATION_ICON_URL = 'https://i.ibb.co/bjqnj7Hx/icon.png';

export interface BarkPushOptions {
 sound?: string; // 推送铃声
 icon?: string; // 推送图标 URL
 group?: string; // 分组
 url?: string; // 点击后打开的 URL
 automaticallyCopy?: string; // 自动复制内容
 copy?: string; // 复制内容
}

const maskDeviceKey = (deviceKey: string): string => {
 if (deviceKey.length <= 8) {
 return `${deviceKey.slice(0, 2)}***${deviceKey.slice(-2)}`
 }

 return `${deviceKey.slice(0, 4)}***${deviceKey.slice(-4)}`
}

const DEVICE_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

const RESERVED_HOST_SUFFIXES = [
 '.localhost',
 '.local',
 '.internal',
 '.home.arpa',
 '.lan',
 '.corp',
 '.invalid',
 '.test',
 '.example',
];

function parseIpv4Octets(host: string): [number, number, number, number] | null {
 const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
 if (!match) {
  return null;
 }

 const octets = match.slice(1).map(part => Number.parseInt(part, 10));
 if (octets.some(octet => Number.isNaN(octet) || octet < 0 || octet > 255)) {
  return null;
 }

 return octets as [number, number, number, number];
}

function isPrivateOrReservedIpv4([a, b, c]: [number, number, number, number]): boolean {
 return (
  a === 0 || // 0.0.0.0/8 (unspecified / current network)
  a === 10 || // 10.0.0.0/8 (RFC 1918)
  (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGNAT)
  a === 127 || // 127.0.0.0/8 (loopback)
  (a === 169 && b === 254) || // 169.254.0.0/16 (link-local / cloud metadata IMDS)
  (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 (RFC 1918)
  (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0.0/24, 192.0.2.0/24
  (a === 192 && b === 88 && c === 99) || // 192.88.99.0/24 (6to4 anycast)
  (a === 192 && b === 168) || // 192.168.0.0/16 (RFC 1918)
  (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 (benchmarking)
  (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24 (TEST-NET-2)
  (a === 203 && b === 0 && c === 113) || // 203.0.113.0/24 (TEST-NET-3)
  a >= 224 // 224.0.0.0/4 multicast & 240.0.0.0/4 reserved/broadcast
 );
}

function parseIpv6Groups(rawAddress: string): number[] | null {
 if (!rawAddress || rawAddress.includes('%')) {
  return null;
 }

 let normalized = rawAddress.toLowerCase();
 const lastColonIndex = normalized.lastIndexOf(':');
 if (lastColonIndex !== -1 && normalized.slice(lastColonIndex + 1).includes('.')) {
  const ipv4Octets = parseIpv4Octets(normalized.slice(lastColonIndex + 1));
  if (!ipv4Octets) {
   return null;
  }
  const high = ((ipv4Octets[0] << 8) | ipv4Octets[1]).toString(16);
  const low = ((ipv4Octets[2] << 8) | ipv4Octets[3]).toString(16);
  normalized = `${normalized.slice(0, lastColonIndex)}:${high}:${low}`;
 }

 const doubleColonParts = normalized.split('::');
 if (doubleColonParts.length > 2) {
  return null;
 }

 const parseSide = (part: string): number[] | null => {
  if (!part) {
   return [];
  }
  const segments = part.split(':');
  const values: number[] = [];
  for (const segment of segments) {
   if (!/^[0-9a-f]{1,4}$/.test(segment)) {
    return null;
   }
   values.push(Number.parseInt(segment, 16));
  }
  return values;
 };

 const left = parseSide(doubleColonParts[0]);
 if (!left) {
  return null;
 }

 if (doubleColonParts.length === 1) {
  return left.length === 8 ? left : null;
 }

 const right = parseSide(doubleColonParts[1]);
 if (!right || left.length + right.length >= 8) {
  return null;
 }

 const zeroCount = 8 - left.length - right.length;
 return [...left, ...Array<number>(zeroCount).fill(0), ...right];
}

function extractEmbeddedIpv4(highGroup: number, lowGroup: number): [number, number, number, number] {
 return [
  (highGroup >> 8) & 0xff,
  highGroup & 0xff,
  (lowGroup >> 8) & 0xff,
  lowGroup & 0xff,
 ];
}

function isPrivateOrReservedIpv6(groups: number[]): boolean {
 const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;

 // IPv4-mapped IPv6 ::ffff:0:0/96
 if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
  return isPrivateOrReservedIpv4(extractEmbeddedIpv4(g6, g7));
 }

 // Reject everything outside IANA Global Unicast 2000::/3
 // (covers ::/128, ::1/128, ::/96, 64:ff9b::/96 NAT64, 100::/64, fc00::/7 ULA, fe80::/10 link-local, ff00::/8 multicast)
 if ((g0 & 0xe000) !== 0x2000) {
  return true;
 }

 // Teredo 2001:0000::/32 and documentation 2001:db8::/32
 if (g0 === 0x2001 && (g1 === 0x0000 || g1 === 0x0db8)) {
  return true;
 }

 // 6to4 2002::/16 embeds an IPv4 address in g1:g2
 if (g0 === 0x2002) {
  return isPrivateOrReservedIpv4(extractEmbeddedIpv4(g1, g2));
 }

 return false;
}

/**
 * Checks whether a resolved IP literal (from DNS lookup or URL host) is a safe public IP.
 */
export function isPublicBarkIpAddress(ipAddress: string): boolean {
 const trimmed = ipAddress.trim().replace(/^\[|\]$/g, '');
 const ipv4 = parseIpv4Octets(trimmed);
 if (ipv4) {
  return !isPrivateOrReservedIpv4(ipv4);
 }

 const ipv6 = parseIpv6Groups(trimmed);
 if (ipv6) {
  return !isPrivateOrReservedIpv6(ipv6);
 }

 return false;
}

function isAllowedBarkHostname(hostname: string): boolean {
 const normalized = hostname.trim().toLowerCase();
 if (!normalized || normalized.endsWith('.')) {
  return false;
 }

 if (normalized.startsWith('[') && normalized.endsWith(']')) {
  const ipv6 = parseIpv6Groups(normalized.slice(1, -1));
  return ipv6 !== null && !isPrivateOrReservedIpv6(ipv6);
 }

 const ipv4 = parseIpv4Octets(normalized);
 if (ipv4) {
  return !isPrivateOrReservedIpv4(ipv4);
 }

 // Reject all-numeric labels that fail strict IPv4 parsing
 const labels = normalized.split('.');
 if (labels.length < 2 || labels.some(label => label.length === 0)) {
  return false;
 }
 if (labels.every(label => /^\d+$/.test(label))) {
  return false;
 }

 if (
  normalized === 'localhost' ||
  RESERVED_HOST_SUFFIXES.some(suffix => normalized.endsWith(suffix))
 ) {
  return false;
 }

 return true;
}

function parseValidatedBarkServerUrl(serverUrl: string): { url: URL; error?: undefined } | { url?: undefined; error: string } {
 let parsed: URL;
 try {
  parsed = new URL(serverUrl.trim());
 } catch {
  return { error: 'Invalid Server URL format' };
 }

 if (parsed.protocol !== 'https:') {
  return { error: 'Server URL must use HTTPS' };
 }

 if (parsed.username || parsed.password) {
  return { error: 'Server URL must not contain credentials' };
 }

 if (parsed.search || parsed.hash) {
  return { error: 'Server URL must not contain query parameters or fragments' };
 }

 if (!isAllowedBarkHostname(parsed.hostname)) {
  return { error: 'Server URL must point to a public host' };
 }

 return { url: parsed };
}

/**
 * 发送 Bark 推送通知
 * Bark API 文档: https://github.com/Finb/Bark
 */
export async function sendBarkNotification(
 serverUrl: string,
 deviceKey: string,
 title: string,
 body: string,
 options?: BarkPushOptions,
 timeoutMs: number = DEFAULT_BARK_REQUEST_TIMEOUT_MS
): Promise<boolean> {
 const validation = validateBarkConfig(serverUrl, deviceKey);
 if (!validation.valid) {
  console.error('Bark: Invalid configuration:', validation.error);
  return false;
 }

 try {
  // 构建 Bark API URL
  // 格式: https://api.day.app/{deviceKey}/{title}/{body}?sound=bell&icon=...
  const baseUrl = serverUrl.trim().replace(/\/+$/, '');
  const url = new URL(
   `${baseUrl}/${encodeURIComponent(deviceKey)}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`
  );

  // 添加可选参数
  if (options?.sound) url.searchParams.set('sound', options.sound);
  if (options?.icon) url.searchParams.set('icon', options.icon);
  if (options?.group) url.searchParams.set('group', options.group);
  if (options?.url) url.searchParams.set('url', options.url);
  if (options?.automaticallyCopy) url.searchParams.set('automaticallyCopy', options.automaticallyCopy);
  if (options?.copy) url.searchParams.set('copy', options.copy);

  console.log('Sending Bark push:', {
   serverUrl: baseUrl,
   deviceKey: maskDeviceKey(deviceKey)
  });

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  const response = await fetch(url.toString(), {
   method: 'GET',
   redirect: 'error',
   signal: abortController.signal
  }).finally(() => {
   clearTimeout(timeoutId);
  });

  if (!response.ok) {
   console.error('Bark push failed:', response.statusText);
   return false;
  }

  const result = await response.json();

  // Bark API 返回 { code: 200, message:"success", ... }
  if (result.code === 200) {
   console.log('Bark push sent successfully');
   return true;
  } else {
   console.error('Bark push failed:', result.message);
   return false;
  }
 } catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
   console.error(`Bark push timed out after ${timeoutMs}ms`);
   return false;
  }
  console.error('Bark push error:', error);
  return false;
 }
}

/**
 * 发送订阅到期提醒到 Bark
 */
export async function sendSubscriptionReminder(
 serverUrl: string,
 deviceKey: string,
 subscription: Subscription,
 daysUntil: number,
 locale?: string
): Promise<boolean> {
 const { title, body, group } = buildSubscriptionReminderContent(subscription, daysUntil, locale);

 return sendBarkNotification(
 serverUrl,
 deviceKey,
 title,
 body,
 {
  sound: 'bell',
  group,
  icon: BARK_NOTIFICATION_ICON_URL
 }
 );
}

/**
 * 测试 Bark 推送
 */
export async function testBarkPush(
 serverUrl: string,
 deviceKey: string,
 locale?: string
): Promise<boolean> {
 const { title, body, group } = buildTestNotificationContent(locale);

 return sendBarkNotification(
 serverUrl,
 deviceKey,
 title,
 body,
 {
  sound: 'bell',
  group,
  icon: BARK_NOTIFICATION_ICON_URL
 }
 );
}

/**
 * 验证 Bark 配置
 */
export function validateBarkConfig(serverUrl: string, deviceKey: string): {
 valid: boolean;
 error?: string;
} {
 if (!serverUrl || !serverUrl.trim()) {
  return { valid: false, error: 'Server URL is required' };
 }

 if (!deviceKey || !deviceKey.trim()) {
  return { valid: false, error: 'Device Key is required' };
 }

 const parsedServer = parseValidatedBarkServerUrl(serverUrl);
 if (parsedServer.error) {
  return { valid: false, error: parsedServer.error };
 }

 // 验证 Device Key 格式（字母数字、连字符和下划线，限制长度防止滥用）
 if (!DEVICE_KEY_PATTERN.test(deviceKey)) {
  return { valid: false, error: 'Device Key should only contain letters, numbers, - and _' };
 }

 return { valid: true };
}
