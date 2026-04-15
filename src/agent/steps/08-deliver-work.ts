import { llm } from "@/lib/providers";
import { mail } from "@/lib/providers";
import { getRun, upsertProspect, addAuditEntry } from "@/lib/store";
import { uuid, nowIso } from "@/lib/utils";
import { eventBus } from "@/agent/events";
import { sendEmailPayment } from "@/lib/locus";
import type { Prospect, Run } from "@/lib/providers/types";

export async function deliverWork(prospect: Prospect, run: Run): Promise<void> {
  if (!prospect.contact || !run.agentInboxId || !prospect.agentMailMessageId) {
    return;
  }

  const currentRun = getRun(run.id);
  if (!currentRun) return;

  // Generate deliverable via LLM
  const deliverable = await llm.generateDeliverable({
    skill: run.skill,
    company: prospect.company,
    contact: prospect.contact,
  });

  // Reply to the prospect's original message (or send a fresh email)
  try {
    await mail.reply({
      inboxId: run.agentInboxId,
      messageId: prospect.agentMailMessageId,
      body: deliverable,
    });
  } catch {
    // If reply fails, send a fresh email
    await mail.sendEmail({
      inboxId: run.agentInboxId,
      to: prospect.contact.email,
      subject: `Your ${run.skill} session is confirmed 🎯`,
      body: deliverable,
    });
  }

  const delivered: Prospect = {
    ...prospect,
    status: "delivered",
    deliveredAt: nowIso(),
    updatedAt: nowIso(),
  };
  upsertProspect(run.id, delivered);

  addAuditEntry(run.id, {
    id: uuid(),
    runId: run.id,
    prospectId: prospect.id,
    timestamp: nowIso(),
    action: `📦 WORK DELIVERED — ${prospect.company.name}`,
    reasoning: `AI-generated session brief delivered to ${prospect.contact.firstName} ${prospect.contact.lastName} via AgentMail reply. Includes personalised agenda and pre-session context tailored to the company. Full cycle complete: prospect → OFAC → outreach → payment → delivery. Zero human intervention.`,
    cost: 0.01,
    txHash: null,
    status: "success",
  });

  // Email escrow payment — subwallet flow: pay prospect confirmation USDC via Locus escrow.
  // Demonstrates full earn → pay economic loop: agent earns checkout payment, then pays
  // the prospect back a service-delivery confirmation held in time-limited escrow.
  const escrow = await sendEmailPayment({
    email: prospect.contact.email,
    amount: 0.50,
    memo: `Service delivery confirmation — ${run.skill} session with ${prospect.company.name}`,
    expiresInDays: 30,
  });
  addAuditEntry(run.id, {
    id: uuid(),
    runId: run.id,
    prospectId: prospect.id,
    timestamp: nowIso(),
    action: escrow.ok
      ? `💸 ESCROW PAYMENT QUEUED — ${prospect.company.name}`
      : `⚠️ ESCROW PAYMENT FAILED — ${prospect.company.name}`,
    reasoning: escrow.ok
      ? `Sent 0.50 USDC via Locus email escrow (subwallet) to ${prospect.contact.email} as service-delivery confirmation. Escrow ID: ${escrow.escrowId}. Funds held until ${escrow.expiresAt ?? "recipient claims"}. Closes the earn→pay loop: checkout USDC in → deliverable + USDC out.`
      : `Email escrow payment to ${prospect.contact.email} failed: ${escrow.error ?? "unknown error"}. Delivery still complete — escrow is best-effort.`,
    cost: escrow.ok ? 0.50 : 0,
    txHash: escrow.transactionId ?? null,
    status: escrow.ok ? "success" : "failed",
  });

  eventBus.emit(run.id, "work_delivered", {
    prospectId: prospect.id,
    companyName: prospect.company.name,
    contactName: `${prospect.contact.firstName} ${prospect.contact.lastName}`,
    deliveredAt: nowIso(),
  });
}
