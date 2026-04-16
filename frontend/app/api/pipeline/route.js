import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

// Pipeline lives one level up from the frontend/ directory.
const ROOT = path.resolve(process.cwd(), "..");

/**
 * GET /api/pipeline — return existing pipeline output (if any).
 */
export async function GET() {
  try {
    const raw = await readFile(path.join(ROOT, "output", "clean_leads.json"), "utf-8");
    const leads = JSON.parse(raw);
    return NextResponse.json({ leads });
  } catch {
    return NextResponse.json({ leads: [], empty: true });
  }
}

/**
 * POST /api/pipeline — run the pipeline, optionally with an uploaded CSV.
 *
 * Body (JSON): { seed?: number, today?: string }
 * Body (FormData): file (CSV), seed?, today?
 */
export async function POST(request) {
  try {
  let csvPath = path.join(ROOT, "data", "messy_leads.csv");
  let seed = 42;
  let today = null;

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    seed = Number(formData.get("seed")) || 42;
    today = formData.get("today") || null;

    if (file && file.size > 0) {
      const uploadDir = path.join(ROOT, "data");
      await mkdir(uploadDir, { recursive: true });
      const bytes = Buffer.from(await file.arrayBuffer());
      csvPath = path.join(uploadDir, "uploaded_leads.csv");
      await writeFile(csvPath, bytes);
    }
  } else {
    try {
      const body = await request.json();
      seed = body.seed || 42;
      today = body.today || null;
    } catch {
      // Empty body is fine — use defaults.
    }
  }

  const todayArg = today ? `--today ${today}` : "";
  const cmd = `python run_pipeline.py --input "${csvPath}" --output-dir "${path.join(ROOT, "output")}" --rules "${path.join(ROOT, "config", "scoring_rules.json")}" --seed ${seed} ${todayArg}`;

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: ROOT,
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    });

    // Read the enriched output.
    const leadsRaw = await readFile(path.join(ROOT, "output", "clean_leads.json"), "utf-8");
    const leads = JSON.parse(leadsRaw);

    // Read Salesforce outputs for export.
    let sfCsv = "";
    let sfJson = null;
    try {
      sfCsv = await readFile(path.join(ROOT, "output", "salesforce_leads.csv"), "utf-8");
      const sfRaw = await readFile(path.join(ROOT, "output", "salesforce_leads.json"), "utf-8");
      sfJson = JSON.parse(sfRaw);
    } catch {
      // SF outputs may not exist yet.
    }

    return NextResponse.json({
      leads,
      salesforce_csv: sfCsv,
      salesforce_json: sfJson,
      stats: {
        total: leads.length,
        enriched: leads.filter((l) => l.enrichment_status === "ok").length,
      },
      stdout: stdout.trim(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message, stderr: err.stderr || "" },
      { status: 500 }
    );
  }
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Pipeline route crashed" },
      { status: 500 }
    );
  }
}
