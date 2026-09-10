import { z } from "zod";
import type { ToolDefinition } from "@/lib/ai/types";

/**
 * Tool capability registry.
 * Each entry is a capability, not a random integration.
 */

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description:
    "Search the public web for business information, directories, and research. Returns titles, snippets, and URLs.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Search query"),
    maxResults: z.number().int().min(1).max(20).optional().default(10),
  }),
  permissionLevel: "read",
  risk: "low",
  timeoutMs: 30000,
  retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
};

export const storeLeadTool: ToolDefinition = {
  name: "store_lead",
  description:
    "Persist a qualified lead (company + optional contact) into the organization's lead database.",
  inputSchema: z.object({
    companyName: z.string().min(1),
    website: z.string().url().optional().nullable(),
    domain: z.string().optional().nullable(),
    location: z.string().optional(),
    industry: z.string().optional(),
    contactName: z.string().optional(),
    contactEmail: z.string().email().optional(),
    score: z.number().min(0).max(100).optional(),
    notes: z.string().optional(),
    source: z.string().optional(),
  }),
  permissionLevel: "write",
  risk: "medium",
  timeoutMs: 10000,
  retryPolicy: { maxAttempts: 2, backoffMs: 500 },
};

export const draftEmailTool: ToolDefinition = {
  name: "draft_email",
  description:
    "Draft an outreach or follow-up email. Does not send. Returns subject and body for review.",
  inputSchema: z.object({
    toName: z.string().optional(),
    toCompany: z.string().optional(),
    purpose: z.string().describe("Why we are writing"),
    tone: z.enum(["professional", "friendly", "concise"]).optional().default("professional"),
    keyPoints: z.array(z.string()).optional(),
  }),
  permissionLevel: "read",
  risk: "low",
  timeoutMs: 20000,
};

export const sendEmailBatchTool: ToolDefinition = {
  name: "send_email_batch",
  description:
    "Send a batch of previously drafted emails. REQUIRES APPROVAL. Never call without user confirmation.",
  inputSchema: z.object({
    emailIds: z.array(z.string()).max(100).optional().default([]),
    campaignId: z.string().optional(),
  }),
  permissionLevel: "external_communication",
  risk: "high",
  requiresApproval: true,
  timeoutMs: 120000,
};

export const createReminderTool: ToolDefinition = {
  name: "create_reminder",
  description: "Create a structured reminder for the user (one-time or recurring).",
  inputSchema: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    dueAt: z.string().datetime().describe("ISO 8601 datetime"),
    recurrence: z
      .enum(["none", "daily", "weekly", "monthly"])
      .optional()
      .default("none"),
  }),
  permissionLevel: "write",
  risk: "low",
  timeoutMs: 5000,
};

export const findBusinessLeadsTool: ToolDefinition = {
  name: "find_business_leads",
  description:
    "Find local businesses (optionally without websites) via the Apify Google Maps lead actor. Provide location and optional filters.",
  inputSchema: z.object({
    location: z.string().min(1),
    country: z.string().min(2).max(2).optional(),
    maxResults: z.number().int().min(1).max(50).optional(),
    businessTypes: z.array(z.string()).optional(),
    onlyNoOrWeakWebsite: z.boolean().optional(),
  }),
  permissionLevel: "read",
  risk: "medium",
  timeoutMs: 240000,
  retryPolicy: { maxAttempts: 1, backoffMs: 2000 },
};

export const searchLeadsTool: ToolDefinition = {
  name: "search_leads",
  description:
    "Search the organization's saved leads by status, minimum score, or free-text query.",
  inputSchema: z.object({
    query: z.string().optional(),
    status: z.string().optional(),
    minScore: z.number().min(0).max(100).optional(),
    limit: z.number().int().min(1).max(100).optional().default(20),
  }),
  permissionLevel: "read",
  risk: "low",
  timeoutMs: 15000,
};

export const scoreLeadTool: ToolDefinition = {
  name: "score_lead",
  description:
    "Score or re-score a lead using structured signals (web presence, contactability, engagement).",
  inputSchema: z.object({
    leadId: z.string().uuid().optional(),
    companyName: z.string().optional(),
    hasWebsite: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
    rating: z.number().optional(),
    reviewCount: z.number().optional(),
  }),
  permissionLevel: "write",
  risk: "low",
  timeoutMs: 10000,
};

export const listRemindersTool: ToolDefinition = {
  name: "list_reminders",
  description: "List upcoming pending reminders for the current user.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional().default(20),
  }),
  permissionLevel: "read",
  risk: "low",
  timeoutMs: 10000,
};

export const scheduleFollowUpTool: ToolDefinition = {
  name: "schedule_follow_up",
  description:
    "Schedule a follow-up reminder relative to now (e.g. in N days). Supports recurrence.",
  inputSchema: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    daysFromNow: z.number().int().min(0).max(365).optional().default(3),
    recurrence: z
      .enum(["none", "daily", "weekly", "monthly"])
      .optional()
      .default("none"),
    relatedLeadId: z.string().uuid().optional(),
  }),
  permissionLevel: "write",
  risk: "low",
  timeoutMs: 10000,
};

export const researchCompanyTool: ToolDefinition = {
  name: "research_company",
  description:
    "Research a company or prospect online presence. Uses web search when configured.",
  inputSchema: z.object({
    companyName: z.string().min(1),
    website: z.string().optional(),
    focus: z
      .enum([
        "online_presence",
        "competitors",
        "market",
        "general",
      ])
      .optional()
      .default("general"),
  }),
  permissionLevel: "read",
  risk: "low",
  timeoutMs: 45000,
};

export const analyzeBusinessDataTool: ToolDefinition = {
  name: "analyze_business_data",
  description:
    "Analyze organization CRM data (leads pipeline) and produce a structured summary. Does not invent external data.",
  inputSchema: z.object({
    focus: z
      .enum(["pipeline", "priority_leads", "weekly_report", "executive_summary"])
      .optional()
      .default("pipeline"),
    limit: z.number().int().min(1).max(100).optional().default(25),
  }),
  permissionLevel: "read",
  risk: "low",
  timeoutMs: 30000,
};

export const createNotificationTool: ToolDefinition = {
  name: "create_notification",
  description:
    "Create an in-app notification for the current user (workflow completion, approval, failure, reminder).",
  inputSchema: z.object({
    type: z.enum([
      "in_app",
      "workflow_completion",
      "approval",
      "failure",
      "reminder",
    ]),
    title: z.string().min(1),
    body: z.string().optional(),
    link: z.string().optional(),
  }),
  permissionLevel: "write",
  risk: "low",
  timeoutMs: 5000,
};

export const coreTools: ToolDefinition[] = [
  webSearchTool,
  findBusinessLeadsTool,
  researchCompanyTool,
  storeLeadTool,
  searchLeadsTool,
  scoreLeadTool,
  draftEmailTool,
  sendEmailBatchTool,
  createReminderTool,
  scheduleFollowUpTool,
  listRemindersTool,
  analyzeBusinessDataTool,
  createNotificationTool,
];
