/**
 * Retry ref-based actions once after refreshing the accessibility snapshot.
 * @param {import('./session.js').BrowserSession} session
 * @param {() => Promise<Record<string, unknown>>} action
 */
export async function withStaleRefRetry(session, action) {
  try {
    return await action();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("Unknown ref") && !message.includes("fresh browser_snapshot")) {
      throw err;
    }

    const fresh = await session.snapshot({ full: false });
    const retry = await action();
    return {
      ...retry,
      stale_ref_recovered: true,
      hint: "Ref was stale; auto-refreshed snapshot and retried.",
      refreshed_element_count: fresh.element_count,
    };
  }
}