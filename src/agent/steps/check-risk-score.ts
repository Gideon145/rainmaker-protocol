import { upsertProspect, addAuditEntry } from "@/lib/store";
import { uuid, nowIso } from "@/lib/utils";
import { eventBus } from "@/agent/events";
import type { Prospect, Contact, Company } from "@/lib/providers/types";

// ─── Risk Score Gate ─────────────────────────────────────────────────────────
//
// Runs after Hunter enrichment, before OFAC screening.
// Computes a confidence score (0–100) for each prospect based on:
//   • Hunter.io email reputation  — primary signal
//   • Contact seniority (title)   — decision-maker bonus
//   • Company richness (tech stack, description depth)
//
// Prospects scoring below RISK_THRESHOLD are hard-blocked to save API budget.

const RISK_THRESHOLD = 35;

type EmailRep = "valid" | "risky" | "invalid" | "unknown" | undefined;

function computeRiskScore(
  contact: Contact | null,
  company: Company,
): { score: number; factors: string[] } {
  let score = 50;
  const factors: string[] = [];

  // ── Email reputation (Hunter.io) ──────────────────────────────────────────
  const rep: EmailRep = contact?.emailReputation;
  if (rep === "valid") {
    score += 30;
    factors.push("email verified by Hunter.io (+30)");
  } else if (rep === "risky") {
    score -= 15;
    factors.push("email flagged risky by Hunter (-15)");
  } else if (rep === "invalid") {
    // Hard block — return score 0 immediately
    factors.push("email marked invalid by Hunter — hard block");
    return { score: 0, factors };
  } else {
    // unknown / no contact
    score -= 5;
    factors.push("email reputation unknown (-5)");
  }

  // ── Contact seniority ─────────────────────────────────────────────────────
  if (contact?.title) {
    const t = contact.title.toLowerCase();
    const isDecisionMaker = [
      "ceo", "cto", "cmo", "cfo", "vp", "vice president",
      "director", "head of", "founder", "co-founder", "owner",
      "president", "chief", "managing",
    ].some((kw) => t.includes(kw));
    if (isDecisionMaker) {
      score += 15;
      factors.push(`decision-maker title "${contact.title}" (+15)`);
    } else {
      factors.push(`standard title "${contact.title}" (neutral)`);
    }
  } else {
    score -= 10;
    factors.push("no contact title found (-10)");
  }

  // ── Company data richness ─────────────────────────────────────────────────
  if (company.techStack?.length > 0) {
    score += 5;
    factors.push(`tech stack detected (${company.techStack.length} signals) (+5)`);
  }
  if (company.description && company.description.length > 60) {
    score += 5;
    factors.push("rich company profile (+5)");
  }

  return { score: Math.max(0, Math.min(100, score)), factors };
}

/**
 * checkRiskScore — gates a prospect through confidence scoring
 * before any paid API calls (OFAC, Claude, AgentMail) are made.
 */
export async function checkRiskScore(prospect: Prospect): Promise<Prospect> {
  const { score, factors } = computeRiskScore(prospect.contact, prospect.company);

  const blocked = score < RISK_THRESHOLD;
  const level   = score >= 65 ? "HIGH" : score >= RISK_THRESHOLD ? "MEDIUM" : "LOW";
  const label   = blocked ? "⚠ RISK GATE BLOCK" : `✓ RISK GATE PASS`;

  const updated: Prospect = {
    ...prospect,
    status: blocked ? "failed" : "ofac_scanning",
    errorMessage: blocked
      ? `RISK GATE: score ${score}/100 (${level}). ${factors.join(". ")}. Below confidence threshold of ${RISK_THRESHOLD} — skipping to conserve API budget.`
      : null,
    updatedAt: nowIso(),
  };

  upsertProspect(prospect.runId, updated);

  addAuditEntry(prospect.runId, {
    id: uuid(),
    runId: prospect.runId,
    prospectId: prospect.id,
    timestamp: nowIso(),
    action: `${label} — ${prospect.company.name}`,
    reasoning: blocked
      ? `Risk score ${score}/100 (${level}). Factors: ${factors.join("; ")}. Prospect blocked at confidence gate — no API budget consumed on low-quality lead.`
      : `Risk score ${score}/100 (${level}). Factors: ${factors.join("; ")}. Prospect cleared confidence gate — proceeding to OFAC screening.`,
    cost: 0,
    txHash: null,
    status: blocked ? "warning" : "success",
  });

  eventBus.emit(prospect.runId, "prospect_update", updated);
  return updated;
}
