import { callWrappedAPI } from "../../locus";

interface FirecrawlScrapeResult {
  markdown?: string;
  metadata?: {
    title?: string;
    description?: string;
  };
}

const TECH_KEYWORDS = [
  "React", "TypeScript", "Node.js", "Python", "Vue", "Angular", "Next.js",
  "AWS", "Docker", "Kubernetes", "GraphQL", "Swift", "Flutter", "Solidity",
  "Go", "Rust", "Java", "PHP", "Ruby", "Rails", "Django", "FastAPI",
];

/**
 * Scrape a company homepage via Locus-wrapped Firecrawl.
 * Returns enriched description and detected tech stack, or null if unavailable.
 */
export async function scrapeCompanyPage(
  domain: string,
): Promise<{ description: string; techStack: string[] } | null> {
  const res = await callWrappedAPI<FirecrawlScrapeResult>("firecrawl", "scrape", {
    url: `https://${domain}`,
    formats: ["markdown"],
    onlyMainContent: true,
  });

  if (!res.ok || !res.data) return null;

  const content = res.data.markdown ?? "";
  if (!content) return null;

  const description = (
    res.data.metadata?.description ?? content.slice(0, 250)
  ).slice(0, 250);

  const lower = content.toLowerCase();
  const techStack = TECH_KEYWORDS.filter((t) => lower.includes(t.toLowerCase()));

  return { description, techStack };
}
