import { RefRegistry } from "./ref-registry.js";

const TYPEABLE_SELECTOR = [
  "input:not([type=hidden]):not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=true]",
  "[role=textbox]:not([aria-disabled=true])",
  "[role=searchbox]:not([aria-disabled=true])",
].join(", ");

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "select",
  "[role=button]",
  "[role=link]",
  "[role=combobox]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=menuitem]",
  "[role=tab]",
].join(", ");

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

/**
 * @param {import('playwright').Page} page
 * @param {{ full?: boolean; registry?: RefRegistry }} options
 */
export async function captureSnapshot(page, { full = false, registry = new RefRegistry() } = {}) {
  registry.clear();

  const url = page.url();
  const title = await page.title();
  const lines = [`Page: ${url}`, `Title: ${title}`, ""];

  const typeables = await collectElements(page, TYPEABLE_SELECTOR, registry, "textbox", {
    requireTypeable: true,
  });
  const interactive = await collectElements(page, INTERACTIVE_SELECTOR, registry, "interactive");

  const options = await collectElements(page, "[role=option]", registry, "option");
  const all = [...typeables, ...interactive, ...options];
  lines.push(`Interactive elements (${all.length}):`);
  lines.push(...all.map(formatLine));
  if (options.length) {
    lines.push("");
    lines.push("(Dropdown is open — click an option ref above, or use browser_select.)");
  }

  if (full) {
    const headings = await collectElements(page, HEADING_SELECTOR, registry, "heading", {
      skipRoles: true,
    });
    if (headings.length) {
      lines.push("");
      lines.push(`Headings (${headings.length}):`);
      lines.push(...headings.map(formatLine));
    }
  }

  return {
    registry,
    text: lines.join("\n"),
    elementCount: registry.size,
    url,
    title,
  };
}

/**
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @param {RefRegistry} registry
 * @param {string} fallbackRole
 * @param {{ requireTypeable?: boolean; skipRoles?: boolean }} [opts]
 */
async function collectElements(page, selector, registry, fallbackRole, opts = {}) {
  const locators = page.locator(selector);
  const count = await locators.count();
  /** @type {{ ref: string; role: string; name: string }[]} */
  const items = [];

  for (let i = 0; i < count; i += 1) {
    const locator = locators.nth(i);
    if (!(await isVisible(locator))) continue;

    if (opts.requireTypeable && !(await isTypeable(locator))) continue;

    const role = (await locator.getAttribute("role")) || fallbackRole;
    const name = await accessibleName(locator);
    if (!name && fallbackRole !== "interactive" && !opts.requireTypeable) continue;

    const ref = registry.assign(locator);
    const normalizedRole = await normalizeRole(role, locator, opts.requireTypeable);
    items.push({ ref, role: normalizedRole, name: name || "(unnamed)" });
  }

  return items;
}

/** @param {{ ref: string; role: string; name: string }} item */
function formatLine(item) {
  return `- ${item.role} "${item.name}" [ref=${item.ref}]`;
}

/** @param {import('playwright').Locator} locator */
async function isVisible(locator) {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

/** @param {import('playwright').Locator} locator */
async function isTypeable(locator) {
  return locator.evaluate((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    const role = el.getAttribute("role");
    if (role === "textbox" || role === "searchbox" || role === "combobox") {
      return el.isContentEditable || !!el.querySelector("input, textarea");
    }
    return false;
  }).catch(() => false);
}

/** @param {import('playwright').Locator} locator */
async function accessibleName(locator) {
  const role = await locator.getAttribute("role");
  const tag = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
  if (role === "combobox" || tag === "select") {
    const selected = await comboboxDisplayValue(locator);
    if (selected) return selected;
  }

  const aria = await locator.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();

  const labelledBy = await locator.getAttribute("aria-labelledby");
  if (labelledBy?.trim()) {
    const labelId = labelledBy.split(/\s+/)[0];
    const text = await locator
      .page()
      .evaluate((id) => document.getElementById(id)?.textContent?.trim() || "", labelId)
      .catch(() => "");
    if (text) return text;
  }

  const placeholder = await locator.getAttribute("placeholder");
  if (placeholder?.trim()) return placeholder.trim();

  const title = await locator.getAttribute("title");
  if (title?.trim()) return title.trim();

  const text = await locator.innerText();
  if (text?.trim()) return text.replace(/\s+/g, " ").trim().slice(0, 120);

  const value = await locator.getAttribute("value");
  if (value?.trim()) return value.trim();

  const name = await locator.getAttribute("name");
  if (name?.trim()) return name.trim();

  const type = await locator.getAttribute("type");
  if (type?.trim()) return type.trim();

  return "";
}

/** @param {import('playwright').Locator} locator */
async function comboboxDisplayValue(locator) {
  const tag = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
  if (tag === "select") {
    const text = await locator.locator("option:checked").textContent().catch(() => "");
    const trimmed = text?.trim() || "";
    if (trimmed && !/^select\b/i.test(trimmed)) return trimmed;
  }

  const inner = (await locator.innerText().catch(() => "")).trim();
  if (!inner) return "";

  const parts = inner
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const value = parts[parts.length - 1];
    if (value && !/^select\b/i.test(value)) return value;
  }

  return "";
}

/** @param {string} role @param {import('playwright').Locator} locator @param {boolean} [forceTextbox] */
async function normalizeRole(role, locator, forceTextbox = false) {
  const tag = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
  if (forceTextbox || tag === "input" || tag === "textarea") return "textbox";
  if (tag === "a" && role === "interactive") return "link";
  if (tag === "button" && role === "interactive") return "button";
  if (tag === "select" && role === "interactive") return "combobox";
  if (tag.startsWith("h") && role === "heading") return tag;
  if (role === "textbox" || role === "searchbox") return "textbox";
  return role;
}