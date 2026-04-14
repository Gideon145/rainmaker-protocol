import { callWrappedAPI } from "../../locus";
import type { CompanyProvider, Company, SearchFilters } from "../types";
import { uuid } from "../../utils";

interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score: number;
}

function extractDomain(rawUrl: string): string {
  return rawUrl
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/$/, "")
    .split("/")[0]
    .toLowerCase();
}

function parseCompanyFromResult(result: TavilyResult): Company | null {
  const content = result.content ?? "";

  // Primary: structured "Website: https://..." line in LinkedIn content
  const websiteMatch = content.match(/Website:\s*(https?:\/\/[^\s\n,]+)/i);

  // Fallback: derive a domain from a Crunchbase URL pattern in content
  // e.g. "Crunchbase Url: https://crunchbase.com/organization/acme" → "acme.com" (skip — not reliable)
  // Fallback 2: use the result URL itself if it's a company homepage (not linkedin)
  let rawDomain: string | null = null;

  if (websiteMatch) {
    rawDomain = websiteMatch[1];
  } else if (result.url && !result.url.includes("linkedin.com") && !result.url.includes("crunchbase")) {
    rawDomain = result.url;
  } else {
    return null;
  }

  const domain = extractDomain(rawDomain);

  // Discard non-company domains
  if (
    !domain ||
    domain === "n/a" ||
    domain.includes("linkedin") ||
    domain.includes("crunchbase") ||
    domain.includes("github") ||
    domain.includes("twitter") ||
    domain.includes("facebook") ||
    !domain.includes(".")
  ) {
    return null;
  }

  const industryMatch = content.match(/Industry:\s*([^\n]+)/i);
  const industry = industryMatch?.[1]?.trim() ?? "Technology";

  const sizeMatch = content.match(/Company size:\s*([^\n]+)/i);
  const size = sizeMatch?.[1]?.trim() ?? "11-200 employees";

  const techKeywords = [
    "React", "TypeScript", "Node.js", "Python", "Vue", "Angular", "Next.js",
    "AWS", "Docker", "Kubernetes", "GraphQL", "Swift", "Flutter", "Solidity",
    "Go", "Rust", "Java", "PHP", "Ruby", "Rails", "Django", "FastAPI",
  ];
  const techStack = techKeywords.filter(t =>
    content.toLowerCase().includes(t.toLowerCase()),
  );

  const overviewMatch = content.match(/Overview:\s*([^\n]+)/i);
  const description = (overviewMatch?.[1] ?? result.title).slice(0, 250);

  const name = result.title.split(" - ")[0].split(" | ")[0].trim();

  return {
    id: uuid(),
    name,
    domain,
    industry,
    size,
    techStack,
    location: "Remote / Global",
    description,
  };
}

export const tavily: CompanyProvider = {
  async searchCompanies(filters: SearchFilters): Promise<Company[]> {
    const queries = [
      `${filters.skill} software development agency startup company hiring engineers`,
      `companies that need ${filters.skill} developers outsource contractors`,
    ];

    const companies: Company[] = [];
    const seenDomains = new Set<string>();

    for (const query of queries) {
      const res = await callWrappedAPI<{ results: TavilyResult[] }>("tavily", "search", {
        query,
        max_results: 8,
        search_depth: "basic",
      });

      if (!res.ok || !res.data?.results) continue;

      for (const result of res.data.results) {
        const company = parseCompanyFromResult(result);
        if (company && !seenDomains.has(company.domain)) {
          seenDomains.add(company.domain);
          companies.push(company);
        }
      }

      if (companies.length >= 12) break;
    }

    return companies.slice(0, 12);
  },
};
