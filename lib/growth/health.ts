import type { NormalizedFinding } from "@/lib/audit/provider";

export const SEVERITY_WEIGHTS = { CRITICAL: 12, HIGH: 8, MEDIUM: 4, LOW: 2, INFO: 0 } as const;
const categories = ["SEO", "TECHNICAL", "PERFORMANCE", "ACCESSIBILITY", "SITE_INTEGRITY"] as const;

export function calculateHealth(findings: NormalizedFinding[]) {
  const categoryScore = (category: typeof categories[number]) => {
    const relevant = findings.filter((finding) => finding.category === category);
    const penalty = relevant.reduce((total, finding) => total + SEVERITY_WEIGHTS[finding.severity], 0);
    return Math.max(0, 100 - Math.min(100, penalty));
  };
  const scores = Object.fromEntries(categories.map((category) => [category, categoryScore(category)])) as Record<typeof categories[number], number>;
  return {
    overall: Math.round(categories.reduce((sum, category) => sum + scores[category], 0) / categories.length),
    seo: scores.SEO, technical: scores.TECHNICAL, performance: scores.PERFORMANCE,
    accessibility: scores.ACCESSIBILITY, siteIntegrity: scores.SITE_INTEGRITY,
    methodology: { version: 1, severityWeights: SEVERITY_WEIGHTS, categoryWeight: "equal" },
  };
}
