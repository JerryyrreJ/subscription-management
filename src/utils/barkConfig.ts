import type { ReminderSettings } from '../types';

export function parseBarkUrl(url: string): {
 serverUrl: string;
 deviceKey: string;
 valid: boolean;
} {
 try {
  const trimmedUrl = url.trim();
  const urlObj = new URL(trimmedUrl);
  const serverUrl = `${urlObj.protocol}//${urlObj.host}`;
  const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
  const deviceKey = pathParts[0] || '';

  return { serverUrl, deviceKey, valid: deviceKey.length > 0 };
 } catch {
  return { serverUrl: '', deviceKey: '', valid: false };
 }
}

export function updateBarkPushFromUrl(
 barkPush: ReminderSettings['barkPush'],
 url: string
): ReminderSettings['barkPush'] {
 const parsed = parseBarkUrl(url);

 return {
  ...barkPush,
  serverUrl: parsed.valid ? parsed.serverUrl : '',
  deviceKey: parsed.valid ? parsed.deviceKey : '',
 };
}
