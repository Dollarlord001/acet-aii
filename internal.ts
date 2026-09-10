/**
 * Internal ACET tools (Supabase-backed CRM, reminders, drafts).
 * Always available when the app is running — no external OAuth.
 */

import type { ToolDefinition } from "@/lib/ai/types";
import {
  storeLeadTool,
  draftEmailTool,
  createReminderTool,
} from "@/tools/registry";
import type {
  ConnectionStatus,
  IntegrationAdapter,
  IntegrationContext,
} from "../types";

export const internalAdapter: IntegrationAdapter = {
  id: "internal",
  name: "ACET Internal",
  type: "internal",
  capabilities: [
    "lead_storage",
    "email_draft",
    "reminder_create",
  ],

  async status(_ctx?: IntegrationContext): Promise<ConnectionStatus> {
    return "connected";
  },

  async isAvailable(): Promise<boolean> {
    return true;
  },

  async getTools(): Promise<ToolDefinition[]> {
    return [storeLeadTool, draftEmailTool, createReminderTool];
  },
};
