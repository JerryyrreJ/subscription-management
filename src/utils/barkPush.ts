import { Subscription } from '../types';
import { buildSubscriptionReminderContent, buildTestNotificationContent } from './notificationContent';
import { DEFAULT_BARK_REQUEST_TIMEOUT_MS } from './barkSettings';

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
 if (!serverUrl || !deviceKey) {
 console.error('Bark: Server URL and Device Key are required');
 return false;
 }

 try {
 // 构建 Bark API URL
 // 格式: https://api.day.app/{deviceKey}/{title}/{body}?sound=bell&icon=...
 const baseUrl = serverUrl.replace(/\/$/, ''); // 移除末尾斜杠
 const url = new URL(`${baseUrl}/${deviceKey}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`);

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
  icon: 'https://i.ibb.co/Z6f84xFY/icon.png'
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
  group
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
 if (!serverUrl) {
 return { valid: false, error: 'Server URL is required' };
 }

 if (!deviceKey) {
 return { valid: false, error: 'Device Key is required' };
 }

 // 验证 URL 格式
 try {
 new URL(serverUrl);
 } catch {
 return { valid: false, error: 'Invalid Server URL format' };
 }

 // 验证 Device Key 格式（通常是字母数字组合）
 if (!/^[a-zA-Z0-9_-]+$/.test(deviceKey)) {
 return { valid: false, error: 'Device Key should only contain letters, numbers, - and _' };
 }

 return { valid: true };
}
