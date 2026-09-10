import { z } from "zod";
import type { ToolDefinition } from "@/lib/ai/types";
import type { ToolCategory } from "./context";
import type { RiskLevel } from "./policy";
import { requiresApproval } from "./policy";
import {
  webSearchTool,
  storeLeadTool,
  draftEmailTool,
  sendEmailBatchTool,
  createReminderTool,
  findBusinessLeadsTool,
  searchLeadsTool,
  scoreLeadTool,
  listRemindersTool,
  scheduleFollowUpTool,
  researchCompanyTool,
  analyzeBusinessDataTool,
  createNotificationTool,
} from "@/tools/registry";

export interface RegisteredCapability {
  definition: ToolDefinition;
  category: ToolCategory;
  /** Integration id required for this tool, if any */
  requiresIntegration?: string;
  /** Human label for UI / planner */
  label: string;
}

function withMeta(
  def: ToolDefinition,
  category: ToolCategory,
  label: string,
  requiresIntegration?: string
): RegisteredCapability {
  const risk = def.risk as RiskLevel;
  return {
    definition: {
      ...def,
      requiresApproval: requiresApproval(risk, def.requiresApproval),
    },
    category,
    label,
    requiresIntegration,
  };
}

/** Canonical capability registry — add tools here without touching the engine */
export const CAPABILITY_REGISTRY: RegisteredCapability[] = [
  withMeta(webSearchTool, "research", "Web search", "serper"),
  withMeta(findBusinessLeadsTool, "research", "Find business leads", "apify"),
  withMeta(researchCompanyTool, "research", "Research company", "serper"),
  withMeta(storeLeadTool, "crm", "Store lead"),
  withMeta(searchLeadsTool, "crm", "Search leads"),
  withMeta(scoreLeadTool, "crm", "Score lead"),
  withMeta(draftEmailTool, "email", "Draft email"),
  withMeta(sendEmailBatchTool, "email", "Send email batch", "gmail"),
  withMeta(createReminderTool, "notifications", "Create reminder"),
  withMeta(scheduleFollowUpTool, "notifications", "Schedule follow-up"),
  withMeta(listRemindersTool, "notifications", "List reminders"),
  withMeta(analyzeBusinessDataTool, "analytics", "Analyze business data"),
  withMeta(createNotificationTool, "notifications", "Create notification"),
];

export function listCapabilities(): RegisteredCapability[] {
  return CAPABILITY_REGISTRY.slice();
}

export function getCapability(name: string): RegisteredCapability | undefined {
  return CAPABILITY_REGISTRY.find((c) => c.definition.name === name);
}

export function capabilitiesForCategories(
  categories: ToolCategory[]
): RegisteredCapability[] {
  const set = new Set(categories);
  return CAPABILITY_REGISTRY.filter((c) => set.has(c.category));
}

/** Integration connectivity checks (aligned with integration adapters) */
export function integrationConnected(id: string): boolean {
  switch (id) {
    case "apify":
      return Boolean(process.env.APIFY_API_TOKEN?.trim());
    case "serper":
      return Boolean(process.env.SERPER_API_KEY?.trim());
    case "gmail":
    case "google":
      // OAuth client configured ≠ user workspace connected
      return false;
    case "gemini":
      return Boolean(process.env.GEMINI_API_KEY?.trim());
    case "groq":
      return Boolean(process.env.GROQ_API_KEY?.trim());
    case "internal":
      return true;
    default:
      if (id.startsWith("mcp:")) {
        return Boolean(
          process.env.MCP_SERVER_URL?.trim() ||
            process.env.MCP_SERVERS_JSON?.trim()
        );
      }
      return true;
  }
}

export function availableCapabilities(): RegisteredCapability[] {
  return CAPABILITY_REGISTRY.filter((c) => {
    if (!c.requiresIntegration) return true;
    return integrationConnected(c.requiresIntegration);
  });
}

export function capabilityCatalogText(
  caps: RegisteredCapability[] = availableCapabilities()
): string {
  return caps
    .map(
      (c) =>
        `- ${c.definition.name} [${c.category}] risk=${c.definition.risk}: ${c.definition.description}`
    )
    .join("\n");
}

/** Lightweight structured intent hints for planner (not hard-coded workflows) */
export const IntentSchema = z.object({
  primary_capability: z.enum([
    "lead_generation",
    "reminder",
    "email_draft",
    "email_send",
    "crm_analysis",
    "research",
    "calendar",
    "report",
    "follow_up",
    "general",
  ]),
  needs_approval: z.boolean().optional(),
  suggested_tools: z.array(z.string()).optional(),
  /** Ordered multi-step tool chain when the objective implies composition */
  plan_tools: z.array(z.string()).optional(),
});

export type IntentClassification = z.infer<typeof IntentSchema>;

/**
 * Deterministic capability classifier used when no model is available
 * and as a fast path. Prefer model-based classification when configured.
 */
export function classifyObjective(objective: string): IntentClassification {
  const t = objective.toLowerCase();

  if (
    /\b(send|dispatch)\b/.test(t) &&
    /\b(email|emails|outreach|message|messages)\b/.test(t)
  ) {
    return {
      primary_capability: "email_send",
      needs_approval: true,
      suggested_tools: ["send_email_batch"],
      plan_tools: ["send_email_batch"],
    };
  }

  if (
    ((/\b(draft|prepare|write)\b/.test(t) &&
      /\b(email|emails|outreach|follow-?up)\b/.test(t)) ||
      /\bpersonalized outreach\b/.test(t)) &&
    !(/\b(find|search|discover)\b/.test(t) && /\b(business|lead|prospect)/.test(t))
  ) {
    return {
      primary_capability: "email_draft",
      suggested_tools: ["search_leads", "draft_email"],
      plan_tools: ["search_leads", "draft_email"],
    };
  }

  if (
    /\b(remind|reminder|remind me)\b/.test(t) ||
    (/\bfollow up\b/.test(t) &&
      /\b(tomorrow|today|next week|in \d+ days?|every \d+ days?|at \d)/.test(t))
  ) {
    const recurring = /\bevery\b/.test(t) || /\brecurring\b/.test(t);
    return {
      primary_capability: recurring ? "follow_up" : "reminder",
      suggested_tools: recurring
        ? ["schedule_follow_up"]
        : ["create_reminder"],
      plan_tools: recurring ? ["schedule_follow_up"] : ["create_reminder"],
    };
  }

  if (
    /\b(calendar|availability|available slots?|schedule a meeting|create a meeting)\b/.test(
      t
    )
  ) {
    return {
      primary_capability: "calendar",
      suggested_tools: ["calendar_create_event"],
      plan_tools: ["calendar_create_event"],
    };
  }

  if (
    /\b(weekly report|business report|executive summary|pipeline report)\b/.test(
      t
    ) ||
    (/\b(report|summary)\b/.test(t) && /\b(business|sales|pipeline|leads)\b/.test(t))
  ) {
    return {
      primary_capability: "report",
      suggested_tools: ["analyze_business_data"],
      plan_tools: ["analyze_business_data", "create_notification"],
    };
  }

  // Multi-capability business ops (research + outreach + follow-up)
  if (
    /\b(find|search|discover)\b/.test(t) &&
    /\b(business|lead|prospect)/.test(t) &&
    /\b(outreach|email|follow)/.test(t)
  ) {
    return {
      primary_capability: "lead_generation",
      suggested_tools: [
        "find_business_leads",
        "score_lead",
        "store_lead",
        "draft_email",
        "schedule_follow_up",
      ],
      plan_tools: [
        "find_business_leads",
        "score_lead",
        "store_lead",
        "draft_email",
        "schedule_follow_up",
      ],
    };
  }

  if (
    (/\b(find|search|scrape|generate|discover)\b/.test(t) &&
      /\b(business|businesses|lead|leads|prospect|prospects|compan)/.test(t)) ||
    /\bwithout websites?\b/.test(t)
  ) {
    const rank = /\b(rank|priorit|best|top)\b/.test(t);
    return {
      primary_capability: "lead_generation",
      suggested_tools: rank
        ? ["find_business_leads", "score_lead", "search_leads"]
        : ["find_business_leads", "store_lead"],
      plan_tools: rank
        ? ["find_business_leads", "score_lead", "search_leads"]
        : ["find_business_leads", "store_lead"],
    };
  }

  if (
    /\b(analyze|analysis|pipeline|which leads|priority|deserve attention|rank my)\b/.test(
      t
    )
  ) {
    return {
      primary_capability: "crm_analysis",
      suggested_tools: ["search_leads", "analyze_business_data"],
      plan_tools: ["search_leads", "analyze_business_data"],
    };
  }

  if (
    /\b(research|look up|investigate|online presence|summarize (these )?compan)/.test(
      t
    )
  ) {
    return {
      primary_capability: "research",
      suggested_tools: ["research_company", "web_search"],
      plan_tools: ["research_company"],
    };
  }

  return { primary_capability: "general", suggested_tools: [] };
}
