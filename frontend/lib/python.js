import { spawnSync } from "child_process";

/**
 * Resolve a Python binary that's actually executable in this environment.
 *
 * `py` (the Windows Python Launcher) isn't always on the Next.js dev server's
 * PATH even when it works from a user shell, and non-Windows machines need
 * `python3` or `python`. We detect at module load and cache the result.
 *
 * Set the `PYTHON` env var to force a specific interpreter (e.g. a full
 * Windows path like `C:\Python312\python.exe`).
 */
const CANDIDATES = [
  process.env.PYTHON,
  "py",
  "python",
  "python3",
  "C:\\Users\\jason\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
].filter(Boolean);

function detect() {
  for (const cmd of CANDIDATES) {
    try {
      const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
      if (res.status === 0) return cmd;
    } catch {
      // keep trying
    }
  }
  // Fall through to "py" so the error message is at least recognizable.
  return "py";
}

export const PYTHON_BIN = detect();

/** Quote a binary path for use inside an `exec` shell string (handles spaces). */
export function quotedPython() {
  return PYTHON_BIN.includes(" ") ? `"${PYTHON_BIN}"` : PYTHON_BIN;
}
