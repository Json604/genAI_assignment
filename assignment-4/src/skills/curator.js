import { readFile, writeFile, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { SKILLS_DIR } from "../config.js";

const STATE_FILE = ".curator_state.json";
const USAGE_FILE = ".usage.json";
const ARCHIVE_DIR = ".archive";
const STALE_DAYS = 30;

export async function runCuratorIfDue() {
  const statePath = path.join(SKILLS_DIR, STATE_FILE);
  /** @type {{ last_run_at?: string }} */
  let state = {};
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    state = {};
  }

  const lastRun = state.last_run_at ? new Date(state.last_run_at).getTime() : 0;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - lastRun < weekMs) return null;

  const archived = await archiveStaleSkills();
  state.last_run_at = new Date().toISOString();
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
  return archived;
}

async function archiveStaleSkills() {
  const usagePath = path.join(SKILLS_DIR, USAGE_FILE);
  /** @type {Record<string, { last_used_at?: string; state?: string }>} */
  let usage = {};
  try {
    usage = JSON.parse(await readFile(usagePath, "utf8"));
  } catch {
    return [];
  }

  const archived = [];
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;

  for (const [name, meta] of Object.entries(usage)) {
    if (name === "web-automation") continue;
    const last = meta.last_used_at ? new Date(meta.last_used_at).getTime() : 0;
    if (last && last < cutoff && meta.state !== "archived") {
      const src = path.join(SKILLS_DIR, name);
      const dest = path.join(SKILLS_DIR, ARCHIVE_DIR, `${name}-${Date.now()}`);
      try {
        await rename(src, dest);
        meta.state = "archived";
        archived.push(name);
      } catch {
        // skill dir may not exist
      }
    }
  }

  if (archived.length) {
    await writeFile(usagePath, JSON.stringify(usage, null, 2), "utf8");
  }
  return archived;
}