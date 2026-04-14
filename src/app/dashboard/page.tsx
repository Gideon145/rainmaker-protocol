"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  Run,
  Prospect,
  AuditEntry,
  AgentEventType,
  WalletBalance,
} from "@/lib/providers/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SSEEvent {
  type: AgentEventType;
  runId: string;
  payload: unknown;
  timestamp: string;
}

interface RunsResponse {
  runs: Run[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<
  string,
  { label: string; badge: string; glyph: string }
> = {
  queued:           { label: "QUEUED",          badge: "badge-dim",     glyph: "○" },
  enriching:        { label: "ENRICHING",        badge: "badge-cyan",    glyph: "◎" },
  ofac_scanning:    { label: "OFAC SCAN",        badge: "badge-amber",   glyph: "⚠" },
  ofac_blocked:     { label: "OFAC BLOCKED",     badge: "badge-red",     glyph: "✕" },
  generating_email: { label: "COMPOSING",        badge: "badge-cyan",    glyph: "✎" },
  creating_checkout:{ label: "CHECKOUT",         badge: "badge-purple",  glyph: "⬡" },
  outreach_sent:    { label: "SENT",             badge: "badge-cyan",    glyph: "➤" },
  awaiting_payment: { label: "AWAITING $",       badge: "badge-amber",   glyph: "◷" },
  paid:             { label: "PAID ✓",           badge: "badge-green",   glyph: "●" },
  delivered:        { label: "DELIVERED",        badge: "badge-green",   glyph: "★" },
  failed:           { label: "FAILED",           badge: "badge-red",     glyph: "✕" },
  policy_rejected:  { label: "POLICY REJECT",    badge: "badge-red",     glyph: "⛔" },
};

const RUN_STATUS_META: Record<string, { label: string; color: string }> = {
  idle:             { label: "IDLE",             color: "text-dim" },
  running:          { label: "RUNNING",          color: "text-neon" },
  completed:        { label: "COMPLETED",        color: "text-green-400" },
  failed:           { label: "FAILED",           color: "text-red-400" },
  budget_exhausted: { label: "BUDGET LIMIT",     color: "text-amber-400" },
};

const AUDIT_STATUS_COLOR: Record<string, string> = {
  success: "text-green-400",
  warning: "text-amber-400",
  error:   "text-red-400",
  info:    "text-cyan-400",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

function calcRoi(spent: number, earned: number) {
  if (spent === 0) return earned > 0 ? "∞" : "—";
  return `${(earned / spent).toFixed(1)}×`;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function shortTx(hash: string | null) {
  if (!hash) return null;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GlitchTitle() {
  return (
    <div className="text-center mb-1">
      <h1
        className="text-neon glitch text-4xl sm:text-5xl font-black tracking-widest uppercase"
        data-text="RAINMAKER PROTOCOL"
      >
        RAINMAKER PROTOCOL
      </h1>
      <p className="text-dim text-xs tracking-[0.3em] mt-1 uppercase">
        Autonomous B2B Client Acquisition · Powered by{" "}
        <span className="text-neon">Locus</span>
      </p>
    </div>
  );
}

function BalanceBar({ balance }: { balance: WalletBalance | null }) {
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="text-dim">WALLET</span>
      <span className="text-neon font-bold">
        {balance ? `${parseFloat(balance.balance).toFixed(4)} USDC` : "—"}
      </span>
      {balance && (
        <span className="text-dim">{balance.address.slice(0, 8)}…</span>
      )}
    </div>
  );
}

function LaunchForm({
  onStart,
  loading,
  disabled,
}: {
  onStart: (skill: string, hourlyRate: number) => void;
  loading: boolean;
  disabled: boolean;
}) {
  const [skill, setSkill] = useState("full-stack development");
  const [rate, setRate] = useState("50");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = parseFloat(rate);
    if (!skill.trim() || isNaN(r) || r <= 0) return;
    onStart(skill.trim(), r);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="glow-card p-5 flex flex-col gap-4"
    >
      <div className="text-neon text-xs font-mono tracking-widest uppercase mb-1">
        ▸ INITIATE ACQUISITION PROTOCOL
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-dim text-xs font-mono uppercase tracking-wider">
            Skill / Service Offering
          </label>
          <input
            className="input-neon"
            placeholder="full-stack development"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            disabled={loading || disabled}
          />
        </div>
        <div className="w-full sm:w-36 flex flex-col gap-1">
          <label className="text-dim text-xs font-mono uppercase tracking-wider">
            Rate (USDC/hr)
          </label>
          <input
            className="input-neon"
            type="number"
            min="1"
            step="1"
            placeholder="50"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={loading || disabled}
          />
        </div>
      </div>

      <button
        type="submit"
        className="btn-neon w-full"
        disabled={loading || disabled}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="pulse-dot" />
            INITIALIZING…
          </span>
        ) : (
          "⚡ LAUNCH RAINMAKER"
        )}
      </button>

      {disabled && !loading && (
        <p className="text-dim text-xs text-center font-mono">
          Run in progress. Wait for completion to start another.
        </p>
      )}
    </form>
  );
}

function RoiCounter({
  spent,
  earned,
  status,
}: {
  spent: number;
  earned: number;
  status: string;
}) {
  return (
    <div className="glow-card p-4 grid grid-cols-3 gap-3 text-center">
      <div>
        <div className="text-dim text-xs font-mono uppercase tracking-wider mb-1">
          Spent
        </div>
        <div className="text-red-400 text-xl font-black font-mono">
          {fmt(spent)}
        </div>
      </div>
      <div>
        <div className="text-dim text-xs font-mono uppercase tracking-wider mb-1">
          Earned
        </div>
        <div className="text-green-400 text-xl font-black font-mono">
          {fmt(earned)}
        </div>
      </div>
      <div>
        <div className="text-dim text-xs font-mono uppercase tracking-wider mb-1">
          ROI
        </div>
        <div
          className={`text-xl font-black font-mono ${
            earned > spent && spent > 0 ? "roi-glow text-neon" : "text-dim"
          }`}
        >
          {calcRoi(spent, earned)}
        </div>
      </div>
      <div className="col-span-3 border-t border-white/5 pt-2 mt-1">
        <span className="text-dim text-xs font-mono">STATUS: </span>
        <span
          className={`text-xs font-bold font-mono ${
            RUN_STATUS_META[status]?.color ?? "text-dim"
          }`}
        >
          {RUN_STATUS_META[status]?.label ?? status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function ProspectCard({ p }: { p: Prospect }) {
  const meta = STATUS_META[p.status] ?? {
    label: p.status.toUpperCase(),
    badge: "badge-dim",
    glyph: "?",
  };
  const isBlocked = p.status === "ofac_blocked" || p.status === "policy_rejected";
  const isPaid = p.status === "paid" || p.status === "delivered";

  return (
    <div
      className={`glow-card p-4 flex flex-col gap-2 relative overflow-hidden transition-all duration-300 ${
        isBlocked ? "border-red-500/40 shadow-red-900/20" : ""
      } ${isPaid ? "border-green-500/40 shadow-green-900/20" : ""}`}
    >
      {/* Status glyph watermark */}
      <div
        className="absolute top-2 right-3 text-5xl opacity-5 font-black pointer-events-none select-none"
        aria-hidden
      >
        {meta.glyph}
      </div>

      {/* Company name */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div
            className={`font-bold font-mono text-sm truncate ${
              isBlocked ? "text-red-400" : "text-white/90"
            }`}
          >
            {p.company.name}
          </div>
          <div className="text-dim text-xs font-mono truncate">
            {p.company.domain}
          </div>
        </div>
        <span className={`badge ${meta.badge} shrink-0`}>{meta.label}</span>
      </div>

      {/* Industry + size */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-cyan-400/60 text-xs font-mono">{p.company.industry}</span>
        <span className="text-dim text-xs font-mono">·</span>
        <span className="text-dim text-xs font-mono">{p.company.size}</span>
        <span className="text-dim text-xs font-mono">·</span>
        <span className="text-dim text-xs font-mono">{p.company.location}</span>
      </div>

      {/* Contact */}
      {p.contact && (
        <div className="text-xs font-mono text-white/60">
          👤 {p.contact.firstName} {p.contact.lastName}
          <span className="text-dim"> · {p.contact.title}</span>
        </div>
      )}

      {/* OFAC block details */}
      {isBlocked && p.ofacResult && p.ofacResult.matches.length > 0 && (
        <div className="bg-red-950/40 border border-red-500/30 rounded p-2 text-xs font-mono text-red-300">
          ⛔ OFAC MATCH — {p.ofacResult.matches[0].list} (score:{" "}
          {p.ofacResult.matches[0].score})
          <div className="text-red-400/70 mt-0.5">
            {p.ofacResult.matches[0].reason}
          </div>
        </div>
      )}

      {/* Payment */}
      {p.paymentTxHash && (
        <div className="text-xs font-mono text-green-400">
          💳 TX: {shortTx(p.paymentTxHash)}
          {p.paidAt && (
            <span className="text-dim ml-2">{timeAgo(p.paidAt)}</span>
          )}
        </div>
      )}

      {/* Checkout link */}
      {p.checkoutUrl &&
        p.status === "awaiting_payment" && (
          <a
            href={p.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neon text-xs font-mono underline underline-offset-2 hover:text-white transition-colors"
          >
            ⬡ Open Checkout →
          </a>
        )}

      {/* Delivered */}
      {p.status === "delivered" && p.deliveredAt && (
        <div className="text-green-400 text-xs font-mono">
          ★ Work delivered · {timeAgo(p.deliveredAt)}
        </div>
      )}

      {/* Error */}
      {p.errorMessage && (
        <div className="text-red-400 text-xs font-mono truncate">
          ✕ {p.errorMessage}
        </div>
      )}
    </div>
  );
}

function AuditLog({ entries }: { entries: AuditEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div className="glow-card p-4 flex flex-col gap-2 h-80 overflow-y-auto">
      <div className="text-neon text-xs font-mono tracking-widest uppercase mb-2 sticky top-0 bg-black/80 pb-1">
        ▸ AUDIT LOG
      </div>
      {entries.length === 0 && (
        <div className="text-dim text-xs font-mono text-center py-8">
          Awaiting protocol initiation…
          <span className="blink-cursor" />
        </div>
      )}
      {entries.map((e) => (
        <div
          key={e.id}
          className="slide-in border-l-2 border-white/10 pl-3 py-1 text-xs font-mono"
        >
          <div className="flex items-center gap-2">
            <span className="text-dim shrink-0">
              {new Date(e.timestamp).toLocaleTimeString()}
            </span>
            <span
              className={`font-bold ${
                AUDIT_STATUS_COLOR[e.status] ?? "text-white"
              }`}
            >
              {e.action}
            </span>
            {e.cost > 0 && (
              <span className="text-amber-400 ml-auto shrink-0">
                -{fmt(e.cost)}
              </span>
            )}
          </div>
          <div className="text-white/50 mt-0.5 leading-relaxed">
            {e.reasoning}
          </div>
          {e.txHash && (
            <div className="text-green-400/70 mt-0.5">
              tx: {shortTx(e.txHash)}
            </div>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function ToastNotification({
  msg,
  onClose,
}: {
  msg: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed bottom-6 right-6 z-50 glow-card px-5 py-3 text-sm font-mono text-neon cursor-pointer animate-pulse max-w-xs"
    >
      {msg}
    </div>
  );
}

function RunHistory({
  runs,
  currentRunId,
  onSelect,
}: {
  runs: Run[];
  currentRunId: string | null;
  onSelect: (id: string) => void;
}) {
  if (runs.length === 0) return null;
  return (
    <div className="glow-card p-4">
      <div className="text-neon text-xs font-mono tracking-widest uppercase mb-3">
        ▸ RUN HISTORY
      </div>
      <div className="flex flex-col gap-2">
        {runs.slice(0, 5).map((r) => {
          const meta = RUN_STATUS_META[r.status] ?? {
            label: r.status,
            color: "text-dim",
          };
          return (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`text-left p-2 rounded border transition-colors text-xs font-mono ${
                r.id === currentRunId
                  ? "border-neon/50 bg-neon/5 text-neon"
                  : "border-white/5 hover:border-white/20 text-dim hover:text-white/70"
              }`}
            >
              <span className={`font-bold ${meta.color}`}>{meta.label}</span>
              <span className="ml-2 text-white/40">{r.skill}</span>
              <span className="ml-2">{timeAgo(r.startedAt)}</span>
              <span className="ml-auto float-right text-green-400/70">
                +{fmt(r.totalEarnedUsdc)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [run, setRun] = useState<Run | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [allRuns, setAllRuns] = useState<Run[]>([]);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [launching, setLaunching] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  const esRef = useRef<EventSource | null>(null);

  // ── Load run history on mount ──────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/agent/runs")
      .then((r) => r.json() as Promise<RunsResponse>)
      .then((d) => {
        setAllRuns(d.runs ?? []);
        // Auto-select last running run if any
        const active = d.runs?.find(
          (r) => r.status === "running"
        );
        if (active) {
          setRunId(active.id);
          setRun(active);
        }
      })
      .catch(() => {});
  }, []);

  // ── SSE connection ─────────────────────────────────────────────────────────
  const connectSSE = useCallback((id: string) => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setSseConnected(false);

    const es = new EventSource(`/api/agent/stream?runId=${id}`);
    esRef.current = es;

    es.onopen = () => setSseConnected(true);

    es.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data);

        if (event.type === "heartbeat") return;

        if (
          event.type === "run_started" ||
          event.type === "run_completed" ||
          event.type === "run_failed" ||
          event.type === "budget_exhausted"
        ) {
          setRun(event.payload as Run);
          setAllRuns((prev) => {
            const updated = event.payload as Run;
            const idx = prev.findIndex((r) => r.id === updated.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = updated;
              return copy;
            }
            return [updated, ...prev];
          });
        }

        if (event.type === "prospect_update") {
          const p = event.payload as Prospect;
          setRun((prev) =>
            prev
              ? {
                  ...prev,
                  prospects: prev.prospects.map((x) =>
                    x.id === p.id ? p : x
                  ).concat(
                    prev.prospects.find((x) => x.id === p.id) ? [] : [p]
                  ),
                }
              : prev
          );
        }

        if (event.type === "audit_entry") {
          const entry = event.payload as AuditEntry;
          setRun((prev) =>
            prev
              ? {
                  ...prev,
                  auditLog: [...prev.auditLog, entry],
                }
              : prev
          );
        }

        if (event.type === "balance_update") {
          setBalance(event.payload as WalletBalance);
        }

        if (event.type === "payment_received") {
          const p = event.payload as Prospect;
          setToast(`💳 Payment received from ${p.company?.name ?? "prospect"}!`);
        }

        if (event.type === "work_delivered") {
          const p = event.payload as Prospect;
          setToast(`★ Work delivered to ${p.company?.name ?? "client"}!`);
        }

        if (
          event.type === "run_completed" ||
          event.type === "run_failed" ||
          event.type === "budget_exhausted"
        ) {
          es.close();
          setSseConnected(false);
          setLaunching(false);
        }
      } catch {
        // malformed event, ignore
      }
    };

    es.onerror = () => {
      setSseConnected(false);
    };
  }, []);

  useEffect(() => {
    if (runId) connectSSE(runId);
    return () => {
      esRef.current?.close();
    };
  }, [runId, connectSSE]);

  // ── Launch handler ─────────────────────────────────────────────────────────
  async function handleStart(skill: string, hourlyRate: number) {
    setLaunching(true);
    try {
      const res = await fetch("/api/agent/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill, hourlyRate }),
      });
      const data = (await res.json()) as { runId: string };
      if (!data.runId) throw new Error("No runId returned");
      setRunId(data.runId);
      setRun({
        id: data.runId,
        skill,
        hourlyRate,
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
      });
      setAllRuns((prev) => [
        {
          id: data.runId,
          skill,
          hourlyRate,
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
        },
        ...prev,
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setToast(`✕ Failed to start: ${msg}`);
      setLaunching(false);
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const isRunning = run?.status === "running";
  const prospects = run?.prospects ?? [];
  const auditLog = run?.auditLog ?? [];
  const blockedCount = prospects.filter((p) => p.status === "ofac_blocked").length;
  const paidCount = prospects.filter(
    (p) => p.status === "paid" || p.status === "delivered"
  ).length;
  const deliveredCount = prospects.filter((p) => p.status === "delivered").length;

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col gap-6">
      {/* ── Header ── */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <GlitchTitle />
        <div className="flex flex-col items-end gap-1">
          <BalanceBar balance={balance} />
          <div className="flex items-center gap-2 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                sseConnected ? "bg-green-400 animate-pulse" : "bg-white/20"
              }`}
            />
            <span className="text-dim">
              {sseConnected ? "LIVE" : run ? "IDLE" : "STANDBY"}
            </span>
          </div>
        </div>
      </header>

      {/* ── Divider ── */}
      <div className="divider" />

      {/* ── Stats strip ── */}
      {run && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "TARGETS",  value: prospects.length, color: "text-neon" },
            { label: "OFAC BLOCKED", value: blockedCount, color: "text-red-400" },
            { label: "PAYMENTS", value: paidCount, color: "text-green-400" },
            { label: "DELIVERED", value: deliveredCount, color: "text-cyan-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="glow-card p-3 text-center">
              <div className={`text-2xl font-black font-mono ${color}`}>
                {value}
              </div>
              <div className="text-dim text-xs font-mono uppercase tracking-wider mt-1">
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left column: controls + ROI + history ── */}
        <div className="flex flex-col gap-4">
          <LaunchForm
            onStart={handleStart}
            loading={launching}
            disabled={isRunning}
          />

          {run && (
            <RoiCounter
              spent={run.totalSpentUsdc}
              earned={run.totalEarnedUsdc}
              status={run.status}
            />
          )}

          {run?.agentEmail && (
            <div className="glow-card p-3 text-xs font-mono">
              <div className="text-dim uppercase tracking-wider mb-1">Agent Inbox</div>
              <div className="text-neon break-all">{run.agentEmail}</div>
            </div>
          )}

          <RunHistory
            runs={allRuns}
            currentRunId={runId}
            onSelect={(id) => {
              const found = allRuns.find((r) => r.id === id);
              if (found) {
                setRunId(id);
                setRun(found);
              }
            }}
          />
        </div>

        {/* ── Right columns: prospects grid + audit log ── */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          {/* Prospect grid */}
          <div>
            <div className="text-neon text-xs font-mono tracking-widest uppercase mb-3">
              ▸ PROSPECT GRID{" "}
              {prospects.length > 0 && (
                <span className="text-dim">({prospects.length} targets)</span>
              )}
            </div>
            {prospects.length === 0 ? (
              <div className="glow-card p-8 text-center text-dim text-sm font-mono">
                {isRunning ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="pulse-dot" />
                    Scanning for targets…
                  </span>
                ) : (
                  "Launch a protocol to begin target acquisition."
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {prospects.map((p) => (
                  <ProspectCard key={p.id} p={p} />
                ))}
              </div>
            )}
          </div>

          {/* Audit log */}
          <AuditLog entries={auditLog} />
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="text-center text-xs font-mono text-dim pt-4 border-t border-white/5">
        RAINMAKER PROTOCOL v1.0 · Locus Paygentic Hackathon #1 ·{" "}
        <span className="text-neon">USE_MOCK=true</span> — no real credits consumed
      </footer>

      {/* ── Toast ── */}
      {toast && (
        <ToastNotification msg={toast} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
