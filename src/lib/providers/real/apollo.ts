import { callWrappedAPI } from "../../locus";
import type { CompanyProvider, Company, SearchFilters } from "../types";
import { uuid } from "../../utils";

// Maps a free-text skill to relevant Apollo search keywords
function deriveKeywords(skill: string): string[] {
  const s = skill.toLowerCase();
  const base = [skill];

  if (s.includes("full-stack") || s.includes("fullstack") || s.includes("full stack")) {
    return [...base, "React", "Node.js", "TypeScript"];
  }
  if (s.includes("frontend") || s.includes("front-end") || s.includes("react") || s.includes("vue") || s.includes("angular")) {
    return [...base, "React", "TypeScript", "frontend"];
  }
  if (s.includes("backend") || s.includes("back-end") || s.includes("api") || s.includes("node") || s.includes("python") || s.includes("django")) {
    return [...base, "Node.js", "Python", "API development"];
  }
  if (s.includes("mobile") || s.includes("ios") || s.includes("android") || s.includes("react native") || s.includes("flutter")) {
    return [...base, "React Native", "mobile", "iOS", "Android"];
  }
  if (s.includes("data") || s.includes("ml") || s.includes("machine learning") || s.includes("ai")) {
    return [...base, "Python", "data science", "machine learning"];
  }
  if (s.includes("devops") || s.includes("infra") || s.includes("cloud") || s.includes("kubernetes") || s.includes("aws")) {
    return [...base, "DevOps", "AWS", "Kubernetes", "infrastructure"];
  }
  if (s.includes("smart contract") || s.includes("solidity") || s.includes("web3") || s.includes("blockchain")) {
    return [...base, "blockchain", "Web3", "Solidity", "smart contracts"];
  }
  if (s.includes("design") || s.includes("ui/ux") || s.includes("ux") || s.includes("figma")) {
    return [...base, "UI/UX design", "Figma", "product design"];
  }
  // Generic fallback — use skill + hiring signals
  return [...base, "software development", "engineering", "hiring contractors"];
}

export const apollo: CompanyProvider = {
  async searchCompanies(filters: SearchFilters): Promise<Company[]> {
    // Derive search keywords from the skill to find genuinely relevant companies
    const skillKeywords = deriveKeywords(filters.skill);

    const res = await callWrappedAPI<{ organizations: Array<{
      id: string;
      name: string;
      primary_domain: string;
      industry: string;
      estimated_num_employees: number;
      technologies?: string[];
      city?: string;
      country?: string;
      short_description?: string;
    }> }>("apollo", "organization-search", {
      q_organization_keyword_tags: skillKeywords,
      num_employees_ranges: ["11,50", "51,200"],
      page: 1,
      per_page: 15,
    });

    if (!res.ok || !res.data) return [];

    return (res.data.organizations ?? []).map((org) => ({
      id: uuid(),
      name: org.name,
      domain: org.primary_domain ?? "",
      industry: org.industry ?? "Technology",
      size: `${org.estimated_num_employees ?? "?"}`,
      techStack: org.technologies?.slice(0, 5) ?? ["React"],
      location: [org.city, org.country].filter(Boolean).join(", "),
      description: org.short_description ?? `${org.name} — recruiting React developers.`,
    }));
  },
};
