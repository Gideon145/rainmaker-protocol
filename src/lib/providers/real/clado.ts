import { callWrappedAPI } from "../../locus";
import type { ContactProvider, Company, Contact } from "../types";

export const clado: ContactProvider = {
  async enrichContact(company: Company): Promise<Contact | null> {
    // Use Clado to find a decision-maker at the company
    const res = await callWrappedAPI<{
      results: Array<{
        first_name: string;
        last_name: string;
        title: string;
        email?: string;
        linkedin_url?: string;
      }>;
    }>("clado", "search", {
      company_domain: company.domain,
      seniority: ["director", "vp", "c_suite", "manager"],
      departments: ["engineering", "product"],
      limit: 1,
    });

    if (!res.ok || !res.data?.results?.length) return null;

    const person = res.data.results[0];
    return {
      firstName: person.first_name,
      lastName: person.last_name,
      title: person.title,
      email: person.email ?? `${person.first_name.toLowerCase()}@${company.domain}`,
      linkedinUrl: person.linkedin_url,
      emailReputation: "unknown",
    };
  },
};
