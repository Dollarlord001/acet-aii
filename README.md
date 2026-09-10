# ACET AI

**Production-grade AI business automation platform.**

> Tell ACET AI what needs to happen. ACET AI plans the work, uses the appropriate tools, executes the workflow, verifies the result and reports back.

This is **not** a generic chatbot. It is a modular agent platform for lead generation, research, email workflows, scheduling, document processing, multi-step operations, approvals, and business intelligence.

## Core capabilities

- Multi-step agent orchestration with planning, tool routing, retries, and failure recovery
- Approval gates for sensitive / irreversible actions
- Lead generation & scoring workflows
- Email automation with safety controls
- Reminders & notifications
- Tenant-isolated data (Supabase + RLS)
- AI provider abstraction (xAI / Grok + OpenAI-compatible)
- Subscription tiers (Free / Lite / Plus / Premium) — pricing configurable from backend
- Observability hooks (Sentry, Mixpanel)

## Stack

| Layer        | Technology                          |
|-------------|--------------------------------------|
| Frontend    | Next.js 15 (App Router), TypeScript, Tailwind, Framer Motion |
| Backend     | Supabase (Postgres, Auth, Storage, RLS) |
| AI          | Provider abstraction → xAI Grok (primary) |
| Validation  | Zod                                 |
| Charts      | Recharts                            |

## Quick start

```bash
cp .env.example .env.local
# Fill Supabase + XAI_API_KEY

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design, agent loop, MCP model |
| [SETUP.md](./docs/SETUP.md) | Local development |
| [ENVIRONMENT.md](./docs/ENVIRONMENT.md) | Env vars |
| [SECURITY.md](./docs/SECURITY.md) | Auth, RLS, secrets, approvals |
| [DATABASE.md](./docs/DATABASE.md) | Schema overview |
| [MCP.md](./docs/MCP.md) | Tool capability model |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Production deploy |

## Definition of done (MVP agent)

1. Authenticate a user  
2. Understand a business request  
3. Plan a multi-step workflow  
4. Call appropriate tools  
5. Retrieve & store structured results  
6. Show execution progress  
7. Handle errors with recovery  
8. Request approval for sensitive actions  
9. Enforce tenant security (RLS)  
10. Deploy successfully  

## License

Proprietary — All rights reserved.
