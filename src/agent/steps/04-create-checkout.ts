import { createCheckoutSession, getBalance } from "@/lib/locus";
import { upsertProspect, addAuditEntry, storeWebhookSecret, updateRun } from "@/lib/store";
import { redisStoreSession } from "@/lib/redis";
import { uuid, nowIso } from "@/lib/utils";
import { eventBus } from "@/agent/events";
import type { Prospect, Run } from "@/lib/providers/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const USE_MOCK = process.env.USE_MOCK !== "false";

export async function createCheckout(prospect: Prospect, run: Run): Promise<Prospect> {
  eventBus.emit(prospect.runId, "prospect_update", {
    ...prospect,
    status: "creating_checkout",
  });

  let sessionId: string;
  let checkoutUrl: string;

  if (USE_MOCK) {
    // Mock: generate a fake session
    sessionId = `sess_mock_${uuid().replace(/-/g, "").slice(0, 20)}`;
    checkoutUrl = `https://checkout.paywithlocus.com/${sessionId}`;
    await new Promise((r) => setTimeout(r, 50));
  } else {
    const result = await createCheckoutSession({
      amount: run.hourlyRate.toFixed(2),
      description: `1-hour ${run.skill} consulting session — ${prospect.company.name}`,
      webhookUrl: `${APP_URL}/api/webhooks/locus`,
      successUrl: `${APP_URL}/success?session=${encodeURIComponent(sessionId!)}`,
      cancelUrl: `${APP_URL}/dashboard`,
      metadata: {
        runId: run.id,
        prospectId: prospect.id,
        companyName: prospect.company.name,
      },
    });

    if (!result) {
      const failed: Prospect = {
        ...prospect,
        status: "failed",
        errorMessage: "Checkout session creation failed — Locus API error.",
        updatedAt: nowIso(),
      };
      upsertProspect(prospect.runId, failed);
      eventBus.emit(prospect.runId, "prospect_update", failed);
      return failed;
    }

    sessionId = result.session.id;
    checkoutUrl = result.session.checkoutUrl;

    if (result.webhookSecret) {
      storeWebhookSecret(sessionId, result.webhookSecret);
      // Persist session → run mapping in Redis so any Vercel instance can
      // resolve the sessionId when the webhook fires (cross-instance safety).
      await redisStoreSession(sessionId, {
        runId: run.id,
        prospectId: prospect.id,
        webhookSecret: result.webhookSecret,
      });
    }

    // Refresh wallet balance after session creation
    const balance = await getBalance();
    if (balance) {
      updateRun(run.id, {});
      eventBus.emit(run.id, "balance_update", { balance: balance.balance });
    }
  }

  const updated: Prospect = {
    ...prospect,
    checkoutSessionId: sessionId,
    checkoutUrl,
    status: "outreach_sent",
    updatedAt: nowIso(),
  };

  upsertProspect(prospect.runId, updated);

  addAuditEntry(prospect.runId, {
    id: uuid(),
    runId: prospect.runId,
    prospectId: prospect.id,
    timestamp: nowIso(),
    action: `CHECKOUT SESSION CREATED — ${prospect.company.name}`,
    reasoning: `Created Locus Checkout session for $${run.hourlyRate} USDC. Session ID: ${sessionId}. Link embedded in outreach email. HMAC webhook configured for payment confirmation.`,
    cost: 0.001,
    txHash: null,
    status: "success",
  });

  eventBus.emit(prospect.runId, "prospect_update", updated);
  return updated;
}
