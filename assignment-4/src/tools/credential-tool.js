import { getAgentCredentials } from "../credentials/store.js";

export const credentialToolSchema = {
  name: "credentials_get",
  description:
    "Get the agent's shared login credentials (one Google/account for any site). Optional site is only page context, not a lookup key. Use with browser_type on login/signup forms. Never log passwords in your final reply.",
  parameters: {
    type: "object",
    properties: {
      site: {
        type: "string",
        description: "Optional — domain of the login page you're on (for context only)",
      },
    },
  },
};

export async function handleCredentialTool(args) {
  const result = await getAgentCredentials(args.site);
  return JSON.stringify(result, null, 2);
}