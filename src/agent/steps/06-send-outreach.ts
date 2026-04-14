import { mail } from "@/lib/providers";
import { upsertProspect, addAuditEntry, updateRun } from "@/lib/store";
import { uuid, nowIso } from "@/lib/utils";
import { eventBus } from "@/agent/events";
import type { Prospect, Run } from "@/lib/providers/types";

export async function sendOutreach(
  prospect: Prospect,
  run: Run,
): Promise<Prospect> {
  if (!prospect.contact || !prospect.outreachEmail) {
    const failed: Prospect = {
      ...prospect,
      status: "failed",
      errorMessage: "Cannot send outreach — missing contact email or message body.",
      updatedAt: nowIso(),
    };
    upsertProspect(prospect.runId, failed);
    return failed;
  }

  if (!run.agentInboxId) {
    const failed: Prospect = {
      ...prospect,
      status: "failed",
      errorMessage: "Agent inbox not initialised.",
      updatedAt: nowIso(),
    };
    upsertProspect(prospect.runId, failed);
    return failed;
  }

  let emailData: { subject: string; body: string };
  try {
    emailData = JSON.parse(prospect.outreachEmail);
  } catch {
    emailData = {
      subject: `${run.skill} developer available`,
      body: prospect.outreachEmail,
    };
  }

  const { messageId } = await mail.sendEmail({
    inboxId: run.agentInboxId,
    to: prospect.contact.email,
    subject: emailData.subject,
    body: emailData.body,
  });

  const updated: Prospect = {
    ...prospect,
    agentMailMessageId: messageId,
    status: "awaiting_payment",
    updatedAt: nowIso(),
  };

  upsertProspect(prospect.runId, updated);

  // Update run email stats
  updateRun(run.id, {});

  addAuditEntry(prospect.runId, {
    id: uuid(),
    runId: prospect.runId,
    prospectId: prospect.id,
    timestamp: nowIso(),
    action: `📨 TRANSMISSION SENT — ${prospect.contact.email}`,
    reasoning: `Outreach dispatched via AgentMail (${run.agentEmail}) to ${prospect.contact.firstName} ${prospect.contact.lastName} at ${prospect.company.name}. Subject: "${emailData.subject}". Checkout link embedded. Now monitoring for payment confirmation.`,
    cost: 0.01,
    txHash: null,
    status: "success",
  });

  eventBus.emit(prospect.runId, "prospect_update", updated);
  eventBus.emit(prospect.runId, "audit_entry", {
    action: `📨 TRANSMISSION SENT — ${prospect.company.name}`,
    reasoning: `Email dispatched to ${prospect.contact.email}. Awaiting payment on session ${prospect.checkoutSessionId}.`,
    status: "success",
    cost: 0.01,
  });

  return updated;
}
