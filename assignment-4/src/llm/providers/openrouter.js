import { OpenAIProvider } from "./openai.js";

export class OpenRouterProvider extends OpenAIProvider {
  /** @param {{ apiKey: string }} options */
  constructor({ apiKey }) {
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for openrouter provider");
    super({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/kartikey/web-automation-agent",
        "X-Title": "Web Automation Agent",
      },
    });
  }
}