# AI Capture

[English](ai-capture.md) | [简体中文](../zh-CN/ai-capture.md)

AI capture lets signed-in users describe subscription changes in natural language or upload a screenshot. The model returns a proposed command; the app shows a review screen and only writes data after the user confirms.

## Supported Actions

- Create one or more subscriptions from text, a receipt, a statement excerpt, or a screenshot.
- Update an existing subscription by name or id.
- Batch update several subscriptions in one request.
- Delete an existing subscription after review.
- Confirm, edit, discard, or undo the resulting action in the app.

AI never writes directly to subscription storage. It only prepares a structured command.

## Required Services

- Supabase auth.
- Supabase migrations through `20260625000100_ai_budget_reservations.sql`.
- Netlify Functions.
- `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`.

If no provider key is configured, the app falls back to the manual add form.

## Server Variables

```bash
OPENROUTER_API_KEY=
ANTHROPIC_API_KEY=
AI_PROVIDER=openrouter
AI_MODEL=google/gemini-2.5-flash-lite
AI_FALLBACK_MODELS=google/gemini-2.5-flash
OPENROUTER_SITE_URL=https://your-site.example
OPENROUTER_APP_TITLE=Subscription Manager
AI_FREE_DAILY_PARSES=20
AI_PREMIUM_DAILY_PARSES=200
AI_MAX_INPUT_CHARS=20000
AI_MAX_IMAGE_BYTES=4194304
AI_MONTHLY_BUDGET_USD=50
AI_INPUT_USD_PER_MTOK=0.1
AI_OUTPUT_USD_PER_MTOK=0.4
```

## Privacy

Pasted text or uploaded screenshots are sent once to the configured model provider for extraction. Subscription Manager does not store or log that content. The database stores only per-user daily counters and workspace-wide monthly aggregate token counts.

For the full guide, see the Mintlify page at `docs-site/en/integrations/ai-capture.mdx`.
