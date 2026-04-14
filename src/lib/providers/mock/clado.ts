import type { ContactProvider, Company, Contact } from "../types";

// Realistic contact data keyed by domain
const CONTACTS: Record<string, Omit<Contact, "email" | "emailReputation">> = {
  "nexusdigital.io":    { firstName: "Sarah",   lastName: "Chen",      title: "VP of Engineering",      linkedinUrl: "https://linkedin.com/in/sarah-chen" },
  "vertexlabs.com":     { firstName: "Marcus",  lastName: "Webb",      title: "CTO",                    linkedinUrl: "https://linkedin.com/in/marcus-webb" },
  "stellarsys.dev":     { firstName: "Priya",   lastName: "Sharma",    title: "Head of Product Eng.",   linkedinUrl: "https://linkedin.com/in/priya-sharma" },
  "orbitcommerce.io":   { firstName: "James",   lastName: "Liu",       title: "Lead Developer",         linkedinUrl: "https://linkedin.com/in/james-liu-dev" },
  "quantumbuild.com":   { firstName: "Elena",   lastName: "Rodriguez", title: "Director of Engineering",linkedinUrl: "https://linkedin.com/in/elena-rodriguez" },
  "cipherworks.io":     { firstName: "Amir",    lastName: "Hassan",    title: "Head of Frontend",       linkedinUrl: "https://linkedin.com/in/amir-hassan" },
  "volkovsyndicate.ru": { firstName: "Unknown", lastName: "Unknown",   title: "Unknown",                linkedinUrl: undefined },
  "prismsoftware.net":  { firstName: "David",   lastName: "Park",      title: "Engineering Manager",    linkedinUrl: "https://linkedin.com/in/david-park" },
  "echosystems.io":     { firstName: "Sophie",  lastName: "Martin",    title: "CTO",                    linkedinUrl: "https://linkedin.com/in/sophie-martin" },
  "fluxdigital.com":    { firstName: "Carlos",  lastName: "Vega",      title: "VP Engineering",         linkedinUrl: "https://linkedin.com/in/carlos-vega" },
  "synapsedigital.co":  { firstName: "Rachel",  lastName: "Kim",       title: "Lead Engineer",          linkedinUrl: "https://linkedin.com/in/rachel-kim" },
};

export const clado: ContactProvider = {
  async enrichContact(company: Company): Promise<Contact | null> {
    await new Promise((r) => setTimeout(r, 60));
    const base = CONTACTS[company.domain];
    if (!base) return null;
    return {
      ...base,
      email: `${base.firstName.toLowerCase()}@${company.domain}`,
      emailReputation: company.domain === "volkovsyndicate.ru" ? "invalid" : "valid",
    };
  },
};
