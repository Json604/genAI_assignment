import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";
import { ROOT } from "../config.js";

export const DEFAULT_CDP_URL = "http://127.0.0.1:9222";

/**
 * @param {string} cdpUrl
 */
export async function isCdpAvailable(cdpUrl) {
  const base = normalizeCdpUrl(cdpUrl);
  try {
    const res = await fetch(`${base}/json/version`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Start agent Chrome if CDP is not listening (runs scripts/chrome-agent-cdp.sh).
 * @param {string} cdpUrl
 */
export async function ensureCdpRunning(cdpUrl = DEFAULT_CDP_URL) {
  const url = normalizeCdpUrl(cdpUrl);
  if (await isCdpAvailable(url)) return url;

  const script = path.join(ROOT, "scripts/chrome-agent-cdp.sh");
  await new Promise((resolve, reject) => {
    const child = spawn("bash", [script], { stdio: "ignore", detached: true });
    child.on("error", reject);
    child.unref();
    resolve(undefined);
  });

  for (let i = 0; i < 40; i += 1) {
    await sleep(500);
    if (await isCdpAvailable(url)) return url;
  }

  throw new Error(
    `CDP did not start at ${url}. Run manually: npm run chrome:cdp`,
  );
}

/**
 * Attach to real Chrome with remote debugging (agent profile).
 *
 * @param {string} [cdpUrl]
 */
export async function connectOverCdp(cdpUrl = DEFAULT_CDP_URL) {
  const url = await ensureCdpRunning(cdpUrl);

  // noDefaults: true — skip Browser.setDownloadBehavior (unsupported on CDP attach; Chrome 136+)
  const browser = await chromium.connectOverCDP(url, { noDefaults: true });
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("CDP connected but no browser context found.");
  }

  let page = pickUsablePage(context);
  if (!page) {
    page = await context.newPage();
  }

  return { browser, context, page, mode: "cdp", cdpUrl: url };
}

/** @param {import('playwright').BrowserContext} context */
function pickUsablePage(context) {
  const pages = context.pages().filter((p) => !p.isClosed() && !isInternalUrl(p.url()));
  return pages.at(-1) ?? context.pages().filter((p) => !p.isClosed()).at(-1) ?? null;
}

/** @param {string} raw */
function isInternalUrl(raw) {
  const u = (raw || "").trim();
  return (
    !u ||
    u.startsWith("chrome://") ||
    u.startsWith("devtools://") ||
    u.startsWith("chrome-extension://")
  );
}

/** @param {string} raw */
function normalizeCdpUrl(raw) {
  return (raw || DEFAULT_CDP_URL).trim().replace(/\/$/, "");
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}