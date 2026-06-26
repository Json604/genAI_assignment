import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { MEMORIES_DIR } from "../config.js";

const ENTRY_DELIMITER = "\n§\n";
const LIMITS = { memory: 2200, user: 1375 };

export class MemoryStore {
  constructor() {
    /** @type {string[]} */
    this.memoryEntries = [];
    /** @type {string[]} */
    this.userEntries = [];
    /** @type {{ memory: string; user: string }} */
    this._snapshot = { memory: "", user: "" };
  }

  async loadFromDisk() {
    await mkdir(MEMORIES_DIR, { recursive: true });
    this.memoryEntries = await readEntries(path.join(MEMORIES_DIR, "MEMORY.md"));
    this.userEntries = await readEntries(path.join(MEMORIES_DIR, "USER.md"));
    this._snapshot = {
      memory: renderBlock("Agent memory", this.memoryEntries),
      user: renderBlock("User profile", this.userEntries),
    };
  }

  getSnapshot() {
    return { ...this._snapshot };
  }

  usage(target) {
    const entries = target === "user" ? this.userEntries : this.memoryEntries;
    const chars = entries.join(ENTRY_DELIMITER).length;
    return { chars, limit: LIMITS[target], entries: [...entries] };
  }

  async add(target, content) {
    const text = (content || "").trim();
    if (!text) return { success: false, error: "content is required" };

    const entries = this.getEntries(target);
    const projected = [...entries, text].join(ENTRY_DELIMITER);
    if (projected.length > LIMITS[target]) {
      return {
        success: false,
        error: `${target} memory at ${projected.length}/${LIMITS[target]} chars. Consolidate with replace/remove first.`,
        ...this.usage(target),
      };
    }

    entries.push(text);
    await this.persist(target);
    return { success: true, action: "add", target, ...this.usage(target) };
  }

  async replace(target, oldText, content) {
    const entries = this.getEntries(target);
    const idx = entries.findIndex((e) => e.includes(oldText));
    if (idx === -1) {
      return { success: false, error: "old_text not found in any entry", ...this.usage(target) };
    }

    const next = [...entries];
    next[idx] = content.trim();
    const projected = next.join(ENTRY_DELIMITER);
    if (projected.length > LIMITS[target]) {
      return { success: false, error: `Replace would exceed ${LIMITS[target]} char limit` };
    }

    if (target === "user") this.userEntries = next;
    else this.memoryEntries = next;

    await this.persist(target);
    return { success: true, action: "replace", target, ...this.usage(target) };
  }

  async remove(target, oldText) {
    const entries = this.getEntries(target);
    const idx = entries.findIndex((e) => e.includes(oldText));
    if (idx === -1) {
      return { success: false, error: "old_text not found in any entry" };
    }

    entries.splice(idx, 1);
    await this.persist(target);
    return { success: true, action: "remove", target, ...this.usage(target) };
  }

  /** @param {'memory'|'user'} target */
  getEntries(target) {
    return target === "user" ? this.userEntries : this.memoryEntries;
  }

  /** @param {'memory'|'user'} target */
  async persist(target) {
    const file = target === "user" ? "USER.md" : "MEMORY.md";
    const entries = this.getEntries(target);
    const body = entries.join(ENTRY_DELIMITER);
    const filePath = path.join(MEMORIES_DIR, file);
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, body, "utf8");
    await rename(tmp, filePath);
  }
}

function renderBlock(title, entries) {
  if (!entries.length) return "";
  return `## ${title}\n${entries.map((e) => `- ${e}`).join("\n")}`;
}

async function readEntries(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split(ENTRY_DELIMITER)
      .map((e) => e.trim())
      .filter(Boolean);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

/** @type {MemoryStore | null} */
let singleton = null;

export async function getMemoryStore() {
  if (!singleton) {
    singleton = new MemoryStore();
    await singleton.loadFromDisk();
  }
  return singleton;
}