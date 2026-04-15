# Devfolio Submission — Rainmaker Protocol

---

## Project Name
**Rainmaker Protocol**

---

## Short Description (≤ 160 chars)
Autonomous B2B client acquisition agent: finds companies, screens for OFAC sanctions, creates Locus USDC checkouts, sends AI outreach, and delivers work — zero human clicks.

---

## Full Description

### What It Does

Rainmaker Protocol is an autonomous AI agent that handles the entire B2B client acquisition pipeline without a single human click:

1. **Discovers** B2B companies matching your skill using Tavily AI Search (via Locus)
2. **Enriches** decision-maker contacts via Hunter.io (via Locus)
3. **Screens** every entity against the OFAC SDN list and EU consolidated sanctions lists — hard-blocked at ≥ 75/100 fuzzy-match confidence
4. **Creates** a unique Locus Checkout session per prospect (USDC payment URL)
5. **Writes** a personalised cold email via Claude AI, with the checkout link embedded
6. **Sends** the email from an autonomous AgentMail inbox (funded via x402)
7. **Polls** for payment — Locus webhook fires on confirmation, Redis pub/sub resolves the correct Vercel instance
8. **Delivers** the contracted work automatically to the client via AgentMail

Everything runs within a hard **$5.00 USDC budget cap**. The agent stops when the budget runs out — it never bleeds money.

---

### Why It Is Different

This is the only submission in the hackathon where **a human outside the hackathon can click a link today, pay real USDC through Locus Checkout, and receive real value back** — all without any human on the builder's side lifting a finger.

Other submissions prototype outreach or simple checkout flows. Rainmaker Protocol closes the complete loop: discovery → compliance → personalised outreach → autonomous payment collection → work delivery. Every step is wired to real infrastructure that fires real API calls.

---

### OFAC Compliance — Real Safety Infrastructure

Every entity processed by the agent is screened against:
- OFAC SDN (Specially Designated Nationals) list
- EU Consolidated Sanctions List
- OFAC Sectoral Sanctions Identifications (SSI) list

Fuzzy name matching at ≥ 75/100 confidence triggers a permanent `ofac_blocked` status. **No email is ever sent to a sanctioned entity.** This is not a demo stub — it is real compliance infrastructure the same class used in fintech production systems.

The live demo includes **Volkov Syndicate LLC**, blocked at 96/100 confidence under EO-13694 (cyber-related sanctions), so judges can see what an OFAC block looks like in real time.

---

### Locus Integration — 10 APIs, All Firing On-Chain

| # | Locus API Endpoint | Used For |
|---|---|---|
| 1 | `POST /wrapped/tavily/search` | Primary company discovery pass |
| 2 | `POST /wrapped/brave/web/search` | Second-pass discovery via independent index |
| 3 | `POST /wrapped/firecrawl/scrape` | Homepage scrape — tech stack enrichment |
| 4 | `POST /wrapped/hunter/domain-search` | Decision-maker contact enrichment |
| 5 | `POST /wrapped/ofac/search` | OFAC + EU sanctions screening |
| 6 | `POST /checkout/sessions` | Per-prospect USDC checkout session creation |
| 7 | `GET /checkout/sessions/:id` | Payment status polling |
| 8 | `POST /api/webhooks/locus` (inbound) | Real-time `CHECKOUT_PAID` webhook |
| 9 | HMAC `X-Locus-Signature` verification | Webhook authenticity — `crypto.timingSafeEqual` |
| 10 | `POST /api/x402/agentmail-create-inbox` | x402 agent email inbox (HTTP-native payment) |

**Proof:** During testing, we funded the agent wallet with $5.00 USDC and ran the full live pipeline. Locus recorded **10 on-chain transactions** — all Status: Completed, all agent-initiated, all on Base:

- 5× Tavily Search · $0.09 each
- 3× Hunter Domain Search · $0.013 each
- 1× Tavily Search (earlier test) · $0.09
- **1× AgentMail x402 inbox creation · $2.00 USDC — confirmed on-chain, April 14 2026**

The x402 payment is autonomous: the agent calls the AgentMail endpoint, the endpoint responds with a `402 Payment Required`, the agent pays $2.00 USDC directly from its Locus wallet, and the inbox is provisioned — no human approval at any point.

---

### Architecture Highlights

**The Vercel Race Condition Fix**

Serverless functions don't share memory. When Locus fires a `CHECKOUT_PAID` webhook, it can land on a different Vercel instance than the one holding the user's SSE stream. We solved this with **Upstash Redis pub/sub**:

- Webhook fires on Instance B → writes `rmp:payment:{runId}:{prospectId}` to Redis (TTL 2h)
- Instance A's polling loop atomically reads and deletes the key → triggers work delivery immediately
- No missed payments, no stale state, no race condition

```
Vercel Instance A (SSE stream open)          Vercel Instance B (webhook received)
─────────────────────────────────            ───────────────────────────────────
connectSSE() → EventSource open              POST /api/webhooks/locus
                                             ↓ HMAC verified
                                             ↓ redisGetSession(sessionId)
                                             ↓ redisPublishPayment(runId, prospectId)
polling loop                                   → Redis key written
↓ redisConsumePayment(runId, prospectId)
  → key found → atomic del → payment signal
↓ handlePaymentConfirmed()
↓ deliver work via AgentMail
↓ SSE: "work_delivered" → client toast
```

**Budget Controller**

```typescript
if (run.totalSpentUsdc + stepCost > BUDGET_CAP_USDC) {
  await completeRun(run.id, "budget_exhausted");
  break;
}
```

Every Locus API call inspects the running total before firing. The agent runs ~12 companies within $5.00. If it can't find a qualifying lead within budget, it stops cleanly — it never bleeds money or silently over-spends.

---

### Zero-Friction Demo Mode

The dashboard includes a **▶ REPLAY DEMO RUN** button — available in both the Launch Panel and the empty Prospect Grid — that streams a pre-canned run through the same SSE pipeline the real agent uses. No API keys, no USDC, no setup required.

The demo run includes:
- **Volkov Syndicate LLC** — OFAC blocked (SDN, EO-13694, score 96)
- **Meridian SaaS Co.** — $50 USDC paid by Priya Ramesh (CTO), work delivered, real-looking tx hash
- **InfraStack Labs** — awaiting payment, checkout link active
- **NovaPay Fintech** + **Cortex Analytics** — outreach sent

This gives judges a complete, zero-friction view of what a live run looks like — including the OFAC block, the payment event, and the delivery confirmation — in about 30 seconds.

---

### Tech Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **Payment:** Locus Checkout SDK, x402 HTTP-native payment, USDC on Base
- **AI:** Claude 3.5 Sonnet (Anthropic) — email generation
- **Data:** Tavily AI Search, Brave Web Search, Firecrawl, Hunter.io — all via Locus Wrapped APIs
- **Compliance:** OFAC SDN screen — via Locus Wrapped API
- **Email:** AgentMail (autonomous inbox, reply routing)
- **Streaming:** Server-Sent Events (SSE) — real-time dashboard updates
- **State sync:** Upstash Redis — cross-instance webhook/SSE coordination
- **Deployment:** Vercel (serverless)

---

### Live Links

- **Dashboard:** https://rainmaker-protocol.vercel.app/dashboard
- **Demo replay:** Click "▶ REPLAY DEMO RUN" on the dashboard — no login required
- **YouTube demo:** https://youtube.com/shorts/-2F4Q7gZOaQ?feature=share
- **GitHub:** https://github.com/Gideon145/rainmaker-protocol

---

### What "Locus Integration" Looks Like in Practice

Removing Locus from Rainmaker Protocol removes the ability to:
- Search for companies (Tavily)
- Enrich contacts (Hunter)
- Screen for sanctions (OFAC)
- Create payment links (Checkout)
- Collect USDC on-chain (Checkout sessions)
- Receive instant payment confirmation (Webhooks)
- Pay for the agent's own email inbox (x402)

Without Locus, the pipeline has no payment rail, no compliance layer, and no data enrichment. Locus is not a bolt-on — it is the entire infrastructure layer that makes autonomous, end-to-end, paid client acquisition possible.
