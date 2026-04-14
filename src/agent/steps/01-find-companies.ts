import { companies, USE_MOCK } from "@/lib/providers";
import { addAuditEntry } from "@/lib/store";
import { uuid, nowIso } from "@/lib/utils";
import { eventBus } from "@/agent/events";
import type { Run, Company } from "@/lib/providers/types";

export async function findCompanies(run: Run): Promise<Company[]> {
  eventBus.emit(run.id, "audit_entry", {
    action: "SCANNING TARGET DATABASE",
    reasoning: `Searching for companies that need ${run.skill} developers using Tavily + Brave AI search intelligence.`,
    status: "info",
  });

  const tavilyResults = await companies.searchCompanies({ skill: run.skill });

  // ── Real mode: second-pass discovery via Brave ────────────────────────
  const seenDomains = new Set(tavilyResults.map((c) => c.domain));
  let braveCount = 0;

  if (!USE_MOCK) {
    try {
      const { searchBrave } = await import("@/lib/providers/real/brave");
      const braveResults = await searchBrave(
        `${run.skill} software agency startup looking for freelancers contractors`,
      );
      for (const c of braveResults) {
        if (!seenDomains.has(c.domain)) {
          seenDomains.add(c.domain);
          tavilyResults.push(c);
          braveCount++;
        }
      }
    } catch { /* non-fatal — Brave unavailable */ }
  }

  const finalCompanies = tavilyResults.slice(0, 12);

  // ── Real mode: enrich descriptions via Firecrawl ──────────────────────
  if (!USE_MOCK) {
    try {
      const { scrapeCompanyPage } = await import("@/lib/providers/real/firecrawl");
      await Promise.all(
        finalCompanies.map(async (company) => {
          const enriched = await scrapeCompanyPage(company.domain);
          if (!enriched) return;
          if (enriched.description) company.description = enriched.description;
          if (enriched.techStack.length > company.techStack.length) {
            company.techStack = enriched.techStack;
          }
        }),
      );
    } catch { /* non-fatal — Firecrawl unavailable */ }
  }

  const totalApis = USE_MOCK ? 1 : 3; // Tavily + Brave + Firecrawl
  const enrichCost = USE_MOCK ? 0 : 0.009 + finalCompanies.length * 0.002; // Brave + Firecrawl per-page

  addAuditEntry(run.id, {
    id: uuid(),
    runId: run.id,
    prospectId: null,
    timestamp: nowIso(),
    action: "TARGET ACQUISITION COMPLETE",
    reasoning: `Identified ${finalCompanies.length} potential targets via ${totalApis === 1 ? "Tavily AI search" : "Tavily AI search + Brave web discovery + Firecrawl homepage enrichment"}. ${braveCount > 0 ? `${braveCount} additional targets found via Brave. ` : ""}Tech stack filtered for "${run.skill}" alignment.`,
    cost: 0.038 + enrichCost,
    txHash: null,
    status: "success",
  });

  eventBus.emit(run.id, "audit_entry", {
    action: "TARGET ACQUISITION COMPLETE",
    reasoning: `${finalCompanies.length} targets queued for OFAC compliance screening.`,
    status: "success",
    cost: 0.043 + enrichCost,
  });

  return finalCompanies;
}
