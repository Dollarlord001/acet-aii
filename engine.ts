/**
 * ACET AI core agent engine.
 *
 * USER OBJECTIVE → classify → plan → execute → observe → replan → complete
 *
 * Lead generation remains a specialized path for reliability; other
 * objectives use capability-driven tool execution.
 */

import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import { assertRateLimit } from "@/lib/rate-limit";
import { isAIConfigured, createAIProvider } from "@/lib/ai/provider";
import {
  classifyObjective,
  availableCapabilities,
  capabilityCatalogText,
  getCapability,
} from "./tool-registry";
import { routeTool } from "./router";
import { createRunContext, type Observation } from "./context";
import { capabilityCatalogForAgent } from "@/lib/integrations/registry";
import { AGENT_RUN_STATUS, APPROVAL_STATUS } from "@/types";
import {
  isLeadGenerationObjective,
  runLeadGenerationWorkflow,
} from "@/services/lead-generation";
import type { WorkflowStep } from "@/lib/ai/types";
import type { AgentRunStatus } from "@/types";

export interface StructuredPlanStep {
  id: string;
  purpose: string;
  tool?: string;
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "blocked"
    | "waiting_approval"
    | "skipped";
  args?: Record<string, unknown>;
  error?: string;
}

export interface StructuredPlan {
  objective: string;
  intent: string;
  steps: StructuredPlanStep[];
}

export interface EngineResult {
  ok: boolean;
  run?: {
    id: string;
    status: string;
    plan?: string | null;
    resultSummary?: string | null;
    steps: WorkflowStep[];
  };
  error?: { code: string; message: string; retryable: boolean };
}

function toWorkflowSteps(plan: StructuredPlan): WorkflowStep[] {
  return plan.steps.map((s) => ({
    id: s.id,
    name: s.purpose,
    status:
      s.status === "waiting_approval"
        ? "awaiting_approval"
        : s.status === "blocked"
          ? "failed"
          : (s.status as WorkflowStep["status"]),
    toolName: s.tool,
    input: s.args,
    error: s.error,
    requiresApproval: s.status === "waiting_approval",
  }));
}

function parseReminderDue(objective: string): string {
  const now = new Date();
  if (/tomorrow/i.test(objective)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  }
  const atMatch = objective.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (atMatch) {
    let h = Number(atMatch[1]);
    const m = Number(atMatch[2] ?? 0);
    const mer = (atMatch[3] ?? "").toLowerCase();
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

function progressLabel(tool?: string, purpose?: string): string {
  if (!tool && purpose) return purpose;
  switch (tool) {
    case "find_business_leads":
      return "Researching";
    case "web_search":
    case "research_company":
      return "Researching";
    case "search_leads":
      return "Collecting";
    case "score_lead":
      return "Scoring";
    case "store_lead":
      return "Saving";
    case "draft_email":
      return "Preparing";
    case "send_email_batch":
      return "Executing";
    case "create_reminder":
    case "schedule_follow_up":
      return "Scheduling";
    case "list_reminders":
      return "Collecting";
    case "analyze_business_data":
      return "Analyzing";
    case "create_notification":
      return "Notifying";
    case "calendar_create_event":
      return "Scheduling";
    default:
      return purpose ?? "Executing";
  }
}

function parseDaysFromObjective(objective: string, fallback = 3): number {
  const m = objective.match(/\bin\s+(\d+)\s+days?\b/i);
  if (m) return Math.min(365, Math.max(0, Number(m[1])));
  const every = objective.match(/\bevery\s+(\d+)\s+days?\b/i);
  if (every) return Math.min(365, Math.max(1, Number(every[1])));
  if (/tomorrow/i.test(objective)) return 1;
  return fallback;
}

function buildPlan(objective: string): StructuredPlan {
  const intent = classifyObjective(objective);
  const tools =
    intent.plan_tools && intent.plan_tools.length > 0
      ? intent.plan_tools
      : intent.suggested_tools ?? [];

  // Capability-aware: if calendar requested, plan marks dependency on Google
  if (intent.primary_capability === "calendar") {
    return {
      objective,
      intent: intent.primary_capability,
      steps: [
        {
          id: uuidv4(),
          purpose: progressLabel("calendar_create_event", "Scheduling"),
          tool: "calendar_create_event",
          status: "pending",
          args: { title: objective.slice(0, 120) },
        },
      ],
    };
  }

  if (intent.primary_capability === "reminder") {
    const titleMatch = objective.match(
      /remind(?:\s+me)?(?:\s+to)?\s+(.+?)(?:\s+tomorrow|\s+at\s+|\s+on\s+|\s+in\s+|$)/i
    );
    const title = titleMatch?.[1]?.trim() || objective.slice(0, 120);
    return {
      objective,
      intent: intent.primary_capability,
      steps: [
        {
          id: uuidv4(),
          purpose: progressLabel("create_reminder", "Scheduling"),
          tool: "create_reminder",
          status: "pending",
          args: {
            title,
            description: objective,
            dueAt: parseReminderDue(objective),
            recurrence: "none",
          },
        },
      ],
    };
  }

  if (intent.primary_capability === "follow_up") {
    const days = parseDaysFromObjective(objective, 3);
    const recurring = /\bevery\b/i.test(objective);
    return {
      objective,
      intent: intent.primary_capability,
      steps: [
        {
          id: uuidv4(),
          purpose: progressLabel("schedule_follow_up", "Scheduling"),
          tool: "schedule_follow_up",
          status: "pending",
          args: {
            title: objective.slice(0, 120),
            description: objective,
            daysFromNow: days,
            recurrence: recurring ? "weekly" : "none",
          },
        },
      ],
    };
  }

  if (tools.length > 0) {
    const steps = tools.map((tool) => {
      const step: StructuredPlanStep = {
        id: uuidv4(),
        purpose: progressLabel(tool),
        tool,
        status: "pending",
      };
      if (tool === "draft_email") {
        step.args = {
          purpose: objective,
          tone: "professional",
          keyPoints: [
            "Reference research signals",
            "Propose a clear next step",
          ],
        };
      } else if (tool === "send_email_batch") {
        step.args = { emailIds: [] };
      } else if (tool === "web_search" || tool === "research_company") {
        step.args = {
          query: objective,
          companyName: objective.slice(0, 80),
          maxResults: 10,
          focus: "online_presence",
        };
      } else if (tool === "analyze_business_data") {
        step.args = {
          focus: /executive/i.test(objective)
            ? "executive_summary"
            : /weekly/i.test(objective)
              ? "weekly_report"
              : "pipeline",
          limit: 25,
        };
      } else if (tool === "create_notification") {
        step.args = {
          type: "workflow_completion",
          title: "Business report ready",
          body: "Your requested analysis is complete.",
        };
      } else if (tool === "schedule_follow_up") {
        step.args = {
          title: "Follow up on outreach",
          daysFromNow: parseDaysFromObjective(objective, 3),
          recurrence: /\bevery\b/i.test(objective) ? "weekly" : "none",
        };
      } else if (tool === "score_lead") {
        step.args = {};
      } else if (tool === "search_leads") {
        step.args = {
          minScore: /\bbest|priority|high\b/i.test(objective) ? 60 : undefined,
          limit: 50,
        };
      } else if (tool === "find_business_leads") {
        step.args = {
          location: "unspecified",
          onlyNoOrWeakWebsite: /without websites?/i.test(objective),
        };
      }
      return step;
    });

    return {
      objective,
      intent: intent.primary_capability,
      steps,
    };
  }

  return {
    objective,
    intent: intent.primary_capability,
    steps: [
      {
        id: uuidv4(),
        purpose: "Planning",
        status: "pending",
      },
    ],
  };
}

/**
 * Main entry — resolves identity, builds plan, executes via router.
 */
export async function runAgentEngine(objectiveRaw: string): Promise<EngineResult> {
  const objective = objectiveRaw.trim();
  if (objective.length < 3) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Please enter a clear objective (at least 3 characters).",
        retryable: false,
      },
    };
  }

  const auth = await requireAuth();
  assertRateLimit(`agent-run:${auth.userId}`, { max: 20, windowMs: 60_000 });

  // Specialized reliable path for lead generation (regression-safe)
  if (isLeadGenerationObjective(objective)) {
    const result = await runLeadGenerationWorkflow(objective);
    return {
      ok: result.ok,
      run: result.run,
      error: result.error,
    };
  }

  const supabase = await createClient();
  const plan = buildPlan(objective);

  const { data: runRow, error: insertErr } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: auth.organizationId,
      user_id: auth.userId,
      objective,
      status: AGENT_RUN_STATUS.PLANNING,
      plan: plan.steps.map((s, i) => `${i + 1}. ${s.purpose}${s.tool ? ` (${s.tool})` : ""}`).join("\n"),
      steps: [],
    })
    .select("*")
    .single();

  if (insertErr || !runRow) {
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Could not create agent run.",
        retryable: true,
      },
    };
  }

  const runCtx = createRunContext({
    runId: runRow.id,
    objective,
    organizationId: auth.organizationId,
    userId: auth.userId,
  });

  const observations: Observation[] = [];
  let status: AgentRunStatus = AGENT_RUN_STATUS.RUNNING;

  await supabase.from("audit_logs").insert({
    organization_id: auth.organizationId,
    actor_id: auth.userId,
    action: "agent_engine.started",
    entity_type: "agent_run",
    entity_id: runRow.id,
    metadata: { intent: plan.intent },
  });

  const persist = async (summary?: string) => {
    const steps = toWorkflowSteps(plan);
    await supabase
      .from("agent_runs")
      .update({
        status,
        plan: plan.steps
          .map((s, i) => `${i + 1}. [${s.status}] ${s.purpose}`)
          .join("\n"),
        steps,
        result_summary: summary ?? null,
        updated_at: new Date().toISOString(),
        completed_at:
          status === AGENT_RUN_STATUS.COMPLETED ||
          status === AGENT_RUN_STATUS.FAILED ||
          status === AGENT_RUN_STATUS.CANCELLED
            ? new Date().toISOString()
            : null,
      })
      .eq("id", runRow.id);

    for (const s of steps) {
      await supabase.from("workflow_steps").upsert(
        {
          id: s.id,
          agent_run_id: runRow.id,
          name: s.name,
          status: s.status,
          tool_name: s.toolName ?? null,
          input: s.input ?? null,
          output: s.output ?? null,
          error: s.error ?? null,
          requires_approval: s.requiresApproval ?? false,
        },
        { onConflict: "id" }
      );
    }
  };

  // Understanding step
  const understandId = uuidv4();
  plan.steps.unshift({
    id: understandId,
    purpose: "Understanding request",
    status: "completed",
  });
  await persist();

  // Execute planned tool steps
  for (const step of plan.steps) {
    if (step.id === understandId) continue;
    if (!step.tool) {
      // General response without tool
      if (isAIConfigured()) {
        step.status = "running";
        await persist();
        try {
          const provider = createAIProvider();
          let catalog = capabilityCatalogText(availableCapabilities());
          try {
            const live = await capabilityCatalogForAgent({
              organizationId: auth.organizationId,
              userId: auth.userId,
            });
            if (live) catalog = live;
          } catch {
            // fall back to static registry catalog
          }
          const resp = await provider.chat({
            messages: [
              {
                role: "system",
                content: `You are ACET AI. Available tools and connection status:\n${catalog}\nRespond helpfully. Do not claim tools ran if they did not. Do not use tools marked NOT_CONNECTED.`,
              },
              { role: "user", content: objective },
            ],
            temperature: 0.2,
          });
          step.status = "completed";
          runCtx.facts.modelReply = resp.message.content;
          await persist(resp.message.content ?? "Completed.");
          status = AGENT_RUN_STATUS.COMPLETED;
        } catch (err) {
          step.status = "failed";
          step.error = err instanceof Error ? err.message : "Model failed";
          status = AGENT_RUN_STATUS.FAILED;
          await persist(step.error);
        }
      } else {
        step.status = "completed";
        const msg =
          "I understood your request. Connect GEMINI_API_KEY or GROQ_API_KEY for free-form reasoning, or use a specific capability (leads, reminders, outreach).";
        await persist(msg);
        status = AGENT_RUN_STATUS.COMPLETED;
      }
      continue;
    }

    step.status = "running";
    await persist();

    const result = await routeTool({
      toolName: step.tool,
      args: step.args ?? {},
      ctx: {
        organizationId: auth.organizationId,
        userId: auth.userId,
        agentRunId: runRow.id,
        stepId: step.id,
      },
    });

    if (result.requiresApproval && result.blocked) {
      step.status = "waiting_approval";
      status = AGENT_RUN_STATUS.AWAITING_APPROVAL;

      await supabase.from("approvals").insert({
        organization_id: auth.organizationId,
        agent_run_id: runRow.id,
        workflow_step_id: step.id,
        requested_by: auth.userId,
        action_summary: `Agent requests approval: ${step.purpose}`,
        payload: {
          tool: step.tool,
          input: step.args ?? {},
          stepId: step.id,
        },
        status: APPROVAL_STATUS.PENDING,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      await supabase.from("audit_logs").insert({
        organization_id: auth.organizationId,
        actor_id: auth.userId,
        action: "approval.created",
        entity_type: "agent_run",
        entity_id: runRow.id,
        metadata: { tool: step.tool },
      });

      await persist(
        `Approval required before executing ${step.tool}. Review it under Approvals.`
      );
      break;
    }

    if (!result.success) {
      // Recoverable? single retry for non-integration errors
      const retryable =
        result.code !== "INTEGRATION_NOT_CONNECTED" &&
        result.code !== "APPROVAL_REQUIRED";

      if (retryable) {
        const retry = await routeTool({
          toolName: step.tool,
          args: step.args ?? {},
          ctx: {
            organizationId: auth.organizationId,
            userId: auth.userId,
            agentRunId: runRow.id,
            stepId: step.id,
          },
        });
        if (retry.success) {
          step.status = "completed";
          observations.push({
            stepId: step.id,
            toolName: step.tool,
            success: true,
            summary: "Succeeded on retry",
            data: retry.data,
            at: new Date().toISOString(),
          });
          runCtx.facts[step.tool] = retry.data;
          continue;
        }
        step.error = retry.error ?? result.error;
      } else {
        step.error = result.error;
      }

      step.status = "failed";
      observations.push({
        stepId: step.id,
        toolName: step.tool,
        success: false,
        summary: step.error ?? "Tool failed",
        error: step.error,
        at: new Date().toISOString(),
      });

      // Preserve partial results; fail the run honestly
      status = AGENT_RUN_STATUS.FAILED;
      await persist(step.error ?? "Step failed");
      break;
    }

    step.status = "completed";
    observations.push({
      stepId: step.id,
      toolName: step.tool,
      success: true,
      summary: `Completed ${step.tool}`,
      data: result.data,
      at: new Date().toISOString(),
    });
    runCtx.facts[step.tool] = result.data;
  }

  if (status === AGENT_RUN_STATUS.RUNNING) {
    status = AGENT_RUN_STATUS.COMPLETED;
    const summaryParts = observations.map((o) =>
      o.success ? `✓ ${o.toolName}` : `✗ ${o.toolName}: ${o.error}`
    );
    await persist(
      summaryParts.length
        ? summaryParts.join(" · ")
        : "Objective completed."
    );
  } else {
    await persist();
  }

  await supabase.from("audit_logs").insert({
    organization_id: auth.organizationId,
    actor_id: auth.userId,
    action: `agent_engine.${status}`,
    entity_type: "agent_run",
    entity_id: runRow.id,
    metadata: { intent: plan.intent, observations: observations.length },
  });

  return {
    ok: status === AGENT_RUN_STATUS.COMPLETED || status === AGENT_RUN_STATUS.AWAITING_APPROVAL,
    run: {
      id: runRow.id,
      status,
      plan: plan.steps.map((s) => `[${s.status}] ${s.purpose}`).join("\n"),
      resultSummary:
        status === AGENT_RUN_STATUS.AWAITING_APPROVAL
          ? "Waiting for approval"
          : status === AGENT_RUN_STATUS.FAILED
            ? plan.steps.find((s) => s.error)?.error ?? "Failed"
            : "Completed",
      steps: toWorkflowSteps(plan),
    },
    error:
      status === AGENT_RUN_STATUS.FAILED
        ? {
            code: "TOOL_FAILED",
            message: plan.steps.find((s) => s.error)?.error ?? "Failed",
            retryable: true,
          }
        : undefined,
  };
}

export function selectToolsForObjective(objective: string): string[] {
  const intent = classifyObjective(objective);
  const suggested = intent.suggested_tools ?? [];
  return suggested.filter((name) => {
    const cap = getCapability(name);
    if (!cap) return false;
    if (cap.requiresIntegration) {
      // Still list them so the engine can report not-connected honestly
      return true;
    }
    return true;
  });
}
