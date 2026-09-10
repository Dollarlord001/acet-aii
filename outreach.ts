import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import { validationError, notFound } from "@/lib/errors";
import { APPROVAL_STATUS, AGENT_RUN_STATUS } from "@/types";

export interface OutreachDraft {
  leadId: string;
  companyName: string;
  subject: string;
  body: string;
}

function draftForLead(input: {
  companyName: string;
  website?: string | null;
  category?: string | null;
  city?: string | null;
  reason?: string | null;
}): { subject: string; body: string } {
  const place = input.city ? ` in ${input.city}` : "";
  const category = input.category ? ` ${input.category}` : " business";
  const websiteLine = input.website
    ? `I reviewed ${input.website} and see an opportunity to strengthen how you show up online.`
    : `I could not find a working website for ${input.companyName}.`;
  const reason = input.reason ? `\n\n${input.reason}` : "";

  return {
    subject: `A stronger web presence for ${input.companyName}`,
    body: `Hello ${input.companyName} team,

I help local${category}s${place} convert more customers through a clear, modern website.

${websiteLine}${reason}

If useful, I can send a short example of what a simple site for ${input.companyName} could look like — no obligation.

Best regards`,
  };
}

export async function getLeadDetail(leadId: string) {
  const auth = await requireAuth();
  const supabase = await createClient();

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!lead) return null;

  let company = null;
  if (lead.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("id", lead.company_id)
      .maybeSingle();
    company = data;
  }

  return { lead, company };
}

export async function listLeads(filters?: {
  q?: string;
  status?: string;
  minScore?: number;
}) {
  const auth = await requireAuth();
  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select("*")
    .eq("organization_id", auth.organizationId)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(100);

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters?.minScore != null) {
    query = query.gte("score", filters.minScore);
  }

  const { data, error } = await query;
  if (error) throw error;
  const leads = data ?? [];

  const companyIds = [
    ...new Set(
      leads.map((l) => l.company_id).filter((id): id is string => !!id)
    ),
  ];
  const companies: Record<string, Record<string, unknown>> = {};
  if (companyIds.length) {
    const { data: rows } = await supabase
      .from("companies")
      .select("*")
      .in("id", companyIds);
    for (const c of rows ?? []) companies[c.id] = c;
  }

  let filtered = leads;
  if (filters?.q) {
    const q = filters.q.toLowerCase();
    filtered = leads.filter((l) => {
      const c = l.company_id ? companies[l.company_id] : null;
      const name = String(c?.name ?? "");
      const loc = String(c?.location ?? "");
      return (
        name.toLowerCase().includes(q) ||
        loc.toLowerCase().includes(q) ||
        String(l.source ?? "").toLowerCase().includes(q) ||
        String(l.notes ?? "").toLowerCase().includes(q)
      );
    });
  }

  return { leads: filtered, companies };
}

export async function createOutreachDrafts(leadIds: string[]) {
  const auth = await requireAuth();
  if (leadIds.length === 0) {
    throw validationError("Select at least one lead.");
  }
  if (leadIds.length > 25) {
    throw validationError("Select at most 25 leads per outreach batch.");
  }

  const supabase = await createClient();
  const drafts: OutreachDraft[] = [];

  for (const leadId of leadIds) {
    const detail = await getLeadDetail(leadId);
    if (!detail) continue;
    const meta = (detail.lead.metadata ?? {}) as Record<string, unknown>;
    const companyName = String(detail.company?.name ?? "your business");
    const drafted = draftForLead({
      companyName,
      website:
        (detail.company?.website as string | null) ??
        (meta.website as string | null),
      category:
        (detail.company?.industry as string | null) ??
        (meta.category as string | null),
      city:
        (detail.company?.location as string | null) ??
        (meta.city as string | null),
      reason:
        (detail.lead.notes as string | null) ??
        (meta.outreach_reason as string | null),
    });
    drafts.push({
      leadId,
      companyName,
      subject: drafted.subject,
      body: drafted.body,
    });
  }

  if (drafts.length === 0) {
    throw validationError("None of the selected leads could be loaded.");
  }

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: auth.organizationId,
      user_id: auth.userId,
      objective: `Prepare outreach for ${drafts.length} lead(s)`,
      status: AGENT_RUN_STATUS.AWAITING_APPROVAL,
      plan: "Draft personalized emails. Wait for approval before sending.",
      result_summary: `${drafts.length} draft(s) ready for review. Sending requires approval.`,
      steps: [
        {
          name: "Draft outreach",
          status: "completed",
          output: { count: drafts.length },
        },
        {
          name: "Send outreach",
          status: "awaiting_approval",
          requiresApproval: true,
          toolName: "send_email_batch",
        },
      ],
    })
    .select("id")
    .single();

  const { data: approval, error } = await supabase
    .from("approvals")
    .insert({
      organization_id: auth.organizationId,
      agent_run_id: run?.id ?? null,
      requested_by: auth.userId,
      action_summary: `Send ${drafts.length} outreach email(s)`,
      payload: {
        tool: "send_email_batch",
        drafts,
        leadIds,
      },
      status: APPROVAL_STATUS.PENDING,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error || !approval) {
    throw new Error(error?.message ?? "Failed to create approval");
  }

  await supabase.from("audit_logs").insert({
    organization_id: auth.organizationId,
    actor_id: auth.userId,
    action: "outreach.drafts_created",
    entity_type: "approval",
    entity_id: approval.id,
    metadata: { count: drafts.length, leadIds },
  });

  return { approvalId: approval.id, drafts, runId: run?.id ?? null };
}
