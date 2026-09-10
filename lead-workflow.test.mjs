import { describe, it } from "node:test";
import assert from "node:assert/strict";

function parseLeadObjective(objective) {
  const text = objective.trim();
  const lower = text.toLowerCase();
  const countMatch = lower.match(/(\d{1,4})\s+(business|businesses|leads|companies|prospects)/);
  const maxResults = countMatch
    ? Math.min(100, Math.max(1, Number(countMatch[1])))
    : 20;
  let location = "Lagos";
  const inMatch = text.match(/\bin\s+([A-Za-z][A-Za-z\s]{1,40}?)(?:\s+without|\s+with|\s+that|\s*$|[.,])/i);
  if (inMatch?.[1]) location = inMatch[1].trim();
  const onlyNoOrWeakWebsite =
    /without (a )?website|no website|missing website|weak website/.test(lower);
  return { location, maxResults: Math.min(maxResults, 50), onlyNoOrWeakWebsite, country: lower.includes("lagos") ? "NG" : "US" };
}

function scoreLead(signals) {
  let score = 0;
  if (!signals.hasWebsite) score += 40;
  if ((signals.outreachPriority ?? "").toUpperCase() === "HIGH") score += 20;
  if (signals.phone) score += 10;
  return Math.min(100, score);
}

function dedupe(leads) {
  const seen = new Set();
  const out = [];
  for (const l of leads) {
    const key = (l.sourceId || l.businessName).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

describe("parseLeadObjective", () => {
  it("extracts Lagos count and no-website flag", () => {
    const p = parseLeadObjective("Find 100 businesses in Lagos without websites.");
    assert.equal(p.location, "Lagos");
    assert.equal(p.maxResults, 50);
    assert.equal(p.onlyNoOrWeakWebsite, true);
    assert.equal(p.country, "NG");
  });
});

describe("scoreLead", () => {
  it("ranks no-website + phone higher", () => {
    const a = scoreLead({ hasWebsite: false, phone: "+234", outreachPriority: "HIGH" });
    const b = scoreLead({ hasWebsite: true });
    assert.ok(a > b);
    assert.equal(a, 70);
  });
});

describe("intent routing", () => {
  it("routes the Lagos command into lead generation", () => {
    const t = "Find 20 businesses in Lagos without websites.".toLowerCase();
    const routed =
      (t.includes("find") || t.includes("search") || t.includes("generate")) &&
      (t.includes("business") || t.includes("lead") || t.includes("prospect") || t.includes("compan"));
    assert.equal(routed, true);
  });
});

describe("dedupe", () => {
  it("drops duplicate source ids", () => {
    const out = dedupe([
      { sourceId: "1", businessName: "A" },
      { sourceId: "1", businessName: "A again" },
      { sourceId: "2", businessName: "B" },
    ]);
    assert.equal(out.length, 2);
  });
});
