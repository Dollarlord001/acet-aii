import type { ToolDefinition } from "@/lib/ai/types";

export interface ExecutorContext {
  organizationId: string;
  userId: string;
  agentRunId: string;
  stepId?: string;
}

export interface ExecutorResult {
  success: boolean;
  data?: unknown;
  error?: string;
  code?: string;
}

export type ToolExecutor = (
  args: Record<string, unknown>,
  ctx: ExecutorContext
) => Promise<ExecutorResult>;

export interface RegisteredTool {
  definition: ToolDefinition;
  execute: ToolExecutor;
}
