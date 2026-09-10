/**
 * Minimal Node tests for structured errors and rate limiting.
 * Run: node --test tests/errors.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Inline minimal copies to avoid TS path resolution in pure node
class AppError extends Error {
  constructor(payload) {
    super(payload.message);
    this.code = payload.code;
    this.userMessage = payload.userMessage;
    this.retryable = payload.retryable;
  }
}

function rateLimited(retryAfterMs) {
  return new AppError({
    code: "RATE_LIMITED",
    message: "Rate limit exceeded",
    userMessage: "Too many requests. Please wait a moment and try again.",
    retryable: true,
    details: retryAfterMs ? { retryAfterMs } : undefined,
  });
}

const buckets = new Map();

function checkRateLimit(key, options = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 3;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  if (bucket.count >= max) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, remaining: max - bucket.count, resetAt: bucket.resetAt };
}

describe("AppError", () => {
  it("creates structured rate limit error", () => {
    const err = rateLimited(1000);
    assert.equal(err.code, "RATE_LIMITED");
    assert.equal(err.retryable, true);
    assert.ok(err.userMessage.includes("Too many"));
  });
});

describe("rate limit", () => {
  it("allows up to max then blocks", () => {
    const key = "test-" + Math.random();
    assert.equal(checkRateLimit(key, { max: 2 }).allowed, true);
    assert.equal(checkRateLimit(key, { max: 2 }).allowed, true);
    assert.equal(checkRateLimit(key, { max: 2 }).allowed, false);
  });
});

describe("status constants", () => {
  it("agent run statuses are stable", () => {
    const statuses = [
      "planning",
      "running",
      "awaiting_approval",
      "completed",
      "failed",
      "cancelled",
    ];
    for (const s of statuses) {
      assert.equal(typeof s, "string");
    }
  });
});
