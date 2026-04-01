import test from 'node:test';
import assert from 'node:assert/strict';
import {
 cleanupNotificationHistoryEntries,
 mergeNotificationHistoryEntries,
 wasNotifiedOnDate,
} from '../../src/utils/notificationHistory.ts';

const formatDate = (daysFromToday: number): string => {
 const date = new Date();
 date.setUTCDate(date.getUTCDate() + daysFromToday);
 return date.toISOString();
};

test('cleanupNotificationHistoryEntries removes expired and invalid records', () => {
 const cleaned = cleanupNotificationHistoryEntries({
  recent: formatDate(-3),
  expired: formatDate(-40),
  invalid: 'not-a-date',
 });

 assert.deepEqual(cleaned, {
  recent: cleaned.recent,
 });
});

test('mergeNotificationHistoryEntries preserves newly sent entries while pruning stale base history', () => {
 const merged = mergeNotificationHistoryEntries(
  {
   stale: formatDate(-45),
   existing: formatDate(-2),
  },
  {
   sent_now: formatDate(0),
  }
 );

 assert.deepEqual(merged, {
  existing: merged.existing,
  sent_now: merged.sent_now,
 });
});

test('wasNotifiedOnDate compares notification timestamps by UTC calendar date', () => {
 const notificationHistory = {
  sub_1: '2026-03-31T23:30:00-05:00',
 };

 const notified = wasNotifiedOnDate(
  'sub_1',
  notificationHistory,
  new Date(Date.UTC(2026, 3, 1))
 );

 assert.equal(notified, true);
});

test('wasNotifiedOnDate returns false for invalid timestamps', () => {
 const notified = wasNotifiedOnDate(
  'sub_1',
  { sub_1: 'definitely-not-a-date' },
  new Date(Date.UTC(2026, 3, 1))
 );

 assert.equal(notified, false);
});
