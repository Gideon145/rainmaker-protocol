import { NextRequest, NextResponse } from "next/server";
import { uuid } from "@/lib/utils";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

// Strip characters that could be used for prompt injection in LLM calls.
// Allows letters, numbers, spaces, and common punctuation — blocks control
// characters, angle brackets, backticks, and newlines.
function sanitizeSkill(input: string): string {
  return input.replace(/[^\w\s.,+#\-()&/]/g, "").trim();
}

// Just generate a runId — the agent starts from the SSE stream route
// so it runs in the same long-lived invocation and Vercel can't kill it
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
    const rawSkill: string = (body.skill ?? "React Developer").trim();
    const skill: string = sanitizeSkill(rawSkill);
    const hourlyRate: number = Math.max(10, Math.min(500, Number(body.hourlyRate) || 100));
    if (!skill) {
      return NextResponse.json({ error: "skill is required" }, { status: 400 });
    }
    if (skill.length > 120) {
      return NextResponse.json({ error: "skill must be 120 characters or fewer" }, { status: 400 });
    }
    return NextResponse.json({ runId: uuid(), skill, hourlyRate });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
