# ACET AI — Netlify deployment

## Required for first launch

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Anon key (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Server-only admin operations |
| `GEMINI_API_KEY` | Recommended | Primary AI; agent free-form reasoning |
| `GROQ_API_KEY` | Optional | Fallback AI |

## Optional integrations

| Variable | Purpose |
|----------|---------|
| `APIFY_API_TOKEN` | Live lead research |
| `SERPER_API_KEY` | Web research |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Workspace OAuth (optional) |
| `GOOGLE_REDIRECT_URI` | Set **after** you know the Netlify URL |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_WEBHOOK_SECRET` | Billing (optional at launch) |
| `PAYSTACK_PUBLIC_KEY` or `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Checkout UI later |
| `MCP_SERVER_URL` / `MCP_SERVERS_JSON` | Remote MCP tools |

## Google OAuth redirect (after deploy)

1. Deploy to Netlify and note the site URL, e.g. `https://acet-ai.netlify.app`
2. In Google Cloud Console → OAuth client → Authorized redirect URIs, add:

```text
https://<your-site>.netlify.app/api/auth/google/callback
```

3. In Netlify env vars set:

```text
GOOGLE_REDIRECT_URI=https://<your-site>.netlify.app/api/auth/google/callback
NEXT_PUBLIC_APP_URL=https://<your-site>.netlify.app
```

Do **not** invent redirect URIs before the site URL exists.

## Supabase Auth

Add the same production URL under Supabase → Authentication → URL configuration (Site URL + Redirect URLs).

## Health check

After deploy:

```text
GET https://<your-site>.netlify.app/api/health
```

Returns configured / not_configured / partial for each integration. Never returns secret values.

## Security rules

- Never put secrets in git, `netlify.toml`, or `NEXT_PUBLIC_*` (except intentionally public keys).
- Never trust browser-reported payment success; verify with Paystack server-side + webhooks.
- Google OAuth is optional — email/password (or Supabase providers you enable) works without Google.
