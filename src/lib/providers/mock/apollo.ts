import type { CompanyProvider, Company, SearchFilters } from "../types";
import { uuid } from "../../utils";

// 11 companies — index 6 is a pre-staged OFAC target
// The rest are real-looking B2B targets for a React/fullstack dev
const SEED_COMPANIES: Omit<Company, "id">[] = [
  {
    name: "Nexus Digital",
    domain: "nexusdigital.io",
    industry: "SaaS",
    size: "51-100",
    techStack: ["React", "TypeScript", "Node.js", "AWS"],
    location: "San Francisco, CA",
    description: "B2B workflow automation platform scaling their frontend team.",
  },
  {
    name: "Vertex Labs",
    domain: "vertexlabs.com",
    industry: "Developer Tools",
    size: "11-50",
    techStack: ["React", "GraphQL", "Python"],
    location: "Austin, TX",
    description: "Dev tooling startup rebuilding their dashboard in React 19.",
  },
  {
    name: "Stellar Systems",
    domain: "stellarsys.dev",
    industry: "FinTech",
    size: "101-250",
    techStack: ["React", "TypeScript", "AWS", "PostgreSQL"],
    location: "New York, NY",
    description: "Payments infrastructure company modernising legacy UI.",
  },
  {
    name: "Orbit Commerce",
    domain: "orbitcommerce.io",
    industry: "E-Commerce",
    size: "11-50",
    techStack: ["Next.js", "React", "Shopify"],
    location: "Chicago, IL",
    description: "Headless commerce agency actively hiring contractors.",
  },
  {
    name: "Quantum Build",
    domain: "quantumbuild.com",
    industry: "Construction Tech",
    size: "51-100",
    techStack: ["React", "Django", "Mapbox"],
    location: "Denver, CO",
    description: "PropTech platform migrating Angular frontend to React.",
  },
  {
    name: "Cipher Works",
    domain: "cipherworks.io",
    industry: "Cybersecurity",
    size: "11-50",
    techStack: ["React", "Rust", "Tailwind"],
    location: "Seattle, WA",
    description: "Security dashboard startup seeking React component specialist.",
  },
  // ── OFAC TARGET ──────────────────────────────────────────────────────────
  {
    name: "Volkov Syndicate LLC",
    domain: "volkovsyndicate.ru",
    industry: "Trading",
    size: "unknown",
    techStack: ["React"],
    location: "Unknown",
    description: "Entity flagged by OFAC SDN list — sanctions screening will block.",
  },
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "Prism Software",
    domain: "prismsoftware.net",
    industry: "HealthTech",
    size: "51-100",
    techStack: ["React", "Go", "HIPAA-compliant infra"],
    location: "Boston, MA",
    description: "Clinical workflow platform rewriting patient portal in React.",
  },
  {
    name: "Echo Systems",
    domain: "echosystems.io",
    industry: "IoT",
    size: "11-50",
    techStack: ["React", "Java", "MQTT"],
    location: "Austin, TX",
    description: "IoT analytics dashboard actively seeking UI contractors.",
  },
  {
    name: "Flux Digital",
    domain: "fluxdigital.com",
    industry: "Media & Entertainment",
    size: "101-250",
    techStack: ["React", "Swift", "Firebase"],
    location: "Los Angeles, CA",
    description: "Content platform scaling their React web app.",
  },
  {
    name: "Synapse Digital",
    domain: "synapsedigital.co",
    industry: "AI/ML",
    size: "11-50",
    techStack: ["React", "Python", "FastAPI"],
    location: "San Francisco, CA",
    description: "AI startup building user-facing React apps for their models.",
  },
];

export const apollo: CompanyProvider = {
  async searchCompanies(_filters: SearchFilters): Promise<Company[]> {
    await new Promise((r) => setTimeout(r, 80)); // simulate network
    return SEED_COMPANIES.map((c) => ({ ...c, id: uuid() }));
  },
};
