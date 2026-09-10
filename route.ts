import { NextResponse } from "next/server";
import { getPublicConfigStatus } from "@/lib/config/env";

/**
 * Production health / configuration status.
 * Never returns secret values — only configured | not_configured | partial.
 */
export async function GET() {
  const status = getPublicConfigStatus();

  return NextResponse.json(
    {
      ok: status.coreReady,
      service: "acet-ai",
      timestamp: new Date().toISOString(),
      config: {
        supabase: status.supabase,
        gemini: status.gemini,
        groq: status.groq,
        apify: status.apify,
        serper: status.serper,
        google: status.google,
        mcp: status.mcp,
        paystack: status.paystack,
      },
      notes: {
        google:
          "Optional. Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI after Netlify URL is known.",
        paystack:
          "Optional for launch. Never trust browser-only payment success.",
        core: "Supabase public URL + anon key required for auth and dashboard.",
      },
    },
    {
      status: status.coreReady ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
