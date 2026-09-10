# ACET AI — Production checklist

## Repository

- [ ] GitHub repository created
- [ ] No secrets committed
- [ ] `.env.example` present (placeholders only)
- [ ] `netlify.toml` present
- [ ] `docs/NETLIFY-DEPLOYMENT.md` present

## Netlify (initial launch)

- [ ] Environment variables added to Netlify (not GitHub)
- [ ] Supabase configured (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Gemini configured (`GEMINI_API_KEY`)
- [ ] Groq configured (`GROQ_API_KEY`)
- [ ] Apify configured (`APIFY_API_TOKEN`) — recommended
- [ ] Serper configured (`SERPER_API_KEY`) — recommended
- [ ] First Netlify deployment completed
- [ ] `NEXT_PUBLIC_APP_URL` updated to the live Netlify URL
- [ ] Redeploy after setting `NEXT_PUBLIC_APP_URL`

## Supabase Auth

- [ ] Site URL set to Netlify URL
- [ ] Redirect URLs include `/auth/callback`

## Live verification

- [ ] Live login tested
- [ ] Live AI tested
- [ ] Lead generation tested
- [ ] Agent runs tested
- [ ] Approval flow tested
- [ ] Reminders tested
- [ ] Notifications tested
- [ ] `/api/health` tested

## Optional (not required for launch)

- [ ] Google OAuth configured
- [ ] Paystack configured
- [ ] Custom domain connected
