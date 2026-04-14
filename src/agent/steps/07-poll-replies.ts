import { mail } from "@/lib/providers";
import { USE_MOCK } from "@/lib/providers";
import { agentMailBus } from "@/lib/providers/mock/agentmail";
import { getRun, getProspect, upsertProspect, addAuditEntry, updateRun } from "@/lib/store";
import { uuid, nowIso, sleep } from "@/lib/utils";
import { eventBus } from "@/agent/events";
import { deliverWork } from "./08-deliver-work";

const POLL_INTERVAL_MS = 8_000;
const POLL_TIMEOUT_MS  = 10 * 60 * 1000; // 10 min max

// ─── Tracks seen message IDs to avoid double-processing ───────────────────
const seenMessages = new Set<string>();

export async function pollForReplies(runId: string): Promise<void> {
  const run = getRun(runId);
  if (!run?.agentInboxId) return;

  const inboxId = run.agentInboxId;
  const start = Date.now();

  // In mock mode — simulate payment directly after pipeline settles (no race condition)
  if (USE_MOCK) {
    await sleep(800); // short pause then simulate payment
    const currentRun = getRun(runId);
    const prospect = currentRun?.prospects.find(
      (p) => p.status === "awaiting_payment" || p.status === "outreach_sent",
    );
    if (prospect) {
      await handlePaymentConfirmed(runId, prospect.id, `mock_tx_${uuid()}`);
    }
    return;
  }

  // Real mode — polling loop
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const currentRun = getRun(runId);
    if (!currentRun || currentRun.status !== "running") break;

    const awaitingProspects = currentRun.prospects.filter(
      (p) => p.status === "awaiting_payment",
    );
    if (awaitingProspects.length === 0) break;

    const messages = await mail.listMessages(inboxId);

    for (const msg of messages) {
      if (seenMessages.has(msg.id)) continue;
      seenMessages.add(msg.id);

      if (!msg.inReplyTo) continue;

      const prospect = awaitingProspects.find(
        (p) => p.agentMailMessageId === msg.inReplyTo,
      );
      if (!prospect) continue;

      // Check if their checkout session was paid
      const { getCheckoutSession } = await import("@/lib/locus");
      if (prospect.checkoutSessionId) {
        const session = await getCheckoutSession(prospect.checkoutSessionId);
        if (session?.status === "PAID") {
          await handlePaymentConfirmed(
            runId,
            prospect.id,
            session.paymentTxHash ?? null,
          );
        }
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

// ─── Called from both polling and webhook ────────────────────────────────

export async function handlePaymentConfirmed(
  runId: string,
  prospectId: string,
  txHash: string | null,
): Promise<void> {
  const prospect = getProspect(runId, prospectId);
  if (!prospect || prospect.status === "paid" || prospect.status === "delivered") return;

  const paid: typeof prospect = {
    ...prospect,
    status: "paid",
    paymentTxHash: txHash,
    paidAt: nowIso(),
    updatedAt: nowIso(),
  };
  upsertProspect(runId, paid);

  const run = getRun(runId);
  if (run) {
    updateRun(runId, {
      totalEarnedUsdc: run.totalEarnedUsdc + run.hourlyRate,
    });
  }

  addAuditEntry(runId, {
    id: uuid(),
    runId,
    prospectId,
    timestamp: nowIso(),
    action: `💰 PAYMENT CONFIRMED — ${prospect.company.name}`,
    reasoning: `${prospect.contact?.firstName ?? "Client"} at ${prospect.company.name} paid $${run?.hourlyRate ?? "?"} USDC via Locus Checkout. On-chain confirmation received. ${txHash ? `TxHash: ${txHash}` : "Mock payment simulated."} Initiating automated work delivery sequence.`,
    cost: 0,
    txHash,
    status: "success",
  });

  eventBus.emit(runId, "payment_received", {
    prospectId,
    companyName: prospect.company.name,
    amount: run?.hourlyRate ?? 0,
    txHash,
  });

  // Auto-deliver work
  await deliverWork(paid, run!);
}
