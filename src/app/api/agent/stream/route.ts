import { NextRequest } from "next/server";
import { eventBus } from "@/agent/events";
import { getRun, createRun } from "@/lib/store";
import { executeRun } from "@/agent/orchestrator";
import type { AgentEvent } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const runId   = req.nextUrl.searchParams.get("runId");
  const skill   = req.nextUrl.searchParams.get("skill");
  const rateStr = req.nextUrl.searchParams.get("rate");

  if (!runId) return new Response("runId required", { status: 400 });

  const autostart  = !!(skill && rateStr);
  const hourlyRate = autostart ? Math.max(10, Math.min(500, Number(rateStr) || 50)) : 0;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: AgentEvent) => {
        try {
          // Send as unnamed SSE data — type is in the JSON payload.
          // Named events (event: foo\n) only fire on es.addEventListener("foo")
          // NOT on es.onmessage, so we deliberately omit the event: prefix.
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch { /* client disconnected */ }
      };

      // Heartbeat keeps the connection alive
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)); }
        catch { clearInterval(heartbeat); }
      }, 15_000);

      // Forward every event emitted by the agent
      const unsubscribe = eventBus.subscribe(runId, (event: AgentEvent) => {
        send(event);
        if (["run_completed", "run_failed", "budget_exhausted"].includes(event.type)) {
          clearInterval(heartbeat);
          setTimeout(() => { try { controller.close(); } catch { /* already closed */ } }, 500);
        }
      });

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });

      if (autostart) {
        // ── NEW: run the agent IN THIS same invocation ──────────────────────
        // The open SSE stream keeps Vercel alive; fire-and-forget from /start
        // was being killed the moment the HTTP response was sent.
        createRun({ id: runId, skill: skill!, hourlyRate });

        void executeRun(runId, { skill: skill!, hourlyRate }).catch((err) => {
          send({
            type: "run_failed",
            runId,
            payload: { error: String(err) },
            timestamp: new Date().toISOString(),
          });
          clearInterval(heartbeat);
          setTimeout(() => { try { controller.close(); } catch { /* already closed */ } }, 500);
        });
      } else {
        // Reconnect to an existing run — send current snapshot immediately
        const run = getRun(runId);
        if (run) {
          send({ type: "run_started", runId, payload: run, timestamp: new Date().toISOString() });
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
