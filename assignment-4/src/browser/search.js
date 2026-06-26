const ENGINES = {
  duckduckgo: {
    name: "duckduckgo",
    buildUrl(query) {
      return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    },
  },
  bing: {
    name: "bing",
    buildUrl(query) {
      return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    },
  },
  google: {
    name: "google",
    buildUrl(query) {
      return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    },
  },
};

export function buildSearchUrl(query, engine = "duckduckgo") {
  const normalized = (engine || "duckduckgo").toLowerCase();
  const impl = ENGINES[normalized];
  if (!impl) {
    throw new Error(`Unknown search engine "${engine}". Use: duckduckgo, bing, google`);
  }
  return { engine: impl.name, url: impl.buildUrl(query) };
}

export function defaultSearchEngines() {
  return ["duckduckgo", "bing", "google"];
}