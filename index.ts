/**
 * In-memory rate limiter.
 * Replaceable later with Redis / Upstash without changing call sites.
 */

import { rateLimited } from "@/lib/errors";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX ?? 30);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  options?: { windowMs?: number; max?: number }
): RateLimitResult {
  const windowMs = options?.windowMs ?? WINDOW_MS;
  const max = options?.max ?? MAX_REQUESTS;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, max - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/** Throws AppError if rate limited */
export function assertRateLimit(
  key: string,
  options?: { windowMs?: number; max?: number }
): void {
  const result = checkRateLimit(key, options);
  if (!result.allowed) {
    throw rateLimited(result.resetAt - Date.now());
  }
}

// Periodic cleanup to avoid unbounded growth in long-running processes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 120_000).unref?.();
}
