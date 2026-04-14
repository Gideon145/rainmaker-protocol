/**
 * RAINMAKER PROTOCOL — Core Agent Tests
 *
 * Covers the three most critical invariants of the system:
 * 1. OFAC provider   — mock correctly flags/clears entities
 * 2. OFAC step fn    — orchestrator step sets correct prospect status
 * 3. Budget ctrl     — exported constant + exhausted-run integration test
 * 4. run_completed   — full Run object emitted, not a stub
 */

import { describe, it, expect } from "vitest";

// ─── 1. OFAC provider (mock) ───────────────────────────────────────────────

describe("OFAC provider (mock)", () => {
  it("returns ofac_blocked result for a sanctioned entity", async () => {
    process.env.USE_MOCK = "true";
    const { compliance } = await import("@/lib/providers");
    const result = await compliance.screenOFAC("Volkov Syndicate LLC", "Russia");
    expect(result.clean).toBe(false);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].score).toBeGreaterThanOrEqual(75);
    expect(result.matches[0].list).toContain("SDN");
  });

  it("returns clean for a legitimate company", async () => {
    process.env.USE_MOCK = "true";
    const { compliance } = await import("@/lib/providers");
    const result = await compliance.screenOFAC("Acme Software Inc", "US");
    expect(result.clean).toBe(true);
    expect(result.matches).toHaveLength(0);
  });
});

// ─── 2. screenOFAC step function ──────────────────────────────────────────
// Tests the actual orchestrator step — not just the raw provider.
// Verifies prospect.status is correctly set and persisted to the store.

describe("screenOFAC step function", () => {
  async function makeProspect(runId: string, companyName: string) {
    const { createRun, upsertProspect } = await import("@/lib/store");
    const { uuid, nowIso } = await import("@/lib/utils");
    createRun({ id: runId, skill: "React", hourlyRate: 50 });
    const prospect = {
      id: uuid(), runId,
      company: {
        id: uuid(), name: companyName, domain: "test.example.com",
        industry: "SaaS", size: "11-50", techStack: ["React"],
        location: "US", description: "Test company",
      },
      contact: null, ofacResult: null, status: "queued" as const,
      outreachEmail: null, checkoutSessionId: null, checkoutUrl: null,
      agentMailMessageId: null, paymentTxHash: null, paidAt: null,
      deliveredAt: null, errorMessage: null,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    upsertProspect(runId, prospect);
    return prospect;
  }

  it("sets prospect.status to ofac_blocked for a sanctioned entity", async () => {
    process.env.USE_MOCK = "true";
    const prospect = await makeProspect("test-step-blocked-" + Date.now(), "Volkov Syndicate LLC");
    const { screenOFAC } = await import("@/agent/steps/03-screen-ofac");
    const result = await screenOFAC(prospect);
    expect(result.status).toBe("ofac_blocked");
    expect(result.ofacResult?.clean).toBe(false);
    expect(result.errorMessage).toMatch(/OFAC MATCH/);
  });

  it("sets prospect.status to generating_email for a clean company", async () => {
    process.env.USE_MOCK = "true";
    const prospect = await makeProspect("test-step-clear-" + Date.now(), "Nexus Digital");
    const { screenOFAC } = await import("@/agent/steps/03-screen-ofac");
    const result = await screenOFAC(prospect);
    expect(result.status).toBe("generating_email");
    expect(result.ofacResult?.clean).toBe(true);
    expect(result.errorMessage).toBeNull();
  });
});

// ─── 3. Budget controller ─────────────────────────────────────────────────

describe("Budget controller", () => {
  it("BUDGET_LIMIT_USDC constant is $5.00", async () => {
    const { BUDGET_LIMIT_USDC } = await import("@/agent/orchestrator");
    expect(BUDGET_LIMIT_USDC).toBe(5.00);
  });

  it("run reaches budget_exhausted status when pre-spent at the limit", async () => {
    process.env.USE_MOCK = "true";
    const { createRun, updateRun, getRun } = await import("@/lib/store");
    const { executeRun, BUDGET_LIMIT_USDC } = await import("@/agent/orchestrator");
    const runId = "test-budget-exec-" + Date.now();
    createRun({ id: runId, skill: "React", hourlyRate: 50 });
    updateRun(runId, { totalSpentUsdc: BUDGET_LIMIT_USDC });
    await executeRun(runId, { skill: "React", hourlyRate: 50 });
    const finished = getRun(runId)!;
    expect(finished.status).toBe("budget_exhausted");
  }, 15_000);
});

// ─── 4. EventBus run_completed payload ────────────────────────────────────

describe("EventBus run_completed payload", () => {
  it("emitted payload is a full Run with prospects and auditLog (not a stub)", async () => {
    const { eventBus } = await import("@/agent/events");
    const { createRun, upsertProspect, addAuditEntry, getRun } = await import("@/lib/store");
    const { uuid, nowIso } = await import("@/lib/utils");

    const runId = "test-event-" + Date.now();
    createRun({ id: runId, skill: "full-stack", hourlyRate: 50 });
    upsertProspect(runId, {
      id: uuid(), runId,
      company: { id: uuid(), name: "Test Co", domain: "test.io", industry: "SaaS", size: "11-50", techStack: ["React"], location: "US", description: "Test" },
      contact: null, ofacResult: null, status: "queued",
      outreachEmail: null, checkoutSessionId: null, checkoutUrl: null,
      agentMailMessageId: null, paymentTxHash: null, paidAt: null,
      deliveredAt: null, errorMessage: null,
      createdAt: nowIso(), updatedAt: nowIso(),
    });
    addAuditEntry(runId, {
      id: uuid(), runId, prospectId: null, timestamp: nowIso(),
      action: "TEST", reasoning: "entry", cost: 0, txHash: null, status: "info",
    });

    let capturedPayload: unknown = null;
    const unsub = eventBus.subscribe(runId, (e) => {
      if (e.type === "run_completed") capturedPayload = e.payload;
    });
    eventBus.emit(runId, "run_completed", getRun(runId)!);
    unsub();

    expect(capturedPayload).not.toBeNull();
    const p = capturedPayload as Record<string, unknown>;
    expect(Array.isArray(p.prospects)).toBe(true);
    expect(Array.isArray(p.auditLog)).toBe(true);
    expect((p.prospects as unknown[]).length).toBeGreaterThan(0);
    expect((p.auditLog as unknown[]).length).toBeGreaterThan(0);
    expect(p.id).toBe(runId);
  });
});

// ─── 5. Webhook HMAC verification ────────────────────────────────────────
// The money path — must reject bad/missing signatures and unknown sessions.

describe("Webhook HMAC verification", () => {
  async function makeSignedRequest(body: object, secret: string, opts: { tamper?: boolean; wrongLength?: boolean } = {}) {
    const { storeWebhookSecret, createRun } = await import("@/lib/store");
    const crypto = await import("crypto");

    const rawBody = JSON.stringify(body);
    const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    let signature = `sha256=${hmac}`;

    if (opts.tamper) signature = `sha256=${"00".repeat(32)}`; // valid length, bad value
    if (opts.wrongLength) signature = "sha256=short";

    return { rawBody, signature };
  }

  it("returns 401 for an unknown sessionId (no secret stored)", async () => {
    const { POST } = await import("@/app/api/webhooks/locus/route");
    const { NextRequest } = await import("next/server");

    const body = { event: "checkout.session.paid", data: { sessionId: "unknown-sess-" + Date.now(), amount: "50" }, timestamp: new Date().toISOString() };
    const req = new NextRequest("http://localhost/api/webhooks/locus", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "x-signature-256": "sha256=abc" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("unknown session");
  });

  it("returns 401 for a tampered signature (wrong HMAC, correct length)", async () => {
    const { storeWebhookSecret } = await import("@/lib/store");
    const { POST } = await import("@/app/api/webhooks/locus/route");
    const { NextRequest } = await import("next/server");

    const sessionId = "tamper-sess-" + Date.now();
    const secret = "test-webhook-secret-tamper";
    storeWebhookSecret(sessionId, secret);

    const body = { event: "checkout.session.paid", data: { sessionId, amount: "50" }, timestamp: new Date().toISOString() };
    const { rawBody } = await makeSignedRequest(body, secret);

    const req = new NextRequest("http://localhost/api/webhooks/locus", {
      method: "POST",
      body: rawBody,
      headers: { "Content-Type": "application/json", "x-signature-256": `sha256=${"ff".repeat(32)}` },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("invalid signature");
  });

  it("returns 401 for a wrong-length signature (would crash timingSafeEqual)", async () => {
    const { storeWebhookSecret } = await import("@/lib/store");
    const { POST } = await import("@/app/api/webhooks/locus/route");
    const { NextRequest } = await import("next/server");

    const sessionId = "wronglen-sess-" + Date.now();
    storeWebhookSecret(sessionId, "test-secret-len");

    const body = { event: "checkout.session.paid", data: { sessionId, amount: "50" }, timestamp: new Date().toISOString() };

    const req = new NextRequest("http://localhost/api/webhooks/locus", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "x-signature-256": "sha256=tooshort" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401); // must not throw 500
  });
});
