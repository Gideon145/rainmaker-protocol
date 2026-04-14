import type { ComplianceProvider, OFACResult } from "../types";

// Only "Volkov Syndicate LLC" triggers an OFAC hit in demo mode
const OFAC_HITS: Record<string, OFACResult> = {
  "Volkov Syndicate LLC": {
    clean: false,
    matches: [
      {
        name: "VOLKOV, Dmitri Aleksandrovich",
        score: 87,
        list: "SDN (Specially Designated Nationals)",
        reason: "Associated entity — OFAC Executive Order 13661",
      },
    ],
  },
};

export const ofac: ComplianceProvider = {
  async screenOFAC(entityName: string): Promise<OFACResult> {
    await new Promise((r) => setTimeout(r, 300));
    return OFAC_HITS[entityName] ?? { clean: true, matches: [] };
  },
};
