/**
 * Structured agent context layers.
 * Keep simple and persisted — no vector memory required for MVP.
 */

import type { MembershipRole } from "@/types";

export type ToolCategory =
  | "research"
  | "data"
  | "communication"
  | "email"
  | "calendar"
  | "crm"
  | "documents"
  | "notifications"
  | "analytics"
  | "payments"
  | "automation";

export interface AgentRunContext {
  runId: string;
  objective: string;
  organizationId: string;
  userId: string;
  conversationId?: string;
  startedAt: string;
  /** Mutable bag of facts collected during the run */
  facts: Record<string, unknown>;
  /** Prior tool observations for this run */
  observations: Observation[];
}

export interface Observation {
  stepId: string;
  toolName: string;
  success: boolean;
  summary: string;
  data?: unknown;
  error?: string;
  at: string;
}

export interface UserContext {
  userId: string;
  email: string | null;
  role: MembershipRole;
  preferences?: Record<string, unknown>;
}

export interface OrganizationContext {
  organizationId: string;
  connectedIntegrations: string[];
  /** Tool names the org/user may use */
  availableTools: string[];
}

export interface ToolAvailability {
  name: string;
  connected: boolean;
  reason?: string;
}

export interface AgentContext {
  run: AgentRunContext;
  user: UserContext;
  organization: OrganizationContext;
  tools: ToolAvailability[];
}

export function createRunContext(input: {
  runId: string;
  objective: string;
  organizationId: string;
  userId: string;
  conversationId?: string;
}): AgentRunContext {
  return {
    runId: input.runId,
    objective: input.objective,
    organizationId: input.organizationId,
    userId: input.userId,
    conversationId: input.conversationId,
    startedAt: new Date().toISOString(),
    facts: {},
    observations: [],
  };
}
