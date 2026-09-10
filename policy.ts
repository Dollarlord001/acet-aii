/**
 * Approval policy engine.
 * Risk drives whether a tool may execute automatically.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ApprovalDecision =
  | "auto_execute"
  | "prepare_optional_review"
  | "require_approval"
  | "require_explicit_confirmation";

const RISK_POLICY: Record<RiskLevel, ApprovalDecision> = {
  low: "auto_execute",
  medium: "prepare_optional_review",
  high: "require_approval",
  critical: "require_explicit_confirmation",
};

export function decisionForRisk(risk: RiskLevel): ApprovalDecision {
  return RISK_POLICY[risk] ?? "require_approval";
}

export function requiresApproval(
  risk: RiskLevel,
  explicitFlag?: boolean
): boolean {
  if (explicitFlag === true) return true;
  const d = decisionForRisk(risk);
  return d === "require_approval" || d === "require_explicit_confirmation";
}

export function canAutoExecute(risk: RiskLevel, explicitFlag?: boolean): boolean {
  return !requiresApproval(risk, explicitFlag);
}
