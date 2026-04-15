import { NextResponse } from "next/server";
import { getBalance, getTransactions } from "@/lib/locus";
import type { WalletBalance, TransactionRecord } from "@/lib/providers/types";

/**
 * GET /api/wallet
 *
 * Returns the Locus agent wallet balance, recent transactions, and a derived
 * spending-controls summary (governance state) computed from transaction data.
 * Dashboard polls this every 30 s to keep the TopBar balance live.
 */
export async function GET() {
  try {
    const [balance, transactions] = await Promise.all([
      getBalance(),
      getTransactions(),
    ]);

    const txList: TransactionRecord[] = transactions ?? [];

    // ── Spending controls (derived from transaction history) ──────────────
    // Spending limits are configured on the Locus dashboard; this endpoint
    // surfaces the *current state* so the UI can show governance health.
    const confirmedSpend = txList
      .filter((t) => t.type === "debit" && t.status === "confirmed")
      .reduce((sum, t) => sum + parseFloat(t.amount ?? "0"), 0);

    const pendingApprovals = txList.filter((t) => t.status === "PENDING_APPROVAL");
    const rejectedByPolicy = txList.filter((t) => t.status === "POLICY_REJECTED");

    const spendingControls = {
      totalSpentUsdc: confirmedSpend.toFixed(2),
      pendingApprovalCount: pendingApprovals.length,
      pendingApprovals: pendingApprovals.map((t) => ({
        id: t.id,
        amount: t.amount,
        description: t.description ?? null,
        createdAt: t.createdAt,
      })),
      policyRejectedCount: rejectedByPolicy.length,
      // Allowance limits are dashboard-only; agent reacts to 403 (exceeded)
      // and 202 (pending approval) from Locus policy guardrails.
      governance: {
        note: "Allowance and per-txn limits are configured on the Locus dashboard. The agent automatically pauses on 403 (budget exceeded) and surfaces approval_url on 202 (pending approval).",
        status:
          pendingApprovals.length > 0
            ? "pending_approval"
            : rejectedByPolicy.length > 0
              ? "policy_active"
              : "within_limits",
      },
    };

    return NextResponse.json({
      balance,
      transactions: txList,
      spendingControls,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), balance: null, transactions: [], spendingControls: null },
      { status: 500 },
    );
  }
}

