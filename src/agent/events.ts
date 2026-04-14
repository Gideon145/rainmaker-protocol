import EventEmitter from "events";
import type { AgentEvent, AgentEventType } from "../lib/providers/types";

// ─── Global SSE event bus ─────────────────────────────────────────────────
// Agent loop emits events here; SSE stream handlers subscribe per runId.

class AgentEventBus extends EventEmitter {
  emit(runId: string, type: AgentEventType, payload: unknown): boolean {
    const event: AgentEvent = {
      type,
      runId,
      payload,
      timestamp: new Date().toISOString(),
    };
    return super.emit(runId, event);
  }

  subscribe(runId: string, handler: (event: AgentEvent) => void): () => void {
    this.on(runId, handler);
    return () => this.off(runId, handler);
  }
}

export const eventBus = new AgentEventBus();
// Prevent Node.js MaxListeners warning — many concurrent runs
eventBus.setMaxListeners(100);
