import { Redis } from "@upstash/redis";

// ─── Upstash Redis client ─────────────────────────────────────────────────
// Used to solve the Vercel serverless cross-instance race condition:
//   - Webhook fires on Instance B  (no in-memory SSE subscriber)
//   - SSE stream runs on Instance A (holds all in-memory state)
//
// Solution: webhook writes payment signal to Redis; Instance A's polling
// loop reads from Redis and triggers delivery locally.
//
// Falls back gracefully when env vars are not set (dev/mock mode).

function createRedisClient(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

let _redis: Redis | null | undefined = undefined;

function getRedis(): Redis | null {
  if (_redis === undefined) _redis = createRedisClient();
  return _redis;
}

// Key prefix to avoid collisions with other apps on the same Redis instance
const PFX = "rmp";

// ─── Session → run mapping (written by 04-create-checkout, read by webhook) ─

export interface SessionMapping {
  runId: string;
  prospectId: string;
  webhookSecret: string;
}

/** Register a checkout session so any serverless instance can resolve it. */
export async function redisStoreSession(
  sessionId: string,
  mapping: SessionMapping,
): Promise<void> {
  const r = getRedis();
  if (!r) return; // no-op in dev / mock mode
  // TTL: 48 hours — well beyond any real session lifetime
  await r.set(`${PFX}:session:${sessionId}`, JSON.stringify(mapping), { ex: 172_800 });
}

/** Resolve a checkout session ID to its run/prospect/secret. */
export async function redisGetSession(
  sessionId: string,
): Promise<SessionMapping | null> {
  const r = getRedis();
  if (!r) return null;
  const raw = await r.get<string>(`${PFX}:session:${sessionId}`);
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : (raw as SessionMapping);
  } catch {
    return null;
  }
}

// ─── Payment signal (written by webhook, consumed by polling loop) ─────────

export interface PaymentSignal {
  txHash: string | null;
  amount: string;
  timestamp: string;
}

/** Signal that a prospect's payment has been confirmed (called from webhook). */
export async function redisPublishPayment(
  runId: string,
  prospectId: string,
  signal: PaymentSignal,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  // TTL: 2 hours — polling loop should consume within minutes
  await r.set(`${PFX}:payment:${runId}:${prospectId}`, JSON.stringify(signal), { ex: 7_200 });
}

/** Check whether a payment signal exists for a specific prospect. Idempotent. */
export async function redisConsumePayment(
  runId: string,
  prospectId: string,
): Promise<PaymentSignal | null> {
  const r = getRedis();
  if (!r) return null;
  const key = `${PFX}:payment:${runId}:${prospectId}`;
  // Read + delete atomically via a pipeline
  const pipeline = r.pipeline();
  pipeline.get<string>(key);
  pipeline.del(key);
  const [raw] = await pipeline.exec<[string | null, number]>();
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : (raw as PaymentSignal);
  } catch {
    return null;
  }
}
