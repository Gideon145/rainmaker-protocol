"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  Run,
  Prospect,
  AuditEntry,
  AgentEventType,
  WalletBalance,
} from "@/lib/providers/types";

interface SSEEvent {
  type: AgentEventType;
  runId: string;
  payload: unknown;
  timestamp: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; badge: string; icon: string; step: number; desc: string }> = {
  queued:            { label: "QUEUED",        badge: "badge-dim",    icon: "○",  step: 0, desc: "Waiting in queue" },
  enriching:         { label: "ENRICHING",      badge: "badge-cyan",   icon: "◎",  step: 1, desc: "Fetching contact via Clado" },
  ofac_scanning:     { label: "OFAC SCAN",      badge: "badge-amber",  icon: "⚠",  step: 2, desc: "Running OFAC sanctions check" },
  ofac_blocked:      { label: "OFAC BLOCKED",   badge: "badge-red",    icon: "⛔", step: -1, desc: "Sanctioned entity — blocked" },
  generating_email:  { label: "COMPOSING",      badge: "badge-cyan",   icon: "✎",  step: 3, desc: "Claude writing outreach email" },
  creating_checkout: { label: "CHECKOUT",       badge: "badge-purple", icon: "◈",  step: 4, desc: "Creating Locus payment session" },
  outreach_sent:     { label: "SENT",           badge: "badge-blue",   icon: "➤",  step: 5, desc: "Email sent via AgentMail" },
  awaiting_payment:  { label: "AWAITING $",     badge: "badge-amber",  icon: "◷",  step: 6, desc: "Waiting for USDC payment" },
  paid:              { label: "PAID",           badge: "badge-green",  icon: "✓",  step: 7, desc: "Payment confirmed on-chain" },
  delivered:         { label: "DELIVERED",      badge: "badge-green",  icon: "★",  step: 8, desc: "Work package delivered" },
  failed:            { label: "FAILED",         badge: "badge-red",    icon: "✕",  step: -1, desc: "Step failed with error" },
  policy_rejected:   { label: "POLICY BLOCK",   badge: "badge-red",    icon: "⛔", step: -1, desc: "Locus policy rejected request" },
};

const PIPELINE_STEPS = [
  { id: "scan",     label: "SCAN",    desc: "Find companies via Apollo" },
  { id: "enrich",   label: "ENRICH",  desc: "Get contacts via Clado"    },
  { id: "ofac",     label: "OFAC",    desc: "Sanctions screening"       },
  { id: "compose",  label: "COMPOSE", desc: "AI writes outreach email"  },
  { id: "checkout", label: "CHKOUT",  desc: "Create Locus checkout"     },
  { id: "send",     label: "SEND",    desc: "Send via AgentMail"        },
  { id: "await",    label: "AWAIT $", desc: "Wait for USDC payment"     },
  { id: "deliver",  label: "DELIVER", desc: "Auto-deliver work"         },
];

const RUN_STATUS_META: Record<string, { label: string; badge: string }> = {
  idle:             { label: "STANDBY",      badge: "badge-dim"   },
  running:          { label: "RUNNING",      badge: "badge-cyan"  },
  completed:        { label: "COMPLETED",    badge: "badge-green" },
  failed:           { label: "FAILED",       badge: "badge-red"   },
  budget_exhausted: { label: "BUDGET LIMIT", badge: "badge-amber" },
};

const AUDIT_COLOR: Record<string, string> = {
  success: "text-green-400",
  warning: "text-amber",
  error:   "text-danger",
  info:    "text-cyan",
};

const HOW_IT_WORKS = [
  { icon: "◉", color: "text-cyan",       title: "1 · Find Companies",   body: "Apollo API scans for B2B companies matching your skill. Returns 10–20 live prospects with industry, size, tech stack." },
  { icon: "◎", color: "text-purple",     title: "2 · Enrich Contacts",  body: "Clado enriches each company with a real decision-maker — name, title, LinkedIn, and verified email address." },
  { icon: "⚠", color: "text-amber",      title: "3 · OFAC Screening",   body: "Every entity is screened against 25+ OFAC sanctions lists. Hits are hard-blocked. Clean entities proceed automatically." },
  { icon: "✎", color: "text-cyan",       title: "4 · AI Outreach",      body: "Claude writes a hyper-personalised cold email for each prospect using their company context, your skill, and a unique checkout link." },
  { icon: "◈", color: "text-neon",       title: "5 · Locus Checkout",   body: "A USDC payment session is created via the Locus Checkout SDK. Each prospect gets a unique, time-limited payment link." },
  { icon: "➤", color: "text-blue-400",   title: "6 · AgentMail Send",   body: "The outreach email (with embedded checkout link) is sent from an AI-controlled inbox via Locus AgentMail." },
  { icon: "◷", color: "text-amber",      title: "7 · Await Payment",    body: "The agent polls for replies and payment confirmation. Webhook fires when the Locus checkout session is marked PAID." },
  { icon: "★", color: "text-neon",       title: "8 · Auto-Deliver",     body: "On payment confirmation, Claude generates the work deliverable and AgentMail sends it to the client automatically." },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => `$${n.toFixed(2)}`;
const shortTx = (h: string | null) => h ? `${h.slice(0, 8)}…${h.slice(-6)}` : null;
const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

// ─── Hero Banner ─────────────────────────────────────────────────────────────

function HeroBanner() {
  return (
    <div className="glow-card p-6 sm:p-8" style={{ background: "linear-gradient(135deg, rgba(0,255,159,0.04) 0%, rgba(0,229,255,0.04) 50%, rgba(6,6,15,1) 100%)", borderColor: "rgba(0,255,159,0.15)" }}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-neon font-black tracking-[0.2em] glitch text-2xl sm:text-3xl" data-text="RAINMAKER PROTOCOL">
              RAINMAKER PROTOCOL
            </h1>
            <span className="badge badge-green">v1.0</span>
            <span className="badge badge-dim">Hackathon #1</span>
          </div>
          <p className="text-white/70 text-sm leading-relaxed max-w-2xl">
            An <span className="text-neon font-bold">autonomous B2B client acquisition agent</span> — it finds companies, enriches contacts, screens for OFAC sanctions, writes personalised AI outreach, creates USDC payment links via{" "}
            <span className="text-cyan font-bold">Locus Checkout</span>, sends emails via{" "}
            <span className="text-cyan font-bold">AgentMail</span>, and auto-delivers your work on payment. Zero human intervention.
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0 text-right">
          <div style={{ fontSize: "0.6rem" }} className="text-sub uppercase tracking-widest">Powered by</div>
          <div className="flex flex-wrap gap-1.5 justify-end">
            {["Locus Checkout","AgentMail","Apollo","Clado","OFAC","Claude AI"].map((t) => (
              <span key={t} className="badge badge-dim">{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="mt-5 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        {[
          { label: "Agent Steps", value: "8",         icon: "⚡", color: "text-neon"   },
          { label: "APIs Used",   value: "6",         icon: "◈",  color: "text-cyan"   },
          { label: "Budget Cap",  value: "$5 USDC",   icon: "⚠",  color: "text-amber"  },
          { label: "Mode",        value: "MOCK · SAFE",icon: "◉",  color: "text-green-400" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className={`${color} text-lg`}>{icon}</span>
            <div>
              <div className={`font-black text-sm ${color}`}>{value}</div>
              <div style={{ fontSize: "0.58rem" }} className="text-sub uppercase tracking-wider">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

function HowItWorksPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="glow-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
        style={{ background: "none", border: "none", cursor: "pointer" }}
      >
        <div className="panel-header" style={{ marginBottom: 0, borderBottom: "none" }}>
          How It Works
          <span className="badge badge-cyan" style={{ marginLeft: "0.5rem" }}>8 steps</span>
        </div>
        <span className="text-sub text-lg">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.title} className="glow-card p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-xl ${step.color}`}>{step.icon}</span>
                <span className={`font-bold text-xs ${step.color}`}>{step.title}</span>
              </div>
              <p className="text-sub leading-relaxed" style={{ fontSize: "0.68rem" }}>{step.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── How To Use ─────────────────────────────────────────────────────────────

function HowToUsePanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="glow-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
        style={{ background: "none", border: "none", cursor: "pointer" }}
      >
        <div className="panel-header" style={{ marginBottom: 0, borderBottom: "none" }}>
          How To Use This Dashboard
        </div>
        <span className="text-sub text-lg">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              n: "01", color: "text-cyan", title: "Configure & Launch",
              steps: [
                "Enter your skill (e.g. 'full-stack development')",
                "Set your hourly rate in USDC (e.g. 50)",
                "Click ⚡ LAUNCH RAINMAKER",
                "The agent fires instantly — no further input needed",
              ],
            },
            {
              n: "02", color: "text-neon", title: "Watch It Run",
              steps: [
                "LIVE dot (top-right) confirms SSE connection",
                "Stats strip updates in real-time",
                "Pipeline tracker shows which step is active",
                "Prospect cards animate as status changes",
                "Audit log records every agent decision + cost",
              ],
            },
            {
              n: "03", color: "text-amber", title: "Payment & Delivery",
              steps: [
                "OFAC-blocked prospects show red warning (Volkov Syndicate in demo)",
                "AWAITING $ cards show a live checkout link",
                "Open the link and pay with USDC to trigger delivery",
                "Agent auto-sends work package on payment confirmation",
                "Toast notification fires when payment + delivery succeed",
              ],
            },
          ].map(({ n, color, title, steps }) => (
            <div key={n} className="glow-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className={`font-black text-2xl ${color}`}>{n}</span>
                <span className={`font-bold text-xs ${color}`}>{title}</span>
              </div>
              <ol className="flex flex-col gap-1.5">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sub" style={{ fontSize: "0.68rem" }}>
                    <span className={`${color} shrink-0`}>›</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────

function TopBar({ balance, sseConnected, run }: {
  balance: WalletBalance | null;
  sseConnected: boolean;
  run: Run | null;
}) {
  const m = RUN_STATUS_META[run?.status ?? "idle"] ?? RUN_STATUS_META.idle;
  return (
    <div className="topbar px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-neon font-black tracking-[0.2em] text-sm sm:text-base" style={{ textShadow: "0 0 16px rgba(0,255,159,0.5)" }}>
          ⚡ RAINMAKER
        </span>
        <span className="hidden sm:inline text-sub border border-white/10 px-2 py-0.5 rounded" style={{ fontSize: "0.52rem", letterSpacing: "0.2em" }}>
          PROTOCOL v1.0
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`badge ${m.badge}`}>{m.label}</span>
        {run?.skill && <span className="hidden md:inline text-sub text-xs">{run.skill} · {fmt(run.hourlyRate)}/hr</span>}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {balance ? (
          <div className="hidden sm:flex flex-col items-end gap-0.5">
            <span className="text-neon text-xs font-bold">{parseFloat(balance.balance).toFixed(4)} USDC</span>
            <span className="text-sub" style={{ fontSize: "0.55rem" }}>{balance.address.slice(0, 10)}…</span>
          </div>
        ) : (
          <span className="text-sub text-xs hidden sm:inline">WALLET —</span>
        )}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full transition-all ${sseConnected ? "bg-green-400" : "bg-white/10"}`}
            style={sseConnected ? { animation: "pulse-dot 1.2s ease-in-out infinite", boxShadow: "0 0 6px #00ff9f" } : {}} />
          <span className="text-sub" style={{ fontSize: "0.58rem", letterSpacing: "0.2em" }}>
            {sseConnected ? "LIVE" : "IDLE"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Strip ─────────────────────────────────────────────────────────────

function StatsStrip({ run }: { run: Run }) {
  const ps        = run.prospects;
  const blocked   = ps.filter((p) => p.status === "ofac_blocked" || p.status === "policy_rejected").length;
  const paid      = ps.filter((p) => p.status === "paid" || p.status === "delivered").length;
  const delivered = ps.filter((p) => p.status === "delivered").length;
  const isProfit  = run.totalEarnedUsdc > run.totalSpentUsdc && run.totalSpentUsdc > 0;
  const roi       = run.totalSpentUsdc === 0 ? (run.totalEarnedUsdc > 0 ? "∞×" : "—") : `${(run.totalEarnedUsdc / run.totalSpentUsdc).toFixed(1)}×`;

  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
      {[
        { l: "Targets",    v: ps.length,               c: "text-neon",      t: "Companies found by Apollo" },
        { l: "OFAC Block", v: blocked,                 c: "text-danger",    t: "Sanctioned entities blocked" },
        { l: "Payments",   v: paid,                    c: "text-green-400", t: "USDC payments received" },
        { l: "Delivered",  v: delivered,               c: "text-cyan",      t: "Work packages sent" },
        { l: "Spent",      v: fmt(run.totalSpentUsdc), c: "text-red-400",   t: "API credits consumed" },
        { l: "Earned",     v: fmt(run.totalEarnedUsdc),c: "text-green-400", t: "USDC collected from clients" },
        { l: "ROI",        v: roi,                     c: isProfit ? "roi-glow text-neon" : "text-sub", t: "Return on investment" },
      ].map(({ l, v, c, t }) => (
        <div key={l} className="stat-card" title={t}>
          <div className={`stat-value ${c}`}>{v}</div>
          <div className="stat-label">{l}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Pipeline Tracker ────────────────────────────────────────────────────────

function PipelineTracker({ prospects }: { prospects: Prospect[] }) {
  const activeStep = PIPELINE_STEPS.findIndex((_, i) =>
    prospects.some((p) => { const m = STATUS_META[p.status]; return m && m.step === i; })
  );
  const maxDone = prospects.length > 0
    ? Math.max(...prospects.map((p) => STATUS_META[p.status]?.step ?? 0))
    : -1;

  return (
    <div className="glow-card p-4">
      <div className="panel-header">
        Agent Pipeline
        <span className="text-sub ml-1" style={{ fontSize: "0.58rem" }}>— each prospect moves through all 8 stages automatically</span>
      </div>
      <div className="flex items-center gap-0">
        {PIPELINE_STEPS.map((step, i) => {
          const isActive = i === activeStep && prospects.length > 0;
          const isDone   = i < activeStep && maxDone >= i;
          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0" title={step.desc}>
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div className={`step-dot ${isActive ? "active" : isDone ? "done" : ""}`} />
                <span className={`hidden sm:block font-bold ${isActive ? "text-cyan" : isDone ? "text-neon" : "text-dim"}`} style={{ fontSize: "0.48rem", letterSpacing: "0.15em" }}>
                  {step.label}
                </span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && <div className={`step-line ${isDone ? "done" : ""}`} />}
            </div>
          );
        })}
      </div>
      {prospects.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PIPELINE_STEPS.map((step, i) => {
            const c = prospects.filter((p) => STATUS_META[p.status]?.step === i).length;
            if (!c) return null;
            return <span key={step.id} className="badge badge-dim">{c} {step.label}</span>;
          })}
          {(() => {
            const c = prospects.filter((p) => STATUS_META[p.status]?.step === -1).length;
            return c > 0 ? <span className="badge badge-red">⛔ {c} BLOCKED</span> : null;
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Launch Form ─────────────────────────────────────────────────────────────

function LaunchForm({ onStart, loading, disabled, agentEmail }: {
  onStart: (skill: string, rate: number) => void;
  loading: boolean;
  disabled: boolean;
  agentEmail: string | null;
}) {
  const [skill, setSkill] = useState("full-stack development");
  const [rate, setRate]   = useState("50");

  const PRESETS = ["full-stack development", "UI/UX design", "smart contract auditing", "data engineering", "DevOps / infra"];

  return (
    <div className="glow-card p-4">
      <div className="panel-header">Launch Protocol</div>

      <p className="text-sub mb-3" style={{ fontSize: "0.68rem", lineHeight: "1.6" }}>
        The agent will autonomously find companies, verify contacts, run compliance checks, write personalised outreach, and collect USDC payment — all without you lifting a finger.
      </p>

      <form onSubmit={(e) => {
        e.preventDefault();
        const r = parseFloat(rate);
        if (!skill.trim() || isNaN(r) || r <= 0) return;
        onStart(skill.trim(), r);
      }} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sub uppercase tracking-widest" style={{ fontSize: "0.58rem" }}>
            Your Skill / Service
          </label>
          <input className="input-neon" placeholder="e.g. full-stack development"
            value={skill} onChange={(e) => setSkill(e.target.value)} disabled={loading || disabled} />
          {/* Presets */}
          <div className="flex flex-wrap gap-1 mt-1">
            {PRESETS.map((p) => (
              <button key={p} type="button"
                onClick={() => setSkill(p)}
                disabled={loading || disabled}
                className="badge badge-dim"
                style={{ cursor: "pointer", fontSize: "0.52rem" }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sub uppercase tracking-widest" style={{ fontSize: "0.58rem" }}>
            Your Rate (USDC / hr)
          </label>
          <input className="input-neon" type="number" min="1" step="1" placeholder="50"
            value={rate} onChange={(e) => setRate(e.target.value)} disabled={loading || disabled} />
          <p className="text-sub" style={{ fontSize: "0.58rem" }}>
            This is what clients will be charged. Agent budget cap: <span className="text-amber">$5.00 USDC</span>
          </p>
        </div>

        <button type="submit" className="btn-neon mt-1" disabled={loading || disabled}>
          <span>
            {loading
              ? <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><span className="spin">◌</span> INITIALIZING…</span>
              : "⚡ LAUNCH RAINMAKER"}
          </span>
        </button>

        {disabled && !loading && (
          <p className="text-sub text-center" style={{ fontSize: "0.6rem" }}>
            ◉ Protocol running — wait for completion before starting a new run
          </p>
        )}
      </form>

      {agentEmail && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="text-sub uppercase tracking-widest mb-1" style={{ fontSize: "0.58rem" }}>Agent Inbox (AgentMail)</div>
          <div className="text-neon text-xs break-all">{agentEmail}</div>
          <p className="text-sub mt-1" style={{ fontSize: "0.58rem" }}>Outreach emails are sent from this AI-controlled address</p>
        </div>
      )}

      {/* Mode notice */}
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-start gap-2">
          <span className="text-amber">⚠</span>
          <div>
            <div className="text-amber font-bold" style={{ fontSize: "0.62rem" }}>MOCK MODE ACTIVE</div>
            <p className="text-sub mt-0.5" style={{ fontSize: "0.6rem", lineHeight: "1.5" }}>
              Running on simulated data — no real Locus credits consumed. Switch{" "}
              <span className="text-neon font-mono">USE_MOCK=false</span> in{" "}
              <span className="text-neon font-mono">.env.local</span> once credits arrive.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Prospect Card ────────────────────────────────────────────────────────────

function ProspectCard({ p }: { p: Prospect }) {
  const meta        = STATUS_META[p.status] ?? { label: p.status.toUpperCase(), badge: "badge-dim", icon: "?", step: 0, desc: "" };
  const isBlocked   = p.status === "ofac_blocked" || p.status === "policy_rejected";
  const isDelivered = p.status === "delivered";
  const isPaid      = p.status === "paid" || isDelivered;
  const isActive    = ["enriching","ofac_scanning","generating_email","creating_checkout","outreach_sent"].includes(p.status);
  const progress    = Math.max(0, Math.min(100, ((meta.step < 0 ? 0 : meta.step + 1) / 9) * 100));

  let cardClass = "glow-card";
  if (isBlocked) cardClass = "glow-card-red";
  else if (isPaid) cardClass = "glow-card-green";

  return (
    <div className={`${cardClass} p-3 flex flex-col gap-2 relative overflow-hidden fade-up`} title={meta.desc}>
      {isActive && (
        <div className="absolute left-0 right-0 pointer-events-none" style={{
          top: "50%", height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.4), transparent)",
          animation: "scan-line 2s linear infinite",
        }} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-xs truncate ${isBlocked ? "text-danger" : isPaid ? "text-neon" : "text-white/90"}`}>
            {meta.icon} {p.company.name}
          </div>
          <div className="text-sub truncate" style={{ fontSize: "0.6rem" }}>{p.company.domain}</div>
        </div>
        <span className={`badge ${meta.badge} shrink-0`}>{meta.label}</span>
      </div>

      {/* Company meta */}
      <div className="flex flex-wrap items-center gap-1" style={{ fontSize: "0.6rem" }}>
        <span className="text-cyan">{p.company.industry}</span>
        <span className="text-sub">·</span>
        <span className="text-sub">{p.company.size}</span>
        <span className="text-sub">·</span>
        <span className="text-sub">{p.company.location}</span>
      </div>

      {/* Tech stack */}
      {p.company.techStack?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.company.techStack.slice(0, 4).map((t) => (
            <span key={t} className="badge badge-dim" style={{ fontSize: "0.5rem" }}>{t}</span>
          ))}
        </div>
      )}

      {/* Contact */}
      {p.contact && (
        <div className="flex items-center gap-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: "0.62rem" }}>
          <span className="text-sub">👤</span>
          <span className="text-white/80 font-semibold">{p.contact.firstName} {p.contact.lastName}</span>
          <span className="text-sub">·</span>
          <span className="text-sub truncate">{p.contact.title}</span>
        </div>
      )}

      {/* Status description */}
      <div className="text-sub" style={{ fontSize: "0.58rem" }}>{meta.desc}</div>

      {/* OFAC block */}
      {isBlocked && p.ofacResult?.matches?.[0] && (
        <div style={{ background: "rgba(255,30,50,0.08)", border: "1px solid rgba(255,51,85,0.3)", borderRadius: "2px", padding: "0.5rem", fontSize: "0.62rem" }}>
          <div className="text-danger font-bold">⛔ SANCTIONS HIT — {p.ofacResult.matches[0].list}</div>
          <div style={{ color: "rgba(255,120,120,0.75)", marginTop: "2px" }}>{p.ofacResult.matches[0].reason}</div>
          <div style={{ color: "rgba(255,100,100,0.45)", marginTop: "2px" }}>Confidence: {p.ofacResult.matches[0].score}/100 · Entity blocked permanently</div>
        </div>
      )}

      {/* Checkout CTA */}
      {p.checkoutUrl && p.status === "awaiting_payment" && (
        <a href={p.checkoutUrl} target="_blank" rel="noopener noreferrer"
          className="text-neon text-center font-bold"
          style={{ fontSize: "0.65rem", border: "1px solid rgba(0,255,159,0.35)", padding: "0.5rem", borderRadius: "2px", display: "block", background: "rgba(0,255,159,0.04)" }}>
          ◈ OPEN LOCUS CHECKOUT →
        </a>
      )}

      {/* Payment */}
      {p.paymentTxHash && (
        <div className="text-green-400" style={{ fontSize: "0.62rem", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "6px" }}>
          <span className="font-bold">✓ PAID ON-CHAIN</span>
          <span className="text-sub" style={{ marginLeft: "8px" }}>tx: {shortTx(p.paymentTxHash)}</span>
          {p.paidAt && <span className="text-sub" style={{ marginLeft: "8px" }}>{timeAgo(p.paidAt)}</span>}
        </div>
      )}

      {/* Delivered */}
      {isDelivered && p.deliveredAt && (
        <div className="text-neon" style={{ fontSize: "0.62rem" }}>★ Work deliverable sent · {timeAgo(p.deliveredAt)}</div>
      )}

      {/* Error */}
      {p.errorMessage && !isBlocked && (
        <div className="text-danger truncate" style={{ fontSize: "0.62rem" }}>✕ {p.errorMessage}</div>
      )}

      {/* Progress bar */}
      {!isBlocked && meta.step >= 0 && (
        <div className="progress-track" style={{ marginTop: "2px" }}>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

function AuditLog({ entries }: { entries: AuditEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [entries.length]);

  return (
    <div className="glow-card flex flex-col" style={{ height: "380px" }}>
      <div className="p-3 pb-2 flex items-center justify-between">
        <div className="panel-header" style={{ marginBottom: 0, borderBottom: "none" }}>
          Audit Log
          <span className="text-sub ml-2" style={{ fontSize: "0.58rem" }}>— every agent action, reasoning &amp; cost</span>
        </div>
        {entries.length > 0 && <span className="badge badge-dim shrink-0">{entries.length} events</span>}
      </div>
      <div className="terminal-log mx-3 mb-3 flex-1" style={{ overflowY: "auto" }}>
        {entries.length === 0 ? (
          <div className="text-sub text-center" style={{ padding: "2.5rem 0", fontSize: "0.7rem" }}>
            <div className="mb-2">No events yet</div>
            <div style={{ fontSize: "0.6rem" }}>Launch a protocol to see real-time agent decisions appear here<span className="blink-cursor" /></div>
          </div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="log-row slide-in">
              <span className="text-sub shrink-0">{hhmm(e.timestamp)}</span>
              <div>
                <span className={`font-bold ${AUDIT_COLOR[e.status] ?? "text-white/80"}`}>{e.action}</span>
                {e.cost > 0 && <span className="text-amber float-right" style={{ fontSize: "0.6rem" }}>-{fmt(e.cost)}</span>}
                <div className="text-sub" style={{ fontSize: "0.6rem", lineHeight: "1.5", marginTop: "1px" }}>{e.reasoning}</div>
                {e.txHash && <div style={{ color: "rgba(0,255,159,0.5)", fontSize: "0.58rem" }}>on-chain: {shortTx(e.txHash)}</div>}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

// ─── Run History ─────────────────────────────────────────────────────────────

function RunHistory({ runs, currentRunId, onSelect }: {
  runs: Run[];
  currentRunId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!runs.length) return null;
  return (
    <div className="glow-card p-4">
      <div className="panel-header">Run History</div>
      <div className="flex flex-col gap-1.5">
        {runs.slice(0, 6).map((r) => {
          const m = RUN_STATUS_META[r.status] ?? RUN_STATUS_META.idle;
          return (
            <button key={r.id} onClick={() => onSelect(r.id)}
              className="w-full text-left rounded transition-all"
              style={{
                padding: "0.5rem 0.75rem",
                border: `1px solid ${r.id === currentRunId ? "rgba(0,255,159,0.3)" : "rgba(255,255,255,0.05)"}`,
                background: r.id === currentRunId ? "rgba(0,255,159,0.04)" : "transparent",
              }}>
              <div className="flex items-center justify-between gap-2">
                <span className={`badge ${m.badge}`}>{m.label}</span>
                <span className="text-sub" style={{ fontSize: "0.6rem" }}>{timeAgo(r.startedAt)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sub truncate" style={{ fontSize: "0.65rem" }}>{r.skill}</span>
                <span className={`font-bold ${r.totalEarnedUsdc > 0 ? "text-green-400" : "text-sub"}`} style={{ fontSize: "0.65rem" }}>
                  +{fmt(r.totalEarnedUsdc)}
                </span>
              </div>
              <div className="text-sub mt-0.5" style={{ fontSize: "0.58rem" }}>
                {r.prospects.length} targets · {r.auditLog.length} events
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div onClick={onClose} className="toast fixed bottom-6 right-6 z-50 px-5 py-3 rounded cursor-pointer max-w-sm">
      <div className="text-neon font-bold text-sm">{msg}</div>
      <div className="text-sub" style={{ fontSize: "0.6rem", marginTop: "2px" }}>Click to dismiss</div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [run, setRun]             = useState<Run | null>(null);
  const [runId, setRunId]         = useState<string | null>(null);
  const [allRuns, setAllRuns]     = useState<Run[]>([]);
  const [balance, setBalance]     = useState<WalletBalance | null>(null);
  const [launching, setLaunching] = useState(false);
  const [toast, setToast]         = useState<string | null>(null);
  const [sseConnected, setSSE]    = useState(false);
  const esRef           = useRef<EventSource | null>(null);
  const pendingParams   = useRef<{ skill: string; rate: number } | null>(null);

  useEffect(() => {
    fetch("/api/agent/runs")
      .then((r) => r.json())
      .then((d: { runs?: Run[] }) => {
        const runs = d.runs ?? [];
        setAllRuns(runs);
        const active = runs.find((r) => r.status === "running");
        if (active) { setRunId(active.id); setRun(active); }
      }).catch(() => {});
  }, []);

  const connectSSE = useCallback((id: string) => {
    esRef.current?.close();
    setSSE(false);
    const p   = pendingParams.current;
    pendingParams.current = null;
    const qs  = p ? `&skill=${encodeURIComponent(p.skill)}&rate=${p.rate}` : "";
    const es  = new EventSource(`/api/agent/stream?runId=${id}${qs}`);
    esRef.current = es;
    es.onopen  = () => { setSSE(true); setLaunching(false); };
    es.onerror = () => setSSE(false);
    es.onmessage = (e) => {
      try {
        const ev: SSEEvent = JSON.parse(e.data);
        if (ev.type === "heartbeat") return;
        if (["run_started","run_completed","run_failed","budget_exhausted"].includes(ev.type)) {
          const u = ev.payload as Run;
          setRun(u);
          setAllRuns((p) => { const i = p.findIndex((r) => r.id === u.id); if (i>=0){const c=[...p];c[i]=u;return c;} return [u,...p]; });
        }
        if (ev.type === "prospect_update") {
          const p = ev.payload as Prospect;
          setRun((prev) => prev ? { ...prev, prospects: prev.prospects.find((x) => x.id === p.id) ? prev.prospects.map((x) => x.id === p.id ? p : x) : [...prev.prospects, p] } : prev);
        }
        if (ev.type === "audit_entry") {
          const entry = ev.payload as AuditEntry;
          setRun((prev) => prev ? { ...prev, auditLog: [...prev.auditLog, entry] } : prev);
        }
        if (ev.type === "balance_update")   setBalance(ev.payload as WalletBalance);
        if (ev.type === "payment_received") { const p = ev.payload as Prospect; setToast(`✓ Payment received from ${p.company?.name ?? "prospect"}!`); }
        if (ev.type === "work_delivered")   { const p = ev.payload as Prospect; setToast(`★ Work delivered to ${p.company?.name ?? "client"}!`); }
        if (["run_completed","run_failed","budget_exhausted"].includes(ev.type)) { es.close(); setSSE(false); setLaunching(false); }
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => { if (runId) connectSSE(runId); return () => esRef.current?.close(); }, [runId, connectSSE]);

  async function handleStart(skill: string, hourlyRate: number) {
    setLaunching(true);
    try {
      const res  = await fetch("/api/agent/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill, hourlyRate }) });
      const data = (await res.json()) as { runId?: string; error?: string };
      if (!data.runId) throw new Error(data.error ?? "No runId returned");
      const newRun: Run = { id: data.runId, skill, hourlyRate, status: "running", prospects: [], auditLog: [], totalSpentUsdc: 0, totalEarnedUsdc: 0, startedAt: new Date().toISOString(), completedAt: null, errorMessage: null, agentInboxId: null, agentEmail: null };
      pendingParams.current = { skill, rate: hourlyRate }; // picked up by connectSSE via useEffect
      setRunId(data.runId);
      setRun(newRun);
      setAllRuns((p) => [newRun, ...p]);
    } catch (err) {
      setToast(`✕ ${err instanceof Error ? err.message : "Failed to start"}`);
      setLaunching(false);
    }
  }

  const isRunning = run?.status === "running";
  const prospects = run?.prospects ?? [];
  const auditLog  = run?.auditLog  ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar balance={balance} sseConnected={sseConnected} run={run} />

      <div className="flex-1 p-4 sm:p-5 max-w-screen-2xl mx-auto w-full flex flex-col gap-4">

        {/* Hero */}
        <HeroBanner />

        {/* Collapsible info panels */}
        <HowItWorksPanel />
        <HowToUsePanel />

        {/* Stats */}
        {run && <StatsStrip run={run} />}

        {/* Pipeline */}
        {prospects.length > 0 && <PipelineTracker prospects={prospects} />}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">

          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            <LaunchForm onStart={handleStart} loading={launching} disabled={isRunning} agentEmail={run?.agentEmail ?? null} />
            <RunHistory runs={allRuns} currentRunId={runId} onSelect={(id) => { const f = allRuns.find((r) => r.id === id); if (f) { setRunId(id); setRun(f); } }} />
          </div>

          {/* Main */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="panel-header" style={{ borderBottom: "none", marginBottom: 0 }}>
                Prospect Grid
                {prospects.length > 0 && <span className="badge badge-dim">{prospects.length} targets</span>}
                <span className="text-sub ml-2" style={{ fontSize: "0.58rem" }}>— each card = one B2B prospect moving through the pipeline</span>
              </div>
              {isRunning && (
                <div className="flex items-center gap-1.5 text-cyan text-xs">
                  <span className="pulse-dot" /> SCANNING
                </div>
              )}
            </div>

            {prospects.length === 0 ? (
              <div className="glow-card p-12 text-center">
                {isRunning ? (
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-cyan text-3xl spin">◌</span>
                    <span className="text-sub text-sm tracking-widest">SCANNING FOR TARGETS…</span>
                    <span className="text-sub" style={{ fontSize: "0.6rem" }}>Apollo is searching for B2B companies that match your skill</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-dim text-5xl">◎</span>
                    <div>
                      <div className="text-sub text-sm tracking-widest mb-1">NO ACTIVE PROTOCOL</div>
                      <div className="text-dim" style={{ fontSize: "0.65rem", maxWidth: "360px", margin: "0 auto", lineHeight: "1.6" }}>
                        Configure your skill and hourly rate in the sidebar, then click{" "}
                        <span className="text-neon">⚡ LAUNCH RAINMAKER</span> to start the autonomous acquisition pipeline.
                        Prospect cards will appear here in real-time as the agent discovers and processes targets.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {prospects.map((p) => <ProspectCard key={p.id} p={p} />)}
              </div>
            )}

            <AuditLog entries={auditLog} />
          </div>
        </div>

        {/* Footer */}
        <footer className="py-5 mt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-neon font-bold text-xs">⚡ RAINMAKER PROTOCOL</span>
              <span className="text-sub" style={{ fontSize: "0.6rem" }}>· Locus Paygentic Hackathon #1 · April 2026</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sub" style={{ fontSize: "0.6rem" }}>Built by</span>
              <a
                href="https://github.com/Gideon145"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-white/70 hover:text-neon transition-colors"
                style={{ fontSize: "0.72rem", fontWeight: 700 }}
              >
                {/* GitHub SVG */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                Gideon145
              </a>
              <span className="text-sub" style={{ fontSize: "0.58rem" }}>·</span>
              <span className="text-sub" style={{ fontSize: "0.58rem" }}>Powered by <span className="text-neon">Locus</span></span>
            </div>
          </div>
        </footer>
      </div>

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
