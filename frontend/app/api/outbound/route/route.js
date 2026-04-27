import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import path from "path";

const execAsync = promisify(exec);
const ROOT = path.resolve(process.cwd(), "..");

/**
 * GET /api/outbound/route — return existing routing artifacts (if any).
 */
export async function GET() {
  try {
    const [routedRaw, plays, scoredRaw, teamRaw] = await Promise.all([
      readFile(path.join(ROOT, "output", "routed_leads.json"), "utf-8"),
      readFile(path.join(ROOT, "output", "account_plays.json"), "utf-8"),
      readFile(path.join(ROOT, "output", "outbound_scored_leads.json"), "utf-8"),
      readFile(path.join(ROOT, "config", "sales_team.json"), "utf-8"),
    ]);
    return NextResponse.json({
      routed_leads: JSON.parse(routedRaw),
      account_plays: JSON.parse(plays),
      scored_leads: JSON.parse(scoredRaw),
      team: JSON.parse(teamRaw),
    });
  } catch {
    return NextResponse.json({
      routed_leads: [], account_plays: [], scored_leads: [], team: { reps: [] },
      empty: true,
    });
  }
}

/**
 * POST /api/outbound/route — re-run the routing pipeline.
 */
export async function POST() {
  const cmd = `py run_outbound.py --mode route`;
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: ROOT, timeout: 120_000, maxBuffer: 50 * 1024 * 1024,
    });
    const [routedRaw, plays, scoredRaw, teamRaw] = await Promise.all([
      readFile(path.join(ROOT, "output", "routed_leads.json"), "utf-8"),
      readFile(path.join(ROOT, "output", "account_plays.json"), "utf-8"),
      readFile(path.join(ROOT, "output", "outbound_scored_leads.json"), "utf-8"),
      readFile(path.join(ROOT, "config", "sales_team.json"), "utf-8"),
    ]);
    return NextResponse.json({
      routed_leads: JSON.parse(routedRaw),
      account_plays: JSON.parse(plays),
      scored_leads: JSON.parse(scoredRaw),
      team: JSON.parse(teamRaw),
      stdout: stdout.trim(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message, stderr: err.stderr || "" },
      { status: 500 }
    );
  }
}
