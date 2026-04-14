import { callWrappedAPI } from "../../locus";
import type { ComplianceProvider, OFACResult } from "../types";

export const ofac: ComplianceProvider = {
  async screenOFAC(entityName: string): Promise<OFACResult> {
    const res = await callWrappedAPI<{
      matches: Array<{
        name: string;
        score: number;
        list_name: string;
        remarks?: string;
      }>;
      total_matches: number;
    }>("ofac", "sanctions-screening", {
      name: entityName,
      fuzzy_match: true,
      threshold: 75,
    });

    if (!res.ok || !res.data) return { clean: true, matches: [] };

    const matches = (res.data.matches ?? []).map((m) => ({
      name: m.name,
      score: m.score,
      list: m.list_name,
      reason: m.remarks ?? "Sanctions match",
    }));

    return { clean: matches.length === 0, matches };
  },
};
