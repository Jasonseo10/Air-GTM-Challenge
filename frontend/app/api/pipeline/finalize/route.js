import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";

const ROOT = path.resolve(process.cwd(), "..");

/**
 * POST /api/pipeline/finalize
 *
 * Accepts review decisions and runs the rest of the pipeline
 * (dedupe with decisions applied -> enrich -> score -> emit).
 *
 * Body (JSON): {
 *   csv_path?: string,
 *   approved_merges: string[],
 *   rejected_merges: string[],
 *   restored_drops: object[],
 *   seed?: number,
 * }
 */
export async function POST(request) {
  const body = await request.json();
  const csvPath = body.csv_path || path.join(ROOT, "data", "messy_leads.csv");
  const seed = body.seed || 42;

  const decisions = JSON.stringify({
    approved_merges: body.approved_merges || [],
    rejected_merges: body.rejected_merges || [],
    restored_drops: body.restored_drops || [],
  });

  return new Promise((resolve) => {
    const proc = spawn("python", [
      "finalize_helper.py",
      csvPath,
      "--today", "2026-04-15",
      "--seed", String(seed),
    ], { cwd: ROOT });

    let stdout = "";
    let stderr = "";
    proc.stdin.write(decisions);
    proc.stdin.end();
    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });

    proc.on("close", async (code) => {
      if (code !== 0) {
        resolve(NextResponse.json(
          { error: `Pipeline exited with code ${code}`, stderr },
          { status: 500 }
        ));
        return;
      }

      try {
        const leadsRaw = await readFile(path.join(ROOT, "output", "clean_leads.json"), "utf-8");
        const leads = JSON.parse(leadsRaw);

        let sfCsv = "";
        let sfJson = null;
        try {
          sfCsv = await readFile(path.join(ROOT, "output", "salesforce_leads.csv"), "utf-8");
          const sfRaw = await readFile(path.join(ROOT, "output", "salesforce_leads.json"), "utf-8");
          sfJson = JSON.parse(sfRaw);
        } catch { /* ok */ }

        const stats = JSON.parse(stdout.trim());
        resolve(NextResponse.json({ leads, salesforce_csv: sfCsv, salesforce_json: sfJson, stats }));
      } catch (err) {
        resolve(NextResponse.json(
          { error: err.message, stdout, stderr },
          { status: 500 }
        ));
      }
    });
  });
}
