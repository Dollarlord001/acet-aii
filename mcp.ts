/**
 * MCP (Model Context Protocol) adapter foundation.
 * Supports optional remote MCP servers via env config without hard-coding providers.
 * Credentials never leave the server.
 */

import { z } from "zod";
import type { ToolDefinition } from "@/lib/ai/types";
import type {
  ConnectionStatus,
  IntegrationAdapter,
  IntegrationContext,
} from "../types";

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  /** Optional bearer token — server-side only */
  authToken?: string;
}

/**
 * Parse MCP server configuration from environment.
 * Supports:
 *   MCP_SERVER_URL / MCP_SERVER_NAME / MCP_SERVER_TOKEN
 *   MCP_SERVERS_JSON=[{"id":"...","name":"...","url":"...","authToken":"..."}]
 */
export function loadMcpServerConfigs(): McpServerConfig[] {
  const servers: McpServerConfig[] = [];

  const json = process.env.MCP_SERVERS_JSON?.trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as Array<{
        id?: string;
        name?: string;
        url?: string;
        authToken?: string;
      }>;
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          if (s.url && s.name) {
            servers.push({
              id: s.id ?? `mcp-${servers.length + 1}`,
              name: s.name,
              url: s.url,
              authToken: s.authToken,
            });
          }
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }

  const singleUrl = process.env.MCP_SERVER_URL?.trim();
  if (singleUrl) {
    servers.push({
      id: process.env.MCP_SERVER_ID?.trim() || "mcp-default",
      name: process.env.MCP_SERVER_NAME?.trim() || "MCP Server",
      url: singleUrl,
      authToken: process.env.MCP_SERVER_TOKEN?.trim(),
    });
  }

  return servers;
}

/** In-memory cache of last discovered remote tool names (no secrets) */
const discoveredTools = new Map<string, ToolDefinition[]>();

export function createMcpAdapter(config: McpServerConfig): IntegrationAdapter {
  return {
    id: `mcp:${config.id}`,
    name: config.name,
    type: "mcp",
    capabilities: ["mcp_tools"],

    async status(_ctx?: IntegrationContext): Promise<ConnectionStatus> {
      if (!config.url) return "not_connected";
      try {
        // Lightweight probe — list tools if server speaks MCP HTTP
        const headers: Record<string, string> = {
          Accept: "application/json",
        };
        if (config.authToken) {
          headers.Authorization = `Bearer ${config.authToken}`;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(config.url, {
          method: "GET",
          headers,
          signal: controller.signal,
        }).catch(() => null);
        clearTimeout(timer);
        if (!res) return "error";
        if (res.status === 401 || res.status === 403) return "invalid";
        // 200 or method-not-allowed still means reachable
        if (res.ok || res.status === 405 || res.status === 404) {
          return "available";
        }
        return "error";
      } catch {
        return "error";
      }
    },

    async isAvailable(ctx?: IntegrationContext): Promise<boolean> {
      const s = await this.status(ctx);
      return s === "connected" || s === "available";
    },

    async getTools(): Promise<ToolDefinition[]> {
      const cached = discoveredTools.get(config.id);
      if (cached) return cached;

      // Without a full MCP client handshake, expose a generic invoke tool
      // so the agent can plan around MCP presence. Real tool schemas can be
      // populated after a successful tools/list handshake (future).
      const generic: ToolDefinition = {
        name: `mcp_${config.id}_invoke`,
        description: `Invoke a tool on MCP server "${config.name}". Requires the server to be connected.`,
        inputSchema: z.object({
          toolName: z.string().min(1),
          arguments: z.record(z.unknown()).optional(),
        }),
        permissionLevel: "write",
        risk: "medium",
        timeoutMs: 60000,
      };
      discoveredTools.set(config.id, [generic]);
      return [generic];
    },

    async statusDetail(): Promise<string | undefined> {
      return `MCP server at configured URL (id=${config.id}). Auth token is never sent to the client.`;
    },
  };
}

/** All configured MCP adapters (may be empty) */
export function createMcpAdapters(): IntegrationAdapter[] {
  return loadMcpServerConfigs().map(createMcpAdapter);
}
