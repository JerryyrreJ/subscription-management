import { DEFAULT_LOCALE, SupportedLocale } from '../i18n/types';
import { ReminderSettings } from '../types';
import { normalizeLocale } from './locale';

export interface NotificationSettingsConfigPayload {
 user_id: string
 time_zone: string
 locale: SupportedLocale
 bark_enabled: boolean
 bark_server_url: string
 bark_device_key: string
 bark_days_before: number
}

export const buildNotificationSettingsConfigPayload = (
 settings: ReminderSettings,
 userId: string
): NotificationSettingsConfigPayload => ({
 user_id: userId,
 time_zone: settings.timeZone,
 locale: normalizeLocale(settings.locale ?? DEFAULT_LOCALE),
 bark_enabled: settings.barkPush.enabled,
 bark_server_url: settings.barkPush.serverUrl,
 bark_device_key: settings.barkPush.deviceKey,
 bark_days_before: settings.barkPush.daysBefore
});
