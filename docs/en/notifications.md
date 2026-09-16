# Renewal and Trial Reminders With Bark

[English](notifications.md) | [简体中文](../zh-CN/notifications.md)

Subscription Manager can send renewal and free-trial reminders through Bark. The hosted reminder flow uses a Netlify Scheduled Function and Supabase-backed notification settings.

## Before You Start

Bark is a free, open-source iOS push app. Subscription Manager sends reminders from its server, so you do not need to keep the web app open.

Before you start, you need:

- A signed-in Subscription Manager account.
- [Bark](https://apps.apple.com/app/bark-customed-notifications/id1403753865) installed on an iPhone or iPad.
- The push URL shown in Bark.
- The number of days before renewal or trial end when you want to be reminded.

> Your Bark URL contains your device key. Do not publish it or share it with anyone you do not trust, because it can be used to send pushes to your device.

## Get Your Bark URL

1. Download and open Bark on your iOS device.
2. Tap **Server** at the bottom of Bark.
3. Copy any example push URL from the Server page, such as `https://api.day.app/your-device-key/example`.
4. Keep the complete URL. Subscription Manager extracts the server URL and device key automatically.

## Configure Subscription Manager

1. Sign in to Subscription Manager.
2. Open **Settings** > **Notifications**.
3. Enable **Bark push notifications**.
4. Paste the complete Bark URL into the **Bark URL** field.
5. Check that the field is marked valid and review the detected server and device key.
6. Choose how many days before renewal or trial end to send the reminder.
7. Select **Test Push** and confirm that the message arrives on your iOS device.
8. Select **Save Settings**.

Notification settings are linked to the current account. You must be signed in before saving or testing so that the server can match subscriptions to the correct notification device.

## Per-Subscription Notification Toggles

After enabling Bark globally, you can still turn reminders on or off for each subscription when adding or editing it. Disabling one subscription does not affect the others.

Paused and cancelled subscriptions are skipped even if their per-subscription notification toggle is still on.

## Free Trials

When you mark a subscription as a free trial, reminders use the trial end / first-charge date instead of a rolling renewal date. The push and dashboard copy say the trial is ending so you can cancel or keep it. After that date passes, it is not auto-advanced the way a normal `nextPaymentDate` is.

Formal (non-trial) subscriptions keep the existing next-renewal reminder behavior.

## Troubleshooting

If a reminder does not arrive:

- Confirm that the Bark URL is marked valid.
- Confirm that iOS notifications are allowed for Bark, then try an example push from Bark.
- Confirm that you are signed in and saved the notification settings.
- Confirm that notifications are enabled for the subscription.
- Confirm that the next payment date (or trial end date) is valid and in the future.
- If you use a self-hosted Bark server, confirm that its URL is publicly reachable.
- Run **Test Push** again to distinguish a device configuration issue from a scheduled-job issue.

## Hosted Services Required for Deployments

- Supabase for notification settings and subscriptions
- Netlify Functions for scheduled checks
- Bark official server or a self-hosted Bark server

## Required Environment Variables

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Prefer `SUPABASE_SECRET_KEY` for new deployments. The legacy `SUPABASE_SERVICE_ROLE_KEY` name remains supported as an alias.

## SQL Setup

Notification tables and constraints are included in the Supabase migrations. For current deployments, use:

```text
supabase/migrations/20260615000100_baseline.sql
supabase/migrations/20260615000200_harden_existing_schema.sql
supabase/migrations/20260916000100_subscription_trials.sql
```

Older setup notes and legacy migration files are kept in `supabase/legacy/` for reference only.

## Scheduled Function

The scheduled function lives at:

```text
netlify/functions/send-scheduled-notifications.ts
```

It checks eligible subscriptions, sends Bark messages, records delivery history, and avoids duplicate sends.

## Local Testing

```bash
npm run test:notifications
```

Use Netlify Dev when testing the full function runtime:

```bash
npm run dev:full
```
