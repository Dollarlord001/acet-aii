/** Shared domain types and status constants for ACET AI */

export const AGENT_RUN_STATUS = {
  QUEUED: "queued",
  PLANNING: "planning",
  RUNNING: "running",
  AWAITING_APPROVAL: "awaiting_approval",
  /** Multi-step run paused until a future time / worker picks it up */
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type AgentRunStatus =
  (typeof AGENT_RUN_STATUS)[keyof typeof AGENT_RUN_STATUS];

export const WORKFLOW_STEP_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  AWAITING_APPROVAL: "awaiting_approval",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
} as const;

export type WorkflowStepStatus =
  (typeof WORKFLOW_STEP_STATUS)[keyof typeof WORKFLOW_STEP_STATUS];

export const APPROVAL_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXPIRED: "expired",
} as const;

export type ApprovalStatus =
  (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

export const MEMBERSHIP_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  VIEWER: "viewer",
} as const;

export type MembershipRole =
  (typeof MEMBERSHIP_ROLES)[keyof typeof MEMBERSHIP_ROLES];

export const LEAD_STATUS = {
  NEW: "new",
  QUALIFIED: "qualified",
  CONTACTED: "contacted",
  NURTURING: "nurturing",
  WON: "won",
  LOST: "lost",
  DISQUALIFIED: "disqualified",
} as const;

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

export const REMINDER_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  DISMISSED: "dismissed",
  COMPLETED: "completed",
} as const;

export type ReminderStatus =
  (typeof REMINDER_STATUS)[keyof typeof REMINDER_STATUS];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  organization_id: string;
  user_id: string;
  role: MembershipRole;
  created_at: string;
}

export interface AgentRunRow {
  id: string;
  organization_id: string;
  user_id: string;
  conversation_id: string | null;
  agent_id: string | null;
  objective: string;
  status: AgentRunStatus;
  plan: string | null;
  result_summary: string | null;
  steps: unknown;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ApprovalRow {
  id: string;
  organization_id: string;
  agent_run_id: string | null;
  workflow_step_id: string | null;
  requested_by: string | null;
  action_summary: string;
  payload: unknown;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface DashboardMetrics {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  activeRuns: number;
  pendingApprovals: number;
  totalLeads: number;
  pendingReminders: number;
}
