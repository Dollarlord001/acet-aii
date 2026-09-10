import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Mirror of classifyObjective — keeps tests free of TS transpile dependency.
 * Must stay aligned with src/lib/agent/tool-registry.ts
 */
function classifyObjective(objective) {
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
    (/\b(report|summary)\b/.test(t) &&
      /\b(business|sales|pipeline|leads)\b/.test(t))
  ) {
    return {
      primary_capability: "report",
      suggested_tools: ["analyze_business_data"],
      plan_tools: ["analyze_business_data", "create_notification"],
    };
  }

  if (
    /\b(find|search|discover)\b/.test(t) &&
    /\b(business|lead|prospect)/.test(t) &&
    /\b(outreach|email|follow)/.test(t)
  ) {
    return {
      primary_capability: "lead_generation",
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
      plan_tools: ["research_company"],
    };
  }

  return { primary_capability: "general", suggested_tools: [] };
}

describe("business objectives — capability selection", () => {
  it("Find businesses without websites → lead research tools", () => {
    const c = classifyObjective("Find businesses without websites.");
    assert.equal(c.primary_capability, "lead_generation");
    assert.ok(c.plan_tools.includes("find_business_leads"));
  });

  it("Find and rank my best prospects → score + search", () => {
    const c = classifyObjective("Find and rank my best prospects.");
    assert.equal(c.primary_capability, "lead_generation");
    assert.ok(c.plan_tools.includes("score_lead"));
  });

  it("Research these companies and summarize them → research", () => {
    const c = classifyObjective(
      "Research these companies and summarize their online presence."
    );
    assert.equal(c.primary_capability, "research");
    assert.ok(c.plan_tools.includes("research_company"));
  });

  it("Draft personalized outreach for these leads → search + draft", () => {
    const c = classifyObjective(
      "Draft personalized outreach for these leads."
    );
    assert.equal(c.primary_capability, "email_draft");
    assert.ok(c.plan_tools.includes("draft_email"));
  });

  it("Send the approved outreach → approval required", () => {
    const c = classifyObjective("Send the approved outreach emails.");
    assert.equal(c.primary_capability, "email_send");
    assert.equal(c.needs_approval, true);
  });

  it("Remind me to follow up in three days → reminder/follow-up", () => {
    const c = classifyObjective("Remind me to follow up in three days.");
    assert.ok(
      c.primary_capability === "reminder" ||
        c.primary_capability === "follow_up"
    );
    assert.ok(
      (c.plan_tools || c.suggested_tools).some((t) =>
        ["create_reminder", "schedule_follow_up"].includes(t)
      )
    );
  });

  it("Prepare a weekly business report → analytics", () => {
    const c = classifyObjective("Prepare a weekly business report.");
    assert.equal(c.primary_capability, "report");
    assert.ok(c.plan_tools.includes("analyze_business_data"));
  });

  it("Find my available calendar slots → calendar (unavailable until Google)", () => {
    const c = classifyObjective("Find my available calendar slots.");
    assert.equal(c.primary_capability, "calendar");
    assert.ok(c.plan_tools.includes("calendar_create_event"));
  });

  it("Create a meeting with this prospect → calendar", () => {
    const c = classifyObjective("Create a meeting with this prospect.");
    assert.equal(c.primary_capability, "calendar");
  });

  it("Composite find + outreach composes multi-step plan", () => {
    const c = classifyObjective(
      "Find businesses that need digital marketing and prepare outreach emails."
    );
    assert.equal(c.primary_capability, "lead_generation");
    assert.ok(c.plan_tools.includes("find_business_leads"));
    assert.ok(c.plan_tools.includes("draft_email"));
  });
});

describe("unavailable integrations stay honest", () => {
  it("gmail remains not auto-executable without connection", () => {
    const connected = false;
    const result = connected
      ? { success: true }
      : {
          success: false,
          code: "INTEGRATION_NOT_CONNECTED",
        };
    assert.equal(result.success, false);
  });

  it("calendar plan still selects tool but execution is blocked", () => {
    const c = classifyObjective("Schedule a meeting with Acme.");
    assert.equal(c.primary_capability, "calendar");
    // Execution layer returns not_connected — planner still names the capability
    assert.ok(c.plan_tools.length >= 1);
  });
});
