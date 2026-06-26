import { loadConfig } from "../config.js";
import { GeminiProvider } from "./providers/gemini.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenRouterProvider } from "./providers/openrouter.js";

const PROVIDERS = {
  gemini: () =>
    new GeminiProvider({
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    }),
  openai: () =>
    new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY,
    }),
  anthropic: () =>
    new AnthropicProvider({
      apiKey: process.env.ANTHROPIC_API_KEY,
    }),
  openrouter: () =>
    new OpenRouterProvider({
      apiKey: process.env.OPENROUTER_API_KEY,
    }),
};

export function createLLMProvider(providerName) {
  const name = (providerName || loadConfig().llmProvider).toLowerCase();
  const factory = PROVIDERS[name];
  if (!factory) {
    throw new Error(
      `Unknown LLM provider "${name}". Supported: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return factory();
}

export function listProviders() {
  return Object.keys(PROVIDERS);
}