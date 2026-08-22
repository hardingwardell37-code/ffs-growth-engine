import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { CrawlButton } from "@/components/sites/action-buttons";
import { GrowthAdvisor } from "@/components/sites/growth-advisor";

export default async function SiteOverviewPage({ params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth(); const { siteId } = await params;
  const site = await db.site.findFirst({ where: { id: siteId, userId: session?.user?.id }, include: { client: { include: { businessProfile: true } } } });
  if (!site) redirect("/sites");
  const crawl = await db.crawl.findFirst({ where: { siteId }, orderBy: { startedAt: "desc" } });
  const [health, findings, opportunities, jobs] = crawl ? await Promise.all([
    db.healthScore.findUnique({ where: { crawlId: crawl.id } }),
    db.auditFinding.findMany({ where: { crawlId: crawl.id }, orderBy: { severity: "asc" }, take: 25 }),
    db.growthOpportunity.findMany({ where: { crawlId: crawl.id }, orderBy: { priorityScore: "desc" }, take: 5 }),
    db.analysisJob.findMany({ where: { crawlId: crawl.id }, orderBy: { createdAt: "asc" } }),
  ]) : [null, [], [], []];
  const critical = findings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH").length;
  const warnings = findings.filter((f) => f.severity === "MEDIUM" || f.severity === "LOW").length;
  return <div>
    <PageHeader eyebrow="FFS Website Growth Engine" title={site.client?.businessName || site.domain} description={`${site.domain}${site.client?.businessProfile ? ` · ${site.client.businessProfile.primaryService} · ${site.client.businessProfile.city}, ${site.client.businessProfile.state}` : ""}`} actions={<CrawlButton siteId={siteId} />} />
    {crawl && <p className="mb-4 text-xs text-muted-foreground">Status: {jobs.find((j) => !["COMPLETE", "FAILED"].includes(j.status))?.status || crawl.status} · Last analyzed {crawl.finishedAt?.toLocaleString() || "in progress"}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Website Health", health ? `${health.overall}/100` : "—"], ["Critical Issues", critical], ["Warnings", warnings], ["Opportunities", opportunities.length], ["Pages Crawled", crawl?.pagesFound || 0]].map(([label, value]) => <div key={String(label)} className="panel p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
    {health && <section className="panel mt-6 p-5"><h2 className="font-heading text-lg font-semibold">Website Health</h2><div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">{[["SEO", health.seo], ["Technical", health.technical], ["Performance", health.performance], ["Accessibility", health.accessibility], ["Site Integrity", health.siteIntegrity]].map(([label, value]) => <div key={String(label)}><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}</div></section>}
    <section className="mt-6"><h2 className="font-heading text-lg font-semibold">Top Growth Opportunities</h2><div className="mt-3 grid gap-3">{opportunities.length ? opportunities.map((o) => <article key={o.id} className="panel p-5"><div className="flex justify-between gap-3"><h3 className="font-semibold">{o.title}</h3><span className="text-xs font-semibold text-signal">{o.priority} · {o.priorityScore}</span></div><p className="mt-2 text-sm text-muted-foreground">{o.description}</p><p className="mt-3 text-sm"><strong>Recommended action:</strong> {o.recommendedAction}</p></article>) : <div className="panel p-5 text-sm text-muted-foreground">Run Analyze Website to generate priorities from real findings.</div>}</div></section>
    <section className="mt-6"><h2 className="font-heading text-lg font-semibold">Technical Findings</h2><div className="mt-3 panel divide-y divide-border">{findings.length ? findings.map((f) => <div key={f.id} className="p-4"><div className="flex justify-between gap-3"><p className="font-medium">{f.title}</p><span className="text-xs">{f.severity}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{f.category} · {f.source} · {f.url || "Sitewide"}</p></div>) : <p className="p-5 text-sm text-muted-foreground">No normalized findings stored yet.</p>}</div></section>
    <div className="mt-6"><GrowthAdvisor siteId={siteId} /></div>
    <section className="panel mt-6 p-5"><h2 className="font-heading text-lg font-semibold">Search Performance</h2><p className="mt-2 text-sm text-muted-foreground">{site.gscProperty ? "Google Search Console connected." : "Search Console Not Connected"}</p></section>
  </div>;
}
