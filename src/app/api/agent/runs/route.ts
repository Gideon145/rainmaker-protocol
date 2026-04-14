import { NextResponse } from "next/server";
import { getAllRuns } from "@/lib/store";

export async function GET() {
  const runs = getAllRuns().slice(0, 20);
  return NextResponse.json({ runs });
}
