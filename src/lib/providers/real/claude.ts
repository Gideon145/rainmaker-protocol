import { callWrappedAPI } from "../../locus";
import type { LLMProvider, Company, Contact } from "../types";

export const claude: LLMProvider = {
  async generateOutreach({ skill, hourlyRate, company, contact, checkoutUrl }) {
    const res = await callWrappedAPI<{
      content: Array<{ type: string; text: string }>;
    }>("anthropic", "messages", {
      model: "claude-3-5-haiku-20241022",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: `You are a top-tier freelance ${skill} developer writing a short, personalized cold outreach email.

Company: ${company.name}
Industry: ${company.industry}
Tech stack: ${company.techStack.join(", ")}
Description: ${company.description}

Contact: ${contact.firstName} ${contact.lastName}, ${contact.title}

Your hourly rate: $${hourlyRate} USDC/hr
Checkout link (they click and pay with USDC — no bank details needed): ${checkoutUrl}

Write a cold email that:
1. Is short (under 150 words)  
2. Shows you researched their stack specifically
3. Mentions the Checkout link naturally as a frictionless booking mechanism
4. Does NOT mention "AI" or "agent" — sounds like a human developer
5. Subject line should be specific, not generic

Return ONLY valid JSON in this exact shape:
{"subject": "...", "body": "..."}`,
        },
      ],
    });

    if (!res.ok || !res.data?.content?.[0]?.text) {
      return {
        subject: `${skill} developer available for ${company.name}`,
        body: `Hi ${contact.firstName},\n\nI'd love to help with your ${company.techStack[0]} work at ${company.name}.\n\nBook a session: ${checkoutUrl}\n\nBest,\nYour Rainmaker Agent`,
      };
    }

    try {
      const parsed = JSON.parse(res.data.content[0].text);
      return { subject: parsed.subject, body: parsed.body };
    } catch {
      return {
        subject: `${skill} developer for ${company.name}`,
        body: res.data.content[0].text,
      };
    }
  },

  async generateDeliverable({ skill, company, contact }) {
    const res = await callWrappedAPI<{
      content: Array<{ type: string; text: string }>;
    }>("anthropic", "messages", {
      model: "claude-3-5-haiku-20241022",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Write a professional booking confirmation email for ${contact.firstName} at ${company.name}. They just booked a 1-hour ${skill} consulting session. Include a mock calendar link and brief agenda. Keep it under 120 words. Plain text only.`,
        },
      ],
    });

    return res.data?.content?.[0]?.text ?? `Hi ${contact.firstName}, your session is confirmed! We'll connect shortly.`;
  },
};
