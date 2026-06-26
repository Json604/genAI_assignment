/*
X / Twitter Collector v1

Use on:
- keyword search result pages
- company profile timelines
- founder profile timelines

Run:
  await XCollectorV1.run()

What it does:
- captures visible tweets/posts
- collects author, handle, timestamp, text, links, media, and engagement counts
- scrolls until the timeline is no longer meaningfully scrollable
*/

const XCollectorV1 = (() => {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function text(node) {
    return (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function attr(node, name) {
    return (node?.getAttribute(name) || "").trim();
  }

  function absoluteUrl(href) {
    try {
      return new URL(href, location.href).toString();
    } catch {
      return href || "";
    }
  }

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function slug(value) {
    return (value || "x-timeline")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "x-timeline";
  }

  function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  function isVisible(node) {
    if (!node) {
      return false;
    }
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function uniqueNodes(nodes) {
    return [...new Set(nodes)].filter(Boolean);
  }

  function uniqueBy(items, keyFn) {
    const seen = new Set();
    const output = [];
    for (const item of items) {
      const key = keyFn(item);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(item);
    }
    return output;
  }

  function pageMeta() {
    return {
      page_url: location.href,
      page_title: document.title,
      extracted_at: new Date().toISOString()
    };
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

  function visibleNumber(value) {
    const raw = normalizeText(value).replace(/,/g, "");
    const match = raw.match(/(\d+(\.\d+)?)([KMB])?/i);
    if (!match) {
      return "";
    }
    const base = Number(match[1]);
    const suffix = (match[3] || "").toUpperCase();
    const multiplier = suffix === "K" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : 1;
    return String(base * multiplier);
  }

  function clickableNodes(root = document) {
    return uniqueNodes([
      ...root.querySelectorAll("button"),
      ...root.querySelectorAll("a[role='button']"),
      ...root.querySelectorAll("[role='button']")
    ]).filter(isVisible);
  }

  function buttonLabel(node) {
    return normalizeText(
      text(node) ||
      attr(node, "aria-label") ||
      attr(node, "title")
    ).toLowerCase();
  }

  function shouldExpandNode(node) {
    const label = buttonLabel(node);
    if (!label) {
      return false;
    }

    const allow = [
      "show more",
      "more replies",
      "show replies",
      "show additional replies",
      "show more posts"
    ];

    const deny = [
      "like",
      "reply",
      "repost",
      "share",
      "bookmark",
      "follow",
      "subscribe"
    ];

    if (deny.some((phrase) => label === phrase || label.startsWith(`${phrase} `))) {
      return false;
    }

    return allow.includes(label) || allow.some((phrase) => label.includes(phrase));
  }

  async function clickNode(node) {
    try {
      node.scrollIntoView({ block: "center", behavior: "instant" });
    } catch {}

    try {
      node.click();
      return true;
    } catch {
      try {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return true;
      } catch {
        return false;
      }
    }
  }

  async function expandVisibleNodes(root = document, pauseMs = 250) {
    let clicks = 0;
    const nodes = clickableNodes(root).filter(shouldExpandNode);
    for (const node of nodes) {
      const ok = await clickNode(node);
      if (ok) {
        clicks += 1;
        await sleep(pauseMs);
      }
    }
    return clicks;
  }

  function tweetNodes() {
    return uniqueNodes([...document.querySelectorAll("article[data-testid='tweet']")])
      .filter((node) => isVisible(node) && normalizeText(node.innerText));
  }

  function tweetUrl(article) {
    const link = article.querySelector("a[href*='/status/']");
    return absoluteUrl(link?.href);
  }

  function tweetId(article) {
    return tweetUrl(article) || normalizeText(text(article)).slice(0, 160);
  }

  function collectLinks(article) {
    const links = uniqueNodes([...article.querySelectorAll("a[href]")]).map((node) => ({
      text: normalizeText(text(node)),
      url: absoluteUrl(node.href)
    }));

    return uniqueBy(
      links.filter((item) => item.url && !item.url.includes("/analytics")),
      (item) => `${item.url}::${item.text}`
    );
  }

  function collectMedia(article) {
    const media = uniqueNodes([
      ...article.querySelectorAll("img"),
      ...article.querySelectorAll("video"),
      ...article.querySelectorAll("video source")
    ]).map((node) => ({
      src: absoluteUrl(node.currentSrc || node.src || attr(node, "src")),
      alt: attr(node, "alt")
    }));

    return uniqueBy(
      media.filter((item) => item.src && !item.src.includes("profile_images") && !item.src.includes("emoji")),
      (item) => item.src
    );
  }

  function authorName(article) {
    const userBlock = article.querySelector("[data-testid='User-Name']");
    const raw = normalizeText(text(userBlock));
    const parts = raw.split("@");
    return normalizeText(parts[0] || raw);
  }

  function authorHandle(article) {
    const userBlock = article.querySelector("[data-testid='User-Name']");
    const raw = normalizeText(text(userBlock));
    const match = raw.match(/(@[A-Za-z0-9_]+)/);
    return match ? match[1] : "";
  }

  function authorProfileUrl(article) {
    const handle = authorHandle(article);
    return handle ? `https://x.com/${handle.replace(/^@/, "")}` : "";
  }

  function tweetText(article) {
    return normalizeText(text(article.querySelector("[data-testid='tweetText']")));
  }

  function metricByTestId(article, testId) {
    return visibleNumber(text(article.querySelector(`[data-testid='${testId}']`)));
  }

  function viewsMetric(article) {
    const analytics = article.querySelector("a[href*='/analytics']");
    return visibleNumber(text(analytics));
  }

  function isPinned(article) {
    return normalizeText(text(article)).toLowerCase().includes("pinned");
  }

  function isReply(article) {
    return normalizeText(text(article)).toLowerCase().includes("replying to");
  }

  function collectTweet(article) {
    return {
      tweet_id: tweetId(article),
      tweet_url: tweetUrl(article),
      author: authorName(article),
      author_handle: authorHandle(article),
      author_url: authorProfileUrl(article),
      date: attr(article.querySelector("time"), "datetime"),
      content: tweetText(article),
      links: collectLinks(article),
      media: collectMedia(article),
      replies: metricByTestId(article, "reply"),
      reposts: metricByTestId(article, "retweet"),
      likes: metricByTestId(article, "like"),
      bookmarks: metricByTestId(article, "bookmark"),
      views: viewsMetric(article),
      is_pinned: isPinned(article),
      is_reply: isReply(article),
      collected_at: new Date().toISOString()
    };
  }

  async function processVisibleTweets(seen, results) {
    let newTweets = 0;
    const tweets = tweetNodes();

    for (const article of tweets) {
      const id = tweetId(article);
      if (!id || seen.has(id)) {
        continue;
      }

      try {
        article.scrollIntoView({ block: "center", behavior: "instant" });
      } catch {}

      await sleep(350);
      await expandVisibleNodes(article);

      results.push(collectTweet(article));
      seen.add(id);
      newTweets += 1;
      await sleep(250);
    }

    return newTweets;
  }

  async function run({
    step = 1400,
    delayMs = 1200,
    idleRounds = 4
  } = {}) {
    const seen = new Set();
    const results = [];
    let previousHeight = 0;
    let previousScrollY = -1;
    let idleCount = 0;

    while (true) {
      await expandVisibleNodes(document);
      const newTweets = await processVisibleTweets(seen, results);

      window.scrollBy(0, step);
      await sleep(delayMs);

      const currentHeight = document.body.scrollHeight;
      const currentScrollY = window.scrollY;
      const atBottom = window.innerHeight + currentScrollY >= currentHeight;
      const stableHeight = currentHeight === previousHeight;
      const stableScroll = currentScrollY === previousScrollY;

      if (newTweets === 0 && stableHeight && stableScroll && atBottom) {
        idleCount += 1;
        if (idleCount >= idleRounds) {
          break;
        }
      } else {
        idleCount = 0;
      }

      previousHeight = currentHeight;
      previousScrollY = currentScrollY;
    }

    const payload = {
      ...pageMeta(),
      platform: "x",
      source_type: location.pathname.includes("/search") ? "search" : "profile_timeline",
      scroll_rule: "Scrolls until the timeline stops extending and the page is no longer meaningfully scrollable.",
      total_items: results.length,
      items: results
    };

    return download(`x-collector-${slug(document.title)}-${timestamp()}.json`, payload);
  }

  return { run };
})();
