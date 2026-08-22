import type { NormalizedFinding } from "@/lib/audit/provider";

const impact = { CRITICAL: 100, HIGH: 80, MEDIUM: 55, LOW: 30, INFO: 10 } as const;

export function buildOpportunities(findings: NormalizedFinding[]) {
  const groups = new Map<string, NormalizedFinding[]>();
  for (const finding of findings.filter((item) => item.severity !== "INFO")) {
    const key = `${finding.category}:${finding.url || "sitewide"}`;
    groups.set(key, [...(groups.get(key) || []), finding]);
  }
  return [...groups.values()].map((evidence) => {
    const maxImpact = Math.max(...evidence.map((item) => impact[item.severity]));
    const confidenceScore = Math.min(100, 65 + evidence.length * 7);
    const effortScore = evidence.length > 4 ? 70 : 45;
    const priorityScore = Math.round(maxImpact * 0.55 + confidenceScore * 0.3 + (100 - effortScore) * 0.15);
    const category = evidence[0].category;
    const page = evidence[0].url;
    return {
      title: `${page ? "Improve" : "Strengthen"} ${category.toLowerCase().replace("_", " ")}${page ? ` on ${new URL(page).pathname || "/"}` : " across the website"}`,
      type: category,
      description: evidence.map((item) => item.title).slice(0, 4).join(", "),
      evidence: evidence.map(({ ruleId, source, url, title }) => ({ ruleId, source, url, title })),
      impactScore: maxImpact, confidenceScore, effortScore, priorityScore,
      priority: priorityScore >= 85 ? "CRITICAL" as const : priorityScore >= 70 ? "HIGH" as const : priorityScore >= 45 ? "MEDIUM" as const : "LOW" as const,
      recommendedAction: evidence.map((item) => item.remediation).filter(Boolean).slice(0, 3).join(" ") || `Resolve the ${evidence.length} verified ${category.toLowerCase()} finding${evidence.length === 1 ? "" : "s"} shown in the evidence.`,
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 20);
}
