import { getSessionDB } from "../memory/session-db.js";
import { getSkillStore } from "../skills/store.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SKILLS_DIR } from "../config.js";

const URL_RE = /https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}/gi;
const FOLLOW_UP_RE =
  /\b(their|them|those|these|same|again|details|now|also|it|that|previous|earlier|before|last time|we found|we did)\b/i;

/**
 * Build extra context from session history + site skill references.
 * @param {string} userTask
 */
export async function prefetchTaskContext(userTask) {
  const blocks = [];
  const domains = extractDomains(userTask);
  const db = await getSessionDB();

  const conversation = db.getRecentConversation(db.sessionId, { maxMessages: 4 });
  if (conversation.length >= 2) {
    blocks.push(
      `## Earlier in this session (follow-up context)\n${conversation
        .map((m) => `**${m.role}:** ${m.content.slice(0, 1500)}`)
        .join("\n\n")}`,
    );
  }

  const workflow = db.getRecentToolWorkflow(db.sessionId, { limit: 10 });
  if (workflow.length && (FOLLOW_UP_RE.test(userTask) || domains.length)) {
    blocks.push(
      `## Recent browser steps in this session\n${workflow.map((w) => `- ${w}`).join("\n")}`,
    );
  }

  const queryDomains = [...domains];
  if (!queryDomains.length && FOLLOW_UP_RE.test(userTask)) {
    const prior = conversation.find((m) => m.role === "user");
    if (prior) queryDomains.push(...extractDomains(prior.content));
  }

  for (const domain of [...new Set(queryDomains)].slice(0, 3)) {
    const ref = await loadSiteReference(domain);
    if (ref) {
      blocks.push(`## Site playbook: ${domain}\n${ref}`);
    }
  }

  if (FOLLOW_UP_RE.test(userTask) || queryDomains.length) {
    const query = queryDomains[0] || userTask.split(/\s+/).slice(0, 4).join(" ");
    const hits = db.search(query, { limit: 5 });
    if (hits.hits?.length) {
      blocks.push(
        `## Related past sessions\n${hits.hits
          .map((h) => `- [${h.role}] ${String(h.snippet || h.content).slice(0, 200)}`)
          .join("\n")}`,
      );
    }
  }

  if (!blocks.length) return userTask;
  return `${userTask}\n\n---\n${blocks.join("\n\n")}`;
}

function extractDomains(text) {
  const matches = text.match(URL_RE) || [];
  const domains = new Set();
  for (const m of matches) {
    try {
      const host = m.includes("://") ? new URL(m).hostname : m;
      domains.add(host.replace(/^www\./, "").toLowerCase());
    } catch {
      domains.add(m.replace(/^www\./, "").toLowerCase());
    }
  }
  return [...domains];
}

async function loadSiteReference(domain) {
  const slug = domain.replace(/[^a-z0-9]+/g, "-");
  const candidates = [
    path.join(SKILLS_DIR, "web-automation", "references", `${slug}.md`),
    path.join(SKILLS_DIR, "web-automation", "references", `${domain}.md`),
  ];
  for (const file of candidates) {
    try {
      return await readFile(file, "utf8");
    } catch {
      // try next
    }
  }
  return null;
}