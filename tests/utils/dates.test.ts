import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addBillingPeriodToDate,
  calculateNextPaymentDate,
  calculatePreviousPaymentDate,
  formatDate,
  formatMonthYear,
  formatInstantToDateOnly,
  getAutoRenewedDates,
  getBillingCycleUsage,
  getDaysUntil,
  subtractBillingPeriodFromDate,
} from '../../src/utils/dates.ts';

const withMockedNow = (isoDateTime: string, run: () => void) => {
  const RealDate = Date;

  class MockDate extends RealDate {
    constructor(value?: string | number | Date) {
      super(value ?? isoDateTime);
    }

    static now() {
      return new RealDate(isoDateTime).getTime();
    }
  }

  MockDate.parse = RealDate.parse;
  MockDate.UTC = RealDate.UTC;

  globalThis.Date = MockDate as unknown as DateConstructor;

  try {
    run();
  } finally {
    globalThis.Date = RealDate;
  }
};

test('monthly billing clamps January 31 to February month end', () => {
  assert.equal(calculateNextPaymentDate('2024-01-31', 'monthly'), '2024-02-29');
  assert.equal(calculateNextPaymentDate('2025-01-31', 'monthly'), '2025-02-28');
  assert.equal(addBillingPeriodToDate('2025-02-28', 'monthly', undefined, 31), '2025-03-31');
});

test('yearly billing clamps leap day to February 28 in non-leap year', () => {
  assert.equal(calculateNextPaymentDate('2024-02-29', 'yearly'), '2025-02-28');
});

test('auto renew keeps month-end cadence for overdue monthly subscriptions', () => {
  withMockedNow('2026-03-24T12:00:00.000Z', () => {
    const renewedDates = getAutoRenewedDates('2024-02-29', 'monthly', undefined, 31);

    assert.deepEqual(renewedDates, {
      lastPaymentDate: '2026-02-28',
      nextPaymentDate: '2026-03-31',
    });
  });
});

test('custom billing still advances by the requested number of days', () => {
  assert.equal(addBillingPeriodToDate('2026-03-24', 'custom', '10'), '2026-04-03');
  assert.equal(addBillingPeriodToDate('2026-01-01', 'custom', '30'), '2026-01-31');
  assert.equal(addBillingPeriodToDate('2026-01-31', 'custom', '30'), '2026-03-02');
});

test('billing periods can be subtracted from a requested renewal date', () => {
  assert.equal(subtractBillingPeriodFromDate('2026-06-23', 'monthly'), '2026-05-23');
  assert.equal(subtractBillingPeriodFromDate('2026-06-23', 'custom', '10'), '2026-06-13');
});

test('formatInstantToDateOnly respects the provided time zone', () => {
  const instant = new Date('2026-04-04T01:30:00.000Z');

  assert.equal(formatInstantToDateOnly(instant, 'UTC'), '2026-04-04');
  assert.equal(formatInstantToDateOnly(instant, 'America/Los_Angeles'), '2026-04-03');
  assert.equal(formatInstantToDateOnly(instant, 'Asia/Shanghai'), '2026-04-04');
});

test('getDaysUntil uses the provided time zone calendar day', () => {
  withMockedNow('2026-04-04T01:30:00.000Z', () => {
    assert.equal(getDaysUntil('2026-04-04', 'UTC'), 0);
    assert.equal(getDaysUntil('2026-04-04', 'America/Los_Angeles'), 1);
  });
});

test('monthly cycle one month ahead of today never reports negative days used at timezone midnight', () => {
  // 2026-09-18 00:30 in Asia/Shanghai; UTC calendar date is still 2026-09-17.
  withMockedNow('2026-09-17T16:30:00.000Z', () => {
    const today = formatInstantToDateOnly(new Date(), 'Asia/Shanghai');
    assert.equal(today, '2026-09-18');

    const nextPaymentDate = calculateNextPaymentDate(today, 'monthly');
    assert.equal(nextPaymentDate, '2026-10-18');
    const lastPaymentDate = calculatePreviousPaymentDate(nextPaymentDate, 'monthly');
    assert.equal(lastPaymentDate, '2026-09-18');

    const shanghaiUsage = getBillingCycleUsage(lastPaymentDate, nextPaymentDate, 'Asia/Shanghai');
    assert.equal(shanghaiUsage.daysTotal, 30);
    assert.equal(shanghaiUsage.daysUntil, 30);
    assert.equal(shanghaiUsage.daysUsed, 0);
    assert.equal(shanghaiUsage.daysUsed + shanghaiUsage.daysUntil, shanghaiUsage.daysTotal);

    // Same instant in UTC still thinks last payment is tomorrow, so remaining
    // is 31 vs a 30-day cycle (used = 30 - 31). That must not render as -1.
    const utcUsage = getBillingCycleUsage(lastPaymentDate, nextPaymentDate, 'UTC');
    assert.equal(utcUsage.daysTotal, 30);
    assert.equal(utcUsage.daysUntil, 31);
    assert.equal(utcUsage.daysUsed, 0);
    assert.ok(utcUsage.daysUsed >= 0);
  });
});

test('formatDate localizes date-only labels by locale', () => {
  assert.equal(formatDate('2026-04-04', 'en'), 'Apr 4, 2026');
  assert.equal(formatDate('2026-04-04', 'zh-CN'), '2026年4月4日');
});

test('formatMonthYear localizes month labels by locale', () => {
  assert.equal(formatMonthYear(new Date('2026-04-01T00:00:00.000Z'), 'en'), 'Apr 2026');
  assert.equal(formatMonthYear(new Date('2026-04-01T00:00:00.000Z'), 'zh-CN'), '2026年4月');
});
