/*
Google Batch Search Collector v1

Use on:
- https://www.google.com/

Run once:
  await GoogleBatchSearchCollectorV1.run()

What it does:
- opens a Google search popup
- runs each built-in query one by one
- scrapes the visible results from each query page
- stores all query results in memory
- downloads one combined JSON at the end

Notes:
- allow popups for google.com
- keep the popup window open while it runs
*/

const GoogleBatchSearchCollectorV1 = (() => {
  const queries = [
    'site:www.scaler.bio',
    '"www.scaler.bio"',
    '"scaler.bio" article OR press OR interview OR podcast',
    '"scaler.bio" Synonym',
    '"Scaler" Synonym biotech',
    '"Scaler" "techno-economic analysis" Synonym',
    '"Scaler" LCA Synonym',
    '"Scaler" "life cycle assessment" Synonym',
    '"Synonym Scaler TEA" "commercialization roadmap"',
    '"Synonym Scaler TEA" "unit economics"',
    '"Synonym Scaler TEA" COGS bioeconomy',
    '"Synonym Scaler TEA" fermentation economics',
    '"Synonym" "Scaler" launch',
    '"Synonym" "Scaler" announcement',
    '"Synonym" "Scaler" podcast OR webinar OR interview',
    'site:synonym.bio "Scaler"',
    'site:roebling.co "Scaler"',
    '"Roebling" "Scaler"',
    '"Roebling" "scaler.bio"',
    '"Synonym" "scaler.bio"',
    '"Edward Shenderovich" Scaler Synonym',
    '"Joshua Lachter" Scaler Synonym',
    '"Brentan Alexander" Scaler Synonym',
    '"Scaler" biotech software',
    '"Scaler" biomanufacturing software',
    '"Scaler" "free TEA"',
    '"Scaler" "customized TEA"'
  ];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function text(node) {
    return (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function absoluteUrl(baseUrl, href) {
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href || "";
    }
  }

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function slug(value) {
    return (value || "google-batch-search")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "google-batch-search";
  }

  function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  function queryUrl(query) {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function download(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return payload;
  }

  function printQueryList() {
    const rows = queries.map((query, index) => ({
      index,
      query,
      url: queryUrl(query)
    }));
    console.table(rows);
    return rows;
  }

  function resultNodes(doc) {
    const nodes = [
      ...doc.querySelectorAll('div[data-snc]'),
      ...doc.querySelectorAll('div.g'),
      ...doc.querySelectorAll('div.MjjYud')
    ];

    return [...new Set(nodes)].filter((node) => {
      const heading = node.querySelector('h3');
      const link = node.querySelector('a[href]');
      return heading && link;
    });
  }

  function resultUrl(win, node) {
    const link = node.querySelector('a[href]');
    return absoluteUrl(win.location.href, link?.href);
  }

  function resultTitle(node) {
    return normalizeText(text(node.querySelector('h3')));
  }

  function resultSnippet(node) {
    const selectors = ['.VwiC3b', '.yXK7lf', '.s3v9rd', '[data-sncf="1"]', '.ITZIwc'];

    for (const selector of selectors) {
      const found = node.querySelector(selector);
      const value = normalizeText(text(found));
      if (value) {
        return value;
      }
    }

    return normalizeText(text(node));
  }

  function resultSource(node) {
    const selectors = ['.VuuXrf', '.yuRUbf cite', 'cite'];

    for (const selector of selectors) {
      const found = node.querySelector(selector);
      const value = normalizeText(text(found));
      if (value) {
        return value;
      }
    }

    return '';
  }

  function resultDate(node) {
    const selectors = ['.OSrXXb', '.MUxGbd span', 'span'];

    for (const selector of selectors) {
      const found = node.querySelector(selector);
      const value = normalizeText(text(found));
      if (/\b(20\d{2}|19\d{2})\b/.test(value) || /\b\d+\s+(day|week|month|year)s?\s+ago\b/i.test(value)) {
        return value;
      }
    }

    return '';
  }

  function collectResultsFromWindow(win, query) {
    const doc = win.document;
    const nodes = resultNodes(doc);

    return nodes.map((node, index) => ({
      query,
      position: index + 1,
      title: resultTitle(node),
      url: resultUrl(win, node),
      source: resultSource(node),
      date_hint: resultDate(node),
      snippet: resultSnippet(node),
      collected_at: new Date().toISOString()
    })).filter((item) => item.title && item.url);
  }

  async function waitForSearchResults(win, expectedQuery, {
    timeoutMs = 45000,
    pollMs = 500
  } = {}) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (win.closed) {
        throw new Error('Search popup was closed');
      }

      try {
        const href = win.location.href;
        const ready = win.document.readyState === 'complete';
        const params = new URLSearchParams(win.location.search);
        const currentQuery = params.get('q') || '';
        const hasResults =
          resultNodes(win.document).length > 0 ||
          normalizeText(text(win.document.body)).includes('did not match any documents');

        if (href.includes('/search') && ready && currentQuery === expectedQuery && hasResults) {
          return;
        }
      } catch {}

      await sleep(pollMs);
    }

    throw new Error(`Timed out waiting for Google results for query: ${expectedQuery}`);
  }

  async function run({
    popupName = 'google_batch_search_runner',
    betweenQueryDelayMs = 1200
  } = {}) {
    const firstUrl = queryUrl(queries[0]);
    const popup = window.open(firstUrl, popupName, 'width=1280,height=900');

    if (!popup) {
      throw new Error('Popup blocked. Please allow popups for google.com and rerun.');
    }

    const payload = {
      controller_page: location.href,
      started_at: new Date().toISOString(),
      platform: 'google',
      source_type: 'search_batch',
      query_pack_size: queries.length,
      queries,
      runs: []
    };

    for (let index = 0; index < queries.length; index += 1) {
      const query = queries[index];
      const url = queryUrl(query);

      popup.location.href = url;
      console.log(`Running query ${index + 1}/${queries.length}: ${query}`);

      await waitForSearchResults(popup, query);
      await sleep(1200);

      const items = collectResultsFromWindow(popup, query);
      payload.runs.push({
        index,
        query,
        page_url: popup.location.href,
        page_title: popup.document.title,
        total_items: items.length,
        items
      });

      await sleep(betweenQueryDelayMs);
    }

    payload.finished_at = new Date().toISOString();
    payload.total_queries_run = payload.runs.length;
    payload.total_items = payload.runs.reduce((sum, run) => sum + run.total_items, 0);

    download(`google-batch-search-${slug(queries[0])}-${timestamp()}.json`, payload);
    return payload;
  }

  return {
    printQueryList,
    queries,
    queryUrl,
    run
  };
})();
