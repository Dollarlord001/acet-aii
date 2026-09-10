import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import {
  DEFAULT_LEAD_ACTOR,
  getDatasetItems,
  isApifyConfigured,
  startActorRun,
  waitForRun,
} from "@/lib/apify/client";
import { scoreLead } from "@/services/lead-scoring";
import { AGENT_RUN_STATUS } from "@/types";
import type { WorkflowStep } from "@/lib/ai/types";

export interface NormalizedLead {
  businessName: string;
  category: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  source: string;
  sourceId: string | null;
  webPresenceCategory: string | null;
  outreachPriority: string | null;
  outreachReason: string | null;
  score: number;
  qualification: "high" | "medium" | "low";
  scoreReasons: { label: string; points: number; reason: string }[];
}

export interface ParsedLeadRequest {
  location: string;
  country: string;
  maxResults: number;
  businessTypes: string[];
  onlyNoOrWeakWebsite: boolean;
}

const COUNTRY_HINTS: Record<string, string> = {
  lagos: "NG",
  nigeria: "NG",
  london: "GB",
  uk: "GB",
  britain: "GB",
  "united kingdom": "GB",
  "new york": "US",
  california: "US",
  texas: "US",
  "united states": "US",
  usa: "US",
  toronto: "CA",
  canada: "CA",
  nairobi: "KE",
  kenya: "KE",
  accra: "GH",
  ghana: "GH",
  johannesburg: "ZA",
  "south africa": "ZA",
};

export function parseLeadObjective(objective: string): ParsedLeadRequest {
  const text = objective.trim();
  const lower = text.toLowerCase();

  const countMatch = lower.match(/(\d{1,4})\s+(business|businesses|leads|companies|prospects)/);
  const maxResults = countMatch
    ? Math.min(100, Math.max(1, Number(countMatch[1])))
    : 20;

  let location = "Lagos";
  const inMatch = text.match(/\bin\s+([A-Za-z][A-Za-z\s]{1,40}?)(?:\s+without|\s+with|\s+that|\s*$|[.,])/i);
  if (inMatch?.[1]) {
    location = inMatch[1].trim();
  }

  let country = "NG";
  for (const [hint, code] of Object.entries(COUNTRY_HINTS)) {
    if (lower.includes(hint)) {
      country = code;
      break;
    }
  }

  const onlyNoOrWeakWebsite =
    /without (a )?website|no website|missing website|weak website/.test(lower);

  const types: string[] = [];
  const typeHints = [
    "restaurant",
    "restaurants",
    "plumber",
    "plumbers",
    "salon",
    "salons",
    "hotel",
    "hotels",
    "clinic",
    "clinics",
    "lawyer",
    "lawyers",
    "dentist",
    "dentists",
    "gym",
    "gyms",
    "cafe",
    "cafes",
    "coffee",
  ];
  for (const t of typeHints) {
    if (lower.includes(t)) types.push(t);
  }

  return {
    location,
    country,
    maxResults: Math.min(maxResults, 50),
    businessTypes: types.length > 0 ? types.slice(0, 5) : ["local businesses"],
    onlyNoOrWeakWebsite,
  };
}

export function isLeadGenerationObjective(objective: string): boolean {
  const t = objective.toLowerCase();
  return (
    (t.includes("find") || t.includes("search") || t.includes("generate")) &&
    (t.includes("business") ||
      t.includes("lead") ||
      t.includes("prospect") ||
      t.includes("compan"))
  );
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickNum(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

export function normalizeApifyItem(
  raw: Record<string, unknown>,
  fallbackCountry: string
): NormalizedLead | null {
  const businessName = pickStr(raw, ["businessName", "name", "title"]);
  if (!businessName) return null;

  const website = pickStr(raw, ["websiteUrl", "website", "url"]);
  const webPresenceCategory = pickStr(raw, ["webPresenceCategory", "websiteType"]);
  const hasWebsite = Boolean(website) &&
    !(webPresenceCategory && /no.?site|none|missing/i.test(webPresenceCategory));

  const scored = scoreLead({
    hasWebsite,
    webPresenceCategory,
    outreachPriority: pickStr(raw, ["outreachPriority"]),
    phone: pickStr(raw, ["phone"]),
    email: pickStr(raw, ["email"]),
    rating: pickNum(raw, ["rating"]),
    reviewCount: pickNum(raw, ["reviewCount", "reviewsCount", "reviews"]),
    siteLoads: typeof raw.siteLoads === "boolean" ? raw.siteLoads : null,
    ssl: typeof raw.ssl === "boolean" ? raw.ssl : null,
  });

  const address = pickStr(raw, ["address"]);
  const matchedLocations = pickStr(raw, ["matchedLocations"]);

  return {
    businessName,
    category: pickStr(raw, ["category"]),
    address,
    city: matchedLocations ?? null,
    country: fallbackCountry,
    phone: pickStr(raw, ["phone"]),
    email: pickStr(raw, ["email"]),
    website,
    googleMapsUrl: pickStr(raw, ["googleMapsUrl", "url"]),
    rating: pickNum(raw, ["rating"]),
    reviewCount: pickNum(raw, ["reviewCount", "reviewsCount"]),
    source: "apify:leafy-dev-jr/no-website-business-leads-scraper-google-maps",
    sourceId: pickStr(raw, ["leadId", "cid", "fid"]),
    webPresenceCategory,
    outreachPriority: pickStr(raw, ["outreachPriority"]),
    outreachReason: pickStr(raw, ["outreachReason"]),
    score: scored.score,
    qualification: scored.qualification,
    scoreReasons: scored.reasons,
  };
}

export function dedupeLeads(leads: NormalizedLead[]): NormalizedLead[] {
  const seen = new Set<string>();
  const out: NormalizedLead[] = [];
  for (const lead of leads) {
    const key = (
      lead.sourceId ||
      `${lead.businessName}|${lead.phone ?? ""}|${lead.address ?? ""}`
    )
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }
  return out;
}

function step(
  name: string,
  status: WorkflowStep["status"],
  extra?: Partial<WorkflowStep>
): WorkflowStep {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    name,
    status,
    startedAt: now,
    completedAt:
      status === "completed" || status === "failed" ? now : undefined,
    ...extra,
  };
}

export async function runLeadGenerationWorkflow(objective: string) {
  const auth = await requireAuth();
  const supabase = await createClient();
  const parsed = parseLeadObjective(objective);

  const { data: runRow, error: insertErr } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: auth.organizationId,
      user_id: auth.userId,
      objective,
      status: AGENT_RUN_STATUS.PLANNING,
      plan: [
        "Interpret lead-generation objective",
        `Search ${parsed.location} (${parsed.country}) for ${parsed.businessTypes.join(", ")}`,
        parsed.onlyNoOrWeakWebsite
          ? "Filter to businesses with no or weak websites"
          : "Collect listings",
        "Normalize and deduplicate",
        "Score and persist leads",
      ].join("\n"),
      steps: [],
    })
    .select("*")
    .single();

  if (insertErr || !runRow) {
    return {
      ok: false as const,
      error: {
        code: "INTERNAL",
        message: "Could not create agent run.",
        retryable: true,
      },
    };
  }

  await supabase.from("audit_logs").insert({
    organization_id: auth.organizationId,
    actor_id: auth.userId,
    action: "lead_generation.started",
    entity_type: "agent_run",
    entity_id: runRow.id,
    metadata: parsed,
  });

  const steps: WorkflowStep[] = [];

  const persist = async (status: string, summary?: string) => {
    await supabase
      .from("agent_runs")
      .update({
        status,
        steps,
        result_summary: summary ?? null,
        updated_at: new Date().toISOString(),
        completed_at:
          status === AGENT_RUN_STATUS.COMPLETED ||
          status === AGENT_RUN_STATUS.FAILED
            ? new Date().toISOString()
            : null,
      })
      .eq("id", runRow.id);

    for (const s of steps) {
      await supabase.from("workflow_steps").upsert(
        {
          id: s.id,
          agent_run_id: runRow.id,
          name: s.name,
          description: s.description ?? null,
          status: s.status,
          tool_name: s.toolName ?? null,
          input: s.input ?? null,
          output: s.output ?? null,
          error: s.error ?? null,
          started_at: s.startedAt ?? null,
          completed_at: s.completedAt ?? null,
        },
        { onConflict: "id" }
      );
    }
  };

  steps.push(
    step("Planning", "completed", {
      description: "Interpret objective and select lead-research tools",
      output: parsed as unknown as Record<string, unknown>,
    })
  );
  await persist(AGENT_RUN_STATUS.RUNNING);

  if (!isApifyConfigured()) {
    steps.push(
      step("Researching", "failed", {
        toolName: "apify_lead_search",
        error:
          "Apify connection required. Set APIFY_API_TOKEN to run leafy-dev-jr/no-website-business-leads-scraper-google-maps.",
      })
    );
    await persist(
      AGENT_RUN_STATUS.FAILED,
      "Apify connection required. No leads were created."
    );
    await supabase.from("audit_logs").insert({
      organization_id: auth.organizationId,
      actor_id: auth.userId,
      action: "lead_generation.apify_not_connected",
      entity_type: "agent_run",
      entity_id: runRow.id,
      metadata: { actor: DEFAULT_LEAD_ACTOR },
    });

    return {
      ok: false as const,
      run: {
        id: runRow.id,
        status: AGENT_RUN_STATUS.FAILED,
        plan: runRow.plan,
        resultSummary: "Apify connection required.",
        steps,
      },
      error: {
        code: "INTEGRATION_NOT_CONNECTED",
        message:
          "Apify connection required. Add APIFY_API_TOKEN in environment variables to search Google Maps leads.",
        retryable: false,
      },
    };
  }

  const researching = step("Researching", "running", {
    toolName: "apify_lead_search",
    description: `Actor ${DEFAULT_LEAD_ACTOR}`,
    input: {
      locations: [parsed.location],
      country: parsed.country,
      businessTypes: parsed.businessTypes,
      maxResults: parsed.maxResults,
      onlyNoOrWeakWebsite: parsed.onlyNoOrWeakWebsite,
    },
  });
  steps.push(researching);
  await persist(AGENT_RUN_STATUS.RUNNING);

  try {
    const actorInput = {
      businessTypes: parsed.businessTypes,
      locations: [parsed.location],
      country: parsed.country,
      maxResults: parsed.maxResults,
      onlyNoOrWeakWebsite: parsed.onlyNoOrWeakWebsite,
      requirePhone: false,
    };

    const started = await startActorRun(DEFAULT_LEAD_ACTOR, actorInput, {
      timeoutSecs: 240,
      memory: 2048,
    });

    const finished = await waitForRun(started.id, { timeoutMs: 180_000 });

    if (finished.status !== "SUCCEEDED") {
      researching.status = "failed";
      researching.error = `Apify run ${finished.status}${
        finished.statusMessage ? `: ${finished.statusMessage}` : ""
      }`;
      researching.completedAt = new Date().toISOString();
      researching.output = { runId: finished.id, status: finished.status };
      await persist(
        AGENT_RUN_STATUS.FAILED,
        researching.error
      );
      return {
        ok: false as const,
        run: {
          id: runRow.id,
          status: AGENT_RUN_STATUS.FAILED,
          steps,
          resultSummary: researching.error,
        },
        error: {
          code: "TOOL_FAILED",
          message: researching.error,
          retryable: finished.status !== "FAILED",
        },
      };
    }

    researching.status = "completed";
    researching.completedAt = new Date().toISOString();
    researching.output = { runId: finished.id, datasetId: finished.defaultDatasetId };

    const collecting = step("Collecting leads", "running", {
      toolName: "apify_dataset",
    });
    steps.push(collecting);
    await persist(AGENT_RUN_STATUS.RUNNING);

    if (!finished.defaultDatasetId) {
      collecting.status = "failed";
      collecting.error = "Apify run succeeded but returned no dataset.";
      collecting.completedAt = new Date().toISOString();
      await persist(AGENT_RUN_STATUS.FAILED, collecting.error);
      return {
        ok: false as const,
        run: { id: runRow.id, status: AGENT_RUN_STATUS.FAILED, steps },
        error: {
          code: "TOOL_FAILED",
          message: collecting.error,
          retryable: true,
        },
      };
    }

    const rawItems = await getDatasetItems<Record<string, unknown>>(
      finished.defaultDatasetId,
      { limit: parsed.maxResults }
    );

    collecting.status = "completed";
    collecting.completedAt = new Date().toISOString();
    collecting.output = { rawCount: rawItems.length };

    const processing = step("Processing", "running", {
      description: "Normalize and deduplicate listings",
    });
    steps.push(processing);
    await persist(AGENT_RUN_STATUS.RUNNING);

    const normalized = rawItems
      .map((item) => normalizeApifyItem(item, parsed.country))
      .filter((x): x is NormalizedLead => x !== null);
    const unique = dedupeLeads(normalized);

    processing.status = "completed";
    processing.completedAt = new Date().toISOString();
    processing.output = {
      normalized: normalized.length,
      unique: unique.length,
    };

    const scoringStep = step("Scoring", "completed", {
      description: "Apply transparent heuristic scoring",
      output: {
        high: unique.filter((l) => l.qualification === "high").length,
        medium: unique.filter((l) => l.qualification === "medium").length,
        low: unique.filter((l) => l.qualification === "low").length,
      },
    });
    steps.push(scoringStep);

    const saving = step("Saving", "running");
    steps.push(saving);
    await persist(AGENT_RUN_STATUS.RUNNING);

    const savedIds: string[] = [];
    let skippedDuplicates = 0;

    for (const lead of unique) {
      // Duplicate check by source id or name+phone in this org
      if (lead.sourceId) {
        const { data: existingBySource } = await supabase
          .from("leads")
          .select("id")
          .eq("organization_id", auth.organizationId)
          .contains("metadata", { source_id: lead.sourceId })
          .maybeSingle();
        if (existingBySource) {
          skippedDuplicates += 1;
          continue;
        }
      }

      const { data: company, error: cErr } = await supabase
        .from("companies")
        .insert({
          organization_id: auth.organizationId,
          name: lead.businessName,
          website: lead.website,
          domain: lead.website
            ? lead.website.replace(/^https?:\/\//, "").split("/")[0]
            : null,
          industry: lead.category,
          location: [lead.address, lead.city, lead.country]
            .filter(Boolean)
            .join(", "),
          country: lead.country,
          metadata: {
            phone: lead.phone,
            email: lead.email,
            google_maps_url: lead.googleMapsUrl,
            rating: lead.rating,
            review_count: lead.reviewCount,
            web_presence: lead.webPresenceCategory,
            source_id: lead.sourceId,
          },
        })
        .select("id")
        .single();

      if (cErr || !company) continue;

      if (lead.email || lead.phone) {
        await supabase.from("contacts").insert({
          organization_id: auth.organizationId,
          company_id: company.id,
          email: lead.email,
          phone: lead.phone,
          metadata: { source: lead.source },
        });
      }

      const { data: saved } = await supabase
        .from("leads")
        .insert({
          organization_id: auth.organizationId,
          company_id: company.id,
          source: lead.source,
          status: lead.qualification === "high" ? "qualified" : "new",
          score: lead.score,
          score_breakdown: lead.scoreReasons,
          notes: lead.outreachReason,
          metadata: {
            agent_run_id: runRow.id,
            source_id: lead.sourceId,
            qualification: lead.qualification,
            outreach_priority: lead.outreachPriority,
            google_maps_url: lead.googleMapsUrl,
            phone: lead.phone,
            website: lead.website,
            category: lead.category,
            address: lead.address,
            city: lead.city,
            country: lead.country,
            rating: lead.rating,
            review_count: lead.reviewCount,
            web_presence: lead.webPresenceCategory,
          },
        })
        .select("id")
        .single();

      if (saved) savedIds.push(saved.id);
    }

    saving.status = "completed";
    saving.completedAt = new Date().toISOString();
    saving.output = {
      saved: savedIds.length,
      skippedDuplicates,
    };

    const summary = `Saved ${savedIds.length} leads from ${parsed.location} (${skippedDuplicates} duplicates skipped).`;
    steps.push(
      step("Completed", "completed", {
        description: summary,
        output: { leadIds: savedIds },
      })
    );

    await persist(AGENT_RUN_STATUS.COMPLETED, summary);

    await supabase.from("activity_events").insert({
      organization_id: auth.organizationId,
      user_id: auth.userId,
      event_type: "leads_imported",
      title: summary,
      metadata: { agent_run_id: runRow.id, count: savedIds.length },
    });

    await supabase.from("audit_logs").insert({
      organization_id: auth.organizationId,
      actor_id: auth.userId,
      action: "lead_generation.completed",
      entity_type: "agent_run",
      entity_id: runRow.id,
      metadata: {
        saved: savedIds.length,
        skippedDuplicates,
        actor: DEFAULT_LEAD_ACTOR,
      },
    });

    return {
      ok: true as const,
      run: {
        id: runRow.id,
        status: AGENT_RUN_STATUS.COMPLETED,
        resultSummary: summary,
        steps,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lead generation failed";
    steps.push(step("Error", "failed", { error: message }));
    await persist(AGENT_RUN_STATUS.FAILED, message);
    return {
      ok: false as const,
      run: { id: runRow.id, status: AGENT_RUN_STATUS.FAILED, steps, resultSummary: message },
      error: { code: "TOOL_FAILED", message, retryable: true },
    };
  }
}
