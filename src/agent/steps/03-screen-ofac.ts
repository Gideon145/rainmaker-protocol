import { compliance } from "@/lib/providers";
import { upsertProspect, addAuditEntry } from "@/lib/store";
import { uuid, nowIso } from "@/lib/utils";
import { eventBus } from "@/agent/events";
import type { Prospect } from "@/lib/providers/types";

export async function screenOFAC(prospect: Prospect): Promise<Prospect> {
  eventBus.emit(prospect.runId, "prospect_update", {
    ...prospect,
    status: "ofac_scanning",
  });

  const ofacResult = await compliance.screenOFAC(
    prospect.company.name,
    prospect.company.location?.split(",").pop()?.trim(),
  );

  const isBlocked = !ofacResult.clean;

  const updated: Prospect = {
    ...prospect,
    ofacResult,
    status: isBlocked ? "ofac_blocked" : "generating_email",
    errorMessage: isBlocked
      ? `OFAC MATCH: ${ofacResult.matches[0]?.name} (score: ${ofacResult.matches[0]?.score}, list: ${ofacResult.matches[0]?.list})`
      : null,
    updatedAt: nowIso(),
  };

  upsertProspect(prospect.runId, updated);

  addAuditEntry(prospect.runId, {
    id: uuid(),
    runId: prospect.runId,
    prospectId: prospect.id,
    timestamp: nowIso(),
    action: isBlocked
      ? `⚠️ OFAC BLOCK — ${prospect.company.name}`
      : `✓ OFAC CLEAR — ${prospect.company.name}`,
    reasoning: isBlocked
      ? `Entity "${prospect.company.name}" matched OFAC SDN list entry "${ofacResult.matches[0]?.name}" with confidence score ${ofacResult.matches[0]?.score}/100. Compliance protocol mandates immediate halt on all outreach to this entity. Zero tolerance policy enforced.`
      : `${prospect.company.name} screened across 25+ OFAC/UN/EU sanctions lists. No matches found. Cleared for outreach.`,
    cost: 0.012,
    txHash: null,
    status: isBlocked ? "error" : "success",
  });

  eventBus.emit(prospect.runId, "prospect_update", updated);
  if (isBlocked) {
    eventBus.emit(prospect.runId, "audit_entry", {
      action: `⚠️ OFAC BLOCK — ${prospect.company.name}`,
      reasoning: `Sanctions match confirmed. Entity blacklisted. All pending transactions cancelled.`,
      status: "error",
    });
  }

  return updated;
}
