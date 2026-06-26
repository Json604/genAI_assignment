import { chromium } from "playwright";
import { captureSnapshot } from "./snapshot.js";
import { compressSnapshotForTask } from "./compress-task.js";
import { RefRegistry } from "./ref-registry.js";
import { BrowserSupervisor } from "./supervisor.js";
import { detectBotWall } from "./bot-detect.js";

import { applyStealth, CHROME_ARGS, USER_AGENT } from "./stealth.js";
import { buildSearchUrl, defaultSearchEngines } from "./search.js";
import { loadConfig } from "../config.js";
import { connectOverCdp } from "./cdp.js";
import { waitForLazyContent, waitForNetworkSettle } from "./wait.js";
import { TabManager } from "./tabs.js";

export class BrowserSession {
  constructor() {
    /** @type {import('playwright').Browser | null} */
    this.browser = null;
    /** @type {import('playwright').BrowserContext | null} */
    this.context = null;
    /** @type {import('playwright').Page | null} */
    this.page = null;
    this.registry = new RefRegistry();
    this.supervisor = new BrowserSupervisor();
    this.userTask = null;
    this.tabs = new TabManager();
    this._browserMode = "playwright";
  }

  async start() {
    if (this.browser) return;

    const config = loadConfig();
    const cdpUrl = process.env.BROWSER_CDP_URL?.trim();

    if (cdpUrl) {
      let attached;
      try {
        attached = await connectOverCdp(cdpUrl);
      } catch (err) {
        this.browser = null;
        this.context = null;
        this.page = null;
        throw err;
      }
      this.browser = attached.browser;
      this.context = attached.context;
      this.page = attached.page;
      this._browserMode = "cdp";
      this.tabs = new TabManager();
      const pages = this.context.pages();
      let activeTabId = null;
      pages.forEach((page, index) => {
        const tabId = `tab${index + 1}`;
        const url = page.url();
        this.tabs.register(page, {
          id: tabId,
          label: url && url !== "about:blank" ? url : tabId,
        });
        if (page === attached.page) activeTabId = tabId;
      });
      if (!activeTabId) {
        activeTabId = this.tabs.register(attached.page, { id: "tab1", label: "main" });
      } else {
        this.tabs.activate(activeTabId);
      }
      this.page = attached.page;
      await this.focusPage(this.page);
    } else {
      this.browser = await chromium.launch({
        headless: config.browserHeadless,
        slowMo: config.browserSlowMo,
        args: CHROME_ARGS,
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent: USER_AGENT,
        locale: "en-US",
        timezoneId: "America/New_York",
        extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
      });
      await applyStealth(this.context);
      this.page = await this.context.newPage();
      this._browserMode = "playwright";
      this.tabs.register(this.page, { id: "tab1", label: "main" });
    }

    this.supervisor.bindContext(this.context);
    this.supervisor.attach(this.page);
  }

  async stop() {
    this.supervisor.detach();
    if (this._browserMode === "cdp") {
      // Disconnect Playwright only — keep the user's Chrome window and profile open.
      await this.browser?.close().catch(() => {});
    } else {
      await this.context?.close().catch(() => {});
      await this.browser?.close().catch(() => {});
    }
    this.browser = null;
    this.context = null;
    this.page = null;
    this.tabs = new TabManager();
    this._browserMode = "playwright";
  }

  /** @param {string | null} task */
  setUserTask(task) {
    this.userTask = task;
  }

  /** Lightweight status for CLI progress lines (no snapshot). */
  getBriefStatus() {
    const url = this.page?.url() || "";
    let host = "";
    try {
      host = url ? new URL(url).hostname : "";
    } catch {
      host = url.slice(0, 40);
    }
    return {
      active_tab: this.tabs.activeTabId,
      url,
      host,
      tab_count: this.tabs.list().length,
    };
  }

  /** @param {string} tabId */
  async switchTab(tabId) {
    const tab = this.tabs.activate(tabId);
    this.page = tab.page;
    await this.focusPage(this.page);
    this.registry.clear();
    this.supervisor.attach(this.page);
    return tab;
  }

  /** Bring tab to front in the real browser window (CDP: visible tab switch). */
  async focusPage(page = this.page) {
    if (!page || page.isClosed()) return;
    await page.bringToFront().catch(() => {});
  }

  async newTab(url, { label } = {}) {
    await this.start();
    if (!this.context) throw new Error("Browser not started");

    const page = await this.context.newPage();
    const tabId = this.tabs.register(page, { label: label || url || "new tab" });
    this.page = page;
    await this.focusPage(page);
    this.registry.clear();
    this.supervisor.attach(page);

    if (url) {
      const normalized = normalizeUrl(url);
      await page.goto(normalized, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await waitForNetworkSettle(page, 1500);
      this.tabs.updateUrl(tabId, normalized);
    }

    return this.buildPageResponse({
      full: false,
      extra: {
        new_tab: tabId,
        tabs: this.tabs.list(),
        ...(url ? { navigated_to: normalizeUrl(url) } : {}),
      },
    });
  }

  syncTabs() {
    if (this.context) {
      this.tabs.syncFromContext(this.context, this.page);
    }
  }

  listTabs() {
    this.syncTabs();
    return {
      success: true,
      tabs: this.tabs.list(),
      active_tab: this.tabs.activeTabId,
      browser_mode: this._browserMode,
    };
  }

  async navigate(url, { newTab = false } = {}) {
    if (newTab) {
      return this.newTab(url);
    }

    await this.start();
    const page = this.page;
    if (!page) throw new Error("Browser not started");

    await this.focusPage(page);
    const normalized = normalizeUrl(url);
    await page.goto(normalized, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForNetworkSettle(page, 2500);
    await waitForLazyContent(page, this.registry, { maxRounds: 2 });

    const active = this.tabs.getActive();
    if (active) this.tabs.updateUrl(active.id, normalized);

    return this.buildPageResponse({
      full: false,
      extra: {
        navigated_to: normalized,
        browser_mode: this._browserMode,
        active_tab: this.tabs.activeTabId,
        tabs: this.tabs.list(),
      },
    });
  }

  async search(query, { engine = "duckduckgo", tryFallbacks = true } = {}) {
    const engines = tryFallbacks
      ? [engine, ...defaultSearchEngines().filter((e) => e !== engine)]
      : [engine];

    /** @type {Record<string, unknown> | null} */
    let lastResult = null;

    for (const eng of engines) {
      const { url, engine: usedEngine } = buildSearchUrl(query, eng);
      const result = await this.navigate(url);
      lastResult = { ...result, search_query: query, search_engine: usedEngine };

      const bot = result.bot_wall;
      if (!bot?.blocked) {
        return lastResult;
      }
      lastResult.bot_wall = {
        ...bot,
        tried_engine: usedEngine,
        next_fallback: engines[engines.indexOf(eng) + 1] || null,
      };
    }

    return lastResult || { success: false, error: "Search failed on all engines" };
  }

  async snapshot({ full = false } = {}) {
    await this.start();
    return this.buildPageResponse({ full });
  }

  async click(ref, { force = false } = {}) {
    await this.start();
    const page = this.page;
    if (!page) throw new Error("Browser not started");

    await this.focusPage(page);
    const urlBefore = page.url();
    const locator = this.registry.resolve(ref);
    const targetLabel = await locator
      .evaluate((el) => {
        const aria = el.getAttribute("aria-label")?.trim();
        if (aria) return aria.slice(0, 120);
        return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
      })
      .catch(() => "");
    await locator.scrollIntoViewIfNeeded().catch(() => {});

    try {
      await locator.click({ timeout: 10_000, force });
    } catch (err) {
      if (!force) {
        await locator.click({ timeout: 5000, force: true });
      } else {
        throw err;
      }
    }

    await waitForNetworkSettle(page, 2500);
    if (page.url() !== urlBefore) {
      await waitForLazyContent(page, this.registry, { maxRounds: 2 });
    }
    const urlAfter = page.url();
    const urlChanged = urlBefore !== urlAfter;

    return this.buildPageResponse({
      full: false,
      extra: {
        clicked: ref,
        target_label: targetLabel || undefined,
        url_before: urlBefore,
        url_after: urlAfter,
        url_changed: urlChanged,
        ...(urlChanged
          ? {}
          : {
              click_note:
                "URL unchanged after click — ref may be wrong. browser_snapshot and click a ref whose label matches your intent (e.g. Log in).",
            }),
      },
    });
  }

  async type(ref, text, { submit = false, append = false } = {}) {
    await this.start();
    const page = this.page;
    if (!page) throw new Error("Browser not started");

    await this.focusPage(page);
    const locator = this.registry.resolve(ref);
    await locator.scrollIntoViewIfNeeded().catch(() => {});

    let value = text;
    if (append) {
      const existing = await locator.inputValue().catch(() => "");
      value = existing ? `${existing}\n${text}` : text;
    }

    await typeIntoLocator(page, locator, value);

    if (submit) {
      await page.keyboard.press("Enter");
      await waitForNetworkSettle(page, 2000);
    }
    return this.buildPageResponse({
      full: false,
      extra: { typed_into: ref, submit, append, text_length: text.length },
    });
  }

  async press(key) {
    await this.start();
    await this.page?.keyboard.press(key);
    await this.page?.waitForTimeout(400);
    return this.buildPageResponse({ full: false, extra: { pressed: key } });
  }

  /** @param {string} ref @param {string} value — visible label, e.g. "June", "15", "2000" */
  async select(ref, value) {
    await this.start();
    const page = this.page;
    if (!page) throw new Error("Browser not started");

    await this.focusPage(page);
    const locator = this.registry.resolve(ref);
    await locator.scrollIntoViewIfNeeded().catch(() => {});

    const picked = await pickDropdownValue(page, locator, String(value));

    await page.waitForTimeout(400);
    return this.buildPageResponse({
      full: false,
      extra: { selected: ref, value: picked || value, method: picked ? "option" : "attempted" },
    });
  }

  async scroll({ direction = "down", amount = 800 } = {}) {
    await this.start();
    const delta = direction === "up" ? -amount : amount;
    await this.page?.mouse.wheel(0, delta);
    await this.page?.waitForTimeout(200);
    return this.buildPageResponse({ full: false, extra: { scrolled: direction, amount } });
  }

  async wait({ mode = "lazy_content" } = {}) {
    await this.start();
    const page = this.page;
    if (!page) throw new Error("Browser not started");

    if (mode === "network" || mode === "navigation") {
      await waitForNetworkSettle(page, 5000);
    } else {
      await waitForLazyContent(page, this.registry);
    }

    return this.buildPageResponse({ full: false, extra: { waited: mode } });
  }

  async back() {
    await this.start();
    await this.page?.goBack({ waitUntil: "domcontentloaded" });
    await waitForNetworkSettle(this.page, 1500);
    return this.buildPageResponse({ full: false, extra: { action: "back" } });
  }

  async evaluate(expression) {
    await this.start();
    const result = await this.page?.evaluate(expression);
    return { success: true, result };
  }

  async extractText() {
    await this.start();
    const text = await this.page?.evaluate(() => document.body?.innerText || "");
    return { success: true, text: (text || "").replace(/\s+/g, " ").trim().slice(0, 12_000) };
  }

  async vision({ question }) {
    await this.start();
    const { analyzePageVisually } = await import("./vision.js");
    return analyzePageVisually(this.page, { question });
  }

  async debugReport({ clear = false } = {}) {
    await this.start();
    const page = this.page;
    if (!page) throw new Error("Browser not started");

    const url = page.url();
    const title = await page.title();
    const botWall = detectBotWall({ url, title, snapshot: "" });
    const bundle = this.supervisor.getDebugBundle();

    if (clear) this.supervisor.clearBuffers();

    return {
      success: true,
      url,
      title,
      bot_wall: botWall,
      debug_summary: bundle.summary,
      ...bundle,
    };
  }

  async buildPageResponse({ full, extra = {} }) {
    const page = this.page;
    if (!page) throw new Error("Browser not started");

    this.syncTabs();

    const captured = await captureSnapshot(page, { full, registry: this.registry });
    const limit = loadConfig().snapshotCharLimit;
    const snapshot = await compressSnapshotForTask(captured.text, this.userTask, limit, {
      pageUrl: captured.url,
    });
    const meta = this.supervisor.snapshotMeta();
    const botWall = detectBotWall({
      url: captured.url,
      title: captured.title,
      snapshot,
    });

    const response = {
      success: true,
      url: captured.url,
      title: captured.title,
      snapshot,
      element_count: captured.elementCount,
      truncated: snapshot.length < captured.text.length,
      bot_wall: botWall,
      browser_mode: this._browserMode,
      active_tab: this.tabs.activeTabId,
      tabs: this.tabs.list(),
      ...meta,
      ...extra,
    };

    if (botWall.blocked) {
      response.debug_summary = this.supervisor.summarize();
    }

    return response;
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} locator
 * @param {string} value
 */
async function pickDropdownValue(page, locator, value) {
  const tag = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");

  if (tag === "select") {
    try {
      await locator.selectOption({ label: value });
      return value;
    } catch {
      await locator.selectOption({ value });
      return value;
    }
  }

  const needle = String(value).trim();
  const exactOnly = /^\d+$/.test(needle);

  // Close stale listboxes so we don't match options from another combobox (e.g. day "1" vs year "2021")
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(200);

  await locator.click({ timeout: 8000 });
  await page.waitForTimeout(400);

  const options = await resolveDropdownOptions(page, locator);
  const picked = await clickMatchingOption(options, needle, { exactOnly });
  if (picked) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(150);
    return picked;
  }

  const roleOption = page.getByRole("option", { name: needle, exact: true });
  const roleCount = await roleOption.count();
  for (let i = 0; i < roleCount; i += 1) {
    const opt = roleOption.nth(i);
    if (await opt.isVisible().catch(() => false)) {
      await opt.click({ force: true });
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(150);
      return needle;
    }
  }

  // Keyboard fallback for custom comboboxes
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(150);
  await locator.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);

  if (exactOnly && needle === "1") {
    await page.keyboard.press("Home");
  } else if (needle.length <= 12) {
    await page.keyboard.type(needle, { delay: 30 });
  }
  await page.keyboard.press("Enter");
  return null;
}

/**
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} locator
 */
async function resolveDropdownOptions(page, locator) {
  const controlsId = await locator.getAttribute("aria-controls");
  if (controlsId) {
    const scoped = page.locator(
      `[id="${controlsId}"] [role=option], [id="${controlsId}"][role=option]`,
    );
    if ((await scoped.count()) > 0) return scoped;
  }

  const listbox = page.locator('[role=listbox]:visible').last();
  if ((await listbox.count()) > 0) {
    const scoped = listbox.locator("[role=option]");
    if ((await scoped.count()) > 0) return scoped;
  }

  return page.locator('[role=option]:visible');
}

/**
 * @param {import('playwright').Locator} options
 * @param {string} needle
 * @param {{ exactOnly?: boolean }} opts
 */
async function clickMatchingOption(options, needle, { exactOnly = false } = {}) {
  const count = await options.count();
  const lowerNeedle = needle.toLowerCase();

  for (let i = 0; i < count; i += 1) {
    const opt = options.nth(i);
    const text = (await opt.textContent())?.trim() || "";
    const matches = exactOnly
      ? text === needle
      : text.toLowerCase() === lowerNeedle || text.toLowerCase().includes(lowerNeedle);
    if (!matches) continue;

    await opt.scrollIntoViewIfNeeded().catch(() => {});
    await opt.click({ force: true, timeout: 5000 });
    return text;
  }

  return null;
}

async function typeIntoLocator(page, locator, value) {
  try {
    await locator.fill(value, { timeout: 10_000 });
    return;
  } catch {
    // fall through — custom/React fields (e.g. Instagram) may not support fill()
  }

  const inner = locator.locator("input, textarea, [contenteditable=true]").first();
  if ((await inner.count()) > 0) {
    try {
      await inner.fill(value, { timeout: 8000 });
      return;
    } catch {
      // continue to keyboard fallback
    }
  }

  await locator.click({ timeout: 8000 });
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press("Backspace");
  await page.keyboard.type(value, { delay: 12 });
}

function normalizeUrl(url) {
  const trimmed = (url || "").trim();
  if (!trimmed) throw new Error("URL is required");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** @type {BrowserSession | null} */
let singleton = null;

export function getBrowserSession() {
  if (!singleton) singleton = new BrowserSession();
  return singleton;
}

export async function closeBrowserSession() {
  if (singleton) {
    await singleton.stop();
    singleton = null;
  }
}