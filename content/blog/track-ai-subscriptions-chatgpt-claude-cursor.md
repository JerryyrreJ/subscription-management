---
title: "How to track AI subscriptions (ChatGPT, Claude, Cursor, Midjourney) before they pile up"
seoTitle: "How to Track AI Subscriptions (ChatGPT & Claude)"
slug: track-ai-subscriptions-chatgpt-claude-cursor
description: "Stop paying for overlapping $20 AI plans, forgotten annual upgrades, and silent API auto-reloads. Audit and track ChatGPT, Claude, Cursor, and API tools in one list."
summary: "AI subscriptions creep up because consumer chat seats ($20/month), temporary $100–$200 coding upgrades, mobile in-app purchases, and API auto-recharge thresholds live on separate billing rails. Audit five billing channels first, disable silent API auto-top-ups, and track fixed seats with pre-renewal alerts in one currency view."
date: 2026-11-15
updated: 2026-11-20
status: published
lang: en
cluster: multi-currency-ai
cta: multi-currency
image: /blog/ai-dashboard-en.png
canonical: https://steadyrenew.com/blog/track-ai-subscriptions-chatgpt-claude-cursor/
---

Nobody notices a single `$20/month` AI seat. What actually blows up a developer or creator budget is stacking four `$20` tools—ChatGPT Plus, Claude Pro, Cursor Pro, Perplexity Pro—on top of cloud hosting (`Supabase`, `Vercel`, `Netlify`), an image generator you barely opened this month, and silent `$10` API credit auto-reloads running in the background.

Before you cancel anything blindly, map every AI and cloud charge by **which payment rail controls the cancel button** and separate fixed calendar renewals from usage-based API top-ups.

## Four traps specific to AI tool billing

AI subscriptions drift out of control faster than Netflix or Spotify for four concrete reasons:

- **Web Stripe vs. Apple / Google Play splits:** Buying ChatGPT or Claude inside the iOS app bills through `APPLE.COM/BILL` (often at a markup) and must be canceled in iPhone **Settings → Subscriptions**, not on `chatgpt.com` or `claude.ai`.
- **Chat seats vs. API auto-recharge:** Canceling a `$20/month` chat plan does **not** touch `platform.openai.com`, `console.anthropic.com`, or OpenRouter. If **Auto top-up** is turned on, an agent script or IDE plugin can still trigger `$10`–`$50` card charges overnight.
- **Sprint-month tier upgrades:** Bumping from a `$20` tier to a `$100` or `$200` high-usage coding plan for one busy deadline—and forgetting to downgrade before the next billing date—turns a one-off sprint into a permanent bill.
- **Mixed currencies outside the US:** Solo builders paying USD for AI/cloud tools alongside EUR, GBP, JPY, or CNY local subscriptions rarely know their true monthly burn without converting everything into one display currency.

## The 10-minute AI billing sweep

Check these five billing rails in order rather than guessing from memory:

| Billing rail | Where to check | Typical AI & dev culprits |
| --- | --- | --- |
| **Apple / Google Play** | iPhone **Settings → Subscriptions** / Google Play **Subscriptions** | Mobile chat IAPs, voice note apps, AI photo & PDF editors |
| **Direct web (Stripe / Link)** | Search inbox for `receipt from OpenAI`, `Anthropic`, `Cursor`, `Midjourney`, `Vercel` | ChatGPT, Claude, Cursor, Perplexity, Midjourney, v0, hosting |
| **PayPal Automatic Payments** | PayPal **Settings → Payments → Automatic payments** | Annual AI writers, transcription tools, browser extensions |
| **API billing consoles** | OpenAI Platform, Anthropic Console, OpenRouter **Billing → Auto-recharge** | Silent `$5–$50` credit reloads triggered by scripts or agents |
| **Secondary / work inboxes** | Search alternate Gmail or work email for `invoice`, `seat`, `renewal` | Duplicate seats opened during a client project or hackathon |

For each active item, record the **original billed currency**, **billing cycle**, **which rail owns it**, and one decision: **Keep**, **Downgrade before renewal**, or **Cancel now**. If you want to sweep non-AI household bills at the same time, run the full [30-minute manual subscription audit](https://steadyrenew.com/blog/how-to-do-a-subscription-audit/).

## Split fixed seats from API top-ups

Keep your tracker clean by drawing a hard line between two categories:

1. **Calendar renewals & trials (put these in your tracker):** Fixed monthly/yearly AI seats, cloud tiers, and 7-day trials. Set reminders **2–3 days ahead** of trials and **at least 3–7 days ahead** of high-tier monthly seats so you can step down before renewal hits.
2. **Usage-based API credits (cap these at the provider):** Turn **Auto-recharge** off completely—or set a strict monthly spending limit inside OpenAI, Anthropic, and OpenRouter—so a runaway loop never bills your card silently.

## What a real AI + cloud ledger looks like

If you only keep three USD AI plans, a simple spreadsheet works fine. Once your list spans a dozen mixed-currency AI tools, hosting accounts, and personal subscriptions, seeing exact renewal urgency and converted totals in one screen makes trim decisions obvious.

Here is a sample 19-item developer ledger in [SteadyRenew](https://steadyrenew.com/app) mixing USD AI/cloud tools (`Supabase Pro`, `Perplexity Pro`, `Netlify Pro`, `ChatGPT Plus`, `Claude Pro`, `Cursor Pro`) with local-currency services (`CN¥` cloud and media) converted into one `$254.72/month` USD view:

![SteadyRenew English multi-currency dashboard tracking 19 AI, cloud, and media subscriptions](/blog/ai-dashboard-en.png "Sample ledger: 19 mixed-currency subscriptions converted to USD with renewal countdown badges (Due today / Due in 2 days)")

Why a lightweight browser tracker fits AI-heavy stacks better than a `$10/month` bank-sync app:

- **No bank login or recurring tracker fee:** Starts locally in your browser on Free (`$0` for unlimited items, multi-currency conversion across 10 currencies, cloud sync, Bark alerts, JSON export, 10 AI captures/month, and API/MCP). Optional Premium is **$9 USD once** for 300 monthly AI captures and print-ready A4 PDF expense reports.
- **Fast updates when you swap models:** Type `Cursor Pro $20 monthly, renews on the 18th` or upload a Stripe receipt screenshot in **AI Assist** to pre-fill a draft instead of filling forms manually.
- **Ask your own AI assistant about your AI spend:** Because Free includes [REST API and MCP support](https://steadyrenew.com/blog/manage-subscriptions-with-mcp/), you can connect Claude, ChatGPT, or Cursor directly to your ledger and ask *"How much am I paying for AI Tools this month?"* or *"Which subscriptions renew in the next 7 days?"*

SteadyRenew does **not** connect to your bank, pull credit-card feeds, cancel AI plans for you, or track live API token usage.

## FAQ

### How do I tell if ChatGPT or Claude is billing me through Apple instead of the website?

Check your card statement descriptor and email receipts. `APPLE.COM/BILL` charges live in **iPhone Settings → [your name] → Subscriptions**, whereas web plans email a Stripe/OpenAI or Anthropic receipt and must be canceled inside your browser account settings.

### Does canceling ChatGPT Plus or Claude Pro stop OpenAI or Anthropic API billing?

No. Consumer chat subscriptions (`chatgpt.com` or `claude.ai`) and developer API consoles (`platform.openai.com` or `console.anthropic.com`) use separate billing systems. Always check API **Billing / Auto-recharge** settings independently.

### Can I downgrade an expensive AI coding plan before renewal without losing the rest of the month?

Most major web AI subscriptions let you cancel or schedule a downgrade immediately while keeping paid access through the end of the current billing period. Double-check the confirmation screen, especially for prepaid annual plans or credit packs.

### What is the easiest way to track AI bills in multiple currencies without sharing bank logins?

Log each tool in its real invoice currency inside a spreadsheet or a no-bank-login tracker like SteadyRenew, view converted totals in your home currency, and pair trials and high-tier seats with alerts a few days before renewal.

## Related reading

- [Connect SteadyRenew to an MCP client](https://steadyrenew.com/blog/manage-subscriptions-with-mcp/)
- [How to create an annual software subscription expense report (spreadsheet or A4 PDF)](https://steadyrenew.com/blog/software-subscription-expense-report-pdf/)
- [How to catch subscription price increases before annual plans auto-renew](https://steadyrenew.com/blog/track-subscription-price-increases/)
- [How to choose a subscription tracker without linking your bank](https://steadyrenew.com/blog/best-subscription-trackers-without-bank-login/)
- [Bobby app alternatives for iPhone, Android, and desktop web](https://steadyrenew.com/blog/bobby-app-alternatives/)
- [How to do a subscription audit (keep / cancel / remind)](https://steadyrenew.com/blog/how-to-do-a-subscription-audit/)
