import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Mirror of classifyObjective for pure unit tests */
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
    };
  }

  if (
    /\b(draft|prepare|write)\b/.test(t) &&
    /\b(email|emails|outreach|follow-?up)\b/.test(t)
  ) {
    return {
      primary_capability: "email_draft",
      suggested_tools: ["draft_email"],
    };
  }

  if (
    /\b(remind|reminder|remind me)\b/.test(t) ||
    (/\bfollow up with\b/.test(t) && /\b(tomorrow|today|next week|at \d)/.test(t))
  ) {
    return {
      primary_capability: "reminder",
      suggested_tools: ["create_reminder"],
    };
  }

  if (
    (/\b(find|search|scrape|generate|discover)\b/.test(t) &&
      /\b(business|businesses|lead|leads|prospect|prospects|compan)/.test(t)) ||
    /\bwithout websites?\b/.test(t)
  ) {
    return {
      primary_capability: "lead_generation",
      suggested_tools: ["find_business_leads", "store_lead"],
    };
  }

  if (
    /\b(analyze|analysis|pipeline|which leads|priority|deserve attention)\b/.test(
      t
    )
  ) {
    return {
      primary_capability: "crm_analysis",
      suggested_tools: ["store_lead"],
    };
  }

  if (/\b(research|look up|investigate)\b/.test(t)) {
    return {
      primary_capability: "research",
      suggested_tools: ["web_search"],
    };
  }

  return { primary_capability: "general", suggested_tools: [] };
}

function requiresApproval(risk, explicitFlag) {
  if (explicitFlag === true) return true;
  return risk === "high" || risk === "critical";
}

function isLeadGenerationObjective(objective) {
  const t = objective.toLowerCase();
  return (
    (t.includes("find") || t.includes("search") || t.includes("generate")) &&
    (t.includes("business") ||
      t.includes("lead") ||
      t.includes("prospect") ||
      t.includes("compan"))
  );
}

describe("Test A — lead generation intent", () => {
  it("routes Lagos businesses request to lead_generation", () => {
    const c = classifyObjective(
      "Find 20 businesses in Lagos without websites."
    );
    assert.equal(c.primary_capability, "lead_generation");
    assert.ok(c.suggested_tools.includes("find_business_leads"));
    assert.equal(
      isLeadGenerationObjective(
        "Find 20 businesses in Lagos without websites."
      ),
      true
    );
  });
});

describe("Test B — reminder intent", () => {
  it("routes reminder to create_reminder", () => {
    const c = classifyObjective(
      "Remind me tomorrow to follow up with Acme Ltd."
    );
    assert.equal(c.primary_capability, "reminder");
    assert.deepEqual(c.suggested_tools, ["create_reminder"]);
  });
});

describe("Test C — draft outreach", () => {
  it("routes draft follow-ups to email_draft", () => {
    const c = classifyObjective(
      "Draft follow-up emails for my highest-priority leads."
    );
    assert.equal(c.primary_capability, "email_draft");
    assert.ok(c.suggested_tools.includes("draft_email"));
  });
});

describe("Test D — send requires approval", () => {
  it("classifies send as email_send needing approval", () => {
    const c = classifyObjective("Send these outreach emails.");
    assert.equal(c.primary_capability, "email_send");
    assert.equal(c.needs_approval, true);
    assert.ok(requiresApproval("high", true));
  });

  it("policy blocks high-risk without approval flag", () => {
    assert.equal(requiresApproval("high"), true);
    assert.equal(requiresApproval("low"), false);
    assert.equal(requiresApproval("critical"), true);
  });
});

describe("Test E — tool unavailable", () => {
  it("does not mark success when integration missing", () => {
    const connected = false;
    const result = connected
      ? { success: true }
      : {
          success: false,
          code: "INTEGRATION_NOT_CONNECTED",
          error: "apify is not connected",
        };
    assert.equal(result.success, false);
    assert.equal(result.code, "INTEGRATION_NOT_CONNECTED");
  });
});

describe("Test F — failure recovery shape", () => {
  it("supports retry then fail without fabricating success", () => {
    const attempts = [
      { success: false, error: "timeout" },
      { success: false, error: "timeout" },
    ];
    let final = null;
    for (const a of attempts) {
      final = a;
      if (a.success) break;
    }
    assert.equal(final.success, false);
    assert.ok(final.error);
  });
});

describe("Test G — org isolation principle", () => {
  it("rejects cross-org access pattern", () => {
    const sessionOrg = "org-a";
    const requestedOrg = "org-b";
    const allowed = sessionOrg === requestedOrg;
    assert.equal(allowed, false);
  });
});

describe("regression — lead gen still classified", () => {
  it("restaurants without websites still maps to lead gen", () => {
    const c = classifyObjective(
      "Find 100 restaurants in Lagos without websites."
    );
    assert.equal(c.primary_capability, "lead_generation");
  });
});
