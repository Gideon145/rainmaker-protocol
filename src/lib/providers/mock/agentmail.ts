import EventEmitter from "events";
import type { MailProvider } from "../types";

// ─── In-process mock email bus ────────────────────────────────────────────
// Simulates AgentMail: sends return a messageId, and after AUTO_REPLY_DELAY_MS
// the "prospect" replies (only for the first inbox that gets mail in a run).

const AUTO_REPLY_DELAY_MS = 12_000; // 12 seconds — visible in demo

interface MockMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
  inReplyTo?: string;
}

const inboxes = new Map<string, { email: string }>();
const messages = new Map<string, MockMessage[]>();
const firstPayTarget = { inboxId: null as string | null, messageId: null as string | null };

export const agentMailBus = new EventEmitter();

export const agentmail: MailProvider = {
  async createInbox(username: string) {
    await new Promise((r) => setTimeout(r, 1000));
    const inboxId = `mock_inbox_${username}_${Date.now()}`;
    const email = `${username}@agentmail.to`;
    inboxes.set(inboxId, { email });
    messages.set(inboxId, []);
    return { inboxId, email };
  },

  async sendEmail({ inboxId, to, subject }) {
    await new Promise((r) => setTimeout(r, 500));
    const messageId = `mock_msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Schedule an auto-reply from the FIRST prospect only (to demo payment flow)
    if (!firstPayTarget.inboxId) {
      firstPayTarget.inboxId = inboxId;
      firstPayTarget.messageId = messageId;

      setTimeout(() => {
        const reply: MockMessage = {
          id: `mock_reply_${Date.now()}`,
          from: to,
          subject: `Re: ${subject}`,
          body: "Hi! This looks great. I just paid via the link. Looking forward to the session!",
          receivedAt: new Date().toISOString(),
          inReplyTo: messageId,
        };
        const inbox = messages.get(inboxId) ?? [];
        inbox.push(reply);
        messages.set(inboxId, inbox);
        agentMailBus.emit("reply", { inboxId, messageId, reply });
      }, AUTO_REPLY_DELAY_MS);
    }

    return { messageId };
  },

  async listMessages(inboxId: string) {
    await new Promise((r) => setTimeout(r, 200));
    return messages.get(inboxId) ?? [];
  },

  async reply({ inboxId, messageId: _msgId, body: _body }) {
    await new Promise((r) => setTimeout(r, 300));
    // no-op in mock — delivery is considered done
  },
};
