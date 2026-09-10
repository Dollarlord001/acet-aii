#!/usr/bin/env bash
# Example: push env vars from your local shell into Netlify.
# Usage:
#   export NETLIFY_SITE_ID=...
#   export GEMINI_API_KEY=...   # already in your environment
#   ./scripts/set-netlify-env.example.sh
#
# This script NEVER contains secrets. It only reads from the environment.

set -euo pipefail

if ! command -v netlify >/dev/null 2>&1; then
  echo "Install Netlify CLI first: npm i -g netlify-cli"
  exit 1
fi

if [[ -z "${NETLIFY_SITE_ID:-}" ]]; then
  echo "Set NETLIFY_SITE_ID to your Netlify site id"
  exit 1
fi

set_var() {
  local key="$1"
  local val="${!key:-}"
  if [[ -n "$val" ]]; then
    echo "Setting $key"
    netlify env:set "$key" "$val" --site "$NETLIFY_SITE_ID" >/dev/null
  else
    echo "Skipping $key (not set in local environment)"
  fi
}

# Required
set_var NEXT_PUBLIC_SUPABASE_URL
set_var NEXT_PUBLIC_SUPABASE_ANON_KEY
set_var SUPABASE_SERVICE_ROLE_KEY

# AI
set_var GEMINI_API_KEY
set_var GROQ_API_KEY

# Optional integrations
set_var APIFY_API_TOKEN
set_var SERPER_API_KEY
set_var GOOGLE_CLIENT_ID
set_var GOOGLE_CLIENT_SECRET
set_var GOOGLE_REDIRECT_URI
set_var PAYSTACK_SECRET_KEY
set_var PAYSTACK_PUBLIC_KEY
set_var PAYSTACK_WEBHOOK_SECRET
set_var MCP_SERVER_URL
set_var MCP_SERVERS_JSON
set_var NEXT_PUBLIC_APP_URL

echo "Done. Verify in Netlify UI. Never commit .env files."
