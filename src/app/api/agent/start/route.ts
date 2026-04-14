import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/agent/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const skill: string = (body.skill ?? "React Developer").trim();
    const hourlyRate: number = Math.max(10, Math.min(500, Number(body.hourlyRate) || 100));

    if (!skill) {
      return NextResponse.json({ error: "skill is required" }, { status: 400 });
    }

    // Fire-and-forget — returns runId immediately
    const runId = await runAgent({ skill, hourlyRate });

    return NextResponse.json({ runId, started: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
