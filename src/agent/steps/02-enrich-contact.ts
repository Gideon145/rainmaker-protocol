import { contacts } from "@/lib/providers";
import { upsertProspect, addAuditEntry } from "@/lib/store";
import { uuid, nowIso } from "@/lib/utils";
import { eventBus } from "@/agent/events";
import type { Prospect } from "@/lib/providers/types";

export async function enrichContact(prospect: Prospect): Promise<Prospect> {
  eventBus.emit(prospect.runId, "prospect_update", {
    ...prospect,
    status: "enriching",
  });

  const contact = await contacts.enrichContact(prospect.company);

  const updated: Prospect = {
    ...prospect,
    contact,
    status: contact ? "ofac_scanning" : "failed",
    errorMessage: contact ? null : "No contact found for this company.",
    updatedAt: nowIso(),
  };

  upsertProspect(prospect.runId, updated);

  addAuditEntry(prospect.runId, {
    id: uuid(),
    runId: prospect.runId,
    prospectId: prospect.id,
    timestamp: nowIso(),
    action: `CONTACT ENRICHED — ${prospect.company.name}`,
    reasoning: contact
      ? `Located ${contact.firstName} ${contact.lastName} (${contact.title}) via LinkedIn/Clado enrichment. Email: ${contact.email}.`
      : `No decision-maker contact found for ${prospect.company.domain}. Skipping.`,
    cost: 0.015,
    txHash: null,
    status: contact ? "success" : "warning",
  });

  eventBus.emit(prospect.runId, "prospect_update", updated);
  return updated;
}
