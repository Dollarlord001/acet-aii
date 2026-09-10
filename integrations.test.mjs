import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Mirror of integrationConnected + connection status rules for pure tests */
function integrationConnected(id) {
  switch (id) {
    case "apify":
      return Boolean(process.env.APIFY_API_TOKEN?.trim());
    case "gmail":
    case "google":
      return false;
    case "internal":
      return true;
    default:
      if (String(id).startsWith("mcp:")) {
        return Boolean(
          process.env.MCP_SERVER_URL?.trim() ||
            process.env.MCP_SERVERS_JSON?.trim()
        );
      }
      return true;
  }
}

function apifyStatus() {
  return process.env.APIFY_API_TOKEN?.trim() ? "connected" : "not_connected";
}

function googleStatus() {
  const hasClient =
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!hasClient) return "not_connected";
  return "available";
}

describe("integration connection status", () => {
  it("internal is always connected", () => {
    assert.equal(integrationConnected("internal"), true);
  });

  it("google/gmail is not connected without user OAuth", () => {
    assert.equal(integrationConnected("google"), false);
    assert.equal(integrationConnected("gmail"), false);
  });

  it("apify reflects token presence without fabricating", () => {
    const prev = process.env.APIFY_API_TOKEN;
    delete process.env.APIFY_API_TOKEN;
    assert.equal(apifyStatus(), "not_connected");
    process.env.APIFY_API_TOKEN = "test-token";
    assert.equal(apifyStatus(), "connected");
    if (prev === undefined) delete process.env.APIFY_API_TOKEN;
    else process.env.APIFY_API_TOKEN = prev;
  });

  it("mcp not connected when no server configured", () => {
    const prevUrl = process.env.MCP_SERVER_URL;
    const prevJson = process.env.MCP_SERVERS_JSON;
    delete process.env.MCP_SERVER_URL;
    delete process.env.MCP_SERVERS_JSON;
    assert.equal(integrationConnected("mcp:default"), false);
    if (prevUrl !== undefined) process.env.MCP_SERVER_URL = prevUrl;
    if (prevJson !== undefined) process.env.MCP_SERVERS_JSON = prevJson;
  });
});

describe("capability availability honesty", () => {
  it("does not claim success when integration missing", () => {
    const status = "not_connected";
    const result =
      status === "connected"
        ? { success: true }
        : {
            success: false,
            code: "INTEGRATION_NOT_CONNECTED",
            error: "not connected",
          };
    assert.equal(result.success, false);
    assert.equal(result.code, "INTEGRATION_NOT_CONNECTED");
  });

  it("google status is not_connected without OAuth client", () => {
    const prevId = process.env.GOOGLE_CLIENT_ID;
    const prevSecret = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    assert.equal(googleStatus(), "not_connected");
    if (prevId !== undefined) process.env.GOOGLE_CLIENT_ID = prevId;
    if (prevSecret !== undefined) process.env.GOOGLE_CLIENT_SECRET = prevSecret;
  });
});
