import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../config.js";

const CREDS_PATH = path.join(DATA_DIR, "credentials.json");
const DEFAULT_KEY = "default";

/**
 * @typedef {{ username?: string; password?: string; email?: string; notes?: string }} CredentialEntry
 */

/**
 * Load the agent's shared login credentials (one account for any site).
 * @param {string} [site] Optional context — which login page you're on (not a lookup key).
 */
export async function getAgentCredentials(site) {
  const page = (site || "").toLowerCase().replace(/^www\./, "") || undefined;

  /** @type {Record<string, CredentialEntry> | CredentialEntry} */
  let store;

  try {
    await mkdir(DATA_DIR, { recursive: true });
    store = JSON.parse(await readFile(CREDS_PATH, "utf8"));
  } catch {
    return {
      success: false,
      error: "No credentials file at data/credentials.json — copy credentials.json.example",
    };
  }

  const entry = resolveDefaultEntry(store);
  if (!entry) {
    return {
      success: false,
      error:
        "No agent credentials in data/credentials.json — set email/username and password under \"default\" or at top level",
    };
  }

  return {
    success: true,
    source: "default",
    page,
    email: entry.email || entry.username || "",
    username: entry.username || entry.email || "",
    password: entry.password || "",
    notes: entry.notes || "",
  };
}

/** @param {Record<string, CredentialEntry> | CredentialEntry} store */
function resolveDefaultEntry(store) {
  if (!store || typeof store !== "object") return null;

  if (isCredentialEntry(store)) {
    return store;
  }

  const keyed = /** @type {Record<string, CredentialEntry>} */ (store);
  if (keyed[DEFAULT_KEY] && isCredentialEntry(keyed[DEFAULT_KEY])) {
    return keyed[DEFAULT_KEY];
  }

  return null;
}

/** @param {unknown} value */
function isCredentialEntry(value) {
  if (!value || typeof value !== "object") return false;
  const v = /** @type {CredentialEntry} */ (value);
  return Boolean((v.email || v.username) && v.password);
}

/** @deprecated Use getAgentCredentials */
export async function getCredentialsForSite(site) {
  return getAgentCredentials(site);
}