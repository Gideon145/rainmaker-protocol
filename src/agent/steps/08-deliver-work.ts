import { llm } from "@/lib/providers";
import { mail } from "@/lib/providers";
import { getRun, upsertProspect, addAuditEntry } from "@/lib/store";
import { uuid, nowIso } from "@/lib/utils";
import { eventBus } from "@/agent/events";
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

  eventBus.emit(run.id, "work_delivered", {
    prospectId: prospect.id,
    companyName: prospect.company.name,
    contactName: `${prospect.contact.firstName} ${prospect.contact.lastName}`,
    deliveredAt: nowIso(),
  });
}
