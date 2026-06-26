import { truncateSnapshot } from "./compress.js";

const REF_LINE = /\[ref=e\d+\]/;
const INTERACTIVE_ROLES =
  /\b(textbox|textarea|button|combobox|checkbox|radio|searchbox|link)\b/i;

const FORM_FILL_TASK =
  /\b(fill\s+(?:the\s+)?\w+|type\s+into|enter\s+(?:your|the|a)\s+\w+)\b/i;
const BROWSE_TASK =
  /\b(find|list|all|details|strains|extract|scrape|read|search|filter|collect|gather|each|every|whose|catalogue|alongside|notepad)\b/i;
const MULTI_TAB_TASK = /\b(alongside|side.?by.?side|another tab|new tab|open .+ and)\b/i;

/**
 * Fast task-aware snapshot shrink — no extra LLM call.
 * @param {string} text
 * @param {string | null} userTask
 * @param {number} limit
 * @param {{ pageUrl?: string }} [ctx]
 */
export async function compressSnapshotForTask(text, userTask, limit, { pageUrl } = {}) {
  if (!userTask) {
    return text.length <= limit ? text : truncateSnapshot(text, limit);
  }

  const mode = classifyMode(userTask, pageUrl);

  if (mode === "notepad") {
    const focused = focusFormControls(text);
    if (focused) return focused.length <= limit ? focused : truncateSnapshot(focused, limit);
  }

  if (mode === "browse") {
    const focused = focusBrowseContent(text, userTask);
    if (focused) return focused.length <= limit ? focused : truncateSnapshot(focused, limit);
  }

  if (mode === "form") {
    const focused = focusFormControls(text);
    if (focused) return focused.length <= limit ? focused : truncateSnapshot(focused, limit);
  }

  if (text.length <= limit) return text;

  const keywords = extractKeywords(userTask);
  const lines = text.split("\n");
  const header = [];
  const refLines = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    if (
      line.startsWith("Page:") ||
      line.startsWith("Title:") ||
      line.startsWith("Interactive elements") ||
      line.startsWith("Headings")
    ) {
      header.push(line);
      continue;
    }
    if (REF_LINE.test(line)) refLines.push(line);
  }

  const scored = refLines
    .map((line) => ({ line, score: scoreLine(line, keywords, false) }))
    .sort((a, b) => b.score - a.score);

  const picked = new Set();
  const ordered = [];
  for (const item of scored) {
    if (picked.has(item.line)) continue;
    picked.add(item.line);
    ordered.push(item.line);
    if (ordered.length >= 60) break;
  }

  const rebuilt = [...header, "", ...ordered].join("\n");
  return rebuilt.length <= limit ? rebuilt : truncateSnapshot(rebuilt, limit);
}

/** @param {string} userTask @param {string} [pageUrl] */
function classifyMode(userTask, pageUrl) {
  const task = userTask.toLowerCase();
  const url = (pageUrl || "").toLowerCase();

  if (url.includes("notepad")) return "notepad";

  if (BROWSE_TASK.test(task) || MULTI_TAB_TASK.test(task)) {
    if (url.includes("notepad")) return "notepad";
    return "browse";
  }

  if (/\/strains|\/search|\/catalogue|\/results/.test(url)) return "browse";

  if (FORM_FILL_TASK.test(task) && !BROWSE_TASK.test(task)) return "form";

  if (/\b(create|sign\s*up|register|signup|log\s*in|sign\s*in|account)\b/i.test(task)) return "form";

  if (/\/signup|\/register|\/emailsignup|\/accounts\//i.test(url)) return "form";

  return "default";
}

/** @param {string} text @param {string} userTask */
function focusBrowseContent(text, userTask) {
  const keywords = extractKeywords(userTask);
  const lines = text.split("\n");
  const header = [];
  const matches = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    if (
      line.startsWith("Page:") ||
      line.startsWith("Title:") ||
      line.startsWith("Interactive elements") ||
      line.startsWith("Headings")
    ) {
      header.push(line);
      continue;
    }
    if (!REF_LINE.test(line)) continue;

    const lower = line.toLowerCase();
    let score = 0;

    for (const kw of keywords) {
      if (lower.includes(kw)) score += 4;
    }

    if (/details|detail/i.test(line)) score += 5;
    if (/search|go\b|filter|submit/i.test(line)) score += 4;
    if (/next|prev|page \d|pagination/i.test(line)) score += 3;
    if (/ncyc|strain|yeast|lipolytica/i.test(line)) score += 3;
    if (/\btextbox\b/i.test(line)) score += 2;
    if (/\bbutton\b/i.test(line)) score += 2;
    if (/\blink\b/i.test(line) && score === 0) score += 1;

    matches.push({ line, score });
  }

  matches.sort((a, b) => b.score - a.score);

  const picked = [];
  const seen = new Set();

  const add = (items, minScore = 0) => {
    for (const item of items) {
      if (item.score < minScore) continue;
      if (seen.has(item.line)) continue;
      seen.add(item.line);
      picked.push(item.line);
    }
  };

  add(matches, 3);
  add(matches.filter((m) => /details|search|go\b|textbox|button|ncyc|strain|lipolytica|yeast/i.test(m.line)), 1);

  if (picked.length < 8) {
    for (const item of matches) {
      if (seen.has(item.line)) continue;
      if (!/\blink\b/i.test(item.line)) continue;
      seen.add(item.line);
      picked.push(item.line);
      if (picked.length >= 20) break;
    }
  }

  if (!picked.length) return null;

  const countLine = header.find((l) => l.startsWith("Interactive elements"));
  if (countLine) {
    const idx = header.indexOf(countLine);
    header[idx] = `Interactive elements (${picked.length} task-relevant shown)`;
  }

  return [...header, "", ...picked].join("\n");
}

/** @param {string} task */
function extractKeywords(task) {
  const stop = new Set([
    "the", "a", "an", "and", "or", "to", "go", "open", "visit", "on", "in", "at",
    "for", "with", "from", "into", "fill", "type", "enter", "click", "get", "find",
    "page", "site", "website", "field", "fields", "form", "http", "https", "www",
    "all", "their", "them", "those", "these", "want", "good", "better", "then",
  ]);

  return task
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
}

/**
 * @param {string} line
 * @param {string[]} keywords
 * @param {boolean} formTask
 */
function scoreLine(line, keywords, formTask) {
  const lower = line.toLowerCase();
  let score = 0;

  for (const kw of keywords) {
    if (lower.includes(kw)) score += 3;
  }

  if (formTask) {
    if (/\btextbox\b/i.test(line)) score += 2;
    if (/\btextarea\b/i.test(line)) score += 2;
    if (/\bbutton\b/i.test(line) && /submit|save|send|continue|next/i.test(line)) score += 2;
  }

  if (/\btextbox\b/i.test(line) || /\btextarea\b/i.test(line)) score += 1;

  return score;
}

/** @param {string} text */
function focusFormControls(text) {
  const lines = text.split("\n");
  const header = [];
  const controls = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    if (
      line.startsWith("Page:") ||
      line.startsWith("Title:") ||
      line.startsWith("Interactive elements") ||
      line.startsWith("Headings")
    ) {
      header.push(line);
      continue;
    }
    if (
      REF_LINE.test(line) &&
      /\b(textbox|textarea|button|combobox|checkbox|radio)\b/i.test(line)
    ) {
      controls.push(line);
    }
  }

  if (controls.length === 0) return null;

  const countLine = header.find((l) => l.startsWith("Interactive elements"));
  if (countLine) {
    const idx = header.indexOf(countLine);
    header[idx] = `Interactive elements (${controls.length} form controls shown)`;
  }

  return [...header, "", ...controls].join("\n");
}