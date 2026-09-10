/**
 * Server-side tool router.
 * Validates auth context, schema, approval policy, and integration availability.
 */

import { getCapability, integrationConnected } from "./tool-registry";
import { requiresApproval } from "./policy";
import { runTool } from "@/lib/agent/executors";
import type { ExecutorContext, ExecutorResult } from "@/lib/agent/executors/types";
import type { RiskLevel } from "./policy";

export interface RouterRequest {
  toolName: string;
  args: Record<string, unknown>;
  ctx: ExecutorContext;
  /** When true, high-risk tools may execute (post-approval) */
  approvalGranted?: boolean;
}

export interface RouterResult extends ExecutorResult {
  blocked?: boolean;
  requiresApproval?: boolean;
  risk?: RiskLevel;
}

export async function routeTool(req: RouterRequest): Promise<RouterResult> {
  const cap = getCapability(req.toolName);
  if (!cap) {
    return {
      success: false,
      error: `Unknown tool: ${req.toolName}`,
      blocked: true,
    };
  }

  const risk = cap.definition.risk as RiskLevel;
  const needsApproval = requiresApproval(risk, cap.definition.requiresApproval);

  if (needsApproval && !req.approvalGranted) {
    return {
      success: false,
      blocked: true,
      requiresApproval: true,
      risk,
      code: "APPROVAL_REQUIRED",
      error: `Tool "${req.toolName}" requires human approval before execution.`,
    };
  }

  if (cap.requiresIntegration && !integrationConnected(cap.requiresIntegration)) {
    return {
      success: false,
      blocked: true,
      risk,
      code: "INTEGRATION_NOT_CONNECTED",
      error: `${cap.requiresIntegration} is not connected. Connect it to use ${req.toolName}.`,
    };
  }

  // Schema + execution via existing executor layer
  const result = await runTool(req.toolName, req.args, req.ctx);
  return {
    ...result,
    risk,
    requiresApproval: needsApproval,
  };
}
