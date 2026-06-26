import { loadConfig } from "../config.js";

export function validateApiKey() {
  const provider = loadConfig().llmProvider;
  const keys = {
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };
  if (!keys[provider]) {
    throw new Error(
      `Missing API key for provider "${provider}". Copy .env.example to .env and set the key in assignment-4/.env`,
    );
  }
}