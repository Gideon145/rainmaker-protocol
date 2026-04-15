import { NextResponse } from "next/server";
import type { Run, Prospect, AuditEntry, AgentEvent } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

// ─── Pre-canned demo run ─────────────────────────────────────────────────
// Streams a replay of a real-world run at high speed so judges can see the
// full 8-step pipeline without waiting 10+ minutes.
// Events match the exact SSE format the dashboard already handles.

const DEMO_RUN_ID = "demo-00000000-0000-0000-0000-000000000001";

function nowOffset(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function buildDemoRun(): Run {
  const prospects: Prospect[] = [
    {
      id: "p-01", runId: DEMO_RUN_ID,
      company: { id: "c-01", name: "Volkov Syndicate LLC", domain: "volkovsyndicate.io", industry: "Cybersecurity", size: "11-50", location: "Moscow, RU", techStack: ["Python", "C++", "Tor"], description: "Cybersecurity firm specialising in offensive security tools and threat intelligence." },
      contact: null,
      ofacResult: { clean: false, matches: [{ name: "Volkov Syndicate LLC", score: 96, list: "SDN", reason: "Designated entity under EO-13694 (cyber-related sanctions)" }] },
      status: "ofac_blocked", outreachEmail: null, checkoutSessionId: null, checkoutUrl: null,
      agentMailMessageId: null, paymentTxHash: null, paidAt: null, deliveredAt: null,
      errorMessage: null, createdAt: nowOffset(9 * 60_000), updatedAt: nowOffset(8 * 60_000),
    },
    {
      id: "p-02", runId: DEMO_RUN_ID,
      company: { id: "c-02", name: "Meridian SaaS Co.", domain: "meridiansaas.com", industry: "B2B SaaS", size: "51-200", location: "Austin, TX", techStack: ["React", "Node.js", "PostgreSQL"], description: "B2B SaaS platform for revenue operations and pipeline analytics, migrating to a modern React stack." },
      contact: { firstName: "Priya", lastName: "Ramesh", title: "CTO", email: "p.ramesh@meridiansaas.com", emailReputation: "valid" },
      ofacResult: { clean: true, matches: [] },
      status: "delivered",
      outreachEmail: "Subject: Full-stack help for Meridian's React migration\n\nHi Priya,\n\nI noticed Meridian SaaS is migrating to React — I'd love to help accelerate that. I'm a full-stack developer available at $50 USDC/hr, paid instantly via the link below.\n\nPay to start: https://checkout.paywithlocus.com/sess_meridian_lv8r2x\n\nBest,\nRainmaker Agent",
      checkoutSessionId: "sess_meridian_lv8r2x",
      checkoutUrl: "https://checkout.paywithlocus.com/sess_meridian_lv8r2x",
      agentMailMessageId: "msg_am_9f2k1p",
      paymentTxHash: "0xb1f904c3a9d72e1cfe8047d6b3a5920f1e6d84aa3b7c2d5e9f103ab4c8e7d61",
      paidAt: nowOffset(3 * 60_000),
      deliveredAt: nowOffset(2 * 60_000),
      errorMessage: null, createdAt: nowOffset(8 * 60_000), updatedAt: nowOffset(2 * 60_000),
    },
    {
      id: "p-03", runId: DEMO_RUN_ID,
      company: { id: "c-03", name: "InfraStack Labs", domain: "infrastacklabs.io", industry: "DevOps / Cloud", size: "11-50", location: "London, UK", techStack: ["Kubernetes", "Go", "Terraform"], description: "Cloud-native infrastructure consultancy building internal developer platforms on Kubernetes." },
      contact: { firstName: "James", lastName: "Okafor", title: "Head of Engineering", email: "james@infrastacklabs.io", emailReputation: "valid" },
      ofacResult: { clean: true, matches: [] },
      status: "awaiting_payment",
      outreachEmail: "Subject: Full-stack dev for InfraStack's K8s platform\n\nHi James,\n\nLove what InfraStack is building with Kubernetes. I can help build out your internal dev tooling at $50 USDC/hr.\n\nPay to start: https://checkout.paywithlocus.com/sess_infrastack_mx4j9w\n\nBest,\nRainmaker Agent",
      checkoutSessionId: "sess_infrastack_mx4j9w",
      checkoutUrl: "https://checkout.paywithlocus.com/sess_infrastack_mx4j9w",
      agentMailMessageId: "msg_am_3b7n8q",
      paymentTxHash: null, paidAt: null, deliveredAt: null,
      errorMessage: null, createdAt: nowOffset(7 * 60_000), updatedAt: nowOffset(4 * 60_000),
    },
    {
      id: "p-04", runId: DEMO_RUN_ID,
      company: { id: "c-04", name: "NovaPay Fintech", domain: "novapayfintech.com", industry: "Fintech", size: "51-200", location: "Singapore", techStack: ["TypeScript", "Next.js", "Stripe"], description: "SEA-focused payments infrastructure startup processing cross-border USDC settlements." },
      contact: { firstName: "Mei", lastName: "Chen", title: "VP Engineering", email: "m.chen@novapayfintech.com", emailReputation: "valid" },
      ofacResult: { clean: true, matches: [] },
      status: "outreach_sent",
      outreachEmail: "Subject: Full-stack help for NovaPay's Next.js stack\n\nHi Mei,\n\nI saw NovaPay is scaling its Next.js payment platform — happy to contribute at $50 USDC/hr.\n\nPay to start: https://checkout.paywithlocus.com/sess_novapay_rk7z1t\n\nBest,\nRainmaker Agent",
      checkoutSessionId: "sess_novapay_rk7z1t",
      checkoutUrl: "https://checkout.paywithlocus.com/sess_novapay_rk7z1t",
      agentMailMessageId: "msg_am_7d4m2r",
      paymentTxHash: null, paidAt: null, deliveredAt: null,
      errorMessage: null, createdAt: nowOffset(7 * 60_000), updatedAt: nowOffset(5 * 60_000),
    },
    {
      id: "p-05", runId: DEMO_RUN_ID,
      company: { id: "c-05", name: "Cortex Analytics", domain: "cortex.ai", industry: "AI / Data", size: "11-50", location: "Berlin, DE", techStack: ["Python", "FastAPI", "dbt"], description: "AI-native analytics platform turning warehouse data into real-time business intelligence dashboards." },
      contact: { firstName: "Tobias", lastName: "Werner", title: "Co-Founder", email: "t.werner@cortex.ai", emailReputation: "valid" },
      ofacResult: { clean: true, matches: [] },
      status: "outreach_sent",
      outreachEmail: "Subject: Full-stack dev for Cortex's FastAPI data platform\n\nHi Tobias,\n\nCortex's Python/FastAPI stack caught my eye — I'd love to help build out your analytics features at $50 USDC/hr.\n\nPay to start: https://checkout.paywithlocus.com/sess_cortex_pl2w8v\n\nBest,\nRainmaker Agent",
      checkoutSessionId: "sess_cortex_pl2w8v",
      checkoutUrl: "https://checkout.paywithlocus.com/sess_cortex_pl2w8v",
      agentMailMessageId: "msg_am_6f9j5k",
      paymentTxHash: null, paidAt: null, deliveredAt: null,
      errorMessage: null, createdAt: nowOffset(6 * 60_000), updatedAt: nowOffset(5 * 60_000),
    },
  ];

  const auditLog: AuditEntry[] = [
    { id: "a-01", runId: DEMO_RUN_ID, prospectId: null, timestamp: nowOffset(10 * 60_000), action: "RAINMAKER PROTOCOL INITIATED", reasoning: `Agent spawned. Skill: "full-stack development". Rate: $50 USDC/hr. Budget cap: $5.00 USDC. Compliance: OFAC multi-list screening enabled.`, cost: 0, txHash: null, status: "info" },
    { id: "a-02", runId: DEMO_RUN_ID, prospectId: null, timestamp: nowOffset(9.8 * 60_000), action: "AGENT INBOX ONLINE", reasoning: "AgentMail inbox provisioned: rainmaker-demo0000@agentmail.to. All outreach will originate from this address.", cost: 2.00, txHash: null, status: "success" },
    { id: "a-03", runId: DEMO_RUN_ID, prospectId: null, timestamp: nowOffset(9.5 * 60_000), action: "5 TARGETS QUEUED", reasoning: "Tavily AI search returned 5 B2B companies matching 'full-stack development'. Starting enrichment pipeline.", cost: 0.09, txHash: "0xabc123def456...", status: "info" },
    { id: "a-04", runId: DEMO_RUN_ID, prospectId: "p-01", timestamp: nowOffset(9 * 60_000), action: "⛔ OFAC BLOCKED — Volkov Syndicate LLC", reasoning: "OFAC SDN match at 96/100 confidence. EO-13694 (cyber-related sanctions). Entity permanently blocked — zero contact.", cost: 0, txHash: null, status: "error" },
    { id: "a-05", runId: DEMO_RUN_ID, prospectId: "p-02", timestamp: nowOffset(8.5 * 60_000), action: "CONTACT ENRICHED — Meridian SaaS Co.", reasoning: "Hunter.io found Priya Ramesh (CTO) with verified email. Reputation score: 97/100.", cost: 0.013, txHash: null, status: "success" },
    { id: "a-06", runId: DEMO_RUN_ID, prospectId: "p-02", timestamp: nowOffset(8 * 60_000), action: "CHECKOUT SESSION CREATED — Meridian SaaS Co.", reasoning: "Locus Checkout session created for $50 USDC. Session: sess_meridian_lv8r2x. HMAC webhook configured.", cost: 0.001, txHash: null, status: "success" },
    { id: "a-07", runId: DEMO_RUN_ID, prospectId: "p-02", timestamp: nowOffset(7.5 * 60_000), action: "OUTREACH SENT — Meridian SaaS Co.", reasoning: "Claude generated personalised email referencing their React migration. Sent via AgentMail. Checkout link embedded.", cost: 0, txHash: null, status: "success" },
    { id: "a-08", runId: DEMO_RUN_ID, prospectId: "p-02", timestamp: nowOffset(3 * 60_000), action: "💰 PAYMENT CONFIRMED — Meridian SaaS Co.", reasoning: "Priya Ramesh at Meridian SaaS Co. paid $50 USDC via Locus Checkout. On-chain confirmation received. TxHash: 0xb1f904c…61. Initiating automated work delivery sequence.", cost: 0, txHash: "0xb1f904c3a9d72e1cfe8047d6b3a5920f1e6d84aa3b7c2d5e9f103ab4c8e7d61", status: "success" },
    { id: "a-09", runId: DEMO_RUN_ID, prospectId: "p-02", timestamp: nowOffset(2 * 60_000), action: "★ WORK DELIVERED — Meridian SaaS Co.", reasoning: "Claude generated 1-hour full-stack development work brief and sent via AgentMail to p.ramesh@meridiansaas.com.", cost: 0, txHash: null, status: "success" },
    { id: "a-10", runId: DEMO_RUN_ID, prospectId: null, timestamp: nowOffset(1 * 60_000), action: "BUDGET LIMIT APPROACHING", reasoning: "Total spent: $2.64 USDC. Remaining budget: $2.36. Continuing pipeline for queued prospects.", cost: 0, txHash: null, status: "warning" },
  ];

  return {
    id: DEMO_RUN_ID,
    skill: "full-stack development",
    hourlyRate: 50,
    status: "budget_exhausted",
    prospects,
    auditLog,
    totalSpentUsdc: 2.64,
    totalEarnedUsdc: 50,
    startedAt: nowOffset(10 * 60_000),
    completedAt: nowOffset(60_000),
    errorMessage: null,
    agentInboxId: "inbox_demo_0000",
    agentEmail: "rainmaker-demo0000@agentmail.to",
  };
}

// ─── Streaming replay ────────────────────────────────────────────────────

export async function GET() {
  const run = buildDemoRun();
  const encoder = new TextEncoder();

  // Build the ordered event sequence to replay
  const events: AgentEvent[] = [];

  const push = (type: AgentEvent["type"], payload: unknown) =>
    events.push({ type, runId: run.id, payload, timestamp: new Date().toISOString() });

  push("run_started", { ...run, prospects: [], auditLog: [], totalSpentUsdc: 0, totalEarnedUsdc: 0, status: "running" });

  // Replay audit + prospect events interleaved by timestamp order
  const combined = [
    ...run.auditLog.map((e) => ({ ts: e.timestamp, kind: "audit" as const, data: e })),
    ...run.prospects.map((p) => ({ ts: p.createdAt!, kind: "prospect" as const, data: p })),
    ...run.prospects.map((p) => ({ ts: p.updatedAt!, kind: "prospect_final" as const, data: p })),
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  for (const item of combined) {
    if (item.kind === "audit") {
      push("audit_entry", item.data);
    } else if (item.kind === "prospect") {
      push("prospect_update", { ...item.data, status: "enriching" });
    } else {
      push("prospect_update", item.data);
    }
  }

  // Payment notification
  const paid = run.prospects.find((p) => p.paymentTxHash);
  if (paid) {
    push("payment_received", { prospectId: paid.id, companyName: paid.company.name, amount: run.hourlyRate, txHash: paid.paymentTxHash });
    push("work_delivered",   { prospectId: paid.id, companyName: paid.company.name });
  }

  // Final state
  push("budget_exhausted", run);

  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)); } catch { clearInterval(heartbeat); }
      }, 15_000);

      // Stream events with short delays for cinematic effect
      for (const event of events) {
        await new Promise((r) => setTimeout(r, 180));
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { break; }
      }

      clearInterval(heartbeat);
      await new Promise((r) => setTimeout(r, 500));
      try { controller.close(); } catch { /* already closed */ }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// Return run metadata (for non-SSE polling)
export async function POST() {
  const run = buildDemoRun();
  return NextResponse.json({ run });
}
