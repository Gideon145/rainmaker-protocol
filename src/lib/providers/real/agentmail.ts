import { callX402 } from "../../locus";
import type { MailProvider } from "../types";

export const agentmail: MailProvider = {
  async createInbox(username: string) {
    const res = await callX402<{ inbox_id: string; email: string }>(
      "agentmail-create-inbox",
      { username },
    );
    if (!res.ok || !res.data) throw new Error("Failed to create AgentMail inbox");
    return { inboxId: res.data.inbox_id, email: res.data.email };
  },

  async sendEmail({ inboxId, to, subject, body }) {
    const res = await callX402<{ message_id: string }>(
      "agentmail-send-message",
      {
        inbox_id: inboxId,
        to: [{ email: to }],
        subject,
        body,
      },
    );
    if (!res.ok || !res.data) throw new Error("Failed to send email via AgentMail");
    return { messageId: res.data.message_id };
  },

  async listMessages(inboxId: string) {
    const res = await callX402<{
      messages: Array<{
        id: string;
        from: string;
        subject: string;
        body?: string;
        text?: string;
        received_at: string;
        in_reply_to?: string;
      }>;
    }>("agentmail-list-messages", { inbox_id: inboxId });

    if (!res.ok || !res.data) return [];

    return (res.data.messages ?? []).map((m) => ({
      id: m.id,
      from: m.from,
      subject: m.subject,
      body: m.body ?? m.text ?? "",
      receivedAt: m.received_at,
      inReplyTo: m.in_reply_to,
    }));
  },

  async reply({ inboxId, messageId, body }) {
    await callX402("agentmail-reply", {
      inbox_id: inboxId,
      message_id: messageId,
      body,
    });
  },
};
