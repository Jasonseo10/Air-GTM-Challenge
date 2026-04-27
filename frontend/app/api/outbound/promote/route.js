import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const ROOT = path.resolve(process.cwd(), "..");

/**
 * POST /api/outbound/promote — promote the proposed rules from the latest
 * weight_updates.json. Writes a versioned file (config/outbound_scoring_rules.vN.json),
 * updates the pointer to point at it, and appends a history entry.
 *
 * Body: { note?: string }
 */
export async function POST(request) {
  let note = "promoted from dashboard";
  try {
    const body = await request.json();
    if (body && body.note) note = body.note;
  } catch {
    // No body is fine.
  }

  const pointerPath = path.join(ROOT, "config", "outbound_scoring_rules.pointer.json");
  const updatesPath = path.join(ROOT, "output", "weight_updates.json");

  let updates;
  let pointer;
  try {
    updates = JSON.parse(await readFile(updatesPath, "utf-8"));
    pointer = JSON.parse(await readFile(pointerPath, "utf-8"));
  } catch (err) {
    return NextResponse.json(
      { error: "Run the feedback step before promoting", detail: err.message },
      { status: 400 }
    );
  }

  const proposed = updates.proposed_rules;
  if (!proposed) {
    return NextResponse.json(
      { error: "No proposed rules in weight_updates.json — feedback step produced no eligible deltas." },
      { status: 400 }
    );
  }

  const version = proposed.version || ((pointer.history || []).length + 1);
  const fname = `outbound_scoring_rules.v${version}.json`;
  const fullPath = path.join(ROOT, "config", fname);
  await writeFile(fullPath, JSON.stringify(proposed, null, 2), "utf-8");

  const rel = `config/${fname}`;
  pointer.active_version = rel;
  pointer.history = pointer.history || [];
  pointer.history.push({
    version_path: rel,
    promoted_at: new Date().toISOString(),
    promoted_by: "dashboard",
    note,
  });
  await writeFile(pointerPath, JSON.stringify(pointer, null, 2), "utf-8");

  return NextResponse.json({
    promoted_version: rel,
    pointer,
  });
}
