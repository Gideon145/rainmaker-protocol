import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getWebhookSecret, getProspectBySession, getRun, updateRun } from "@/lib/store";
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
  const webhookSecret = getWebhookSecret(sessionId);
  if (!webhookSecret) {
    return NextResponse.json({ error: "unknown session" }, { status: 401 });
  }

  const signature = req.headers.get("x-signature-256") ?? "";
  const expected = `sha256=${crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex")}`;

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (payload.event !== "checkout.session.paid") {
    return NextResponse.json({ received: true });
  }

  // Resolve runId + prospectId from metadata or by scanning store
  let runId = payload.data.metadata?.runId;
  let prospectId = payload.data.metadata?.prospectId;

  if (!runId || !prospectId) {
    // Fall back to scanning all runs for this sessionId
    const { getAllRuns } = await import("@/lib/store");
    for (const run of getAllRuns()) {
      const prospect = getProspectBySession(run.id, sessionId);
      if (prospect) {
        runId = run.id;
        prospectId = prospect.id;
        break;
      }
    }
  }

  if (!runId || !prospectId) {
    return NextResponse.json({ error: "run/prospect not found" }, { status: 404 });
  }

  // Update run earned total
  const run = getRun(runId);
  if (run) {
    const earned = parseFloat(payload.data.amount) || run.hourlyRate;
    updateRun(runId, { totalEarnedUsdc: run.totalEarnedUsdc + earned });
  }

  // Trigger payment confirmed + auto-delivery
  await handlePaymentConfirmed(runId, prospectId, payload.data.paymentTxHash ?? null);

  return NextResponse.json({ received: true, sessionId, prospectId });
}
