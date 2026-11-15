---
title: "How to track AI subscriptions (ChatGPT, Claude, Cursor, Midjourney) before they pile up"
seoTitle: "How to Track AI Subscriptions & Free Trials Without Bank Sync"
slug: track-ai-subscriptions-chatgpt-claude-cursor
description: "Stop paying for overlapping $20 AI plans, forgotten annual upgrades, and silent API auto-reloads. Audit and track ChatGPT, Claude, Cursor, and API tools in one list."
date: 2026-11-15
status: published
lang: en
cluster: multi-currency-ai
cta: multi-currency
canonical: https://steadyrenew.com/blog/track-ai-subscriptions-chatgpt-claude-cursor/
---

A single `$20/month` AI plan feels trivial. The surprise hits three months later when you realize you are still paying `$20` for ChatGPT Plus on the web, `$20` for Claude Pro via Apple, `$20` for Cursor, `$30` for an image generator you barely opened, `$15` for a meeting note-taker trial that converted, plus silent `$10` API credit auto-top-ups running in the background.

Before you switch models or downgrade a tier, you need one clear map of every AI tool billing you, which payment rail owns the renewal switch, and which charges are fixed seats versus usage top-ups.

## Why AI subscriptions sneak past normal budgeting

AI tools break standard subscription habits in four predictable ways:

- **Split billing rails:** Half of your tools bill directly through Stripe or Link in a web browser, while mobile apps bill through Apple (`APPLE.COM/BILL`) or Google Play (`GOOGLE *`)—sometimes at a higher price to cover store commissions, and almost always with a separate cancellation menu.
- **Seat plans mixed with prepaid API credits:** Paying `$20/month` for Claude Pro or ChatGPT Plus is a recurring subscription. Adding `$10` whenever your OpenAI, Anthropic, or OpenRouter balance drops below `$5` is an **auto-reload threshold**—canceling the web chat plan never turns off API auto-recharge.
- **Quiet tier jumps and annual promos:** Moving from a `$20` plan to a `$100` or `$200` pro/max coding tier for one intense sprint—or picking an annual discount on an AI writer—leaves big charges ticking until you explicitly step back down.
- **Multi-currency invoices:** Teams and solo builders outside the US routinely mix USD SaaS tools with EUR, GBP, JPY, or CNY local subscriptions, making mental monthly math unreliable.

## Run a 10-minute AI subscription sweep

Open a blank spreadsheet or manual tracker and check these five places in order:

| Channel | Where to look | Common AI culprits |
| --- | --- | --- |
| **Apple / Google Play** | iPhone **Settings → Subscriptions** / Google Play **Subscriptions** | Voice note apps, ChatGPT/Claude mobile IAP, AI photo & PDF apps |
| **Stripe Link & browser billing** | Check email for `receipt from OpenAI`, `Anthropic`, `Cursor`, `Midjourney`, `Vercel` | ChatGPT, Claude, Cursor, Midjourney, Perplexity, v0 |
| **PayPal Automatic Payments** | PayPal **Settings → Payments → Automatic payments** | Annual AI writing, transcription, and browser-extension tools |
| **API billing dashboards** | OpenAI Platform, Anthropic Console, OpenRouter **Credits / Auto top-up** | Silent `$5–$50` auto-reloads triggered by scripts or coding agents |
| **Work vs. personal emails** | Search secondary Gmail / work inbox for `invoice`, `seat`, `renewal` | Duplicate seats started during a hackathon or client project |

Write down each item’s **real billed currency**, **billing cycle**, **where it bills**, and whether you want to **Keep**, **Downgrade/Pause**, or **Cancel** before its next renewal date. If you want a full step-by-step sweep across non-AI bills too, follow the [30-minute manual subscription audit](https://steadyrenew.com/blog/how-to-do-a-subscription-audit/).

## Separate fixed subscriptions from API auto-reloads

When organizing your list, split AI spending into two distinct buckets:

1. **Fixed recurring seats & trials:** Tools that charge on a calendar date (weekly, monthly, yearly, or a 7-day trial). Put an alert **2–3 days ahead** of free trials and **a week ahead** of monthly/annual seats so you can downgrade right after a heavy project ends.
2. **Usage-based API balances:** Check **Billing → Auto-recharge** inside OpenAI, Anthropic, or OpenRouter. Either turn off auto-recharge completely (so you only pay when you manually top up) or set a hard monthly budget ceiling in each dashboard.

## Keep AI subscriptions visible across currencies and tools

Once your trimmed list is clean, you do not need another `$10/month` bank-linked tracker just to watch `$20` AI tools:

- **Spreadsheets** work fine if all your tools bill in USD and you manually update calendar reminders when switching plans.
- **[SteadyRenew](https://steadyrenew.com/app)** is useful if you want browser-first tracking with zero bank connection, converted multi-currency totals (USD, EUR, GBP, CNY, JPY, HKD, CAD, AUD, CHF, SGD), and **AI screenshot or one-line draft capture**—paste a Stripe receipt screenshot or type `Cursor Pro $20 monthly next 18th`, inspect the draft, and save. Free ($0) includes unlimited subscriptions, sync, Bark reminders, JSON export, 10 monthly AI captures, and API/MCP access; Premium is $9 USD once for 300 monthly AI captures and printable A4 PDF reports.
- **Query from your coding assistant:** Because SteadyRenew includes [REST API and MCP support](https://steadyrenew.com/blog/manage-subscriptions-with-mcp/) on the Free plan, you can connect Claude, ChatGPT, or Cursor directly to your own subscription ledger and ask *"How much am I spending on AI tools this month?"* or *"Which trials end this week?"*

As always, SteadyRenew does **not** connect to your bank, read credit card feeds, cancel AI plans for you, or monitor live API token usage.

## FAQ

### How do I tell if ChatGPT or Claude is billing me through Apple instead of the website?

Check your card statement descriptor and email receipts. `APPLE.COM/BILL` charges live in **iPhone Settings → [your name] → Subscriptions**, whereas web subscriptions email a Stripe/OpenAI or Anthropic receipt and must be canceled inside your browser account settings.

### Does canceling ChatGPT Plus or Claude Pro stop OpenAI or Anthropic API billing?

No. Consumer chat subscriptions (`chatgpt.com` or `claude.ai`) and developer API consoles (`platform.openai.com` or `console.anthropic.com`) have completely separate billing systems. Always check API **Billing / Auto-recharge** settings separately.

### Can I downgrade an expensive AI coding plan before renewal without losing the rest of the month?

Most major web AI subscriptions let you cancel or schedule a downgrade immediately while keeping paid features active until the current billing period ends. Still read the confirmation prompt carefully, especially for prepaid annual plans or usage credits.

### What is the easiest way to track AI bills in multiple currencies without sharing bank logins?

Log each tool in its original billed currency inside a spreadsheet or a privacy-focused manual tracker like SteadyRenew, set converted display totals in your home currency, and pair annual or trial rows with reminders a few days before renewal.

## Related reading

- [Connect SteadyRenew to an MCP client](https://steadyrenew.com/blog/manage-subscriptions-with-mcp/)
- [How to create an annual software subscription expense report (spreadsheet or A4 PDF)](https://steadyrenew.com/blog/software-subscription-expense-report-pdf/)
- [How to catch subscription price increases before annual plans auto-renew](https://steadyrenew.com/blog/track-subscription-price-increases/)
- [How to choose a subscription tracker without linking your bank](https://steadyrenew.com/blog/best-subscription-trackers-without-bank-login/)
- [Bobby app alternatives for iPhone, Android, and desktop web](https://steadyrenew.com/blog/bobby-app-alternatives/)
- [How to do a subscription audit (keep / cancel / remind)](https://steadyrenew.com/blog/how-to-do-a-subscription-audit/)
