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

// ─── Email escrow / subwallet payments ───────────────────────────────────

export interface EmailPaymentResult {
  ok: boolean;
  transactionId?: string;
  escrowId?: string;
  status?: string;
  expiresAt?: string;
  error?: string;
}

/** Send USDC to a recipient via Locus email escrow (subwallet flow).
 *  Funds are held in a time-limited escrow until the recipient claims them.
 *  Demonstrates the full earn→pay economic loop within a single agent run.
 */
export async function sendEmailPayment(params: {
  email: string;
  amount: number;
  memo: string;
  expiresInDays?: number;
}): Promise<EmailPaymentResult> {
  const r = await locusRequest<{
    transaction_id: string;
    escrow_id: string;
    status: string;
    recipient_email: string;
    amount: number;
    expires_at: string;
  }>("POST", "/pay/send-email", {
    email: params.email,
    amount: params.amount,
    memo: params.memo,
    expires_in_days: params.expiresInDays ?? 30,
  });
  if (!r.ok) return { ok: false, error: r.message };
  return {
    ok: true,
    transactionId: r.data?.transaction_id,
    escrowId: r.data?.escrow_id,
    status: r.data?.status,
    expiresAt: r.data?.expires_at,
  };
}

// ─── Agent self-registration ──────────────────────────────────────────────

export interface RegisterSubAgentResult {
  ok: boolean;
  apiKey?: string;
  ownerPrivateKey?: string;
  walletId?: string;
  walletStatus?: string;
  claimUrl?: string;
  defaults?: { allowanceUsdc: string; maxAllowedTxnSizeUsdc: string };
  error?: string;
}

/** Register a new sub-agent wallet via Locus (beta).
 *  Returns API key + wallet ID for the newly created agent.
 *  The apiKey and ownerPrivateKey are shown only once — store securely.
 */
export async function registerSubAgent(params?: {
  name?: string;
  email?: string;
}): Promise<RegisterSubAgentResult> {
  const r = await locusRequest<{
    apiKey: string;
    ownerPrivateKey: string;
    walletId: string;
    walletStatus: string;
    claimUrl: string;
    defaults: { allowanceUsdc: string; maxAllowedTxnSizeUsdc: string };
  }>("POST", "/register", {
    name: params?.name ?? "Rainmaker Sub-Agent",
    ...(params?.email ? { email: params.email } : {}),
  });
  if (!r.ok) return { ok: false, error: r.message };
  return {
    ok: true,
    apiKey: r.data?.apiKey,
    ownerPrivateKey: r.data?.ownerPrivateKey,
    walletId: r.data?.walletId,
    walletStatus: r.data?.walletStatus,
    claimUrl: r.data?.claimUrl,
    defaults: r.data?.defaults,
  };
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
