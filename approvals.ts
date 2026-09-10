import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import {
  forbidden,
  notFound,
  validationError,
  isAppError,
  toUserError,
} from "@/lib/errors";
import { APPROVAL_STATUS, AGENT_RUN_STATUS } from "@/types";
import { runTool } from "@/lib/agent/executors";

export async function listPendingApprovals() {
  const auth = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("approvals")
    .select("*")
    .eq("organization_id", auth.organizationId)
    .eq("status", APPROVAL_STATUS.PENDING)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function decideApproval(
  approvalId: string,
  decision: "approved" | "rejected"
) {
  try {
    const auth = await requireAuth();
    const supabase = await createClient();

    const { data: approval, error } = await supabase
      .from("approvals")
      .select("*")
      .eq("id", approvalId)
      .eq("organization_id", auth.organizationId)
      .maybeSingle();

    if (error) throw error;
    if (!approval) throw notFound("Approval");

    if (approval.status !== APPROVAL_STATUS.PENDING) {
      throw validationError(
        `This approval is already ${approval.status} and cannot be changed.`
      );
    }

    if (
      approval.expires_at &&
      new Date(approval.expires_at).getTime() < Date.now()
    ) {
      await supabase
        .from("approvals")
        .update({ status: APPROVAL_STATUS.EXPIRED })
        .eq("id", approvalId);
      throw validationError("This approval has expired.");
    }

    // Role check: viewers cannot approve
    if (auth.role === "viewer") {
      throw forbidden("Viewers cannot approve actions.");
    }

    const now = new Date().toISOString();
    const newStatus =
      decision === "approved"
        ? APPROVAL_STATUS.APPROVED
        : APPROVAL_STATUS.REJECTED;

    const { error: updateErr } = await supabase
      .from("approvals")
      .update({
        status: newStatus,
        decided_by: auth.userId,
        decided_at: now,
      })
      .eq("id", approvalId)
      .eq("status", APPROVAL_STATUS.PENDING); // optimistic concurrency

    if (updateErr) throw updateErr;

    // Update workflow step
    if (approval.workflow_step_id) {
      await supabase
        .from("workflow_steps")
        .update({
          status:
            decision === "approved" ? "completed" : "cancelled",
          approved_by: auth.userId,
          approved_at: now,
          completed_at: now,
        })
        .eq("id", approval.workflow_step_id);
    }

    // Audit
    await supabase.from("audit_logs").insert({
      organization_id: auth.organizationId,
      actor_id: auth.userId,
      action: `approval.${decision}`,
      entity_type: "approval",
      entity_id: approvalId,
      metadata: {
        agent_run_id: approval.agent_run_id,
        action_summary: approval.action_summary,
      },
    });

    // If approved and we have a payload tool, attempt execution
    if (decision === "approved" && approval.payload) {
      const payload = approval.payload as {
        tool?: string;
        input?: Record<string, unknown>;
        stepId?: string;
      };

      if (payload.tool && approval.agent_run_id) {
        const payloadAny = approval.payload as {
          tool?: string;
          input?: Record<string, unknown>;
          stepId?: string;
          leadIds?: string[];
          drafts?: unknown[];
        };
        const toolArgs: Record<string, unknown> = {
          ...(payload.input ?? {}),
        };
        if (payload.tool === "send_email_batch" && !toolArgs.emailIds) {
          toolArgs.emailIds = payloadAny.leadIds ?? [];
        }
        const result = await runTool(
          payload.tool,
          toolArgs,
          {
            organizationId: auth.organizationId,
            userId: auth.userId,
            agentRunId: approval.agent_run_id,
            stepId: payload.stepId,
          }
        );

        await supabase.from("audit_logs").insert({
          organization_id: auth.organizationId,
          actor_id: auth.userId,
          action: result.success
            ? `tool.${payload.tool}.succeeded`
            : `tool.${payload.tool}.failed`,
          entity_type: "agent_run",
          entity_id: approval.agent_run_id,
          metadata: {
            success: result.success,
            error: result.error ?? null,
            code: result.code ?? null,
          },
        });

        if (approval.workflow_step_id) {
          await supabase
            .from("workflow_steps")
            .update({
              status: result.success ? "completed" : "failed",
              output: result.success ? result.data : null,
              error: result.success ? null : result.error,
              completed_at: new Date().toISOString(),
            })
            .eq("id", approval.workflow_step_id);
        }

        // Resume run status if no more pending approvals
        const { count } = await supabase
          .from("approvals")
          .select("id", { count: "exact", head: true })
          .eq("agent_run_id", approval.agent_run_id)
          .eq("status", APPROVAL_STATUS.PENDING);

        await supabase
          .from("agent_runs")
          .update({
            status:
              (count ?? 0) > 0
                ? AGENT_RUN_STATUS.AWAITING_APPROVAL
                : result.success
                  ? AGENT_RUN_STATUS.COMPLETED
                  : AGENT_RUN_STATUS.FAILED,
            updated_at: new Date().toISOString(),
            completed_at:
              (count ?? 0) === 0 ? new Date().toISOString() : null,
            result_summary: result.success
              ? `Approved action completed: ${payload.tool}`
              : `Approved action failed: ${result.error}`,
          })
          .eq("id", approval.agent_run_id);
      }
    } else if (decision === "rejected" && approval.agent_run_id) {
      await supabase
        .from("agent_runs")
        .update({
          status: AGENT_RUN_STATUS.CANCELLED,
          result_summary: "Action rejected by user.",
          updated_at: new Date().toISOString(),
          completed_at: now,
        })
        .eq("id", approval.agent_run_id);
    }

    return { ok: true, status: newStatus };
  } catch (err) {
    if (isAppError(err)) {
      return { ok: false, error: toUserError(err) };
    }
    console.error("decideApproval error", err);
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Failed to process approval decision.",
        retryable: true,
      },
    };
  }
}
