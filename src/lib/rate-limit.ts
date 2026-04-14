// ─── Shared in-memory sliding-window rate limiter ────────────────────────────
// Imported by both /api/agent/start and /api/agent/stream so a single Map
// is shared across both entry points in the same Node.js process.
//
// NOTE: resets on cold-start. For multi-instance production use Redis/KV.

const WINDOW_MS  = 5 * 60 * 1000; // 5 minutes
const MAX_PER_IP = 3;

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

/**
 * Extract the real client IP from a Next.js request.
 * Prefers x-real-ip (set by Vercel's edge) over x-forwarded-for.
 * x-forwarded-for is user-controlled and can be spoofed — only use
 * the LAST value (appended by the actual proxy), not the first.
 */
export function getClientIp(req: { headers: { get(h: string): string | null } }): string {
  // x-real-ip is set by Vercel/Nginx and cannot be spoofed by the client
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // If x-forwarded-for is present, take the LAST entry — that's the one
  // appended by the outermost trusted proxy, not the client-supplied one.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    if (ips.length > 0) return ips[ips.length - 1];
  }

  return "unknown";
}

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
