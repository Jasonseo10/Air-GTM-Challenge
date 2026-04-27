import { NextResponse } from "next/server";
import { readFile, writeFile, access } from "fs/promises";
import path from "path";

const ROOT = path.resolve(process.cwd(), "..");

/**
 * POST /api/outbound/rollback — flip the active scoring rules pointer to a
 * prior version that already exists in config/. Appends a history entry so
 * the audit trail stays linear.
 *
 * Body: { version_path: "config/outbound_scoring_rules.json", note?: string }
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const targetPath = body?.version_path;
  if (!targetPath || typeof targetPath !== "string") {
    return NextResponse.json(
      { error: "version_path is required (e.g. 'config/outbound_scoring_rules.json')." },
      { status: 400 }
    );
  }
  if (!targetPath.startsWith("config/") || !targetPath.endsWith(".json")) {
    return NextResponse.json(
      { error: "version_path must be a config/*.json path." },
      { status: 400 }
    );
  }

  const pointerPath = path.join(ROOT, "config", "outbound_scoring_rules.pointer.json");
  const targetFull = path.join(ROOT, targetPath);

  try {
    await access(targetFull);
  } catch {
    return NextResponse.json(
      { error: `Target version file not found: ${targetPath}` },
      { status: 404 }
    );
  }

  let pointer;
  try {
    pointer = JSON.parse(await readFile(pointerPath, "utf-8"));
  } catch (err) {
    return NextResponse.json(
      { error: "Could not read pointer file", detail: err.message },
      { status: 500 }
    );
  }

  if (pointer.active_version === targetPath) {
    return NextResponse.json(
      { error: `${targetPath} is already the active version.` },
      { status: 400 }
    );
  }

  pointer.active_version = targetPath;
  pointer.history = pointer.history || [];
  pointer.history.push({
    version_path: targetPath,
    promoted_at: new Date().toISOString(),
    promoted_by: "dashboard",
    note: body.note || `rolled back to ${targetPath.split("/").pop()}`,
  });
  await writeFile(pointerPath, JSON.stringify(pointer, null, 2), "utf-8");

  return NextResponse.json({
    rolled_back_to: targetPath,
    pointer,
  });
}
