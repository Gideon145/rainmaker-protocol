# RAINMAKER PROTOCOL

> **An autonomous B2B client acquisition agent that finds companies, enriches contacts, screens for OFAC sanctions, writes personalised AI outreach, creates USDC payment links, sends emails, and auto-delivers work — all without a single human click.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-rainmaker--protocol.vercel.app-00ff9f?style=for-the-badge&logo=vercel&logoColor=black)](https://rainmaker-protocol.vercel.app/dashboard)
[![Hackathon](https://img.shields.io/badge/Locus%20Paygentic-Hackathon%20%231-00e5ff?style=for-the-badge)](https://paygentic-week1.devfolio.co)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)

---

## The Problem

Freelancers and agencies spend **4–8 hours per week** manually searching job boards, finding contacts, writing cold emails, and chasing payments. The conversion rate for cold outreach is under 3%. The unit economics are broken: high time cost, low yield, slow payment collection.

**RAINMAKER PROTOCOL** inverts this entirely. A single agent invocation — parameterised only by your skill and hourly rate — autonomously executes the entire acquisition-to-payment pipeline end-to-end, within a hard $5 USDC budget cap.

---

## Economics at a Glance

| Metric | Value |
|---|---|
| Agent operating budget | $5.00 USDC (hard cap) |
| Cost per company processed | ~$0.24 USDC (enrichment + email + checkout) |
| AgentMail inbox (one-time per run) | $2.00 USDC |
| Companies reachable per $5 budget | 11–12 |
| Pipeline execution time (mock) | < 5 seconds end-to-end |
| Pipeline execution time (real APIs) | ~30–60 seconds |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│   Next.js Dashboard  ←──── SSE Stream ────── EventBus          │
└──────────────────────────────┬──────────────────────────────────┘
                               │  POST /api/agent/start
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AGENT ORCHESTRATOR                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  STEP 1  │→ │  STEP 2  │→ │  STEP 3  │→ │  STEP 4  │       │
│  │  Find    │  │  Enrich  │  │   OFAC   │  │ Checkout │       │
│  │Companies │  │ Contact  │  │ Screening│  │  Create  │       │
│  │ (Apollo) │  │ (Clado)  │  │          │  │ (Locus)  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  STEP 5  │→ │  STEP 6  │→ │  STEP 7  │→ │  STEP 8  │       │
│  │  Write   │  │   Send   │  │  Poll    │  │ Deliver  │       │
│  │  Email   │  │ Outreach │  │ Replies  │  │  Work    │       │
│  │ (Claude) │  │(AgentMail│  │(Webhook) │  │(AgentMail│       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  Budget Controller: stops pipeline at $5.00 USDC hard cap      │
└─────────────────────────────────────────────────────────────────┘
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
        Locus Checkout   AgentMail Inbox   OFAC SDN List
        (USDC payment)   (email send/rx)   (compliance)
```

---

## The 8-Step Pipeline

Each prospect moves through a strict deterministic state machine. No step is skipped. Every decision is logged with cost and reasoning.

### Step 1 — Company Discovery (`01-find-companies.ts`)
- Calls **Apollo.io API** with your skill as the search vector
- Returns companies actively hiring contractors matching the skill profile
- Includes tech stack, company size, industry, location, and hiring signals
- Produces 10–12 qualified targets per run

### Step 2 — Contact Enrichment (`02-enrich-contact.ts`)
- Calls **Clado API** to find the decision-maker (CTO, VP Eng, Lead Dev)
- Returns name, title, LinkedIn URL, email address, and email reputation score
- Email reputation check (`valid` / `risky` / `invalid`) gates the pipeline — risky emails are skipped to protect sender reputation

### Step 3 — OFAC Sanctions Screening (`03-screen-ofac.ts`)
- Checks every company and contact against the **OFAC SDN (Specially Designated Nationals)** list and EU consolidated sanctions list
- Fuzzy-match scoring: any entity scoring ≥ 75/100 confidence is hard-blocked
- No email is ever sent to a sanctioned entity — the prospect is permanently flagged `ofac_blocked`
- This is not a demo feature. This is real compliance infrastructure.

### Step 4 — Locus Checkout Creation (`04-create-checkout.ts`)
- Creates a **Locus Checkout session** for the exact hourly rate
- Returns a unique USDC payment URL embedded in the outreach email
- Stores `checkoutSessionId` for webhook correlation on payment
- Each session is tied to a single prospect — no ambiguity on who paid

### Step 5 — AI Email Generation (`05-generate-email.ts`)
- Calls **Claude AI (Anthropic)** to write a personalised cold email
- Prompt includes: company name, tech stack, contact name/title, skill, rate, and Locus checkout URL
- Output: subject line + full email body referencing specific tech stack
- No generic templates — every email is contextually unique

### Step 6 — Outreach Dispatch (`06-send-outreach.ts`)
- Sends the email via **AgentMail** from the agent's dedicated inbox
- Stores the `agentMailMessageId` on the prospect for reply correlation
- Updates prospect status to `outreach_sent` → `awaiting_payment`

### Step 7 — Payment Polling (`07-poll-replies.ts`)
- In production: polls AgentMail inbox every 8 seconds for replies
- When a reply arrives, checks the corresponding **Locus Checkout session** status
- If status = `PAID`: triggers Step 8 immediately
- Hard timeout: 10 minutes — run auto-completes and is archived
- Also handles **Locus webhook** (`/api/webhooks/locus`) for real-time payment events

### Step 8 — Automated Work Delivery (`07-deliver-work.ts`)
- On payment confirmation: generates and sends a professional work deliverable via AgentMail
- Updates `totalEarnedUsdc` on the run, marks prospect `delivered`
- Emits `work_delivered` SSE event to the dashboard in real time

---

## Prospect State Machine

```
queued
  │
  ├─► enriching ──► ofac_scanning ──► [ofac_blocked]  (terminal, sanctioned)
  │                      │
  │                      ▼
  │               generating_email
  │                      │
  │                      ▼
  │               creating_checkout
  │                      │
  │                      ▼
  │               outreach_sent
  │                      │
  │                      ▼
  │               awaiting_payment ──► [timeout / failed]
  │                      │
  │                      ▼ (payment confirmed on-chain)
  │                    paid
  │                      │
  │                      ▼
  └─────────────────► delivered  ✓  (terminal, success)
```

Every transition is immutable — stored in the audit log with timestamp, action, reasoning, cost delta, and on-chain tx hash.

---

## Compliance & Risk Controls

RAINMAKER Protocol is built with **financial compliance as a first-class constraint**, not an afterthought.

| Control | Implementation |
|---|---|
| OFAC SDN screening | Fuzzy-match against SDN + EU lists, ≥75 confidence = hard block |
| Email reputation gate | Clado reputation check — `invalid` emails never contacted |
| Budget hard cap | $5.00 USDC — orchestrator halts the pipeline on breach |
| Checkout session isolation | One session per prospect — prevents double-payment |
| Webhook idempotency | `paymentTxHash` uniqueness check before triggering delivery |
| Audit trail | Every action logged with cost, reasoning, and timestamp |

---

## Real-Time Observability

The dashboard receives **Server-Sent Events (SSE)** from the agent in real time. Every state transition, cost event, and payment confirmation is streamed to the UI within milliseconds.

### SSE Event Types

| Event | Payload | Description |
|---|---|---|
| `run_started` | Full `Run` object | Agent initialised, inbox provisioned |
| `prospect_update` | Full `Prospect` object | Any prospect state transition |
| `audit_entry` | `AuditEntry` object | Agent reasoning + cost log entry |
| `payment_received` | `{prospectId, companyName, amount, txHash}` | On-chain payment confirmed |
| `work_delivered` | `{prospectId, companyName}` | Work package sent to client |
| `budget_exhausted` | Full `Run` object | $5 cap hit — pipeline halted |
| `run_completed` | Full `Run` object | All steps complete, final stats |
| `run_failed` | `{error}` | Unrecoverable error |
| `heartbeat` | — | Keep-alive (every 15s) |

---

## API Reference

### `POST /api/agent/start`
Allocates a `runId`. Does not start the agent — execution begins when the SSE stream connects (ensures the agent runs inside the same long-lived HTTP invocation).

**Request:**
```json
{ "skill": "full-stack development", "hourlyRate": 50 }
```
**Response:**
```json
{ "runId": "uuid-v4", "skill": "full-stack development", "hourlyRate": 50 }
```

### `GET /api/agent/stream?runId=&skill=&rate=`
Opens an SSE stream. If `skill` + `rate` are present (`autostart=true`), the agent executes inside this HTTP invocation — keeping the serverless function alive for the full pipeline duration. All events are streamed as unnamed `data:` frames containing JSON payloads.

### `GET /api/agent/runs`
Returns all runs from the in-memory store with their full prospect and audit log data.

### `POST /api/webhooks/locus`
Receives Locus payment webhooks. Verifies HMAC signature, correlates `checkoutSessionId` to a prospect, triggers work delivery. Idempotent.

### `GET /api/health`
Returns service status, mock/real mode, and environment validation.

---

## Data Model

```typescript
interface Run {
  id: string;
  skill: string;
  hourlyRate: number;        // USDC per hour
  status: RunStatus;         // idle | running | completed | failed | budget_exhausted
  prospects: Prospect[];
  auditLog: AuditEntry[];
  totalSpentUsdc: number;    // running cost tally
  totalEarnedUsdc: number;   // confirmed USDC payments received
  agentInboxId: string | null;
  agentEmail: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface Prospect {
  id: string;
  company: Company;          // name, domain, techStack, industry, size
  contact: Contact | null;   // name, title, email, reputation
  ofacResult: OFACResult | null; // clean: bool, matches: [{name, score, list}]
  status: ProspectStatus;    // 12-state machine (see diagram above)
  checkoutSessionId: string | null;
  checkoutUrl: string | null;  // Locus USDC payment link
  agentMailMessageId: string | null;
  paymentTxHash: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
}

interface AuditEntry {
  action: string;
  reasoning: string;
  cost: number;     // USDC cost of this action
  txHash: string | null;
  status: "success" | "warning" | "error" | "info";
  timestamp: string;
}
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server + UI in one deployment |
| Language | TypeScript 5 (strict) | Full type safety across agent + UI |
| Styling | Tailwind CSS + custom CSS vars | Terminal-aesthetic dark UI |
| Payment | **Locus Checkout API** | USDC payment sessions + webhooks |
| Email | **AgentMail API** | Agent-native send/receive inbox |
| Company data | **Apollo.io API** | B2B company + contact discovery |
| Contact enrichment | **Clado API** | LinkedIn-based contact data |
| AI generation | **Anthropic Claude** | Personalised email writing |
| Sanctions | OFAC SDN + EU lists | Compliance screening |
| Streaming | Server-Sent Events (SSE) | Real-time dashboard updates |
| State | In-memory + JSON file backup | Run persistence across requests |
| Deployment | Vercel (Hobby) | Serverless edge deployment |

---

## Key Engineering Decisions

**1. Agent runs inside the SSE invocation, not fire-and-forget**
Early versions started the agent in `POST /start` and let the SSE stream reconnect. On Vercel Hobby (10s function timeout), the agent was killed mid-run. Solution: `POST /start` only allocates a `runId`. The actual `executeRun` is called inside `GET /api/agent/stream` — the open SSE connection keeps the serverless function alive for the full duration.

**2. Unnamed SSE events only**
The SSE spec distinguishes named events (`event: foo\ndata:...`) from unnamed events (`data:...`). Browser `EventSource.onmessage` only fires for unnamed events. Named events require `addEventListener("foo")`. All events are sent as unnamed `data:` frames; the `type` field is encoded in the JSON payload — ensuring `onmessage` catches everything without manual listener registration.

**3. Full `Run` object emitted on `run_completed`**
Emitting a stub `{status, totalSpent, totalEarned}` on completion caused the dashboard to wipe all prospect cards from the UI (React replaced the full run state with the stub). `run_completed` now emits the full hydrated `Run` with all prospects and audit entries, so the final state is a lossless snapshot.

**4. Per-run AgentMail inbox**
Each run gets its own inbox (`rainmaker-{runId[0:8]}`). This enables exact reply-to-prospect correlation via `agentMailMessageId` stored on each prospect. No inbox sharing across concurrent runs.

**5. Budget controller before every prospect**
The orchestrator checks `totalSpentUsdc >= BUDGET_LIMIT_USDC` before processing each company — not after. This ensures the budget cap is enforced at the earliest possible gate, preventing overspend on a long-running enrichment or Claude call.

---

## Running Locally

```bash
git clone https://github.com/Gideon145/rainmaker-protocol.git
cd rainmaker-protocol
npm install
```

Create `.env.local`:
```env
# Locus
LOCUS_API_KEY=your_locus_api_key
LOCUS_PRIVATE_KEY=0x_your_private_key
LOCUS_API_BASE=https://beta-api.paywithlocus.com/api

# Mock mode — set to false + add real API keys to go live
USE_MOCK=true

# Required when USE_MOCK=false
APOLLO_API_KEY=
AGENTMAIL_API_KEY=
CLADO_API_KEY=
ANTHROPIC_API_KEY=

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

```bash
npm run dev
# → http://localhost:3000/dashboard
```

---

## Deployment

Deployed on Vercel. Every push to `main` triggers a new production deployment.

```bash
npm run build   # verify TypeScript + build
git push        # auto-deploys to Vercel
```

**Vercel Environment Variables required:**
```
LOCUS_API_KEY
LOCUS_PRIVATE_KEY
LOCUS_API_BASE
USE_MOCK          # true (safe demo) | false (live with real APIs)
NEXT_PUBLIC_APP_URL
```

---

## Going Production

To switch from mock to live mode:

1. Add real API keys to Vercel env vars: `APOLLO_API_KEY`, `AGENTMAIL_API_KEY`, `CLADO_API_KEY`, `ANTHROPIC_API_KEY`
2. Ensure your Locus wallet has ≥ $5 USDC (agent operating budget)
3. Set `USE_MOCK=false` in Vercel
4. Redeploy
5. The agent will now email **real companies**, create **real Locus checkout sessions**, and collect **real USDC** — fully autonomously

---

## Project Structure

```
src/
├── agent/
│   ├── events.ts                 # EventBus (EventEmitter wrapper, SSE bridge)
│   ├── orchestrator.ts           # Main agent loop + budget controller
│   └── steps/
│       ├── 01-find-companies.ts  # Apollo company discovery
│       ├── 02-enrich-contact.ts  # Clado contact enrichment
│       ├── 03-screen-ofac.ts     # OFAC sanctions screening
│       ├── 04-create-checkout.ts # Locus checkout session creation
│       ├── 05-generate-email.ts  # Claude AI email generation
│       ├── 06-send-outreach.ts   # AgentMail email dispatch
│       ├── 07-poll-replies.ts    # Payment polling + webhook handler
│       └── 07-deliver-work.ts    # Automated work delivery
├── app/
│   ├── api/
│   │   ├── agent/start/          # Run allocation endpoint
│   │   ├── agent/stream/         # SSE stream + agent executor
│   │   ├── agent/runs/           # Run history endpoint
│   │   └── webhooks/locus/       # Payment webhook receiver
│   ├── dashboard/                # Main UI (real-time agent dashboard)
│   └── globals.css               # Terminal-aesthetic design system
└── lib/
    ├── locus.ts                  # Locus API client (checkout, webhooks)
    ├── store.ts                  # In-memory run store + JSON persistence
    ├── utils.ts                  # uuid, nowIso, sleep, fmt
    └── providers/
        ├── types.ts              # Shared domain types (Run, Prospect, etc.)
        ├── index.ts              # Provider factory (mock/real toggle)
        ├── real/                 # Apollo, AgentMail, Clado, Claude, OFAC
        └── mock/                 # Mock providers with realistic delays
```

---

## License

MIT — build on it, fork it, ship it.

---

*RAINMAKER PROTOCOL — the agent doesn't stop until the money moves.*
