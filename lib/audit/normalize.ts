import type { NormalizedFinding } from "./provider";

type RawIssue = Record<string, unknown>;

const categoryMap: Record<string, NormalizedFinding["category"]> = {
  seo: "SEO", "core-seo": "SEO", content: "SEO", "structured-data": "SEO",
  crawlability: "TECHNICAL", links: "TECHNICAL", mobile: "TECHNICAL", "url-structure": "TECHNICAL",
  performance: "PERFORMANCE", accessibility: "ACCESSIBILITY",
  security: "SITE_INTEGRITY", integrity: "SITE_INTEGRITY", "site-integrity": "SITE_INTEGRITY", "legal-compliance": "SITE_INTEGRITY",
};

function severity(value: unknown): NormalizedFinding["severity"] {
  const v = String(value || "info").toUpperCase();
  if (["ERROR", "CRITICAL"].includes(v)) return "CRITICAL";
  if (v === "HIGH") return "HIGH";
  if (["WARN", "WARNING", "MEDIUM"].includes(v)) return "MEDIUM";
  if (v === "LOW") return "LOW";
  return "INFO";
}

export function normalizeSquirrelscan(payload: unknown): NormalizedFinding[] {
  const root = (payload && typeof payload === "object" ? payload : {}) as RawIssue;
  const candidates = [root.issues, root.findings, (root.audit as RawIssue | undefined)?.issues].find(Array.isArray) as RawIssue[] | undefined;
  return (candidates || []).map((item, index) => {
    const rawCategory = String(item.category || item.group || "technical").toLowerCase().replace(/\s+/g, "-");
    const ruleId = String(item.ruleId || item.rule || item.id || `squirrel-${index + 1}`);
    const title = String(item.title || item.name || item.message || ruleId);
    return {
      source: "SQUIRRELSCAN",
      ruleId,
      category: categoryMap[rawCategory] || "TECHNICAL",
      severity: severity(item.severity || item.level),
      url: typeof item.url === "string" ? item.url : Array.isArray((item.checks as RawIssue[] | undefined)?.[0]?.affectedPages) ? String(((item.checks as RawIssue[])[0].affectedPages as unknown[])[0] || "") || undefined : undefined,
      title,
      description: String(item.description || item.message || title),
      evidence: { raw: item },
      remediation: typeof item.remediation === "string" ? item.remediation : typeof item.solution === "string" ? item.solution : typeof item.fix === "string" ? item.fix : undefined,
    };
  });
}
