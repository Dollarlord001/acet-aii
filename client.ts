/**
 * Apify REST client. Uses APIFY_API_TOKEN only on the server.
 * Never fabricates results.
 */

const APIFY_BASE = "https://api.apify.com/v2";

export const DEFAULT_LEAD_ACTOR =
  process.env.APIFY_LEAD_ACTOR ??
  "leafy-dev-jr/no-website-business-leads-scraper-google-maps";

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}

function token(): string {
  const t = process.env.APIFY_API_TOKEN?.trim();
  if (!t) {
    throw new Error("APIFY_API_TOKEN is not set");
  }
  return t;
}

function actorPath(actorId: string): string {
  // API expects username~name
  return encodeURIComponent(actorId.replace("/", "~"));
}

export interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId?: string;
  statusMessage?: string;
}

export async function startActorRun(
  actorId: string,
  input: Record<string, unknown>,
  options?: { timeoutSecs?: number; memory?: number }
): Promise<ApifyRun> {
  const params = new URLSearchParams({ token: token() });
  if (options?.timeoutSecs) params.set("timeout", String(options.timeoutSecs));
  if (options?.memory) params.set("memory", String(options.memory));

  const res = await fetch(
    `${APIFY_BASE}/acts/${actorPath(actorId)}/runs?${params.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Apify start failed (${res.status}): ${text.slice(0, 400)}`);
  }

  const body = await res.json();
  const data = body.data ?? body;
  return {
    id: data.id,
    status: data.status,
    defaultDatasetId: data.defaultDatasetId,
    statusMessage: data.statusMessage,
  };
}

export async function getActorRun(runId: string): Promise<ApifyRun> {
  const params = new URLSearchParams({ token: token() });
  const res = await fetch(
    `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?${params.toString()}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Apify run status failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const body = await res.json();
  const data = body.data ?? body;
  return {
    id: data.id,
    status: data.status,
    defaultDatasetId: data.defaultDatasetId,
    statusMessage: data.statusMessage,
  };
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

export async function waitForRun(
  runId: string,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<ApifyRun> {
  const timeoutMs = options?.timeoutMs ?? 180_000;
  const intervalMs = options?.intervalMs ?? 5_000;
  const start = Date.now();

  let last = await getActorRun(runId);
  while (!TERMINAL.has(last.status)) {
    if (Date.now() - start > timeoutMs) {
      return { ...last, statusMessage: last.statusMessage ?? "Timed out waiting for Apify run" };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await getActorRun(runId);
  }
  return last;
}

export async function getDatasetItems<T = Record<string, unknown>>(
  datasetId: string,
  options?: { limit?: number; offset?: number }
): Promise<T[]> {
  const params = new URLSearchParams({
    token: token(),
    clean: "true",
  });
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));

  const res = await fetch(
    `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?${params.toString()}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Apify dataset failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
