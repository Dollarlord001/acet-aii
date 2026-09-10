/**
 * Transparent, configurable lead scoring.
 * Scores are heuristics, not ground truth.
 */

export interface ScoringSignals {
  hasWebsite: boolean;
  webPresenceCategory?: string | null;
  outreachPriority?: string | null;
  phone?: string | null;
  email?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  siteLoads?: boolean | null;
  ssl?: boolean | null;
}

export interface ScoreBreakdownItem {
  label: string;
  points: number;
  reason: string;
}

export interface LeadScore {
  score: number;
  reasons: ScoreBreakdownItem[];
  qualification: "high" | "medium" | "low";
}

const WEAK_PRESENCE = new Set([
  "no_site",
  "no-site",
  "none",
  "social-only",
  "social_only",
  "directory-only",
  "directory_only",
  "placeholder",
  "unreachable",
  "outdated",
]);

export function scoreLead(signals: ScoringSignals): LeadScore {
  const reasons: ScoreBreakdownItem[] = [];

  if (!signals.hasWebsite) {
    reasons.push({
      label: "No website",
      points: 40,
      reason: "No website listed — highest priority for web-presence outreach.",
    });
  } else if (
    signals.webPresenceCategory &&
    WEAK_PRESENCE.has(signals.webPresenceCategory.toLowerCase())
  ) {
    reasons.push({
      label: "Weak web presence",
      points: 25,
      reason: `Web presence classified as "${signals.webPresenceCategory}".`,
    });
  } else {
    reasons.push({
      label: "Website present",
      points: 0,
      reason: "A website was found; this lead is lower priority for a site-build pitch.",
    });
  }

  const prio = (signals.outreachPriority ?? "").toUpperCase();
  if (prio === "HIGH") {
    reasons.push({
      label: "Source priority HIGH",
      points: 20,
      reason: "The research source marked this listing as high outreach priority.",
    });
  } else if (prio === "MEDIUM") {
    reasons.push({
      label: "Source priority MEDIUM",
      points: 10,
      reason: "The research source marked this listing as medium outreach priority.",
    });
  }

  if (signals.phone) {
    reasons.push({
      label: "Phone available",
      points: 10,
      reason: "A phone number is available for follow-up.",
    });
  }
  if (signals.email) {
    reasons.push({
      label: "Email available",
      points: 10,
      reason: "An email address was found.",
    });
  }

  if (signals.rating != null && signals.rating >= 4) {
    reasons.push({
      label: "Strong rating",
      points: 8,
      reason: `Rating ${signals.rating}/5 suggests an active business.`,
    });
  }

  if (signals.reviewCount != null && signals.reviewCount >= 10) {
    reasons.push({
      label: "Review volume",
      points: 7,
      reason: `${signals.reviewCount} reviews indicate established demand.`,
    });
  }

  if (signals.hasWebsite && signals.ssl === false) {
    reasons.push({
      label: "No HTTPS",
      points: 8,
      reason: "Site exists but is not on HTTPS — a concrete pitch point.",
    });
  }
  if (signals.hasWebsite && signals.siteLoads === false) {
    reasons.push({
      label: "Site unreachable",
      points: 12,
      reason: "Listed website did not load.",
    });
  }

  const score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  const qualification: LeadScore["qualification"] =
    score >= 60 ? "high" : score >= 35 ? "medium" : "low";

  return { score, reasons, qualification };
}
