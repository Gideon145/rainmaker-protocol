import { callWrappedAPI } from "../../locus";
import { uuid } from "../../utils";
import type { Company } from "../types";

interface BraveWebResult {
  url: string;
  title: string;
  description: string;
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
}

const TECH_KEYWORDS = [
  "React", "TypeScript", "Node.js", "Python", "Vue", "Angular", "Next.js",
  "AWS", "Docker", "Kubernetes", "GraphQL", "Swift", "Flutter", "Solidity",
  "Go", "Rust", "Java", "PHP", "Ruby", "Rails", "Django", "FastAPI",
];

function extractDomain(rawUrl: string): string {
  return rawUrl
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/$/, "")
    .split("/")[0]
    .toLowerCase();
}

/**
 * Discover additional companies via Locus-wrapped Brave web search.
 * Used as a second discovery pass after Tavily.
 */
export async function searchBrave(query: string): Promise<Company[]> {
  const res = await callWrappedAPI<BraveResponse>("brave", "web/search", {
    q: query,
    count: 8,
  });

  if (!res.ok || !res.data?.web?.results) return [];

  const companies: Company[] = [];
  for (const result of res.data.web.results) {
    const domain = extractDomain(result.url);
    if (
      !domain ||
      domain.includes("linkedin") ||
      domain.includes("github") ||
      domain.includes("twitter") ||
      domain.includes("crunchbase") ||
      !domain.includes(".")
    ) {
      continue;
    }

    const lower = result.description.toLowerCase();
    const techStack = TECH_KEYWORDS.filter((t) => lower.includes(t.toLowerCase()));

    companies.push({
      id: uuid(),
      name: result.title.split(" - ")[0].split(" | ")[0].trim(),
      domain,
      industry: "Technology",
      size: "11-200 employees",
      techStack,
      location: "Remote / Global",
      description: result.description.slice(0, 250),
    });
  }

  return companies;
}
