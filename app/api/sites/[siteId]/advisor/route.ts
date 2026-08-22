import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { siteId } = await params; const site = await db.site.findFirst({ where: { id: siteId, userId: session.user.id }, include: { client: { include: { businessProfile: true } } } });
  if (!site) return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = z.object({ question: z.string().min(2).max(500) }).safeParse(await req.json()); if (!parsed.success) return Response.json({ error: "Question required" }, { status: 400 });
  const crawl = await db.crawl.findFirst({ where: { siteId, status: "COMPLETED" }, orderBy: { finishedAt: "desc" } });
  if (!crawl) return Response.json({ answer: "I do not have completed analysis data for this website yet. Run Analyze Website first." });
  const [health, findings, opportunities] = await Promise.all([
    db.healthScore.findUnique({ where: { crawlId: crawl.id } }),
    db.auditFinding.findMany({ where: { crawlId: crawl.id }, orderBy: { severity: "asc" }, take: 50 }),
    db.growthOpportunity.findMany({ where: { crawlId: crawl.id }, orderBy: { priorityScore: "desc" }, take: 5 }),
  ]);
  const context = { business: site.client ? { name: site.client.businessName, ...site.client.businessProfile } : null, website: site.domain, crawl: { pages: crawl.pagesFound, issues: crawl.issuesFound }, health, findings, opportunities };
  if (!process.env.OPENAI_API_KEY) {
    const top = opportunities[0]; return Response.json({ answer: top ? `Fix “${top.title}” first. It has priority ${top.priorityScore}/100 based on ${Array.isArray(top.evidence) ? top.evidence.length : "the stored"} verified findings. Recommended action: ${top.recommendedAction}` : "The analysis is complete, but it did not produce a prioritized opportunity. I do not have evidence to recommend an unverified change.", mode: "grounded-fallback" });
  }
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", instructions: "You are FFS Growth Advisor. Answer only from the supplied stored evidence. Never invent rankings, traffic, backlinks, or metrics. If evidence is absent, say so. You may analyze and recommend but never claim to execute changes.", input: `Website context:\n${JSON.stringify(context)}\n\nQuestion: ${parsed.data.question}` }) });
  if (!response.ok) return Response.json({ error: "Growth Advisor provider failed" }, { status: 502 });
  const result = await response.json() as { output_text?: string }; return Response.json({ answer: result.output_text || "No grounded answer was returned." });
}
