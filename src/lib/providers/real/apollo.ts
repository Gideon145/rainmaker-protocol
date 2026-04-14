import { callWrappedAPI } from "../../locus";
import type { CompanyProvider, Company, SearchFilters } from "../types";
import { uuid } from "../../utils";

export const apollo: CompanyProvider = {
  async searchCompanies(filters: SearchFilters): Promise<Company[]> {
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
      q_organization_keyword_tags: [filters.skill, "React", "TypeScript"],
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
