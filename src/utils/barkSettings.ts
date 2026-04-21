import type { ReminderSettings } from '../types';
import { validateBarkConfig } from './barkPush';

export const DEFAULT_BARK_REQUEST_TIMEOUT_MS = 10_000;

export function hasValidBarkConfig(settings: Pick<ReminderSettings, 'barkPush'>): boolean {
 const validation = validateBarkConfig(
  settings.barkPush.serverUrl,
  settings.barkPush.deviceKey
 );

 return validation.valid;
}

export function isBarkReady(settings: Pick<ReminderSettings, 'barkPush'>): boolean {
 return settings.barkPush.enabled && hasValidBarkConfig(settings);
}
