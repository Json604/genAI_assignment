import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(ROOT, "data");
export const MEMORIES_DIR = path.join(DATA_DIR, "memories");
export const SKILLS_DIR = path.join(DATA_DIR, "skills");

export function loadConfig() {
  return {
    llmProvider: (process.env.LLM_PROVIDER || "gemini").toLowerCase(),
    llmModel: process.env.LLM_MODEL || defaultModel(process.env.LLM_PROVIDER || "gemini"),
    maxIterations: Number(process.env.MAX_ITERATIONS || 60),
    snapshotCharLimit: Number(process.env.SNAPSHOT_CHAR_LIMIT || 8000),
    browserHeadless: process.env.BROWSER_HEADLESS === "true",
    browserSlowMo: Number(process.env.BROWSER_SLOW_MO || 0),
    browserCdpUrl: (process.env.BROWSER_CDP_URL || "").trim() || null,
    browserCdpDataDir: process.env.BROWSER_CDP_DATA_DIR || path.join(DATA_DIR, "chrome-cdp-profile"),
    memoryNudgeInterval: Number(process.env.MEMORY_NUDGE_INTERVAL || 3),
    backgroundReview: process.env.BACKGROUND_REVIEW !== "false",
  };
}

function defaultModel(provider) {
  const defaults = {
    gemini: "gemini-3.1-flash-lite",
    openai: "gpt-4o-mini",
    anthropic: "claude-sonnet-4-20250514",
    openrouter: "google/gemini-3.1-flash-lite",
  };
  return defaults[(provider || "gemini").toLowerCase()] || defaults.gemini;
}