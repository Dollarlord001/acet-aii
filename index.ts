import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isAppError } from "@/lib/errors";
import type { ExecutorContext, ExecutorResult, ToolExecutor } from "./types";
import {
  webSearchTool,
  findBusinessLeadsTool,
  storeLeadTool,
  draftEmailTool,
  sendEmailBatchTool,
  createReminderTool,
  searchLeadsTool,
  scoreLeadTool,
  listRemindersTool,
  scheduleFollowUpTool,
  researchCompanyTool,
  analyzeBusinessDataTool,
  createNotificationTool,
} from "@/tools/registry";
import { scoreLead as scoreLeadSignals } from "@/services/lead-scoring";
import { isApifyConfigured } from "@/lib/apify/client";
import { parseLeadObjective } from "@/services/lead-generation";
import type { RegisteredTool } from "./types";

/** Web search — uses a lightweight public search when available; otherwise clear failure */
const executeWebSearch: ToolExecutor = async (args) => {
  const query = String(args.query ?? "");
  const maxResults = Number(args.maxResults ?? 10);

  // Prefer configured search API; fall back to structured "not connected" rather than fake data
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    // Try a minimal DuckDuckGo HTML scrape is not reliable; return honest state
    return {
      success: false,
      code: "INTEGRATION_NOT_CONNECTED",
      error:
        "Web search is not configured. Set SERPER_API_KEY (or connect an Apify actor) to enable research tools.",
    };
  }

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": serperKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: maxResults }),
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Search API error: ${res.status}`,
      };
    }

    const data = await res.json();
    const organic = (data.organic ?? []).slice(0, maxResults).map(
      (r: { title?: string; link?: string; snippet?: string }) => ({
        title: r.title ?? "",
        url: r.link ?? "",
        snippet: r.snippet ?? "",
      })
    );

    return {
      success: true,
      data: { query, results: organic },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Search failed",
    };
  }
};

const executeStoreLead: ToolExecutor = async (args, ctx) => {
  const supabase = await createClient();

  const companyName = String(args.companyName ?? "").trim();
  if (!companyName) {
    return { success: false, error: "companyName is required" };
  }

  // Upsert company
  const domain =
    args.domain != null
      ? String(args.domain)
      : args.website
        ? String(args.website)
            .replace(/^https?:\/\//, "")
            .split("/")[0]
        : null;

  let companyId: string | null = null;

  if (domain) {
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("domain", domain)
      .maybeSingle();

    if (existing) {
      companyId = existing.id;
    }
  }

  if (!companyId) {
    const { data: company, error } = await supabase
      .from("companies")
      .insert({
        organization_id: ctx.organizationId,
        name: companyName,
        website: args.website ? String(args.website) : null,
        domain,
        location: args.location ? String(args.location) : null,
        industry: args.industry ? String(args.industry) : null,
      })
      .select("id")
      .single();

    if (error || !company) {
      return { success: false, error: error?.message ?? "Failed to store company" };
    }
    companyId = company.id;
  }

  let contactId: string | null = null;
  if (args.contactEmail || args.contactName) {
    const { data: contact, error: cErr } = await supabase
      .from("contacts")
      .insert({
        organization_id: ctx.organizationId,
        company_id: companyId,
        full_name: args.contactName ? String(args.contactName) : null,
        email: args.contactEmail ? String(args.contactEmail) : null,
      })
      .select("id")
      .single();

    if (!cErr && contact) contactId = contact.id;
  }

  const score =
    args.score != null ? Number(args.score) : null;

  const { data: lead, error: lErr } = await supabase
    .from("leads")
    .insert({
      organization_id: ctx.organizationId,
      company_id: companyId,
      contact_id: contactId,
      source: args.source ? String(args.source) : "agent",
      status: "new",
      score,
      notes: args.notes ? String(args.notes) : null,
      metadata: { agent_run_id: ctx.agentRunId },
    })
    .select("id")
    .single();

  if (lErr || !lead) {
    return { success: false, error: lErr?.message ?? "Failed to store lead" };
  }

  // Activity event
  await supabase.from("activity_events").insert({
    organization_id: ctx.organizationId,
    user_id: ctx.userId,
    event_type: "lead_created",
    title: `Lead stored: ${companyName}`,
    metadata: { lead_id: lead.id, agent_run_id: ctx.agentRunId },
  });

  return {
    success: true,
    data: {
      leadId: lead.id,
      companyId,
      contactId,
      companyName,
    },
  };
};

const executeDraftEmail: ToolExecutor = async (args) => {
  const toName = args.toName ? String(args.toName) : "there";
  const toCompany = args.toCompany ? String(args.toCompany) : "your company";
  const purpose = String(args.purpose ?? "follow up");
  const tone = (args.tone as string) ?? "professional";
  const keyPoints = Array.isArray(args.keyPoints)
    ? (args.keyPoints as string[])
    : [];

  const pointsBlock =
    keyPoints.length > 0
      ? "\n\n" + keyPoints.map((p) => `• ${p}`).join("\n")
      : "";

  const subject =
    tone === "friendly"
      ? `Quick note about ${toCompany}`
      : `Regarding ${purpose} — ${toCompany}`;

  const body = `Hi ${toName},

I hope this finds you well. I'm reaching out regarding ${purpose} at ${toCompany}.${pointsBlock}

Would you be open to a brief conversation next week?

Best regards`;

  return {
    success: true,
    data: {
      subject,
      body,
      toName,
      toCompany,
      purpose,
      tone,
      status: "draft",
    },
  };
};

const executeSendEmailBatch: ToolExecutor = async (_args, _ctx) => {
  // High-risk — should only run after approval. Still check integration.
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return {
      success: false,
      code: "INTEGRATION_NOT_CONNECTED",
      error:
        "Gmail is not connected. Connect Google OAuth in Settings before sending email.",
    };
  }

  return {
    success: false,
    code: "INTEGRATION_NOT_CONNECTED",
    error:
      "Gmail send path is prepared but requires per-org OAuth tokens. Connect Gmail in Settings.",
  };
};

const executeCreateReminder: ToolExecutor = async (args, ctx) => {
  const title = String(args.title ?? "").trim();
  if (!title) {
    return { success: false, error: "title is required" };
  }

  const dueAt = String(args.dueAt ?? "");
  if (!dueAt || Number.isNaN(Date.parse(dueAt))) {
    return { success: false, error: "dueAt must be a valid ISO 8601 datetime" };
  }

  const supabase = await createClient();
  const recurrence = (args.recurrence as string) ?? "none";

  const { data: reminder, error } = await supabase
    .from("reminders")
    .insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      title,
      description: args.description ? String(args.description) : null,
      due_at: dueAt,
      recurrence: recurrence === "none" ? null : recurrence,
      status: "pending",
      related_entity_type: "agent_run",
      related_entity_id: ctx.agentRunId,
    })
    .select("id, title, due_at, status")
    .single();

  if (error || !reminder) {
    return { success: false, error: error?.message ?? "Failed to create reminder" };
  }

  await supabase.from("activity_events").insert({
    organization_id: ctx.organizationId,
    user_id: ctx.userId,
    event_type: "reminder_created",
    title: `Reminder: ${title}`,
    metadata: { reminder_id: reminder.id, agent_run_id: ctx.agentRunId },
  });

  return {
    success: true,
    data: reminder,
  };
};

/** Apify lead generation — integration boundary only */
export const executeApifyLeadGen: ToolExecutor = async (_args, _ctx) => {
  if (!process.env.APIFY_API_TOKEN) {
    return {
      success: false,
      code: "INTEGRATION_NOT_CONNECTED",
      error:
        "Apify is not configured. Set APIFY_API_TOKEN and connect an actor to enable lead generation scraping.",
    };
  }

  return {
    success: false,
    code: "INTEGRATION_NOT_CONNECTED",
    error:
      "Apify token is present but no actor is configured for this organization yet.",
  };
};

const executeFindBusinessLeads: ToolExecutor = async (args) => {
  if (!isApifyConfigured()) {
    return {
      success: false,
      code: "INTEGRATION_NOT_CONNECTED",
      error:
        "Apify connection required. Set APIFY_API_TOKEN to run leafy-dev-jr/no-website-business-leads-scraper-google-maps.",
    };
  }
  const parsed = parseLeadObjective(
    `Find ${args.maxResults ?? 20} businesses in ${args.location ?? "unspecified"}`
  );
  return {
    success: true,
    data: {
      message:
        "Use the dedicated lead-generation workflow (command bar) for full collect → score → save.",
      parsed: {
        ...parsed,
        location: args.location ?? parsed.location,
        country: args.country ?? parsed.country,
        onlyNoOrWeakWebsite:
          args.onlyNoOrWeakWebsite ?? parsed.onlyNoOrWeakWebsite,
      },
    },
  };
};

const executeSearchLeads: ToolExecutor = async (args, ctx) => {
  const supabase = await createClient();
  let q = supabase
    .from("leads")
    .select("id, status, score, source, notes, metadata, created_at, companies(name, website, location)")
    .eq("organization_id", ctx.organizationId)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(Number(args.limit ?? 20));

  if (args.status) q = q.eq("status", String(args.status));
  if (args.minScore != null) q = q.gte("score", Number(args.minScore));

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { leads: data ?? [], count: data?.length ?? 0 } };
};

const executeScoreLead: ToolExecutor = async (args) => {
  const hasWebsite = Boolean(args.hasWebsite);
  const scored = scoreLeadSignals({
    hasWebsite,
    phone: args.hasPhone ? "provided" : null,
    rating: args.rating != null ? Number(args.rating) : null,
    reviewCount: args.reviewCount != null ? Number(args.reviewCount) : null,
    webPresenceCategory: hasWebsite ? null : "none",
  });
  return {
    success: true,
    data: {
      companyName: args.companyName ? String(args.companyName) : undefined,
      leadId: args.leadId ? String(args.leadId) : undefined,
      ...scored,
    },
  };
};

const executeListReminders: ToolExecutor = async (args, ctx) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminders")
    .select("id, title, description, due_at, status, recurrence")
    .eq("organization_id", ctx.organizationId)
    .eq("user_id", ctx.userId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(Number(args.limit ?? 20));
  if (error) return { success: false, error: error.message };
  return { success: true, data: { reminders: data ?? [] } };
};

const executeScheduleFollowUp: ToolExecutor = async (args, ctx) => {
  const title = String(args.title ?? "").trim();
  if (!title) return { success: false, error: "title is required" };
  const days = Number(args.daysFromNow ?? 3);
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + days);
  due.setUTCHours(10, 0, 0, 0);
  const recurrence = (args.recurrence as string) ?? "none";
  const supabase = await createClient();
  const { data: reminder, error } = await supabase
    .from("reminders")
    .insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      title,
      description: args.description ? String(args.description) : null,
      due_at: due.toISOString(),
      recurrence: recurrence === "none" ? null : recurrence,
      status: "pending",
      related_entity_type: args.relatedLeadId ? "lead" : "agent_run",
      related_entity_id: (args.relatedLeadId as string) ?? ctx.agentRunId,
    })
    .select("id, title, due_at, status, recurrence")
    .single();
  if (error || !reminder) {
    return { success: false, error: error?.message ?? "Failed to schedule follow-up" };
  }
  return { success: true, data: reminder };
};

const executeResearchCompany: ToolExecutor = async (args, ctx) => {
  const companyName = String(args.companyName ?? "").trim();
  if (!companyName) return { success: false, error: "companyName is required" };
  // Reuse web search path when Serper is configured
  const search = await executeWebSearch(
    {
      query: `${companyName} company ${args.focus ?? "overview"}`,
      maxResults: 8,
    },
    ctx
  );
  if (!search.success) {
    return {
      success: false,
      code: search.code ?? "INTEGRATION_NOT_CONNECTED",
      error:
        search.error ??
        "Research requires a connected search integration (SERPER_API_KEY).",
    };
  }
  return {
    success: true,
    data: {
      companyName,
      focus: args.focus ?? "general",
      findings: search.data,
    },
  };
};

const executeAnalyzeBusinessData: ToolExecutor = async (args, ctx) => {
  const supabase = await createClient();
  const limit = Number(args.limit ?? 25);
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, status, score, source, created_at")
    .eq("organization_id", ctx.organizationId)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return { success: false, error: error.message };

  const rows = leads ?? [];
  const byStatus: Record<string, number> = {};
  let scored = 0;
  let high = 0;
  for (const l of rows) {
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
    if (l.score != null) scored += 1;
    if (Number(l.score) >= 60) high += 1;
  }

  const focus = String(args.focus ?? "pipeline");
  const summary = {
    focus,
    totalExamined: rows.length,
    byStatus,
    scoredCount: scored,
    highPriorityCount: high,
    topLeadIds: rows.slice(0, 5).map((l) => l.id),
    note:
      rows.length === 0
        ? "No leads in CRM yet. Run lead generation first."
        : undefined,
  };
  return { success: true, data: summary };
};

const executeCreateNotification: ToolExecutor = async (args, ctx) => {
  const title = String(args.title ?? "").trim();
  if (!title) return { success: false, error: "title is required" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      type: String(args.type ?? "in_app"),
      title,
      body: args.body ? String(args.body) : null,
      link: args.link ? String(args.link) : null,
    })
    .select("id, type, title, created_at")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to create notification" };
  }
  return { success: true, data };
};

const executeCalendarCreateEvent: ToolExecutor = async () => {
  return {
    success: false,
    code: "INTEGRATION_NOT_CONNECTED",
    error:
      "Google Calendar is not connected. Connect Google Workspace OAuth before creating events.",
  };
};

export function getRegisteredTools(): RegisteredTool[] {
  return [
    { definition: webSearchTool, execute: executeWebSearch },
    { definition: findBusinessLeadsTool, execute: executeFindBusinessLeads },
    { definition: researchCompanyTool, execute: executeResearchCompany },
    { definition: storeLeadTool, execute: executeStoreLead },
    { definition: searchLeadsTool, execute: executeSearchLeads },
    { definition: scoreLeadTool, execute: executeScoreLead },
    { definition: draftEmailTool, execute: executeDraftEmail },
    { definition: sendEmailBatchTool, execute: executeSendEmailBatch },
    { definition: createReminderTool, execute: executeCreateReminder },
    { definition: scheduleFollowUpTool, execute: executeScheduleFollowUp },
    { definition: listRemindersTool, execute: executeListReminders },
    { definition: analyzeBusinessDataTool, execute: executeAnalyzeBusinessData },
    { definition: createNotificationTool, execute: executeCreateNotification },
    {
      definition: {
        name: "calendar_create_event",
        description:
          "Create a Google Calendar event. Requires Google Workspace connection.",
        inputSchema: z.object({
          title: z.string().min(1),
          startAt: z.string().optional(),
          endAt: z.string().optional(),
          description: z.string().optional(),
        }),
        permissionLevel: "write",
        risk: "medium",
        timeoutMs: 15000,
      },
      execute: executeCalendarCreateEvent,
    },
  ];
}


export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ExecutorContext
): Promise<ExecutorResult> {
  const tools = getRegisteredTools();
  const tool = tools.find((t) => t.definition.name === name);
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }

  try {
    // Validate input with Zod schema
    const parsed = tool.definition.inputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid arguments: ${parsed.error.message}`,
      };
    }

    return await tool.execute(parsed.data as Record<string, unknown>, ctx);
  } catch (err) {
    if (isAppError(err)) {
      return {
        success: false,
        code: err.code,
        error: err.userMessage,
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
