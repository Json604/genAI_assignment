/**
 * Truncate snapshot text at line boundaries, preserving ref tags.
 * @param {string} text
 * @param {number} limit
 */
export function truncateSnapshot(text, limit) {
  if (text.length <= limit) return text;

  const lines = text.split("\n");
  const kept = [];
  let size = 0;
  let dropped = 0;

  for (const line of lines) {
    const next = size + line.length + 1;
    if (next > limit) {
      dropped += 1;
      continue;
    }
    kept.push(line);
    size = next;
  }

  if (dropped > 0) {
    kept.push(`[... ${dropped} more lines truncated — use browser_snapshot with full=true if needed]`);
  }

  return kept.join("\n");
}