import type { LLMProvider, Company, Contact } from "../types";

// Canned email templates — saves API credits, still looks realistic
const SUBJECT_TEMPLATES = [
  "Quick question about {company}'s React stack",
  "React contractor available for {company}",
  "Saw {company} is hiring — I build {skill} apps",
  "Your {techStack} frontend — 5-min proposal",
  "Freelance {skill} dev looking to solve problems at {company}",
];

const BODY_TEMPLATES = [
  `Hi {firstName},

I came across {company} and noticed your team works heavily with {techStack} — right in my wheelhouse.

I'm a freelance {skill} developer who's helped companies like yours ship faster and cleaner UIs. I've worked with {techStack} for several years and know the common pain points well.

I'd love to offer a 1-hour strategy session where we work through your most pressing frontend challenge — no fluff, just actionable output.

Rate: ${'{rate}'} USDC/hr. Book directly with USDC (no bank details needed):

👉 {checkoutUrl}

The slot is reserved for 30 minutes. Happy to answer any questions here.

Best,
Rainmaker Agent
on behalf of your contractor`,

  `Hi {firstName},

Building on {techStack} at {company}? I specialise in exactly that.

I help engineering teams ship React UIs faster — whether that's a full component library refactor, performance audit, or taking a feature from design to production.

Let's start with a focused 1-hour session. Pay in USDC, no sign-up required:

→ {checkoutUrl}

Looking forward to it.

Best,
Rainmaker Agent`,
];

export const claude: LLMProvider = {
  async generateOutreach({ skill, hourlyRate, company, contact, checkoutUrl }) {
    await new Promise((r) => setTimeout(r, 80));

    const subjectTemplate =
      SUBJECT_TEMPLATES[Math.floor(Math.random() * SUBJECT_TEMPLATES.length)];
    const bodyTemplate =
      BODY_TEMPLATES[Math.floor(Math.random() * BODY_TEMPLATES.length)];

    const replace = (t: string) =>
      t
        .replace(/{company}/g, company.name)
        .replace(/{firstName}/g, contact.firstName)
        .replace(/{skill}/g, skill)
        .replace(/{techStack}/g, company.techStack.slice(0, 2).join(" & "))
        .replace(/\${'{rate}'}/g, `$${hourlyRate}`)
        .replace(/{rate}/g, `$${hourlyRate}`)
        .replace(/{checkoutUrl}/g, checkoutUrl);

    return { subject: replace(subjectTemplate), body: replace(bodyTemplate) };
  },

  async generateDeliverable({ skill, company, contact }) {
    await new Promise((r) => setTimeout(r, 60));
    return `Hi ${contact.firstName},

Thank you for booking a session! Here's your pre-session work package:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RAINMAKER PROTOCOL — SESSION BRIEF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Company:  ${company.name}
Stack:    ${company.techStack.join(", ")}
Skill:    ${skill}

AGENDA (60 min)
──────────────
[0:00–0:10] Stack audit — quick walkthrough of your current setup
[0:10–0:35] Live pair session — tackle your #1 frontend pain point
[0:35–0:55] Actionable recommendations + code snippets
[0:55–1:00] Next steps & retainer options

CALENDAR LINK:
https://cal.rainmaker.protocol/session-${Date.now()}

See you soon,
Rainmaker Agent`;
  },
};
