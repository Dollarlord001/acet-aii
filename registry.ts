/**
 * Integration registry — source of connection status + capability discovery.
 * Executable tools remain in the tool registry; this layer answers
 * "what is connected?" and "what can I use?"
 */

import type { ToolDefinition } from "@/lib/ai/types";
import { requiresApproval } from "@/lib/agent/policy";
import { internalAdapter } from "./adapters/internal";
import { apifyAdapter } from "./adapters/apify";
import { googleAdapter } from "./adapters/google";
import { createMcpAdapters } from "./adapters/mcp";
import type {
  CapabilityDescriptor,
  ConnectionStatus,
  IntegrationAdapter,
  IntegrationContext,
  IntegrationStatusSnapshot,
} from "./types";

const STATIC_ADAPTERS: IntegrationAdapter[] = [
  internalAdapter,
  apifyAdapter,
  googleAdapter,
];

export function listAdapters(): IntegrationAdapter[] {
  return [...STATIC_ADAPTERS, ...createMcpAdapters()];
}

export function getAdapter(id: string): IntegrationAdapter | undefined {
  return listAdapters().find((a) => a.id === id);
}

export async function getIntegrationStatuses(
  context?: IntegrationContext
): Promise<IntegrationStatusSnapshot[]> {
  const adapters = listAdapters();
  const out: IntegrationStatusSnapshot[] = [];
  for (const a of adapters) {
    const status = await a.status(context);
    const detail = a.statusDetail ? await a.statusDetail(context) : undefined;
    out.push({
      id: a.id,
      name: a.name,
      type: a.type,
      status,
      detail,
      capabilities: a.capabilities.slice(),
    });
  }
  return out;
}

export async function discoverCapabilities(
  context?: IntegrationContext
): Promise<CapabilityDescriptor[]> {
  const adapters = listAdapters();
  const results: CapabilityDescriptor[] = [];

  for (const adapter of adapters) {
    const status = await adapter.status(context);
    const available = await adapter.isAvailable(context);
    let tools: ToolDefinition[] = [];
    try {
      tools = await adapter.getTools(context);
    } catch {
      tools = [];
    }

    for (const tool of tools) {
      results.push({
        id: `${adapter.id}:${tool.name}`,
        name: tool.name,
        description: tool.description,
        integrationId: adapter.id,
        toolName: tool.name,
        category: tool.permissionLevel,
        risk: tool.risk,
        requiresApproval: requiresApproval(
          tool.risk,
          tool.requiresApproval
        ),
        // Only advertise as available when integration can actually run
        available,
        connectionStatus: status,
      });
    }
  }

  return results;
}

/** Compact text for agent system prompts / planners */
export async function capabilityCatalogForAgent(
  context?: IntegrationContext
): Promise<string> {
  const caps = await discoverCapabilities(context);
  const lines = caps.map((c) => {
    const flag = c.available ? "AVAILABLE" : c.connectionStatus.toUpperCase();
    return `- ${c.toolName} [${c.integrationId}] ${flag} risk=${c.risk}${c.requiresApproval ? " APPROVAL" : ""}: ${c.description}`;
  });
  return lines.length
    ? lines.join("\n")
    : "No capabilities registered.";
}

export async function isIntegrationConnected(
  integrationId: string,
  context?: IntegrationContext
): Promise<boolean> {
  const adapter = getAdapter(integrationId);
  if (!adapter) return false;
  const status = await adapter.status(context);
  return status === "connected" || status === "available";
}

export type { ConnectionStatus, IntegrationStatusSnapshot, CapabilityDescriptor };
