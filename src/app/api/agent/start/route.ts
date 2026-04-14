import { NextRequest, NextResponse } from "next/server";
import { uuid } from "@/lib/utils";

// Just generate a runId — the agent starts from the SSE stream route
// so it runs in the same long-lived invocation and Vercel can't kill it
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const skill: string = (body.skill ?? "React Developer").trim();
    const hourlyRate: number = Math.max(10, Math.min(500, Number(body.hourlyRate) || 100));
    if (!skill) {
      return NextResponse.json({ error: "skill is required" }, { status: 400 });
    }
    return NextResponse.json({ runId: uuid(), skill, hourlyRate });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
