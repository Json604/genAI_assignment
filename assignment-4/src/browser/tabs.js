/**
 * @typedef {{ page: import('playwright').Page; label: string; url: string }} TabEntry
 */

export class TabManager {
  constructor() {
    /** @type {Map<string, TabEntry>} */
    this.tabs = new Map();
    /** @type {string | null} */
    this.activeTabId = null;
    this._counter = 0;
  }

  /** @param {import('playwright').Page} page @param {{ id?: string; label?: string }} [meta] */
  register(page, { id, label } = {}) {
    const tabId = id || `tab${++this._counter}`;
    this.tabs.set(tabId, {
      page,
      label: label || tabId,
      url: page.url(),
    });
    this.activeTabId = tabId;
    return tabId;
  }

  /** @param {string} tabId */
  activate(tabId) {
    if (!this.tabs.has(tabId)) {
      throw new Error(`Unknown tab: ${tabId}. Call browser_list_tabs to see open tabs.`);
    }
    this.activeTabId = tabId;
    return this.tabs.get(tabId);
  }

  getActive() {
    if (!this.activeTabId || !this.tabs.has(this.activeTabId)) {
      return null;
    }
    return { id: this.activeTabId, ...this.tabs.get(this.activeTabId) };
  }

  /** @param {string} tabId @param {string} url */
  updateUrl(tabId, url) {
    const tab = this.tabs.get(tabId);
    if (tab) tab.url = url;
  }

  list() {
    return [...this.tabs.entries()].map(([id, tab]) => ({
      id,
      label: tab.label,
      url: safePageUrl(tab.page),
      active: id === this.activeTabId,
    }));
  }

  /**
   * Pick up tabs opened manually in CDP Chrome (or closed tabs removed).
   * @param {import('playwright').BrowserContext} context
   * @param {import('playwright').Page | null} activePage
   */
  syncFromContext(context, activePage) {
    const openPages = context.pages().filter((p) => !p.isClosed());
    const known = new Map([...this.tabs.entries()].map(([id, tab]) => [tab.page, id]));

    for (const [id, tab] of [...this.tabs.entries()]) {
      if (tab.page.isClosed()) this.remove(id);
    }

    for (const page of openPages) {
      if (known.has(page)) {
        const id = known.get(page);
        const entry = this.tabs.get(id);
        if (entry) entry.url = safePageUrl(page);
        continue;
      }
      const url = safePageUrl(page);
      this.register(page, { label: url || "tab" });
    }

    if (activePage && !activePage.isClosed()) {
      for (const [id, tab] of this.tabs.entries()) {
        if (tab.page === activePage) {
          this.activeTabId = id;
          break;
        }
      }
    }
  }

  /** @param {string} tabId */
  remove(tabId) {
    this.tabs.delete(tabId);
    if (this.activeTabId === tabId) {
      const next = this.tabs.keys().next().value;
      this.activeTabId = next || null;
    }
  }

  size() {
    return this.tabs.size;
  }
}

/** @param {import('playwright').Page} page */
function safePageUrl(page) {
  try {
    return page.url();
  } catch {
    return "";
  }
}