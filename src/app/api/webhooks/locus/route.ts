import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getWebhookSecret, getProspectBySession, getRun, getAllRuns, updateRun } from "@/lib/store";
import { redisGetSession, redisPublishPayment } from "@/lib/redis";
import { handlePaymentConfirmed } from "@/agent/steps/07-poll-replies";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Parse payload first to get sessionId
  let payload: {
    event: string;
    data: {
      sessionId: string;
      amount: string;
      paymentTxHash?: string;
      metadata?: { runId?: string; prospectId?: string };
    };
    timestamp: string;
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sessionId = payload?.data?.sessionId;
  if (!sessionId) {
    return NextResponse.json({ error: "no sessionId" }, { status: 400 });
  }

  // Verify HMAC-SHA256 signature — always required, no bypass path.
  // Rejecting unknown sessions prevents fake payment injection.
  //
  // Resolution order:
  //   1. Redis   — populated by 04-create-checkout (cross-instance safe)
  //   2. In-memory store  — same-instance fallback (dev / single instance)
  //   3. Scan all runs    — last-resort fallback
  let resolvedRunId: string | undefined;
  let resolvedProspectId: string | undefined;
  let webhookSecret: string | null = null;

  const redisSession = await redisGetSession(sessionId);
  if (redisSession) {
    webhookSecret      = redisSession.webhookSecret;
    resolvedRunId      = redisSession.runId;
    resolvedProspectId = redisSession.prospectId;
  } else {
    // In-memory fallback (same Vercel instance or dev mode)
    webhookSecret = getWebhookSecret(sessionId);
    if (!webhookSecret) {
      return NextResponse.json({ error: "unknown session" }, { status: 401 });
    }
  }

  if (!webhookSecret) {
    return NextResponse.json({ error: "unknown session" }, { status: 401 });
  }

  const signature = req.headers.get("x-signature-256") ?? "";
  const expected = `sha256=${crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex")}`;

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  // timingSafeEqual throws RangeError if lengths differ — check first
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (payload.event !== "checkout.session.paid") {
    return NextResponse.json({ received: true });
  }

  // Resolve runId + prospectId:
  //   1. Redis session mapping (set by 04-create-checkout — cross-instance safe)
  //   2. Webhook metadata
  //   3. Scan in-memory store (same-instance fallback)
  let runId     = resolvedRunId     ?? payload.data.metadata?.runId;
  let prospectId = resolvedProspectId ?? payload.data.metadata?.prospectId;

  if (!runId || !prospectId) {
    // Last-resort: scan all in-memory runs for this sessionId
    for (const run of getAllRuns()) {
      const prospect = getProspectBySession(run.id, sessionId);
      if (prospect) {
        runId      = run.id;
        prospectId = prospect.id;
        break;
      }
    }
  }

  if (!runId || !prospectId) {
    return NextResponse.json({ error: "run/prospect not found" }, { status: 404 });
  }

  // Publish payment signal to Redis — the SSE instance's polling loop will
  // pick this up and call handlePaymentConfirmed locally, enabling correct
  // eventBus.emit routing and work delivery even across Vercel instances.
  await redisPublishPayment(runId, prospectId, {
    txHash:    payload.data.paymentTxHash ?? null,
    amount:    payload.data.amount ?? "0",
    timestamp: new Date().toISOString(),
  });

  // Also attempt direct call if run is in-memory on this instance
  // (covers single-instance setups and Railway Docker deployments)
  const run = getRun(runId);
  if (run) {
    const earned = parseFloat(payload.data.amount) || run.hourlyRate;
    updateRun(runId, { totalEarnedUsdc: run.totalEarnedUsdc + earned });
    await handlePaymentConfirmed(runId, prospectId, payload.data.paymentTxHash ?? null);
  }

  return NextResponse.json({ received: true, sessionId, prospectId });
}
