/**
 * Apify research adapter — wraps the live lead-generation actor capability.
 */

import type { ToolDefinition } from "@/lib/ai/types";
import { findBusinessLeadsTool, webSearchTool } from "@/tools/registry";
import type {
  ConnectionStatus,
  IntegrationAdapter,
  IntegrationContext,
} from "../types";

function hasToken(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}

export const apifyAdapter: IntegrationAdapter = {
  id: "apify",
  name: "Apify",
  type: "api",
  capabilities: ["lead_research", "business_research"],

  async status(_ctx?: IntegrationContext): Promise<ConnectionStatus> {
    return hasToken() ? "connected" : "not_connected";
  },

  async isAvailable(): Promise<boolean> {
    return hasToken();
  },

  async getTools(): Promise<ToolDefinition[]> {
    // Always expose definitions so the planner can see them;
    // execution still fails honestly when token is missing.
    return [findBusinessLeadsTool, webSearchTool];
  },

  async statusDetail(): Promise<string | undefined> {
    if (!hasToken()) {
      return "Set APIFY_API_TOKEN to enable lead research (leafy-dev-jr/no-website-business-leads-scraper-google-maps).";
    }
    return `Actor: ${process.env.APIFY_LEAD_ACTOR ?? "leafy-dev-jr/no-website-business-leads-scraper-google-maps"}`;
  },
};
