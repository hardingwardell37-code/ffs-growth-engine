import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import os from "node:os";
import { normalizeSquirrelscan } from "./normalize";
import type { AuditProvider } from "./provider";

const execFileAsync = promisify(execFile);

export class SquirrelscanProvider implements AuditProvider {
  async runAudit(websiteUrl: string) {
    const binary = process.env.SQUIRRELSCAN_BIN || path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "squirrel.cmd" : "squirrel");
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
