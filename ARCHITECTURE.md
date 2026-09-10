# ACET AI — Architecture

## Philosophy

ACET AI is a **business operating system with an agent at the center**. Users issue natural-language objectives; the system plans, routes tools, executes, verifies, and reports — with human approval for high-risk actions.

## High-level layers

```
┌─────────────────────────────────────────────────────────────┐
│  UI (Next.js App Router)                                    │
│  Command interface · Dashboard · Agent Run view · Workflows │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  API / Server Actions                                       │
│  Auth · Rate limits · Input validation · Approval gates     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Agent Orchestrator                                         │
│  Plan → Select tools → Execute → Verify → Report            │
│  State machine · Retries · Partial completion               │
└─────────────┬───────────────────────────────┬───────────────┘
              │                               │
┌─────────────▼─────────────┐   ┌─────────────▼───────────────┐
│  AI Provider Abstraction  │   │  Tool Router / MCP layer    │
│  xAI · OpenAI-compatible  │   │  Capability registry        │
└───────────────────────────┘   └─────────────┬───────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
              Supabase DB              External APIs              Integrations
              (RLS, storage)           (search, scrape)           (email, calendar)
```

## Agent Orchestrator

Responsibilities:

1. Interpret objective  
2. Produce plan  
3. Select tools via capability registry  
4. Execute steps (sequential / parallel where safe)  
5. Track `WorkflowStep` status  
6. Enforce approval gates for `high` / `critical` risk tools  
7. Recover: retry → alternative tool → partial result → human  
8. Emit progress events for the Agent Run UI  

## Tool model (MCP-inspired)

Every tool has:

- `name`, `description`
- `inputSchema` / `outputSchema` (Zod)
- `permissionLevel`: read | write | destructive | external_communication | payment | admin
- `risk`: low | medium | high | critical
- `timeoutMs`, `retryPolicy`
- `requiresApproval` (derived from risk + policy)

The model never receives service-role keys or payment secrets.

## Memory

| Layer | Scope | Storage |
|-------|--------|---------|
| Short-term | Current conversation + active run | Messages + agent_runs.steps |
| Long-term | Preferences, business context | profiles / org config / documents |
| Task | Prior workflow results | agent_runs, leads, activity_events |

Only structured, useful information is persisted.

## Security boundaries

- Browser: anon key + user JWT only  
- Server: service role for privileged ops; never exposed to client or model context  
- RLS on all tenant tables  
- Approval table for gated actions  
- Audit log for sensitive mutations  

## Extensibility

- New AI provider: implement `AIProvider` interface  
- New tool: register definition + executor; classify risk  
- New workflow type: compose steps in orchestrator or visual builder  

See also: `MCP.md`, `SECURITY.md`, `DATABASE.md`.
