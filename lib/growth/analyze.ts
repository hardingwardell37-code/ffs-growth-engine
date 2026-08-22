import { db } from "@/lib/db";
import { runSiteCrawl } from "@/lib/crawler/engine";
import { runAudit } from "@/lib/audit/squirrelscan";
import type { NormalizedFinding } from "@/lib/audit/provider";
import { calculateHealth } from "./health";
import { buildOpportunities } from "./opportunities";
import type { Prisma } from "@prisma/client";

const categoryByRule: Record<string, NormalizedFinding["category"]> = {
  SLOW_PAGE: "PERFORMANCE", LARGE_PAGE: "PERFORMANCE", MIXED_CONTENT: "SITE_INTEGRITY",
};

async function setJob(id: string, status: "CRAWLING" | "AUDITING" | "ANALYZING" | "COMPLETE" | "FAILED", error?: string) {
  await db.analysisJob.update({ where: { id }, data: { status, ...(status === "COMPLETE" || status === "FAILED" ? { finishedAt: new Date() } : {}), ...(error ? { error } : {}) } });
}

export async function runWebsiteAnalysis(siteId: string, domain: string, crawlId: string, maxPages = 200) {
  const jobs = await db.$transaction([
    db.analysisJob.create({ data: { siteId, crawlId, type: "CRAWL_WEBSITE" } }),
    db.analysisJob.create({ data: { siteId, crawlId, type: "RUN_AUDIT" } }),
    db.analysisJob.create({ data: { siteId, crawlId, type: "CALCULATE_HEALTH" } }),
    db.analysisJob.create({ data: { siteId, crawlId, type: "BUILD_OPPORTUNITIES" } }),
  ]);
  try {
    await setJob(jobs[0].id, "CRAWLING");
    await runSiteCrawl(siteId, domain, Math.min(500, Math.max(1, maxPages)), crawlId);
    await setJob(jobs[0].id, "COMPLETE");

    const crawlIssues = await db.crawlIssue.findMany({ where: { crawlId } });
    const crawlFindings: NormalizedFinding[] = crawlIssues.filter((issue) => (issue.details as { kind?: string } | null)?.kind !== "crawl_summary").map((issue) => ({
      source: "CRAWLSEO", ruleId: issue.type,
      category: categoryByRule[issue.type] || "SEO",
      severity: issue.severity === "CRITICAL" ? "CRITICAL" : issue.severity === "WARNING" ? "MEDIUM" : "INFO",
      url: issue.url, title: issue.message, description: issue.message,
      evidence: (issue.details || {}) as Record<string, unknown>,
      remediation: (issue.details as { howToFix?: string } | null)?.howToFix,
    }));

    await setJob(jobs[1].id, "AUDITING");
    const websiteUrl = domain.startsWith("http") ? domain : `https://${domain}`;
    const squirrelFindings = await runAudit(websiteUrl);
    await setJob(jobs[1].id, "COMPLETE");
    const findings = [...crawlFindings, ...squirrelFindings];
    if (findings.length) await db.auditFinding.createMany({ data: findings.map((finding) => ({ ...finding, siteId, crawlId, evidence: (finding.evidence || {}) as Prisma.InputJsonValue })) });

    await setJob(jobs[2].id, "ANALYZING");
    const health = calculateHealth(findings);
    await db.healthScore.create({ data: { siteId, crawlId, ...health } });
    await db.crawl.update({ where: { id: crawlId }, data: { healthScore: health.overall } });
    await setJob(jobs[2].id, "COMPLETE");

    await setJob(jobs[3].id, "ANALYZING");
    const opportunities = buildOpportunities(findings);
    if (opportunities.length) await db.growthOpportunity.createMany({ data: opportunities.map((opportunity) => ({ ...opportunity, evidence: opportunity.evidence as Prisma.InputJsonValue, siteId, crawlId })) });
    await setJob(jobs[3].id, "COMPLETE");
    return { crawlId, health, opportunities: opportunities.slice(0, 5) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    await Promise.all(jobs.map((job) => db.analysisJob.updateMany({ where: { id: job.id, status: { not: "COMPLETE" } }, data: { status: "FAILED", error: message, finishedAt: new Date() } })));
    await db.crawl.update({ where: { id: crawlId }, data: { status: "FAILED", finishedAt: new Date() } }).catch(() => undefined);
    throw error;
  }
}
