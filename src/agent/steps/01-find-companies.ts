import { companies } from "@/lib/providers";
import { addAuditEntry, updateRun } from "@/lib/store";
import { uuid, nowIso } from "@/lib/utils";
import { eventBus } from "@/agent/events";
import type { Run, Company } from "@/lib/providers/types";

export async function findCompanies(run: Run): Promise<Company[]> {
  eventBus.emit(run.id, "audit_entry", {
    action: "SCANNING TARGET DATABASE",
    reasoning: `Searching for companies that need ${run.skill} developers using Apollo + BuiltWith intelligence.`,
    status: "info",
  });

  const results = await companies.searchCompanies({ skill: run.skill });

  updateRun(run.id, {}); // trigger persist

  addAuditEntry(run.id, {
    id: uuid(),
    runId: run.id,
    prospectId: null,
    timestamp: nowIso(),
    action: "TARGET ACQUISITION COMPLETE",
    reasoning: `Identified ${results.length} potential targets using skill-match heuristics on Apollo organization database. Filtered by tech stack alignment with "${run.skill}".`,
    cost: 0.043, // Apollo org search cost estimate
    txHash: null,
    status: "success",
  });

  eventBus.emit(run.id, "audit_entry", {
    action: "TARGET ACQUISITION COMPLETE",
    reasoning: `${results.length} targets identified and queued for OFAC compliance screening.`,
    status: "success",
    cost: 0.043,
  });

  // Return companies for the orchestrator to process
  return results;
}
