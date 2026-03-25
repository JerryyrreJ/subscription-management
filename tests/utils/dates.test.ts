import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addBillingPeriodToDate,
  calculateNextPaymentDate,
  getAutoRenewedDates,
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
});

test('yearly billing clamps leap day to February 28 in non-leap year', () => {
  assert.equal(calculateNextPaymentDate('2024-02-29', 'yearly'), '2025-02-28');
});

test('auto renew keeps month-end cadence for overdue monthly subscriptions', () => {
  withMockedNow('2026-03-24T12:00:00.000Z', () => {
    const renewedDates = getAutoRenewedDates('2024-01-31', '2024-02-29', 'monthly');

    assert.deepEqual(renewedDates, {
      lastPaymentDate: '2026-02-28',
      nextPaymentDate: '2026-03-28',
    });
  });
});

test('custom billing still advances by the requested number of days', () => {
  assert.equal(addBillingPeriodToDate('2026-03-24', 'custom', '10'), '2026-04-03');
});
