const BOT_URL_PATTERNS = [
  /\/sorry\//i,
  /google\.com\/sorry/i,
  /captcha/i,
  /challenge-platform/i,
  /cf-browser-verification/i,
  /just a moment/i,
  /attention required/i,
  /verify you are human/i,
];

const BOT_TITLE_PATTERNS = [
  /^sorry$/i,
  /unusual traffic/i,
  /verify/i,
  /just a moment/i,
  /attention required/i,
];

const BOT_SNIPPET_PATTERNS = [
  /unusual traffic from your computer network/i,
  /verify you are not a robot/i,
  /our systems have detected unusual traffic/i,
  /enable javascript to continue/i,
  /checking your browser/i,
  /please complete the security check/i,
];

/**
 * @param {{ url?: string; title?: string; snapshot?: string; bodyText?: string }} page
 */
export function detectBotWall(page) {
  const url = page.url || "";
  const title = page.title || "";
  const haystack = [page.snapshot || "", page.bodyText || ""].join("\n");

  const urlHit = BOT_URL_PATTERNS.some((re) => re.test(url));
  const titleHit = BOT_TITLE_PATTERNS.some((re) => re.test(title.trim()));
  const textHit = BOT_SNIPPET_PATTERNS.some((re) => re.test(haystack));

  if (!urlHit && !titleHit && !textHit) {
    return { blocked: false };
  }

  let platform = "unknown";
  if (/google/i.test(url) || /google/i.test(title)) platform = "google";
  else if (/cloudflare/i.test(haystack)) platform = "cloudflare";
  else if (/bing/i.test(url)) platform = "bing";

  return {
    blocked: true,
    platform,
    reason:
      platform === "google"
        ? "Google blocked automated access (CAPTCHA / unusual traffic page)."
        : "Site blocked automated access (bot protection / CAPTCHA).",
    suggestion:
      platform === "google"
        ? "Use browser_search with engine=duckduckgo or engine=bing instead of typing into Google."
        : "Wait for the user to complete verification in the browser — do not fail the task.",
    user_action:
      "A bot verification (CAPTCHA / Cloudflare) is showing in the browser window. Complete it there, then reply done.",
    agent_must_not_fail: true,
  };
}