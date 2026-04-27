import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import path from "path";

const execAsync = promisify(exec);
const ROOT = path.resolve(process.cwd(), "..");

/**
 * GET /api/outbound/feedback — return existing weight_updates / rep_affinity.
 */
export async function GET() {
  try {
    const [weights, affinity, pointer] = await Promise.all([
      readFile(path.join(ROOT, "output", "weight_updates.json"), "utf-8"),
      readFile(path.join(ROOT, "output", "rep_affinity.json"), "utf-8"),
      readFile(path.join(ROOT, "config", "outbound_scoring_rules.pointer.json"), "utf-8"),
    ]);
    return NextResponse.json({
      weight_updates: JSON.parse(weights),
      rep_affinity: JSON.parse(affinity),
      pointer: JSON.parse(pointer),
    });
  } catch {
    return NextResponse.json({
      weight_updates: { updates: [] },
      rep_affinity: {},
      pointer: { active_version: "", history: [] },
      empty: true,
    });
  }
}

/**
 * POST /api/outbound/feedback — re-run the closed-loop refit.
 */
export async function POST() {
  const cmd = `py run_outbound.py --mode feedback`;
  try {
    const { stdout } = await execAsync(cmd, {
      cwd: ROOT, timeout: 120_000, maxBuffer: 50 * 1024 * 1024,
    });
    const [weights, affinity, pointer] = await Promise.all([
      readFile(path.join(ROOT, "output", "weight_updates.json"), "utf-8"),
      readFile(path.join(ROOT, "output", "rep_affinity.json"), "utf-8"),
      readFile(path.join(ROOT, "config", "outbound_scoring_rules.pointer.json"), "utf-8"),
    ]);
    return NextResponse.json({
      weight_updates: JSON.parse(weights),
      rep_affinity: JSON.parse(affinity),
      pointer: JSON.parse(pointer),
      stdout: stdout.trim(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message, stderr: err.stderr || "" },
      { status: 500 }
    );
  }
}
