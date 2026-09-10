import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import {
  toUserError,
  validationError,
  isAppError,
} from "@/lib/errors";
import { AGENT_RUN_STATUS, APPROVAL_STATUS } from "@/types";
import type { WorkflowStep } from "@/lib/ai/types";
import { runAgentEngine } from "@/lib/agent/engine";

export interface RunAgentInput {
  objective: string;
  conversationId?: string;
}

export interface RunAgentResult {
  ok: boolean;
  run?: {
    id: string;
    status: string;
    plan?: string | null;
    resultSummary?: string | null;
    steps: WorkflowStep[];
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

/**
 * Server-side entry point for starting an agent run.
 * Identity is resolved inside the agent engine from the session.
 */
export async function runAgentObjective(
  input: RunAgentInput
): Promise<RunAgentResult> {
  try {
    const objective = (input.objective ?? "").trim();
    if (!objective || objective.length < 3) {
      throw validationError(
        "Please enter a clear objective (at least 3 characters)."
      );
    }
    if (objective.length > 4000) {
      throw validationError("Objective is too long (max 4000 characters).");
    }

    return await runAgentEngine(objective);
  } catch (err) {
    if (isAppError(err)) {
      return { ok: false, error: toUserError(err) };
    }
    console.error("runAgentObjective error", err);
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "An unexpected error occurred while running the agent.",
        retryable: true,
      },
    };
  }
}

export async function listAgentRuns(limit = 20) {
  const auth = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("agent_runs")
    .select(
      "id, objective, status, plan, result_summary, created_at, updated_at, completed_at"
    )
    .eq("organization_id", auth.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function getAgentRun(runId: string) {
  const auth = await requireAuth();
  const supabase = await createClient();

  const { data: run, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("id", runId)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!run) return null;

  const { data: steps } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("agent_run_id", runId)
    .order("created_at", { ascending: true });

  const { data: approvals } = await supabase
    .from("approvals")
    .select("*")
    .eq("agent_run_id", runId)
    .order("created_at", { ascending: true });

  return {
    ...run,
    workflow_steps: steps ?? [],
    approvals: approvals ?? [],
  };
}

export async function getDashboardMetrics() {
  const auth = await requireAuth();
  const supabase = await createClient();
  const orgId = auth.organizationId;

  const [
    totalRuns,
    completedRuns,
    failedRuns,
    activeRuns,
    pendingApprovals,
    totalLeads,
    qualifiedLeads,
    highPriorityLeads,
    pendingReminders,
  ] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", AGENT_RUN_STATUS.COMPLETED),
    supabase
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", AGENT_RUN_STATUS.FAILED),
    supabase
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("status", [
        AGENT_RUN_STATUS.PLANNING,
        AGENT_RUN_STATUS.RUNNING,
        AGENT_RUN_STATUS.AWAITING_APPROVAL,
        AGENT_RUN_STATUS.QUEUED,
      ]),
    supabase
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", APPROVAL_STATUS.PENDING),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "qualified"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("score", 60),
    supabase
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "pending"),
  ]);

  return {
    totalRuns: totalRuns.count ?? 0,
    completedRuns: completedRuns.count ?? 0,
    failedRuns: failedRuns.count ?? 0,
    activeRuns: activeRuns.count ?? 0,
    pendingApprovals: pendingApprovals.count ?? 0,
    totalLeads: totalLeads.count ?? 0,
    qualifiedLeads: qualifiedLeads.count ?? 0,
    highPriorityLeads: highPriorityLeads.count ?? 0,
    pendingReminders: pendingReminders.count ?? 0,
  };
}
