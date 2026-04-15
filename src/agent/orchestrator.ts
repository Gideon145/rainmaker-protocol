import { mail } from "@/lib/providers";
import {
  createRun,
  updateRun,
  getRun,
  finishRun,
  upsertProspect,
  addAuditEntry,
} from "@/lib/store";
import { uuid, nowIso, sleep } from "@/lib/utils";
import { eventBus } from "@/agent/events";
import type { Prospect } from "@/lib/providers/types";

import { findCompanies } from "./steps/01-find-companies";
import { enrichContact } from "./steps/02-enrich-contact";
import { checkRiskScore } from "./steps/check-risk-score";
import { screenOFAC } from "./steps/03-screen-ofac";
import { createCheckout } from "./steps/04-create-checkout";
import { generateEmail } from "./steps/05-generate-email";
import { sendOutreach } from "./steps/06-send-outreach";
import { pollForReplies } from "./steps/07-poll-replies";

// Budget limit — exported so tests can reference the real constant
export const BUDGET_LIMIT_USDC = 5.00;

// Cost billed by AgentMail for inbox creation (approximate — update once live)
const AGENTMAIL_INBOX_COST = 2.00;

export interface StartRunParams {
  skill: string;
  hourlyRate: number;
}

export async function executeRun(runId: string, params: StartRunParams): Promise<void> {
  const run = getRun(runId)!;

  // ── Step 0: Create AgentMail inbox ──────────────────────────────────────
  eventBus.emit(runId, "run_started", run);

  addAuditEntry(runId, {
    id: uuid(),
    runId,
    prospectId: null,
    timestamp: nowIso(),
    action: "RAINMAKER PROTOCOL INITIATED",
    reasoning: `Agent spawned. Skill: "${params.skill}". Rate: $${params.hourlyRate} USDC/hr. Budget cap: $${BUDGET_LIMIT_USDC} USDC. Compliance: OFAC multi-list screening enabled. Delivery: AgentMail escrow-on-payment.`,
    cost: 0,
    txHash: null,
    status: "info",
  });

  try {
    const inbox = await mail.createInbox(`rainmaker-${runId.slice(0, 8)}`);
    updateRun(runId, {
      agentInboxId: inbox.inboxId,
      agentEmail: inbox.email,
      totalSpentUsdc: run.totalSpentUsdc + AGENTMAIL_INBOX_COST,
    });
    run.agentInboxId = inbox.inboxId;
    run.agentEmail   = inbox.email;

    addAuditEntry(runId, {
      id: uuid(),
      runId,
      prospectId: null,
      timestamp: nowIso(),
      action: "AGENT INBOX ONLINE",
      reasoning: `AgentMail inbox provisioned: ${inbox.email}. All outreach will originate from this address. Reply monitoring active.`,
      cost: AGENTMAIL_INBOX_COST,
      txHash: null,
      status: "success",
    });

    eventBus.emit(runId, "audit_entry", {
      action: "AGENT INBOX ONLINE",
      reasoning: `Inbox: ${inbox.email}`,
      status: "success",
      cost: AGENTMAIL_INBOX_COST,
    });
  } catch (err) {
    // Non-fatal — continue with null inbox (will use mock in mock mode)
    addAuditEntry(runId, {
      id: uuid(),
      runId,
      prospectId: null,
      timestamp: nowIso(),
      action: "INBOX PROVISION WARNING",
      reasoning: `Could not create AgentMail inbox: ${String(err)}. Operating in limited mode.`,
      cost: 0,
      txHash: null,
      status: "warning",
    });
  }

  // ── Step 1: Find companies ───────────────────────────────────────────────
  const companiesBuffer = await findCompanies(run);

  if (!companiesBuffer.length) {
    finishRun(runId, "failed", "No companies found.");
    eventBus.emit(runId, "run_failed", { error: "No companies found." });
    return;
  }

  eventBus.emit(runId, "audit_entry", {
    action: `${companiesBuffer.length} TARGETS QUEUED`,
    reasoning: `Pipeline starting. Each target will be enriched, OFAC-screened, and contacted. Budget: $${BUDGET_LIMIT_USDC}.`,
    status: "info",
  });

  // ── Pipeline: process each company ──────────────────────────────────────
  let budgetExhausted = false;

  for (const company of companiesBuffer) {
    // Check budget before each prospect
    const currentRun = getRun(runId)!
    if (currentRun.totalSpentUsdc >= BUDGET_LIMIT_USDC) {
      budgetExhausted = true;
      addAuditEntry(runId, {
        id: uuid(),
        runId,
        prospectId: null,
        timestamp: nowIso(),
        action: "💸 BUDGET LIMIT REACHED — POLICY ENFORCED",
        reasoning: `Total spending reached $${currentRun.totalSpentUsdc.toFixed(4)} USDC. Hard limit of $${BUDGET_LIMIT_USDC} enforced by spending controls. ${companiesBuffer.indexOf(company)} of ${companiesBuffer.length} targets processed. Remaining targets cancelled.`,
        cost: 0,
        txHash: null,
        status: "warning",
      });

      eventBus.emit(runId, "budget_exhausted", {
        spent: currentRun.totalSpentUsdc,
        limit: BUDGET_LIMIT_USDC,
        processed: companiesBuffer.indexOf(company),
        total: companiesBuffer.length,
      });
      break;
    }

    // Create prospect record
    let prospect: Prospect = {
      id: uuid(),
      runId,
      company,
      contact: null,
      ofacResult: null,
      status: "queued",
      outreachEmail: null,
      checkoutSessionId: null,
      checkoutUrl: null,
      agentMailMessageId: null,
      paymentTxHash: null,
      paidAt: null,
      deliveredAt: null,
      errorMessage: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    upsertProspect(runId, prospect);
    eventBus.emit(runId, "prospect_update", prospect);

    await sleep(80); // brief pacing delay between API calls

    try {
      // 1. Enrich contact
      prospect = await enrichContact(prospect);
      if (prospect.status === "failed") continue;

      // 1b. Risk score gate — blocks low-confidence prospects before paid APIs
      prospect = await checkRiskScore(prospect);
      if (prospect.status === "failed") continue;

      // 2. OFAC screen
      prospect = await screenOFAC(prospect);
      if (prospect.status === "ofac_blocked") continue;

      // 3. Create Checkout session (before email gen so URL is ready)
      prospect = await createCheckout(prospect, currentRun);
      if (prospect.status === "failed") continue;

      // 4. Generate email
      prospect = await generateEmail(prospect, currentRun);
      if (prospect.status === "failed") continue;

      // 5. Send outreach
      prospect = await sendOutreach(prospect, currentRun);

    } catch (err) {
      const errorMsg = String(err);
      const failed: Prospect = { ...prospect, status: "failed", errorMessage: errorMsg, updatedAt: nowIso() };
      upsertProspect(runId, failed);
      eventBus.emit(runId, "prospect_update", failed);

      addAuditEntry(runId, {
        id: uuid(),
        runId,
        prospectId: prospect.id,
        timestamp: nowIso(),
        action: `ERROR — ${company.name}`,
        reasoning: errorMsg,
        cost: 0,
        txHash: null,
        status: "error",
      });
    }
  }

  // ── Step 7: Poll for replies / payments (runs until payment or timeout) ──
  if (!budgetExhausted) {
    eventBus.emit(runId, "audit_entry", {
      action: "ALL TRANSMISSIONS SENT — MONITORING FOR PAYMENTS",
      reasoning: "Outreach complete. AgentMail inbox polling active every 8 seconds. Auto-delivery triggered on first payment confirmation.",
      status: "info",
    });
  }

  await pollForReplies(runId);

  // ── Finish ───────────────────────────────────────────────────────────────
  const preFinishRun = getRun(runId)!;
  const finalStatus = budgetExhausted ? "budget_exhausted" : "completed";
  finishRun(runId, finalStatus);

  addAuditEntry(runId, {
    id: uuid(),
    runId,
    prospectId: null,
    timestamp: nowIso(),
    action: "MISSION COMPLETE",
    reasoning: `Total spent: $${preFinishRun.totalSpentUsdc.toFixed(4)} USDC. Total earned: $${preFinishRun.totalEarnedUsdc.toFixed(2)} USDC. ROI: ${preFinishRun.totalSpentUsdc > 0 ? (preFinishRun.totalEarnedUsdc / preFinishRun.totalSpentUsdc).toFixed(1) : "∞"}×.`,
    cost: 0,
    txHash: null,
    status: "success",
  });

  // Emit FULL run object so dashboard can use it directly without wiping state
  const completedRun = getRun(runId)!;
  eventBus.emit(runId, "run_completed", completedRun);
}
