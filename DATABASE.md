# Database

ACET AI uses Supabase (PostgreSQL) with Row Level Security.

## Migration

```bash
# Supabase CLI
npx supabase db push

# Or paste supabase/migrations/001_initial_schema.sql into the SQL editor
```

## Core entities

| Table | Purpose |
|-------|---------|
| `organizations` | Tenant |
| `profiles` | User profile (1:1 with `auth.users`) |
| `memberships` | User ↔ org role (`owner`, `admin`, `member`, `viewer`) |
| `plans` / `subscriptions` / `usage_records` | Billing |
| `conversations` / `messages` | Chat history |
| `agents` | Named agent configs |
| `agent_runs` | Execution records + JSON steps snapshot |
| `workflow_steps` | Normalized step rows |
| `tool_calls` | Individual tool invocations |
| `companies` / `contacts` / `leads` | CRM |
| `campaigns` / `emails` | Outreach |
| `notifications` / `reminders` | User alerts |
| `integrations` | Connected providers (credential refs only) |
| `approvals` | Human-in-the-loop gates |
| `audit_logs` | Sensitive action log |
| `activity_events` | Dashboard activity feed |
| `documents` | File metadata |

## Tenancy

- All business tables carry `organization_id`.
- Helper: `user_organization_ids()` returns orgs for `auth.uid()`.
- Policies restrict SELECT/INSERT/UPDATE to membership.

## Agent run lifecycle

Statuses (schema CHECK):

`planning` → `running` → `awaiting_approval` → `completed` | `failed` | `cancelled`

Steps are stored both as JSON on `agent_runs.steps` (for fast UI) and as rows in `workflow_steps` (for querying).

## Bootstrap

On first authenticated request, `ensureUserOrganization`:

1. Upserts `profiles`
2. Creates a personal `organizations` row (if none)
3. Creates `memberships` as `owner`
4. Upserts free `subscriptions`

This is idempotent.

## Indexes

Key indexes exist on org + status / created_at for runs, leads, notifications, approvals, and activity.
