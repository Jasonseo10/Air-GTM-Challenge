import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const execAsync = promisify(exec);
const ROOT = path.resolve(process.cwd(), "..");

/**
 * POST /api/pipeline/review
 *
 * Runs ingest + normalize, identifies duplicates and dropped rows
 * WITHOUT merging or enriching. Returns data for user review.
 */
export async function POST(request) {
  let csvPath = path.join(ROOT, "data", "messy_leads.csv");

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (file && file.size > 0) {
      const uploadDir = path.join(ROOT, "data");
      await mkdir(uploadDir, { recursive: true });
      const bytes = Buffer.from(await file.arrayBuffer());
      csvPath = path.join(uploadDir, "uploaded_leads.csv");
      await writeFile(csvPath, bytes);
    }
  }

  const cmd = `python review_helper.py "${csvPath}" --today 2026-04-15`;

  try {
    const { stdout } = await execAsync(cmd, { cwd: ROOT, timeout: 30_000 });
    const result = JSON.parse(stdout.trim());
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err.message, stderr: err.stderr || "" },
      { status: 500 }
    );
  }
}
