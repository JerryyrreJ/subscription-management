import type { Subscription } from '../../types';
import { BARK_NOTIFICATION_ICON_URL } from '../../utils/barkPush';
import {
  addBillingPeriodToDate,
  compareDateOnly,
  diffDateOnlyDays,
  formatDateOnly,
  getDateOnlyDay,
  getTodayDateOnly,
  normalizeTimeZone,
  parseDateOnly,
} from '../../utils/dates';
import { normalizeLocale } from '../../utils/locale';
import { buildSubscriptionReminderContent } from '../../utils/notificationContent';
import { resolveSubscriptionRenewal } from '../../utils/subscriptionRenewal';
import { isSubscriptionReminderEligible, isTrialSubscription } from '../../utils/subscriptionReminder';
import {
  type BarkE2eeMode,
  computeSubscriptionPushHash,
  encryptBarkPushPayload,
  isValidBarkEncryptionKey,
} from './crypto';

export interface PushScheduleRowInput {
  subscription_hash: string;
  trigger_date: string;
  payload_mode: 'bark_ciphertext' | 'generic';
  bark_ciphertext: string | null;
  bark_iv: string | null;
}

export interface PushScheduleContext {
  barkEnabled: boolean;
  daysBefore: number;
  timeZone?: string | null;
  locale?: string | null;
  barkMode: BarkE2eeMode;
  barkEncryptionKey?: string | null;
  now?: Date;
  maxCyclesPerSubscription?: number;
}

function subtractDaysFromDateOnly(dateString: string, days: number): string {
  const date = parseDateOnly(dateString);
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() - Math.max(0, days));
  return formatDateOnly(copy);
}

/**
 * Computes upcoming reminder schedule entries for a single subscription.
 * When `barkMode === 'bark_e2ee'` and a valid 16/32-char Bark AES key is provided,
 * generates Bark-native AES-CBC ciphertexts so neither Supabase, Netlify Functions,
 * nor the Bark relay server ever see the subscription name or amount.
 */
export async function buildPushSchedulesForSubscription(
  subscription: Subscription,
  dekBytes: Uint8Array,
  ctx: PushScheduleContext
): Promise<{ subscriptionHash: string; rows: PushScheduleRowInput[] }> {
  const subscriptionHash = await computeSubscriptionPushHash(dekBytes, subscription.id);

  if (
    !ctx.barkEnabled
    || ctx.barkMode === 'off'
    || !isSubscriptionReminderEligible(subscription)
  ) {
    return { subscriptionHash, rows: [] };
  }

  const now = ctx.now ?? new Date();
  const timeZone = normalizeTimeZone(ctx.timeZone, 'UTC');
  const locale = normalizeLocale(ctx.locale ?? 'en');
  const todayStr = formatDateOnly(getTodayDateOnly(timeZone, now));
  const daysBefore = Math.max(0, Math.min(30, Math.trunc(ctx.daysBefore)));
  const maxCycles = ctx.maxCyclesPerSubscription ?? 12;

  const useBarkCiphertext =
    ctx.barkMode === 'bark_e2ee'
    && Boolean(ctx.barkEncryptionKey && isValidBarkEncryptionKey(ctx.barkEncryptionKey));
  const barkKey = useBarkCiphertext ? ctx.barkEncryptionKey!.trim() : null;

  const renewal = resolveSubscriptionRenewal(subscription, timeZone, now);
  if (renewal.daysUntilEffectiveNextPayment < 0) {
    return { subscriptionHash, rows: [] };
  }

  const upcomingDueDates: string[] = [];
  if (isTrialSubscription(subscription)) {
    upcomingDueDates.push(renewal.effectiveNextPaymentDate);
  } else {
    const anchorDay =
      subscription.period === 'monthly' || subscription.period === 'yearly'
        ? (subscription.billingAnchorDay ?? getDateOnlyDay(renewal.effectiveNextPaymentDate))
        : undefined;

    let currentDue = renewal.effectiveNextPaymentDate;
    for (let i = 0; i < maxCycles; i += 1) {
      upcomingDueDates.push(currentDue);
      const nextDue = addBillingPeriodToDate(
        currentDue,
        subscription.period,
        subscription.customDate,
        anchorDay
      );
      if (nextDue === currentDue) {
        break;
      }
      currentDue = nextDue;
    }
  }

  const rows: PushScheduleRowInput[] = [];
  const seenTriggerDates = new Set<string>();

  for (const dueDate of upcomingDueDates) {
    const idealTriggerDate = subtractDaysFromDateOnly(dueDate, daysBefore);
    // If today is already inside [idealTriggerDate, dueDate], schedule for today so
    // newly added imminent renewals still alert promptly.
    const triggerDate =
      compareDateOnly(idealTriggerDate, todayStr) < 0 && compareDateOnly(dueDate, todayStr) >= 0
        ? todayStr
        : idealTriggerDate;

    if (compareDateOnly(triggerDate, todayStr) < 0 || seenTriggerDates.has(triggerDate)) {
      continue;
    }
    seenTriggerDates.add(triggerDate);

    if (barkKey) {
      const daysUntilAtTrigger = Math.max(0, diffDateOnlyDays(triggerDate, dueDate));
      const content = buildSubscriptionReminderContent(
        {
          ...subscription,
          nextPaymentDate: dueDate,
          trialEndsOn: subscription.isTrial ? dueDate : subscription.trialEndsOn,
        },
        daysUntilAtTrigger,
        locale
      );
      const encrypted = await encryptBarkPushPayload(barkKey, {
        title: content.title,
        body: content.body,
        sound: 'bell',
        group: content.group,
        icon: BARK_NOTIFICATION_ICON_URL,
      });

      rows.push({
        subscription_hash: subscriptionHash,
        trigger_date: triggerDate,
        payload_mode: 'bark_ciphertext',
        bark_ciphertext: encrypted.ciphertext,
        bark_iv: encrypted.iv,
      });
    } else {
      rows.push({
        subscription_hash: subscriptionHash,
        trigger_date: triggerDate,
        payload_mode: 'generic',
        bark_ciphertext: null,
        bark_iv: null,
      });
    }
  }

  return { subscriptionHash, rows };
}

export async function buildPushSchedulesForAllSubscriptions(
  subscriptions: readonly Subscription[],
  dekBytes: Uint8Array,
  ctx: PushScheduleContext
): Promise<PushScheduleRowInput[]> {
  const allRows: PushScheduleRowInput[] = [];
  for (const subscription of subscriptions) {
    const { rows } = await buildPushSchedulesForSubscription(subscription, dekBytes, ctx);
    allRows.push(...rows);
  }
  return allRows;
}
