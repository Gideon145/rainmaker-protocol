import { callWrappedAPI } from "../../locus";
import type { ContactProvider, Company, Contact } from "../types";

interface HunterEmail {
  value: string;
  confidence: number;
  first_name: string;
  last_name: string;
  position: string;
  seniority: string;
  department: string;
  linkedin: string | null;
}

interface HunterDomainSearchData {
  domain: string;
  organization: string;
  pattern: string;
  emails: HunterEmail[];
}

function pickBestContact(emails: HunterEmail[]): HunterEmail | null {
  if (!emails.length) return null;

  // Prefer engineering/IT decision-makers
  const engineering = emails.filter(
    e =>
      ["engineering", "it"].includes(e.department?.toLowerCase() ?? "") &&
      ["senior", "executive", "manager"].includes(e.seniority?.toLowerCase() ?? ""),
  );
  if (engineering.length) return engineering[0];

  // Fall back to any management/executive with a full name
  const senior = emails.filter(
    e =>
      ["senior", "executive", "manager"].includes(e.seniority?.toLowerCase() ?? "") &&
      e.first_name &&
      e.last_name,
  );
  if (senior.length) return senior[0];

  // Last resort: first result with a name
  return emails.find(e => e.first_name && e.last_name) ?? null;
}

async function searchDomain(
  domain: string,
  seniority?: string,
  department?: string,
): Promise<HunterEmail[] | null> {
  const body: Record<string, unknown> = { domain, limit: 5 };
  if (seniority) body.seniority = seniority;
  if (department) body.department = department;

  const res = await callWrappedAPI<{ data: HunterDomainSearchData }>(
    "hunter",
    "domain-search",
    body,
  );

  if (!res.ok || !res.data?.data?.emails?.length) return null;
  return res.data.data.emails;
}

export const hunter: ContactProvider = {
  async enrichContact(company: Company): Promise<Contact | null> {
    // First try: targeted engineering department search
    let emails = await searchDomain(
      company.domain,
      "senior,executive,manager",
      "engineering,it,management",
    );

    // Second try: any seniority, any department
    if (!emails) {
      emails = await searchDomain(company.domain);
    }

    if (!emails) return null;

    const person = pickBestContact(emails);
    if (!person?.first_name || !person?.last_name) return null;

    return {
      firstName: person.first_name,
      lastName: person.last_name,
      title: person.position ?? "Engineer",
      email: person.value,
      linkedinUrl: person.linkedin ?? undefined,
      emailReputation: person.confidence >= 80 ? "valid" : "unknown",
    };
  },
};
