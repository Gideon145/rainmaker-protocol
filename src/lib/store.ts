import fs from "fs";
import path from "path";
import type { Run, Prospect, AuditEntry } from "./providers/types";

// ─── In-memory store with JSON file backup ────────────────────────────────

const STATE_FILE = path.join(process.cwd(), "data", "state.json");

interface StoreState {
  runs: Record<string, Run>;
  webhookSecrets: Record<string, string>; // sessionId -> webhookSecret
}

let state: StoreState = { runs: {}, webhookSecrets: {} };

// Load persisted state on startup
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf-8");
      state = JSON.parse(raw);
    }
  } catch { /* start fresh if corrupt */ }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch { /* best-effort persistence */ }
}

// Init on module load
loadState();

// ─── Run CRUD ─────────────────────────────────────────────────────────────

export function createRun(params: {
  id: string;
  skill: string;
  hourlyRate: number;
}): Run {
  const run: Run = {
    id: params.id,
    skill: params.skill,
    hourlyRate: params.hourlyRate,
    status: "running",
    prospects: [],
    auditLog: [],
    totalSpentUsdc: 0,
    totalEarnedUsdc: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    errorMessage: null,
    agentInboxId: null,
    agentEmail: null,
  };
  state.runs[params.id] = run;
  saveState();
  return run;
}

export function getRun(runId: string): Run | null {
  return state.runs[runId] ?? null;
}

export function getAllRuns(): Run[] {
  return Object.values(state.runs).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export function updateRun(runId: string, patch: Partial<Run>): Run | null {
  const run = state.runs[runId];
  if (!run) return null;
  Object.assign(run, patch);
  saveState();
  return run;
}

export function finishRun(runId: string, status: Run["status"], error?: string) {
  const run = state.runs[runId];
  if (!run) return;
  run.status = status;
  run.completedAt = new Date().toISOString();
  if (error) run.errorMessage = error;
  saveState();
}

// ─── Prospect CRUD ────────────────────────────────────────────────────────

export function upsertProspect(runId: string, prospect: Prospect): void {
  const run = state.runs[runId];
  if (!run) return;
  const idx = run.prospects.findIndex((p) => p.id === prospect.id);
  if (idx === -1) run.prospects.push(prospect);
  else run.prospects[idx] = prospect;
  saveState();
}

export function getProspect(runId: string, prospectId: string): Prospect | null {
  return state.runs[runId]?.prospects.find((p) => p.id === prospectId) ?? null;
}

export function getProspectBySession(
  runId: string,
  sessionId: string,
): Prospect | null {
  return (
    state.runs[runId]?.prospects.find(
      (p) => p.checkoutSessionId === sessionId,
    ) ?? null
  );
}

// ─── Audit log ────────────────────────────────────────────────────────────

export function addAuditEntry(runId: string, entry: AuditEntry): void {
  const run = state.runs[runId];
  if (!run) return;
  run.auditLog.push(entry);
  if (entry.cost > 0) run.totalSpentUsdc = +(run.totalSpentUsdc + entry.cost).toFixed(6);
  saveState();
}

// ─── Webhook secrets ──────────────────────────────────────────────────────

export function storeWebhookSecret(sessionId: string, secret: string): void {
  state.webhookSecrets[sessionId] = secret;
  saveState();
}

export function getWebhookSecret(sessionId: string): string | null {
  return state.webhookSecrets[sessionId] ?? null;
}
