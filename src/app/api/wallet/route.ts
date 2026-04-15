import { NextResponse } from "next/server";
import { getBalance, getTransactions } from "@/lib/locus";
import type { WalletBalance, TransactionRecord } from "@/lib/providers/types";

/**
 * GET /api/wallet
 *
 * Returns the Locus agent wallet balance and recent transactions.
 * Dashboard polls this every 30 s to keep the TopBar balance live.
 */
export async function GET() {
  try {
    const [balance, transactions] = await Promise.all([
      getBalance(),
      getTransactions(),
    ]);

    return NextResponse.json({
      balance,
      transactions: transactions ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), balance: null, transactions: [] },
      { status: 500 },
    );
  }
}
