# Deployment

## Prerequisites

- Supabase project with migration applied
- xAI (or OpenAI-compatible) API key
- Node.js 20+ for build

## Vercel (recommended)

1. Import the repository.
2. Set environment variables from `.env.example` (production values).
3. Build command: `npm run build`
4. Output: Next.js default
5. Ensure `NEXT_PUBLIC_APP_URL` matches the deployment URL.

## Build locally

```bash
npm install
npm run typecheck
npm run build
npm start
```

## Checklist before production

- [ ] All secrets set as environment variables (not in source)
- [ ] Supabase Auth providers configured (email, etc.)
- [ ] RLS policies reviewed and tested
- [ ] Service role key only on server
- [ ] Approval gates exercised for high-risk tools
- [ ] Rate limits appropriate for expected traffic
- [ ] Sentry / Mixpanel configured if desired
- [ ] Custom domain + HTTPS

## Database

Run `supabase/migrations/001_initial_schema.sql` against the production project before first deploy.

## Health

After deploy:

1. Open `/` — landing page loads  
2. Sign up / sign in  
3. Dashboard loads with zeroed metrics  
4. Submit a simple objective (e.g. create a reminder)  
5. Confirm run appears under Runs  
