import { NextRequest, NextResponse, after } from "next/server";
import { createRun, getRun } from "@/lib/store";
import { executeRun } from "@/agent/orchestrator";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { uuid } from "@/lib/utils";

// Strip characters that could be used for prompt injection
function sanitizeSkill(input: string): string {
  return input.replace(/[^\w\s.,+#\-()&/]/g, "").trim();
}

/**
 * POST /api/agent/hire
 *
 * Agent-to-Agent API. Any external agent can hire Rainmaker Protocol
 * to execute a full client acquisition run on their behalf.
 *
 * Request body:
 *   { skill: string, hourlyRate: number, webhookUrl?: string }
 *
 * Returns 202 immediately with { runId, pollUrl, streamUrl }.
 * The agent pipeline runs in the background via after().
 * If webhookUrl is provided, the run result is POSTed there on completion.
 */
export async function POST(req: NextRequest) {
  try {
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
      },
      { status: 202 },
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
