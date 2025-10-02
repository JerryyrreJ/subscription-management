import { Subscription } from '../types';
import { formatCurrency } from './currency';

export interface BarkPushOptions {
  sound?: string;      // 推送铃声
  icon?: string;       // 推送图标 URL
  group?: string;      // 分组
  url?: string;        // 点击后打开的 URL
  automaticallyCopy?: string; // 自动复制内容
  copy?: string;       // 复制内容
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
  options?: BarkPushOptions
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

    console.log('Sending Bark push to:', url.toString());

    const response = await fetch(url.toString(), {
      method: 'GET'
    });

    if (!response.ok) {
      console.error('Bark push failed:', response.statusText);
      return false;
    }

    const result = await response.json();

    // Bark API 返回 { code: 200, message: "success", ... }
    if (result.code === 200) {
      console.log('Bark push sent successfully');
      return true;
    } else {
      console.error('Bark push failed:', result.message);
      return false;
    }
  } catch (error) {
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
  daysUntil: number
): Promise<boolean> {
  const title = 'Subscription Manager';
  const periodText = subscription.period === 'monthly' ? 'month' : subscription.period === 'yearly' ? 'year' : subscription.period;
  const body = `${subscription.name} expires in ${daysUntil} day${daysUntil > 1 ? 's' : ''}\n${formatCurrency(subscription.amount, subscription.currency)}/${periodText}`;

  return sendBarkNotification(
    serverUrl,
    deviceKey,
    title,
    body,
    {
      sound: 'bell',
      group: 'Subscription Manager',
      icon: 'https://i.ibb.co/Z6f84xFY/icon.png'
    }
  );
}

/**
 * 测试 Bark 推送
 */
export async function testBarkPush(
  serverUrl: string,
  deviceKey: string
): Promise<boolean> {
  return sendBarkNotification(
    serverUrl,
    deviceKey,
    'Test Notification',
    'This is a test push from Subscription Manager',
    {
      sound: 'bell',
      group: 'Subscription Manager'
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
