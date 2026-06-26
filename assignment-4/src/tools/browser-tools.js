import { getBrowserSession } from "../browser/session.js";
import { withStaleRefRetry } from "../browser/stale-ref.js";

export const browserToolSchemas = [
  {
    name: "browser_search",
    description:
      "Search the web for a query. Defaults to DuckDuckGo (Google often blocks bots). Auto-falls back to Bing if blocked. Returns results page snapshot.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query, e.g. 'good books 2024'" },
        engine: {
          type: "string",
          enum: ["duckduckgo", "bing", "google"],
          description: "Search engine. Prefer duckduckgo — Google frequently shows CAPTCHA to automated browsers.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "browser_navigate",
    description:
      "Open a URL. Default replaces the active tab. Set new_tab=true to open alongside (required when keeping auth + mail, or any two sites at once). Returns snapshot with refs and tabs list.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL or domain, e.g. https://example.com" },
        new_tab: {
          type: "boolean",
          description: "Open in a new tab instead of replacing the current page",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_new_tab",
    description:
      "Open a new browser tab, optionally navigating to a URL. Use for 'alongside' / side-by-side multi-site tasks.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Optional URL to open in the new tab" },
        label: { type: "string", description: "Short label, e.g. 'notepad' or 'ncyc'" },
      },
    },
  },
  {
    name: "browser_switch_tab",
    description:
      "Switch the active tab (brings it to front in the Chrome window). Refs only work on the active tab — call browser_list_tabs first.",
    parameters: {
      type: "object",
      properties: {
        tab_id: { type: "string", description: "Tab id from browser_list_tabs, e.g. tab1" },
      },
      required: ["tab_id"],
    },
  },
  {
    name: "browser_list_tabs",
    description:
      "List all open tabs (syncs with real Chrome in CDP mode — includes user-opened tabs). Use before browser_switch_tab or when user says a site is already open.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "browser_snapshot",
    description:
      "Refresh snapshot only after navigation or DOM changes — not right after browser_navigate (that already returns a snapshot). Use full=true for headings.",
    parameters: {
      type: "object",
      properties: {
        full: { type: "boolean", description: "Include headings and extra structure" },
      },
    },
  },
  {
    name: "browser_click",
    description: "Click an element by ref from the latest snapshot, e.g. @e5.",
    parameters: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element ref from snapshot, e.g. @e5" },
      },
      required: ["ref"],
    },
  },
  {
    name: "browser_type",
    description:
      "Type text into an input/textbox ref. Use append=true to add without clearing existing content (multi-item notes). Set submit=true to press Enter.",
    parameters: {
      type: "object",
      properties: {
        ref: { type: "string" },
        text: { type: "string" },
        submit: { type: "boolean" },
        append: {
          type: "boolean",
          description: "Append after existing text instead of replacing (textareas, editors)",
        },
      },
      required: ["ref", "text"],
    },
  },
  {
    name: "browser_wait",
    description:
      "Wait for page content. mode=navigation after clicks that load new pages. mode=network for network idle. mode=lazy_content (default) for lazy-loaded lists.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["lazy_content", "network", "navigation"] },
      },
    },
  },
  {
    name: "browser_scroll",
    description: "Scroll the page up or down to load more content.",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down"] },
        amount: { type: "number", description: "Pixels to scroll, default 800" },
      },
    },
  },
  {
    name: "browser_select",
    description:
      "Pick a dropdown/combobox option by visible label. Use on combobox or select refs — opens the menu, clicks matching [role=option], or types+Enter as fallback. For month/day/year fields use label text like \"June\", \"15\", \"2000\".",
    parameters: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Combobox ref from snapshot, e.g. @e8" },
        value: { type: "string", description: "Option label to pick" },
      },
      required: ["ref", "value"],
    },
  },
  {
    name: "browser_press",
    description: "Press a keyboard key on the page, e.g. Enter, Escape, Tab.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string" },
      },
      required: ["key"],
    },
  },
  {
    name: "browser_back",
    description: "Navigate back in browser history.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "browser_extract",
    description:
      "Extract visible page text when snapshot is insufficient. Use sparingly — prefer snapshot refs.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "browser_vision",
    description:
      "Escalation: screenshot + vision analysis when accessibility snapshot is insufficient (CAPTCHA, charts, visual layout). Use sparingly.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "What to look for in the screenshot" },
      },
      required: ["question"],
    },
  },
  {
    name: "browser_debug",
    description:
      "Get recent console messages, failed network requests, and HTTP 4xx/5xx errors. Use when bot_wall blocks or login loops. Set clear=true to reset buffers after reading.",
    parameters: {
      type: "object",
      properties: {
        clear: { type: "boolean", description: "Clear debug buffers after reading" },
      },
    },
  },
  {
    name: "browser_console",
    description:
      "Evaluate a JavaScript expression in the page context. Use when data is not exposed in the accessibility tree.",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "JS expression to evaluate" },
      },
      required: ["expression"],
    },
  },
];

export async function handleBrowserTool(name, args) {
  const session = getBrowserSession();

  try {
    switch (name) {
      case "browser_search":
        return json(
          await session.search(args.query, {
            engine: args.engine || "duckduckgo",
            tryFallbacks: args.try_fallbacks !== false,
          }),
        );
      case "browser_navigate":
        return json(await session.navigate(args.url, { newTab: Boolean(args.new_tab) }));
      case "browser_new_tab":
        return json(await session.newTab(args.url, { label: args.label }));
      case "browser_switch_tab":
        await session.switchTab(args.tab_id);
        return json(await session.snapshot({ full: false }));
      case "browser_list_tabs":
        await session.start().catch(() => {});
        return json(session.listTabs());
      case "browser_snapshot":
        return json(await session.snapshot({ full: Boolean(args.full) }));
      case "browser_wait":
        return json(await session.wait({ mode: args.mode || "lazy_content" }));
      case "browser_click":
        return json(
          await withStaleRefRetry(session, () => session.click(normalizeRef(args.ref))),
        );
      case "browser_type":
        return json(
          await withStaleRefRetry(session, () =>
            session.type(normalizeRef(args.ref), args.text, {
              submit: Boolean(args.submit),
              append: Boolean(args.append),
            }),
          ),
        );
      case "browser_scroll":
        return json(
          await session.scroll({
            direction: args.direction || "down",
            amount: args.amount || 800,
          }),
        );
      case "browser_select":
        return json(
          await withStaleRefRetry(session, () => session.select(normalizeRef(args.ref), args.value)),
        );
      case "browser_press":
        return json(await session.press(args.key));
      case "browser_back":
        return json(await session.back());
      case "browser_extract":
        return json(await session.extractText());
      case "browser_debug":
        return json(await session.debugReport({ clear: Boolean(args.clear) }));
      case "browser_vision":
        return json(await session.vision({ question: args.question }));
      case "browser_console":
        return json(await session.evaluate(args.expression));
      default:
        return json({ success: false, error: `Unknown browser tool: ${name}` });
    }
  } catch (err) {
    return json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

/** @param {string | undefined} ref */
function normalizeRef(ref) {
  const raw = (ref || "").trim();
  if (!raw) throw new Error("ref is required");
  return raw.startsWith("@") ? raw : `@${raw}`;
}