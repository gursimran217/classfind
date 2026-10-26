import "server-only";

/** Extremely simple in-memory rate limiter (single-process prototype). */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max = 12, windowMs = 60_000): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "local";
}