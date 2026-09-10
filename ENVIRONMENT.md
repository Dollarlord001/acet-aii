# Environment Variables

Copy `.env.example` to `.env.local` and fill in values. **Never commit real secrets.**

## Required for local development

| Variable | Scope | Description |
|----------|--------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon key (RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service role — never expose to browser or model |
| `XAI_API_KEY` | Server only | xAI / Grok API key |

## AI provider

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `xai` | `xai` or `openai-compatible` |
| `AI_MODEL` | `grok-2-latest` | Model id |
| `OPENAI_API_KEY` | — | Optional OpenAI-compatible key |
| `OPENAI_BASE_URL` | OpenAI default | Optional custom base URL |

## Optional integrations

| Variable | Purpose |
|----------|---------|
| `SERPER_API_KEY` | Web search (Serper) |
| `APIFY_API_TOKEN` | Apify actors for lead gen / scraping |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail / Calendar OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `SENTRY_DSN` | Error monitoring |
| `MIXPANEL_TOKEN` / `NEXT_PUBLIC_MIXPANEL_TOKEN` | Analytics |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` | Payments |

## Rate limiting

| Variable | Default |
|----------|---------|
| `RATE_LIMIT_WINDOW_MS` | `60000` |
| `RATE_LIMIT_MAX` | `100` (agent runs use a tighter default of 20/min) |

## App

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Canonical app URL (e.g. `http://localhost:3000`) |
| `NODE_ENV` | `development` / `production` |

## Security rules

1. Only `NEXT_PUBLIC_*` variables are available in the browser bundle.
2. Service role, API keys, and OAuth secrets must remain server-side.
3. Do not pass secrets into model context or tool definitions.
