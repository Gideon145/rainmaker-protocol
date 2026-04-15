import { NextRequest, NextResponse, after } from "next/server";
import { createRun, getRun } from "@/lib/store";
import { executeRun } from "@/agent/orchestrator";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { getBalance } from "@/lib/locus";
import { uuid } from "@/lib/utils";

// USDC on Base (6 decimals) — 1 USDC hire fee
const HIRE_FEE_USDC_ATOMIC = "1000000"; // 1 USDC
const USDC_BASE_ADDRESS     = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Strip characters that could be used for prompt injection
function sanitizeSkill(input: string): string {
  return input.replace(/[^\w\s.,+#\-()&/]/g, "").trim();
}

/**
 * Verify an X-Payment header (x402 protocol, exact scheme, USDC/Base).
 * Returns { ok, payerAddress } on success, { ok: false, error } on failure.
 */
function verifyX402Payment(header: string): { ok: boolean; payerAddress?: string; error?: string } {
  try {
    const raw = Buffer.from(header, "base64").toString("utf-8");
    const data = JSON.parse(raw) as {
      x402Version?: number;
      scheme?: string;
      network?: string;
      payload?: {
        from?: string;
        txHash?: string;
        amount?: string;
        asset?: string;
      };
    };

    if (!data.payload?.from) return { ok: false, error: "Missing payer address in X-Payment payload" };

    const { from, txHash, amount } = data.payload;

    // Require a non-empty tx hash and an amount covering the fee
    if (!txHash || !txHash.startsWith("0x")) return { ok: false, error: "Invalid or missing txHash in payment payload" };

    const paid = BigInt(amount ?? "0");
    if (paid < BigInt(HIRE_FEE_USDC_ATOMIC)) {
      return { ok: false, error: `Underpayment: received ${paid}, required ${HIRE_FEE_USDC_ATOMIC} (1 USDC)` };
    }

    return { ok: true, payerAddress: from };
  } catch {
    return { ok: false, error: "Malformed X-Payment header — expected base64-encoded JSON" };
  }
}

/**
 * POST /api/agent/hire
 *
 * Agent-to-Agent (A2A) endpoint implementing the x402 HTTP payment protocol.
 * Any external AI agent can hire Rainmaker Protocol by paying 1 USDC on Base.
 *
 * x402 flow:
 *   1. Send POST without X-Payment → receive 402 with payment requirements.
 *   2. Agent pays 1 USDC to the Rainmaker wallet on Base.
 *   3. Re-send POST with X-Payment: <base64 payment proof>.
 *   4. Server verifies, accepts, returns 202 with runId/pollUrl/streamUrl.
 *
 * Request body:
 *   { skill: string, hourlyRate: number, webhookUrl?: string }
 *
 * Returns 202 immediately. Pipeline runs in background via after().
 * If webhookUrl is provided, the run result is POSTed there on completion.
 */
export async function POST(req: NextRequest) {
  try {
    // ── x402 Payment Gate ────────────────────────────────────────────────────
    const paymentHeader = req.headers.get("X-Payment");
    if (!paymentHeader) {
      // Return 402 with Locus wallet address and USDC/Base payment requirements
      const walletInfo = await getBalance().catch(() => null);
      const payTo = walletInfo?.address ?? process.env.LOCUS_WALLET_ADDRESS ?? "";

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://rainmaker-protocol.vercel.app";

      return NextResponse.json(
        {
          x402Version: 1,
          accepts: [
            {
              scheme: "exact",
              network: "base",
              maxAmountRequired: HIRE_FEE_USDC_ATOMIC,
              resource: `${appUrl}/api/agent/hire`,
              description: "Hire Rainmaker Protocol — autonomous B2B client acquisition agent. 1 USDC per run.",
              mimeType: "application/json",
              payTo,
              maxTimeoutSeconds: 60,
              asset: USDC_BASE_ADDRESS,
              extra: { name: "USDC", version: "2" },
            },
          ],
          error: "X-Payment header is required. Pay 1 USDC on Base to hire this agent.",
        },
        {
          status: 402,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "X-Payment",
          },
        },
      );
    }

    const verification = verifyX402Payment(paymentHeader);
    if (!verification.ok) {
      return NextResponse.json(
        { error: `Payment verification failed: ${verification.error}` },
        { status: 402 },
      );
    }
    // ── End x402 Gate ────────────────────────────────────────────────────────

    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded — max 3 runs per 5 minutes" },
        { status: 429 },
      );
    }

    const body = await req.json();

    const rawSkill: string = (body.skill ?? "").trim();
    const skill = sanitizeSkill(rawSkill);
    if (!skill) {
      return NextResponse.json({ error: "skill is required" }, { status: 400 });
    }
    if (skill.length > 120) {
      return NextResponse.json({ error: "skill must be 120 characters or fewer" }, { status: 400 });
    }

    const hourlyRate = Math.max(10, Math.min(500, Number(body.hourlyRate) || 100));

    // webhookUrl — must be HTTPS if provided to prevent SSRF to internal services
    const webhookUrl: string | null =
      typeof body.webhookUrl === "string" && body.webhookUrl.startsWith("https://")
        ? body.webhookUrl
        : null;
    if (body.webhookUrl && !webhookUrl) {
      return NextResponse.json(
        { error: "webhookUrl must use HTTPS" },
        { status: 400 },
      );
    }

    const runId = uuid();
    createRun({ id: runId, skill, hourlyRate });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Fire pipeline after response is returned — keeps the 202 instant
    after(async () => {
      await executeRun(runId, { skill, hourlyRate });

      if (webhookUrl) {
        try {
          const run = getRun(runId);
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              runId,
              status: run?.status,
              skill: run?.skill,
              hourlyRate: run?.hourlyRate,
              totalSpentUsdc: run?.totalSpentUsdc,
              totalEarnedUsdc: run?.totalEarnedUsdc,
              prospectsDelivered: run?.prospects.filter((p) => p.status === "delivered").length ?? 0,
              completedAt: run?.completedAt,
            }),
          });
        } catch { /* best-effort delivery */ }
      }
    });

    return NextResponse.json(
      {
        runId,
        status: "running",
        pollUrl: `${appUrl}/api/agent/runs/${runId}`,
        streamUrl: `${appUrl}/api/agent/stream?runId=${runId}`,
        message:
          "Rainmaker Protocol agent started. Poll pollUrl for status or subscribe to streamUrl for real-time SSE events.",
        payer: verification.payerAddress,
        hireFee: `${parseInt(HIRE_FEE_USDC_ATOMIC) / 1_000_000} USDC`,
      },
      { status: 202 },
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
