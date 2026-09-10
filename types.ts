/**
 * Unified integration abstraction.
 * Internal, MCP, and API tools all surface through the same shapes.
 */

import type { ToolDefinition } from "@/lib/ai/types";

export type IntegrationType = "internal" | "mcp" | "api";

export type ConnectionStatus =
  | "connected"
  | "available"
  | "not_connected"
  | "invalid"
  | "expired"
  | "error";

export interface IntegrationContext {
  organizationId?: string;
  userId?: string;
}

export interface IntegrationAdapter {
  id: string;
  name: string;
  type: IntegrationType;
  /** High-level capability ids this adapter can expose */
  capabilities: string[];
  status(context?: IntegrationContext): Promise<ConnectionStatus>;
  isAvailable(context?: IntegrationContext): Promise<boolean>;
  getTools(context?: IntegrationContext): Promise<ToolDefinition[]>;
  /** Optional human-readable status detail (never secrets) */
  statusDetail?(context?: IntegrationContext): Promise<string | undefined>;
}

export interface CapabilityDescriptor {
  id: string;
  name: string;
  description: string;
  integrationId: string;
  toolName: string;
  category: string;
  risk: string;
  requiresApproval: boolean;
  available: boolean;
  connectionStatus: ConnectionStatus;
}

export interface IntegrationStatusSnapshot {
  id: string;
  name: string;
  type: IntegrationType;
  status: ConnectionStatus;
  detail?: string;
  capabilities: string[];
}
