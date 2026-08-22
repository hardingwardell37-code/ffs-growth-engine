export type NormalizedFinding = {
  source: "CRAWLSEO" | "SQUIRRELSCAN";
  ruleId: string;
  category: "SEO" | "TECHNICAL" | "PERFORMANCE" | "ACCESSIBILITY" | "SITE_INTEGRITY";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  url?: string;
  title: string;
  description: string;
  evidence?: Record<string, unknown>;
  remediation?: string;
};

export interface AuditProvider {
  runAudit(websiteUrl: string): Promise<NormalizedFinding[]>;
}
