/**
 * Google Workspace adapter foundation.
 * Tools are advertised only when OAuth client credentials exist.
 * No fake send/read — execution remains gated until tokens are connected.
 */

import { z } from "zod";
import type { ToolDefinition } from "@/lib/ai/types";
import { sendEmailBatchTool } from "@/tools/registry";
import type {
  ConnectionStatus,
  IntegrationAdapter,
  IntegrationContext,
} from "../types";

function hasOAuthClient(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

/** Placeholder tool defs for discovery — executors return not_connected until OAuth is wired */
const gmailSearchTool: ToolDefinition = {
  name: "gmail_search",
  description: "Search Gmail messages. Requires Google Workspace connection.",
  inputSchema: z.object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(50).optional(),
  }),
  permissionLevel: "read",
  risk: "medium",
  timeoutMs: 30000,
};

const calendarCreateTool: ToolDefinition = {
  name: "calendar_create_event",
  description: "Create a Google Calendar event. Requires Google Workspace connection.",
  inputSchema: z.object({
    title: z.string().min(1),
    startAt: z.string().datetime(),
    endAt: z.string().datetime().optional(),
    description: z.string().optional(),
  }),
  permissionLevel: "write",
  risk: "medium",
  timeoutMs: 15000,
};

const driveSearchTool: ToolDefinition = {
  name: "drive_search",
  description: "Search Google Drive files. Requires Google Workspace connection.",
  inputSchema: z.object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(50).optional(),
  }),
  permissionLevel: "read",
  risk: "medium",
  timeoutMs: 30000,
};

const sheetsReadTool: ToolDefinition = {
  name: "sheets_read",
  description: "Read data from a Google Sheet. Requires Google Workspace connection.",
  inputSchema: z.object({
    spreadsheetId: z.string().min(1),
    range: z.string().min(1),
  }),
  permissionLevel: "read",
  risk: "medium",
  timeoutMs: 20000,
};

const docsReadTool: ToolDefinition = {
  name: "docs_read",
  description: "Read a Google Doc. Requires Google Workspace connection.",
  inputSchema: z.object({
    documentId: z.string().min(1),
  }),
  permissionLevel: "read",
  risk: "medium",
  timeoutMs: 20000,
};

export const googleAdapter: IntegrationAdapter = {
  id: "google",
  name: "Google Workspace",
  type: "api",
  capabilities: [
    "email_search",
    "email_send",
    "calendar_read",
    "calendar_create",
    "drive_search",
    "sheet_read",
    "document_read",
  ],

  async status(_ctx?: IntegrationContext): Promise<ConnectionStatus> {
    // Client credentials alone ≠ user-connected; treat as available when OAuth app is configured
    if (!hasOAuthClient()) return "not_connected";
    return "available";
  },

  async isAvailable(): Promise<boolean> {
    // Not fully connected until per-org OAuth tokens exist (future)
    return false;
  },

  async getTools(): Promise<ToolDefinition[]> {
    // Expose send_email_batch (existing) + discovery defs for planning honesty
    return [
      sendEmailBatchTool,
      gmailSearchTool,
      calendarCreateTool,
      driveSearchTool,
      sheetsReadTool,
      docsReadTool,
    ];
  },

  async statusDetail(): Promise<string | undefined> {
    if (!hasOAuthClient()) {
      return "Google is not connected yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (optional for launch).";
    }
    if (!process.env.GOOGLE_REDIRECT_URI?.trim()) {
      return "OAuth client present. Set GOOGLE_REDIRECT_URI to your production callback after Netlify deploy.";
    }
    return "Google OAuth configured; complete user consent to connect Workspace tools.";
  },
};
