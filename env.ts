/**
 * Server-side environment configuration.
 * Never import this module into client components.
 * Only NEXT_PUBLIC_* values are safe for the browser.
 */

function trim(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
}

function present(key: string): boolean {
  return Boolean(trim(key));
}

/** Public app URL (safe for links / redirects when set) */
export function getAppUrl(): string {
  return (
    trim("NEXT_PUBLIC_APP_URL") ||
    trim("URL") || // Netlify
    "http://localhost:3000"
  );
}

export function getSupabasePublicConfig(): {
  url: string | undefined;
  anonKey: string | undefined;
} {
  return {
    url: trim("NEXT_PUBLIC_SUPABASE_URL") || trim("SUPABASE_URL"),
    anonKey:
      trim("NEXT_PUBLIC_SUPABASE_ANON_KEY") || trim("SUPABASE_ANON_KEY"),
  };
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return trim("SUPABASE_SERVICE_ROLE_KEY");
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabasePublicConfig();
  return Boolean(url && anonKey);
}

export function isGeminiConfigured(): boolean {
  return present("GEMINI_API_KEY");
}

export function isGroqConfigured(): boolean {
  return present("GROQ_API_KEY");
}

export function isApifyConfigured(): boolean {
  return present("APIFY_API_TOKEN");
}

export function isSerperConfigured(): boolean {
  return present("SERPER_API_KEY");
}

export function isGoogleOAuthConfigured(): boolean {
  return present("GOOGLE_CLIENT_ID") && present("GOOGLE_CLIENT_SECRET");
}

/** Redirect URI is never hardcoded — must be set after Netlify URL is known */
export function getGoogleRedirectUri(): string | undefined {
  return trim("GOOGLE_REDIRECT_URI");
}

export function isPaystackConfigured(): boolean {
  return present("PAYSTACK_SECRET_KEY");
}

export function isMcpConfigured(): boolean {
  return present("MCP_SERVER_URL") || present("MCP_SERVERS_JSON");
}

export type IntegrationConfigStatus =
  | "configured"
  | "not_configured"
  | "partial";

export interface PublicConfigStatus {
  supabase: IntegrationConfigStatus;
  gemini: IntegrationConfigStatus;
  groq: IntegrationConfigStatus;
  apify: IntegrationConfigStatus;
  serper: IntegrationConfigStatus;
  google: IntegrationConfigStatus;
  mcp: IntegrationConfigStatus;
  paystack: IntegrationConfigStatus;
  /** True when minimum required vars for auth + app shell exist */
  coreReady: boolean;
}

/**
 * Configuration status for health checks and UI.
 * NEVER includes secret values.
 */
export function getPublicConfigStatus(): PublicConfigStatus {
  const supabase = isSupabaseConfigured()
    ? "configured"
    : present("NEXT_PUBLIC_SUPABASE_URL") || present("SUPABASE_URL")
      ? "partial"
      : "not_configured";

  const google =
    isGoogleOAuthConfigured() && getGoogleRedirectUri()
      ? "configured"
      : isGoogleOAuthConfigured()
        ? "partial"
        : "not_configured";

  return {
    supabase,
    gemini: isGeminiConfigured() ? "configured" : "not_configured",
    groq: isGroqConfigured() ? "configured" : "not_configured",
    apify: isApifyConfigured() ? "configured" : "not_configured",
    serper: isSerperConfigured() ? "configured" : "not_configured",
    google,
    mcp: isMcpConfigured() ? "configured" : "not_configured",
    paystack: isPaystackConfigured() ? "configured" : "not_configured",
    coreReady: isSupabaseConfigured(),
  };
}
