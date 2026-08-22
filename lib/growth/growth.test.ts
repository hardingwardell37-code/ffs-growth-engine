import { describe, expect, it } from "vitest";
import { normalizeSquirrelscan } from "@/lib/audit/normalize";
import { calculateHealth } from "./health";
import { buildOpportunities } from "./opportunities";

describe("growth engine", () => {
  const findings = normalizeSquirrelscan({ issues: [
    { id: "seo/title", category: "seo", severity: "high", url: "https://example.com/service", title: "Weak title", remediation: "Write a specific service title." },
    { id: "schema/local", category: "structured data", severity: "warning", url: "https://example.com/service", title: "Missing schema" },
  ] });
  it("normalizes provider output without leaking its raw shape", () => { expect(findings[0]).toMatchObject({ source: "SQUIRRELSCAN", ruleId: "seo/title", category: "SEO", severity: "HIGH" }); });
  it("calculates transparent bounded scores from actual severity", () => { const health = calculateHealth(findings); expect(health.overall).toBeLessThan(100); expect(health.seo).toBe(88); expect(health.methodology.severityWeights.HIGH).toBe(8); });
  it("groups related evidence into ranked opportunities", () => { const opportunities = buildOpportunities(findings); expect(opportunities).toHaveLength(1); expect(opportunities[0].evidence).toHaveLength(2); expect(opportunities[0].recommendedAction).toContain("specific service title"); });
});
