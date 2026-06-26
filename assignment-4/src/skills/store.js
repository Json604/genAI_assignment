import { mkdir, readFile, writeFile, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { SKILLS_DIR } from "../config.js";

const USAGE_FILE = ".usage.json";
const ARCHIVE_DIR = ".archive";

export class SkillStore {
  constructor() {
    this.skillsDir = SKILLS_DIR;
  }

  async ensureSeed() {
    await mkdir(this.skillsDir, { recursive: true });
    const seedPath = path.join(this.skillsDir, "web-automation", "SKILL.md");
    try {
      await stat(seedPath);
    } catch {
      await this.create("web-automation", DEFAULT_WEB_AUTOMATION_SKILL, { seeded: true });
    }
  }

  async list() {
    await mkdir(this.skillsDir, { recursive: true });
    const entries = await readdir(this.skillsDir, { withFileTypes: true });
    const skills = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const skillPath = path.join(this.skillsDir, entry.name, "SKILL.md");
      try {
        const content = await readFile(skillPath, "utf8");
        const description = parseFrontmatterDescription(content) || entry.name;
        skills.push({ name: entry.name, description });
      } catch {
        // skip invalid
      }
    }
    return skills;
  }

  async readSkill(name) {
    const skillPath = path.join(this.skillsDir, name, "SKILL.md");
    return readFile(skillPath, "utf8");
  }

  async create(name, content, { seeded = false } = {}) {
    validateName(name);
    const dir = path.join(this.skillsDir, name);
    await mkdir(dir, { recursive: true });
    const skillPath = path.join(dir, "SKILL.md");
    await writeFile(skillPath, content.trim() + "\n", "utf8");
    await trackUsage(name, { created_by: seeded ? "seed" : "agent" });
    return { success: true, action: "create", name };
  }

  async patch(name, oldString, newString) {
    const skillPath = path.join(this.skillsDir, name, "SKILL.md");
    const content = await readFile(skillPath, "utf8");
    if (!content.includes(oldString)) {
      return { success: false, error: "old_string not found in SKILL.md" };
    }
    await writeFile(skillPath, content.replace(oldString, newString), "utf8");
    await trackUsage(name, { patch: true });
    return { success: true, action: "patch", name };
  }

  async writeFile(name, filePath, fileContent) {
    validateName(name);
    const safe = sanitizeRelativePath(filePath);
    const full = path.join(this.skillsDir, name, safe);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFileAtomic(full, fileContent);
    await trackUsage(name, { patch: true });
    return { success: true, action: "write_file", name, file_path: safe };
  }

  async delete(name) {
    const dir = path.join(this.skillsDir, name);
    const archiveRoot = path.join(this.skillsDir, ARCHIVE_DIR);
    await mkdir(archiveRoot, { recursive: true });
    const dest = path.join(archiveRoot, `${name}-${Date.now()}`);
    await rename(dir, dest).catch(() => {
      throw new Error(`Skill "${name}" not found`);
    });
    return { success: true, action: "delete", name, archived_to: dest };
  }

  /** Build compact index for system prompt (frozen snapshot). */
  async buildIndex() {
    const skills = await this.list();
    if (!skills.length) return "";
    const lines = skills.map((s) => `- **${s.name}**: ${s.description}`);
    return `## Skill library\n${lines.join("\n")}\n\nLoad site-specific playbooks from references/ via skill_manage when needed.`;
  }
}

const DEFAULT_WEB_AUTOMATION_SKILL = `---
name: web-automation
description: General web browsing — snapshots, refs, search, bot-wall fallbacks
---

# Web Automation

## When to use
Any task that requires browsing, clicking, searching, or extracting from websites.

## Core workflow
1. browser_search for queries (DuckDuckGo default — Google blocks bots)
2. browser_navigate for direct URLs
3. Act via refs (@eN) from snapshots — never guess coordinates
4. browser_vision only when a11y tree is insufficient

## Bot walls
If bot_wall.blocked is true, switch search engine immediately. Do not retry Google.

## Site references
Store site-specific flows in references/<domain>.md via skill_manage write_file.
`;

function validateName(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error("Skill name must be lowercase alphanumeric with hyphens");
  }
}

function sanitizeRelativePath(filePath) {
  const normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("file_path must stay inside the skill directory");
  }
  return normalized;
}

async function writeFileAtomic(filePath, content) {
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, filePath);
}

function parseFrontmatterDescription(content) {
  const match = content.match(/^---\n[\s\S]*?description:\s*["']?([^"'\n]+)["']?[\s\S]*?---/m);
  return match?.[1]?.trim();
}

async function trackUsage(name, { created_by, patch } = {}) {
  const usagePath = path.join(SKILLS_DIR, USAGE_FILE);
  /** @type {Record<string, object>} */
  let usage = {};
  try {
    usage = JSON.parse(await readFile(usagePath, "utf8"));
  } catch {
    usage = {};
  }
  const now = new Date().toISOString();
  const entry = usage[name] || { use_count: 0, patch_count: 0, state: "active" };
  if (patch) entry.patch_count = (entry.patch_count || 0) + 1;
  entry.last_used_at = now;
  if (created_by) entry.created_by = created_by;
  usage[name] = entry;
  await writeFile(usagePath, JSON.stringify(usage, null, 2), "utf8");
}

/** @type {SkillStore | null} */
let singleton = null;

export async function getSkillStore() {
  if (!singleton) {
    singleton = new SkillStore();
    await singleton.ensureSeed();
  }
  return singleton;
}