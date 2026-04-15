// ─── Locus API client — server-side only, never import in client components ──
// All calls go to beta-api.paywithlocus.com

import type { TransactionRecord } from "@/lib/providers/types";

const API_BASE = process.env.LOCUS_API_BASE ?? "https://beta-api.paywithlocus.com/api";
const API_KEY  = process.env.LOCUS_API_KEY  ?? "";

async function locusRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data?: T; error?: string; message?: string }> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json: { success: boolean; data?: T; error?: string; message?: string } | null = null;
  try { json = await res.json(); } catch { /* empty body */ }

  if (!res.ok || !json?.success) {
    return {
      ok: false,
      status: res.status,
      error: json?.error,
      message: json?.message ?? `HTTP ${res.status}`,
    };
  }

  return { ok: true, status: res.status, data: json.data };
}

// ─── Wallet ───────────────────────────────────────────────────────────────

export async function getBalance(): Promise<{ balance: string; address: string } | null> {
  const r = await locusRequest<{ usdc_balance: string; wallet_address: string }>("GET", "/pay/balance");
  if (!r.ok || !r.data) return null;
  return { balance: r.data.usdc_balance, address: r.data.wallet_address };
}

export async function getTransactions(): Promise<TransactionRecord[] | null> {
  interface RawTx {
    id: string;
    category: string;
    amount_usdc: string;
    status: string;
    tx_hash: string | null;
    created_at: string;
    memo?: string;
    tokens?: { symbol?: string }[];
  }
  const r = await locusRequest<{ transactions: RawTx[] }>("GET", "/pay/transactions");
  if (!r.ok || !r.data?.transactions) return null;
  return r.data.transactions.map((t) => ({
    id: t.id,
    type: t.category,
    amount: t.amount_usdc,
    asset: t.tokens?.[0]?.symbol ?? "USDC",
    status: t.status,
    txHash: t.tx_hash,
    createdAt: t.created_at,
    description: t.memo,
  }));
}

// ─── Checkout sessions ────────────────────────────────────────────────────

export interface CreateSessionParams {
  amount: string;
  description: string;
  webhookUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
}

export interface SessionResponse {
  id: string;
  amount: string;
  description: string;
  status: string;
  checkoutUrl: string;
  expiresAt: string;
  webhookSecret?: string;
  paymentTxHash?: string | null;
  paidAt?: string | null;
}

export async function createCheckoutSession(
  params: CreateSessionParams,
): Promise<{ session: SessionResponse; webhookSecret?: string } | null> {
  const r = await locusRequest<{ session: SessionResponse; webhookSecret?: string }>(
    "POST",
    "/checkout/sessions",
    params,
  );
  if (!r.ok || !r.data) return null;
  return r.data;
}

export async function getCheckoutSession(sessionId: string): Promise<SessionResponse | null> {
  const r = await locusRequest<{ session: SessionResponse }>("GET", `/checkout/sessions/${sessionId}`);
  return r.ok && r.data ? r.data.session : null;
}

// ─── Wrapped APIs ─────────────────────────────────────────────────────────

export async function callWrappedAPI<T>(
  provider: string,
  endpoint: string,
  body: unknown,
): Promise<{ ok: boolean; data?: T; status?: number; policyRejected?: boolean; pendingApproval?: boolean; approvalUrl?: string; error?: string }> {
  const r = await locusRequest<T>("POST", `/wrapped/${provider}/${endpoint}`, body);

  if (!r.ok) {
    if (r.status === 403) return { ok: false, policyRejected: true, error: r.message };
    if (r.status === 202) return { ok: false, pendingApproval: true, approvalUrl: (r as unknown as { data?: { approval_url?: string } }).data?.approval_url };
    return { ok: false, status: r.status, error: r.message };
  }
  return { ok: true, data: r.data };
}

// ─── x402 endpoints (AgentMail, Laso, etc.) ──────────────────────────────

export async function callX402<T>(
  slug: string,
  body: unknown,
): Promise<{ ok: boolean; data?: T; policyRejected?: boolean; pendingApproval?: boolean; error?: string }> {
  const r = await locusRequest<T>("POST", `/x402/${slug}`, body);
  if (!r.ok) {
    if (r.status === 403) return { ok: false, policyRejected: true, error: r.message };
    if (r.status === 202) return { ok: false, pendingApproval: true };
    return { ok: false, error: r.message };
  }
  return { ok: true, data: r.data };
}

// ─── Feedback (submit on every error) ────────────────────────────────────

export async function submitFeedback(params: {
  category: "error" | "general" | "endpoint" | "suggestion";
  endpoint?: string;
  message: string;
  context?: unknown;
  source?: "error" | "heartbeat" | "manual";
}): Promise<void> {
  try {
    await locusRequest("POST", "/feedback", {
      category: params.category,
      endpoint: params.endpoint,
      message: params.message,
      context: params.context,
      source: params.source ?? "manual",
    });
  } catch { /* best-effort */ }
}
