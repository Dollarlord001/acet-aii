# ACET AI — Netlify deployment guide

Deploy the existing Next.js application. Do not put secrets in the repository.

## Step-by-step

1. **Connect the GitHub repository to Netlify**  
   Netlify → Add new site → Import an existing project → GitHub → select the ACET AI repo.

2. **Select the ACET AI repository**  
   Choose the branch you deploy from (usually `main`).

3. **Confirm Next.js framework**  
   Netlify should detect Next.js. With `@netlify/plugin-nextjs` in `netlify.toml`, the Next runtime is used.

4. **Confirm build settings**  
   - Build command: `npm run build`  
   - Publish directory: leave as Netlify/Next plugin default (do not set a static `out` folder)  
   - Node version: `20` (set in `netlify.toml`)

5. **Add environment variables**  
   Netlify → Site configuration → Environment variables → add every variable listed in the table below that you need for launch.  
   Paste values only in the Netlify UI (or CLI). Never commit them.

6. **Deploy**  
   Trigger a production deploy and wait until the build succeeds.

7. **Get the Netlify URL**  
   Example: `https://your-site-name.netlify.app`

8. **Set `NEXT_PUBLIC_APP_URL`**  
   Add or update:  
   `NEXT_PUBLIC_APP_URL=https://your-site-name.netlify.app`  
   Redeploy so client/server code sees the production URL.

9. **Update Supabase Auth URLs**  
   Supabase Dashboard → Authentication → URL configuration:  
   - Site URL: your Netlify URL  
   - Redirect URLs: include  
     `https://your-site-name.netlify.app/**`  
     and  
     `https://your-site-name.netlify.app/auth/callback`

10. **Configure Google OAuth later (optional)**  
    After the Netlify URL is final:  
    - Google Cloud Console → OAuth client → Authorized redirect URIs → add  
      `https://your-site-name.netlify.app/api/auth/google/callback`  
    - Netlify env:  
      `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,  
      `GOOGLE_REDIRECT_URI=https://your-site-name.netlify.app/api/auth/google/callback`  
    Google is **not** required for core agent usage.

11. **Custom domain later**  
    Netlify → Domain management → add domain → update `NEXT_PUBLIC_APP_URL`, Supabase Auth URLs, and Google redirect URI to the custom domain.

## Environment variable table

| Variable | Required? | Purpose | Secret? |
|----------|-----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL | No (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Supabase anon key (RLS enforced) | No (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** (recommended) | Server-side admin operations | **Yes** |
| `GEMINI_API_KEY` | **Yes** (recommended) | Primary AI provider | **Yes** |
| `GROQ_API_KEY` | **Yes** (recommended) | Fallback AI provider | **Yes** |
| `NEXT_PUBLIC_APP_URL` | After first deploy | Canonical site URL | No |
| `APIFY_API_TOKEN` | Recommended | Lead research actor runs | **Yes** |
| `SERPER_API_KEY` | Recommended | Web research | **Yes** |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client | No (public client id) |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth secret | **Yes** |
| `GOOGLE_REDIRECT_URI` | Optional | OAuth callback (real Netlify URL) | No |
| `PAYSTACK_SECRET_KEY` | Optional | Billing API | **Yes** |
| `PAYSTACK_PUBLIC_KEY` | Optional | Checkout public key | No |
| `PAYSTACK_WEBHOOK_SECRET` | Optional | Webhook verification | **Yes** |
| `MCP_SERVER_URL` | Optional | Single MCP server | Depends |
| `MCP_SERVERS_JSON` | Optional | Multiple MCP servers | **Yes** (may contain tokens) |

## Health check

After deploy:

```http
GET https://your-site-name.netlify.app/api/health
```

Returns only `configured` / `not_configured` / `partial` per integration. Never returns key values.

## Security rules

- Do not put secrets in git, `netlify.toml`, or source code.
- Do not use `NEXT_PUBLIC_` for service-role keys, API tokens, OAuth client secrets, or Paystack secrets.
- Google OAuth and Paystack are optional for initial launch.
- Missing integrations must show not connected / not configured — never fake success.
