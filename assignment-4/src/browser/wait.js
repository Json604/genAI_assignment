const LAZY_COUNT_SELECTOR =
  "a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=combobox], [role=tab]";

/** Fast element count — avoids full a11y snapshot during scroll-wait. */
async function countInteractiveElements(page) {
  return page.locator(LAZY_COUNT_SELECTOR).count();
}

/**
 * Wait for lazy-loaded content: scroll until interactive element count stabilizes.
 * @param {import('playwright').Page} page
 * @param {import('./ref-registry.js').RefRegistry} [_registry] unused — kept for call-site compat
 * @param {{ maxRounds?: number; step?: number }} options
 */
export async function waitForLazyContent(page, _registry, { maxRounds = 2, step = 700 } = {}) {
  let lastCount = 0;
  let stableRounds = 0;

  for (let i = 0; i < maxRounds; i += 1) {
    const count = await countInteractiveElements(page);

    if (count === lastCount) {
      stableRounds += 1;
      if (stableRounds >= 1) break;
    } else {
      stableRounds = 0;
      lastCount = count;
    }

    await page.mouse.wheel(0, step);
    await page.waitForTimeout(400);
  }

  return { element_count: lastCount, stable: stableRounds >= 1 };
}

/** @param {import('playwright').Page} page */
export async function waitForNetworkSettle(page, timeoutMs = 1500) {
  try {
    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
  } catch {
    await page.waitForTimeout(300);
  }
}