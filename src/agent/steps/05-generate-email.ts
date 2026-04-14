import { llm } from "@/lib/providers";
import { upsertProspect, addAuditEntry } from "@/lib/store";
import { uuid, nowIso } from "@/lib/utils";
import { eventBus } from "@/agent/events";
import type { Prospect, Run } from "@/lib/providers/types";

export async function generateEmail(prospect: Prospect, run: Run): Promise<Prospect> {
  if (!prospect.contact || !prospect.checkoutUrl) {
    const failed: Prospect = {
      ...prospect,
      status: "failed",
      errorMessage: "Cannot generate email — missing contact or checkout URL.",
      updatedAt: nowIso(),
    };
    upsertProspect(prospect.runId, failed);
    return failed;
  }

  const { subject, body } = await llm.generateOutreach({
    skill: run.skill,
    hourlyRate: run.hourlyRate,
    company: prospect.company,
    contact: prospect.contact,
    checkoutUrl: prospect.checkoutUrl,
  });

  const updated: Prospect = {
    ...prospect,
    outreachEmail: JSON.stringify({ subject, body }),
    updatedAt: nowIso(),
  };

  upsertProspect(prospect.runId, updated);

  addAuditEntry(prospect.runId, {
    id: uuid(),
    runId: prospect.runId,
    prospectId: prospect.id,
    timestamp: nowIso(),
    action: `EMAIL GENERATED — ${prospect.company.name}`,
    reasoning: `Claude generated a personalized outreach email for ${prospect.contact.firstName} ${prospect.contact.lastName} (${prospect.contact.title}). Personalization signals used: tech stack [${prospect.company.techStack.slice(0, 3).join(", ")}], industry [${prospect.company.industry}], company size [${prospect.company.size}]. Subject: "${subject}"`,
    cost: 0.018,
    txHash: null,
    status: "success",
  });

  eventBus.emit(prospect.runId, "prospect_update", updated);
  return updated;
}
