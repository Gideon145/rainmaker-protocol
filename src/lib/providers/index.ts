// ─── Provider swap gate ───────────────────────────────────────────────────
// Set USE_MOCK=true in .env.local to run entirely on mock data.
// Set USE_MOCK=false to use real Locus API calls (requires credits).

import type {
  CompanyProvider,
  ContactProvider,
  ComplianceProvider,
  LLMProvider,
  MailProvider,
} from "./types";

import { apollo as mockApollo }    from "./mock/apollo";
import { clado as mockClado }      from "./mock/clado";
import { ofac as mockOfac }        from "./mock/ofac";
import { claude as mockClaude }    from "./mock/claude";
import { agentmail as mockMail }   from "./mock/agentmail";

import { apollo as realApollo }    from "./real/apollo";
import { clado as realClado }      from "./real/clado";
import { ofac as realOfac }        from "./real/ofac";
import { claude as realClaude }    from "./real/claude";
import { agentmail as realMail }   from "./real/agentmail";

const USE_MOCK = process.env.USE_MOCK !== "false"; // default ON for safety

export const companies: CompanyProvider   = USE_MOCK ? mockApollo : realApollo;
export const contacts: ContactProvider   = USE_MOCK ? mockClado  : realClado;
export const compliance: ComplianceProvider = USE_MOCK ? mockOfac   : realOfac;
export const llm: LLMProvider           = USE_MOCK ? mockClaude : realClaude;
export const mail: MailProvider         = USE_MOCK ? mockMail   : realMail;

export { USE_MOCK };
