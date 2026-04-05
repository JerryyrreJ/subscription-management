import test from 'node:test';
import assert from 'node:assert/strict';
import {
 cleanupNotificationHistory,
 loadNotificationSettings,
 saveNotificationSettings,
} from '../../src/utils/notificationChecker.ts';
import { ReminderSettings } from '../../src/types.ts';

const NOTIFICATION_STORAGE_KEY = 'notification_settings';

const createSettings = (history: Record<string, string>): ReminderSettings => ({
 timeZone: 'Asia/Shanghai',
 locale: 'zh-CN',
 barkPush: {
  enabled: true,
  serverUrl: 'https://api.day.app',
  deviceKey: 'device-key',
  daysBefore: 3,
  notificationHistory: history,
 }
});

const formatDate = (daysFromToday: number): string => {
 const date = new Date();
 date.setUTCDate(date.getUTCDate() + daysFromToday);
 return date.toISOString();
};

const createLocalStorageMock = () => {
 const storage = new Map<string, string>();

 return {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
   storage.set(key, value);
  },
  removeItem: (key: string) => {
   storage.delete(key);
  },
  clear: () => {
   storage.clear();
  }
 };
};

test('cleanupNotificationHistory removes expired and invalid notification history entries', () => {
 const settings = createSettings({
  recent: formatDate(-5),
  expired: formatDate(-31),
  invalid: 'not-a-date',
 });

 const cleaned = cleanupNotificationHistory(settings);

 assert.deepEqual(cleaned.barkPush.notificationHistory, {
  recent: settings.barkPush.notificationHistory.recent,
 });
});

test('loadNotificationSettings persists cleaned notification history back to localStorage', () => {
 const localStorageMock = createLocalStorageMock();
 const originalLocalStorage = globalThis.localStorage;
 globalThis.localStorage = localStorageMock as Storage;

 try {
  localStorageMock.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify({
   timeZone: 'America/Los_Angeles',
   barkPush: {
    enabled: true,
    serverUrl: 'https://api.day.app',
    deviceKey: 'device-key',
    daysBefore: 3,
    notificationHistory: {
     recent: formatDate(-1),
     expired: formatDate(-45),
    }
   },
   browserNotification: {
    enabled: true
   }
  }));

  const settings = loadNotificationSettings();

  assert.deepEqual(settings.barkPush.notificationHistory, {
   recent: settings.barkPush.notificationHistory.recent,
  });
  assert.equal(settings.timeZone, 'America/Los_Angeles');
  assert.equal(settings.locale, 'en');

  const persisted = JSON.parse(localStorageMock.getItem(NOTIFICATION_STORAGE_KEY) || '{}');
  assert.deepEqual(persisted.barkPush.notificationHistory, {
   recent: settings.barkPush.notificationHistory.recent,
  });
  assert.equal(persisted.timeZone, 'America/Los_Angeles');
  assert.equal(persisted.locale, 'en');
  assert.equal('browserNotification' in persisted, false);
 } finally {
  if (originalLocalStorage) {
   globalThis.localStorage = originalLocalStorage;
  } else {
   delete (globalThis as { localStorage?: Storage }).localStorage;
  }
 }
});

test('saveNotificationSettings writes a cleaned notification history', () => {
 const localStorageMock = createLocalStorageMock();
 const originalLocalStorage = globalThis.localStorage;
 globalThis.localStorage = localStorageMock as Storage;

 try {
  saveNotificationSettings(createSettings({
   recent: formatDate(0),
   expired: formatDate(-60),
  }));

 const persisted = JSON.parse(localStorageMock.getItem(NOTIFICATION_STORAGE_KEY) || '{}');
 assert.deepEqual(persisted.barkPush.notificationHistory, {
  recent: persisted.barkPush.notificationHistory.recent,
 });
  assert.equal(persisted.timeZone, 'Asia/Shanghai');
  assert.equal(persisted.locale, 'zh-CN');
 } finally {
  if (originalLocalStorage) {
   globalThis.localStorage = originalLocalStorage;
  } else {
   delete (globalThis as { localStorage?: Storage }).localStorage;
  }
 }
});
