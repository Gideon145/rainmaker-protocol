// ─── Shared in-memory sliding-window rate limiter ────────────────────────────
// Imported by both /api/agent/start and /api/agent/stream so a single Map
// is shared across both entry points in the same Node.js process.
//
// NOTE: resets on cold-start. For multi-instance production use Redis/KV.

const WINDOW_MS  = 5 * 60 * 1000; // 5 minutes
const MAX_PER_IP = 3;

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

export function isRateLimited(ip: string): boolean {
  const now   = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= MAX_PER_IP) return true;
  entry.count++;
  return false;
}
