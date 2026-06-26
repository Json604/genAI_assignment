const MAX_CONSOLE = 40;
const MAX_NETWORK = 40;
const MAX_HTTP = 30;
const MAX_PAGE_ERRORS = 20;

const NOISE_URL =
  /\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|css)(\?|$)/i;

export class BrowserSupervisor {
  constructor() {
    /** @type {Array<{ level: string; text: string; at: string }>} */
    this.consoleMessages = [];
    /** @type {Array<{ url: string; method: string; error: string; at: string }>} */
    this.networkFailures = [];
    /** @type {Array<{ url: string; status: number; statusText: string; at: string }>} */
    this.httpErrors = [];
    /** @type {Array<{ message: string; at: string }>} */
    this.pageErrors = [];
    this.pendingDialogs = [];
    /** @type {import('playwright').BrowserContext | null} */
    this._context = null;
    /** @type {import('playwright').Page | null} */
    this._activePage = null;
    this._contextBound = false;
    /** @type {{ page: import('playwright').Page; onConsole: Function; onDialog: Function; onPageError: Function } | null} */
    this._pageHandler = null;
  }

  /** @param {import('playwright').BrowserContext} context */
  bindContext(context) {
    if (this._context === context && this._contextBound) return;
    this.unbindContext();
    this._context = context;

    const onRequestFailed = (request) => {
      const url = request.url();
      if (shouldSkipUrl(url)) return;
      this.pushRing(this.networkFailures, MAX_NETWORK, {
        url: truncate(url),
        method: request.method(),
        error: request.failure()?.errorText || "request failed",
        at: now(),
      });
    };

    const onResponse = (response) => {
      const status = response.status();
      if (status < 400) return;
      const url = response.url();
      if (shouldSkipUrl(url)) return;
      this.pushRing(this.httpErrors, MAX_HTTP, {
        url: truncate(url),
        status,
        statusText: response.statusText(),
        at: now(),
      });
    };

    context.on("requestfailed", onRequestFailed);
    context.on("response", onResponse);
    this._contextHandlers = { onRequestFailed, onResponse };
    this._contextBound = true;
  }

  unbindContext() {
    if (this._context && this._contextHandlers) {
      this._context.off("requestfailed", this._contextHandlers.onRequestFailed);
      this._context.off("response", this._contextHandlers.onResponse);
    }
    this._contextHandlers = null;
    this._contextBound = false;
    this._context = null;
  }

  /** @param {import('playwright').Page} page */
  attach(page) {
    this.detachPage();
    this._activePage = page;

    const onConsole = (msg) => {
      const type = msg.type();
      if (type !== "error" && type !== "warning" && type !== "log") return;
      const text = msg.text();
      if (!text?.trim()) return;
      this.pushRing(this.consoleMessages, MAX_CONSOLE, {
        level: type,
        text: truncate(text, 500),
        at: now(),
      });
    };

    const onDialog = (dialog) => {
      this.pushRing(this.pendingDialogs, 10, {
        type: dialog.type(),
        message: truncate(dialog.message(), 300),
        at: now(),
      });
      dialog.dismiss().catch(() => {});
    };

    const onPageError = (error) => {
      this.pushRing(this.pageErrors, MAX_PAGE_ERRORS, {
        message: truncate(error.message, 500),
        at: now(),
      });
    };

    page.on("console", onConsole);
    page.on("dialog", onDialog);
    page.on("pageerror", onPageError);
    this._pageHandler = { page, onConsole, onDialog, onPageError };
  }

  detachPage() {
    if (this._pageHandler) {
      const { page, onConsole, onDialog, onPageError } = this._pageHandler;
      page.off("console", onConsole);
      page.off("dialog", onDialog);
      page.off("pageerror", onPageError);
    }
    this._pageHandler = null;
    this._activePage = null;
  }

  detach() {
    this.detachPage();
    this.unbindContext();
  }

  clearBuffers() {
    this.consoleMessages = [];
    this.networkFailures = [];
    this.httpErrors = [];
    this.pageErrors = [];
    this.pendingDialogs = [];
  }

  snapshotMeta() {
    return {
      console: this.recentConsole(12),
      console_errors: this.recentConsole(12).filter((m) => m.level === "error"),
      network_failures: this.networkFailures.slice(-8),
      http_errors: this.httpErrors.slice(-8),
      page_errors: this.pageErrors.slice(-5),
      pending_dialogs: [...this.pendingDialogs],
    };
  }

  getDebugBundle() {
    return {
      console: this.consoleMessages.slice(-20),
      network_failures: this.networkFailures.slice(-15),
      http_errors: this.httpErrors.slice(-15),
      page_errors: this.pageErrors.slice(-10),
      pending_dialogs: [...this.pendingDialogs],
      summary: this.summarize(),
    };
  }

  summarize() {
    const lines = [];
    const lastHttp = this.httpErrors.at(-1);
    const lastNet = this.networkFailures.at(-1);
    const lastConsoleErr = [...this.consoleMessages].reverse().find((m) => m.level === "error");

    if (lastHttp) {
      lines.push(`Last HTTP error: ${lastHttp.status} ${lastHttp.statusText} — ${lastHttp.url}`);
    }
    if (lastNet) {
      lines.push(`Last network failure: ${lastNet.method} ${lastNet.url} — ${lastNet.error}`);
    }
    if (lastConsoleErr) {
      lines.push(`Last console error: ${lastConsoleErr.text}`);
    }
    if (!lines.length) {
      lines.push("No network/console errors captured yet.");
    }
    return lines.join("\n");
  }

  recentConsole(limit) {
    return this.consoleMessages.slice(-limit);
  }

  /** @template T */
  pushRing(arr, max, item) {
    arr.push(item);
    while (arr.length > max) arr.shift();
  }
}

function shouldSkipUrl(url) {
  return NOISE_URL.test(url);
}

function truncate(s, max = 220) {
  const t = String(s || "");
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function now() {
  return new Date().toISOString();
}