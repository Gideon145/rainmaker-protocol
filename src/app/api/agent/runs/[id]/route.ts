import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  // Return a safe subset — omit audit log noise for external callers
  return NextResponse.json({
    runId: run.id,
    status: run.status,
    skill: run.skill,
    hourlyRate: run.hourlyRate,
    totalSpentUsdc: run.totalSpentUsdc,
    totalEarnedUsdc: run.totalEarnedUsdc,
    prospectsTotal: run.prospects.length,
    prospectsDelivered: run.prospects.filter((p) => p.status === "delivered").length,
    ofacBlocked: run.prospects.filter((p) => p.status === "ofac_blocked").length,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    errorMessage: run.errorMessage,
  });
}
