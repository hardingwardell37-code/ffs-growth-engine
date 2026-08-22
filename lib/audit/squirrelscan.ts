import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import os from "node:os";
import { normalizeSquirrelscan } from "./normalize";
import type { AuditProvider } from "./provider";

const execFileAsync = promisify(execFile);
const apiBase = "https://api.squirrelscan.com/v1";

type CloudRun = {
  id: string;
  status: string;
  error?: { message?: string } | string;
};

async function squirrelRequest(pathname: string, apiKey: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Squirrelscan API request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

async function runCloudAudit(websiteUrl: string, apiKey: string) {
  const created = (await squirrelRequest("/agent-runs", apiKey, {
    method: "POST",
    body: JSON.stringify({
      url: websiteUrl,
      trigger: "api",
      mode: "audit",
      config: JSON.stringify({ coverageMode: "quick", maxPages: 200 }),
    }),
  })) as CloudRun;

  const deadline = Date.now() + 10 * 60_000;
  let run = created;
  while (!["complete", "completed", "succeeded", "failed", "cancelled"].includes(run.status.toLowerCase())) {
    if (Date.now() >= deadline) throw new Error("Squirrelscan cloud audit timed out");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    run = (await squirrelRequest(`/agent-runs/${created.id}`, apiKey)) as CloudRun;
  }
  if (!["complete", "completed", "succeeded"].includes(run.status.toLowerCase())) {
    const message = typeof run.error === "string" ? run.error : run.error?.message;
    throw new Error(message || `Squirrelscan cloud audit ${run.status}`);
  }

  const response = await squirrelRequest(`/agent-runs/${created.id}/report`, apiKey);
  const report = response.report || response.data || response;
  return normalizeSquirrelscan(report);
}

export class SquirrelscanProvider implements AuditProvider {
  async runAudit(websiteUrl: string) {
    const apiKey = process.env.SQUIRRELSCAN_API_KEY;
    if (apiKey) return runCloudAudit(websiteUrl, apiKey);

    const binary = process.env.SQUIRRELSCAN_BIN || path.join(process.cwd(), "node_modules", "squirrelscan", "bin", process.platform === "win32" ? "squirrel.exe" : "squirrel");
    const { stdout } = await execFileAsync(binary, ["audit", websiteUrl, "--format", "json", "--max-pages", "200"], {
      timeout: 10 * 60_000,
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, NO_TELEMETRY: "1", LOCALAPPDATA: process.env.SQUIRRELSCAN_DATA_DIR || path.join(os.tmpdir(), "ffs-squirrelscan"), XDG_DATA_HOME: process.env.SQUIRRELSCAN_DATA_DIR || path.join(os.tmpdir(), "ffs-squirrelscan") },
    });
    const jsonStart = stdout.indexOf('{\n  "meta"');
    if (jsonStart < 0) throw new Error("Squirrelscan did not return JSON output");
    return normalizeSquirrelscan(JSON.parse(stdout.slice(jsonStart)));
  }
}

export const runAudit = (websiteUrl: string) => new SquirrelscanProvider().runAudit(websiteUrl);
