/**
 * Optional Google OAuth helpers.
 * Google is NOT required for ACET AI core usage.
 * Redirect URI always comes from GOOGLE_REDIRECT_URI — never hardcoded.
 */

import {
  getGoogleRedirectUri,
  isGoogleOAuthConfigured,
} from "@/lib/config/env";

/** Least-privilege scopes for planned Workspace capabilities */
export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
] as const;

export function googleOAuthReady(): boolean {
  return isGoogleOAuthConfigured() && Boolean(getGoogleRedirectUri());
}

/**
 * Build the Google authorization URL when fully configured.
 * Returns null if OAuth client or redirect URI is missing.
 */
export function buildGoogleAuthorizeUrl(state: string): string | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const redirectUri = getGoogleRedirectUri();
  if (!clientId || !redirectUri) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function googleOAuthStatusMessage(): string {
  if (!isGoogleOAuthConfigured()) {
    return "Google is not connected yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Workspace integrations.";
  }
  if (!getGoogleRedirectUri()) {
    return "Google OAuth client is present, but GOOGLE_REDIRECT_URI is not set. Configure it after deployment with your production URL.";
  }
  return "Google OAuth is configured. Complete user consent to connect Workspace tools.";
}
