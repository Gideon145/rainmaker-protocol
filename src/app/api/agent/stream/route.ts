import { NextRequest } from "next/server";
import { eventBus } from "@/agent/events";
import { getRun } from "@/lib/store";
import type { AgentEvent } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) {
    return new Response("runId query param required", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send current run state immediately on connect
      const run = getRun(runId);
      if (run) {
        const snapshot: AgentEvent = {
          type: "run_started",
          runId,
          payload: run,
          timestamp: new Date().toISOString(),
        };
        controller.enqueue(
          encoder.encode(`event: run_started\ndata: ${JSON.stringify(snapshot)}\n\n`),
        );
      }

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch { clearInterval(heartbeat); }
      }, 15_000);

      const unsubscribe = eventBus.subscribe(runId, (event: AgentEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
          );
          // Close stream on terminal events
          if (event.type === "run_completed" || event.type === "run_failed") {
            setTimeout(() => {
              try { controller.close(); } catch { /* already closed */ }
            }, 500);
          }
        } catch { /* client disconnected */ }
      });

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
