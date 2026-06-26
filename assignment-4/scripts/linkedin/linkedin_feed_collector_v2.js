/*
LinkedIn Feed Collector v2

Simplified version:
- expands visible "...more" / "see more"
- captures core post content and links
- captures basic post metadata
- scrolls until the feed is no longer meaningfully scrollable

Run:
  await LinkedInFeedCollectorV2.run()
*/

const LinkedInFeedCollectorV2 = (() => {
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

  function slug(value) {
    return (value || "linkedin-feed")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "linkedin-feed";
  }

  function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
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
      attr(node, "title") ||
      attr(node, "data-control-name")
    ).toLowerCase();
  }

  function shouldExpandNode(node) {
    const label = buttonLabel(node);
    if (!label) {
      return false;
    }

    const allow = [
      "see more",
      "show more",
      "view more",
      "load more",
      "read more",
      "more",
      "...more",
      "…more"
    ];

    const deny = [
      "show less",
      "see less",
      "like",
      "celebrate",
      "support",
      "love",
      "insightful",
      "funny",
      "comment",
      "repost",
      "send",
      "share via",
      "copy link",
      "follow",
      "message",
      "connect",
      "report",
      "dismiss",
      "sort by"
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

  async function expandVisibleMore(article, pauseMs = 250) {
    const nodes = clickableNodes(article).filter(shouldExpandNode);
    let clicks = 0;

    for (const node of nodes) {
      const ok = await clickNode(node);
      if (ok) {
        clicks += 1;
        await sleep(pauseMs);
      }
    }

    return clicks;
  }

  function postNodes() {
    return uniqueNodes([
      ...document.querySelectorAll("div.feed-shared-update-v2"),
      ...document.querySelectorAll("article.feed-shared-update-v2"),
      ...document.querySelectorAll("div[data-urn*='activity:']"),
      ...document.querySelectorAll("div[data-urn*='ugcPost:']")
    ]).filter((node) => isVisible(node) && normalizeText(node.innerText));
  }

  function primaryActorBlock(article) {
    return (
      article.querySelector(".update-components-actor") ||
      article.querySelector(".feed-shared-actor") ||
      article
    );
  }

  function primaryAuthorName(article) {
    const actor = primaryActorBlock(article);
    const titleNode =
      actor.querySelector(".update-components-actor__title span[dir='ltr']") ||
      actor.querySelector(".update-components-actor__title") ||
      actor.querySelector(".feed-shared-actor__name span[dir='ltr']") ||
      actor.querySelector(".feed-shared-actor__name");

    return normalizeText(text(titleNode))
      .replace(/\s*•.*$/, "")
      .replace(/\s+Premium.*$/, "")
      .trim();
  }

  function primaryAuthorUrl(article) {
    const actor = primaryActorBlock(article);
    const link =
      actor.querySelector("a[href*='/in/']") ||
      actor.querySelector("a[href*='/company/']") ||
      article.querySelector("a[href*='/in/']") ||
      article.querySelector("a[href*='/company/']");
    return absoluteUrl(link?.href);
  }

  function primaryDate(article) {
    const actor = primaryActorBlock(article);
    return (
      attr(actor.querySelector("time"), "datetime") ||
      normalizeText(
        text(actor.querySelector(".update-components-actor__sub-description")) ||
        text(actor.querySelector(".feed-shared-actor__sub-description"))
      )
    );
  }

  function findPermalink(article) {
    const candidates = uniqueNodes([
      ...article.querySelectorAll("a[href*='/feed/update/']"),
      ...article.querySelectorAll("a[href*='/posts/']"),
      ...article.querySelectorAll("a[href*='activity-']")
    ]);

    for (const node of candidates) {
      const href = absoluteUrl(node.href);
      if (!href || href.includes("undefined")) {
        continue;
      }
      return href;
    }

    const urn = attr(article, "data-urn");
    if (urn && urn.includes("activity:")) {
      const activityId = urn.split("activity:")[1];
      if (activityId) {
        return `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
      }
    }

    return "";
  }

  function postId(article) {
    return attr(article, "data-urn") || findPermalink(article) || normalizeText(text(article)).slice(0, 160);
  }

  function collectLinks(article) {
    const links = uniqueNodes([...article.querySelectorAll("a[href]")]).map((node) => ({
      text: normalizeText(text(node)),
      url: absoluteUrl(node.href)
    }));

    return uniqueBy(
      links.filter((item) => item.url && !item.url.includes("undefined")),
      (item) => `${item.url}::${item.text}`
    );
  }

  function collectPost(article) {
    return {
      post_id: postId(article),
      post_url: findPermalink(article),
      author: primaryAuthorName(article),
      author_url: primaryAuthorUrl(article),
      date: primaryDate(article),
      content: normalizeText(
        text(article.querySelector(".update-components-text")) ||
        text(article.querySelector(".feed-shared-update-v2__description")) ||
        text(article.querySelector(".feed-shared-text"))
      ),
      links: collectLinks(article),
      collected_at: new Date().toISOString()
    };
  }

  async function processVisiblePosts(seen, results) {
    let newPosts = 0;
    const posts = postNodes();

    for (const article of posts) {
      const id = postId(article);
      if (!id || seen.has(id)) {
        continue;
      }

      try {
        article.scrollIntoView({ block: "center", behavior: "instant" });
      } catch {}

      await sleep(450);
      await expandVisibleMore(article);

      results.push(collectPost(article));
      seen.add(id);
      newPosts += 1;
      await sleep(300);
    }

    return newPosts;
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
      const newPosts = await processVisiblePosts(seen, results);

      window.scrollBy(0, step);
      await sleep(delayMs);

      const currentHeight = document.body.scrollHeight;
      const currentScrollY = window.scrollY;
      const atBottom = window.innerHeight + currentScrollY >= currentHeight;
      const stableHeight = currentHeight === previousHeight;
      const stableScroll = currentScrollY === previousScrollY;

      if (newPosts === 0 && stableHeight && stableScroll && atBottom) {
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
      platform: "linkedin",
      source_type: "feed",
      scroll_rule: "Scrolls until the feed stops extending and the page is no longer meaningfully scrollable.",
      total_posts: results.length,
      items: results
    };

    return download(`linkedin-feed-${slug(document.title)}-${timestamp()}.json`, payload);
  }

  return { run };
})();
