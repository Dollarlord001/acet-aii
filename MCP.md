# MCP & Tool Capability Model

Tools are **capabilities**, not ad-hoc integrations. Each tool has:

- `name`, `description`
- Zod `inputSchema` (and optional `outputSchema`)
- `permissionLevel`: `read` | `write` | `destructive` | `external_communication` | `payment` | `admin`
- `risk`: `low` | `medium` | `high` | `critical`
- `timeoutMs`, `retryPolicy`
- `requiresApproval` (derived from risk when high/critical)

## Architecture

```
Tool Definition (registry)  →  Executor (server)  →  Result
                ↓
        Orchestrator routes by model tool_calls
                ↓
        Approval gate for high/critical risk
                ↓
        Persist tool_calls + audit_logs
```

Definitions live in `src/tools/registry.ts`.  
Executors live in `src/lib/agent/executors/`.

## Current tools

| Tool | Risk | Notes |
|------|------|-------|
| `web_search` | low | Requires `SERPER_API_KEY` |
| `store_lead` | medium | Writes companies/contacts/leads |
| `draft_email` | low | Returns draft only |
| `send_email_batch` | high | Approval required; Gmail OAuth |
| `create_reminder` | low | Writes `reminders` |

## Integration readiness

### Supabase
- **Purpose**: Primary data store, auth, RLS  
- **Auth**: Project keys via env  
- **Failure**: Queries fail closed  

### Apify
- **Purpose**: Lead generation / scraping actors  
- **Auth**: `APIFY_API_TOKEN`  
- **Env**: `APIFY_API_TOKEN`  
- **Failure**: `INTEGRATION_NOT_CONNECTED` — never fabricates leads  
- **Security**: Token server-side only  

### Gmail / Google
- **Purpose**: Search, read, draft, send email  
- **Auth**: OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) + per-org tokens  
- **Send risk**: high — approval required  
- **Failure**: `INTEGRATION_NOT_CONNECTED`  

### Google Calendar / Drive
- Planned: same OAuth client; separate scopes and executors  

### GitHub
- **Auth**: OAuth client credentials  
- **Use**: Issues, PRs, repo research  

### Linear
- **Auth**: API key or OAuth  
- **Use**: Project tasks from agent workflows  

### Sentry
- **Auth**: `SENTRY_DSN`  
- **Use**: Error monitoring, not agent tools  

### Custom ACET MCP
Future tools register the same way: definition + executor + risk classification. The orchestrator does not need provider-specific branches.

## Rules

1. Never put secrets in tool definitions or model messages.  
2. High/critical risk tools must create an `approvals` row and pause.  
3. Executors return structured `{ success, data?, error?, code? }`.  
4. Prefer `INTEGRATION_NOT_CONNECTED` over fake success.
