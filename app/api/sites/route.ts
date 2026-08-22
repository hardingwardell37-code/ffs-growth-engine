import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertPublicDomain } from "@/lib/crawler/engine";
import { syncGSCDataForSite } from "@/lib/workers/gsc-sync";
import { ensureDefaultAlerts } from "@/lib/alerts/evaluate";
import { z } from "zod";

const onboardingSchema = z.object({
  businessName: z.string().min(1).max(120), websiteUrl: z.string().url(),
  industry: z.string().min(1).max(100), primaryService: z.string().min(1).max(120),
  city: z.string().min(1).max(100), state: z.string().min(1).max(100),
  competitors: z.array(z.string().url()).max(3).optional(),
});

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sites = await db.site.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        domain: true,
        gscProperty: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            keywords: true,
            crawls: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(sites);
  } catch (error) {
    console.error("Error fetching sites:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch sites",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = onboardingSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "Invalid business information" }, { status: 400 });
    const { businessName, websiteUrl, industry, primaryService, city, state, competitors } = parsed.data;
    const domain = new URL(websiteUrl).hostname;

    // Reject domains that resolve to private/internal IPs (SSRF protection)
    try {
      await assertPublicDomain(domain);
    } catch {
      return Response.json(
        { error: "Domain must resolve to a public IP address" },
        { status: 400 }
      );
    }

    // Check if site already exists
    const existing = await db.site.findUnique({
      where: {
        userId_domain: {
          userId: session.user.id,
          domain,
        },
      },
    });

    if (existing) {
      return Response.json(
        { error: "Site already exists" },
        { status: 409 }
      );
    }

    // Create the site
    const site = await db.$transaction(async (tx) => {
      const organization = await tx.organization.upsert({ where: { ownerId_name: { ownerId: session.user.id, name: "FFS" } }, update: {}, create: { ownerId: session.user.id, name: "FFS" } });
      const client = await tx.client.create({ data: { organizationId: organization.id, businessName, businessProfile: { create: { industry, primaryService, city, state, competitors: competitors || [] } } } });
      return tx.site.create({ data: { userId: session.user.id, clientId: client.id, domain }, select: { id: true, domain: true, gscProperty: true, createdAt: true } });
    });

    await ensureDefaultAlerts(session.user.id, site.id);

    // Kick off initial GSC sync (don't block the response)
    if (site.gscProperty) void syncGSCDataForSite(session.user.id, site.id, 28).catch((err) => console.error("Initial GSC sync failed:", err));

    return Response.json(site, { status: 201 });
  } catch (error) {
    console.error("Error creating site:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to create site",
      },
      { status: 500 }
    );
  }
}
