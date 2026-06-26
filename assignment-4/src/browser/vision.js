import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createLLMProvider } from "../llm/registry.js";
import { loadConfig } from "../config.js";

/**
 * Screenshot + vision LLM analysis (escalation tier).
 * @param {import('playwright').Page} page
 * @param {{ question: string }} options
 */
export async function analyzePageVisually(page, { question }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "web-agent-vision-"));
  const shotPath = path.join(dir, "screenshot.png");

  try {
    await page.screenshot({ path: shotPath, fullPage: false });
    const buffer = await import("node:fs/promises").then((fs) => fs.readFile(shotPath));
    const base64 = buffer.toString("base64");

    const config = loadConfig();
    const llm = createLLMProvider(config.llmProvider);

    if (!llm.supportsVision()) {
      return {
        success: false,
        error: `Provider "${config.llmProvider}" does not support vision. Try gemini, openai, or anthropic.`,
      };
    }

    const analysis = await llm.chat({
      model: config.llmModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: question || "Describe the page content relevant to the user task." },
            { type: "image", mimeType: "image/png", data: base64 },
          ],
        },
      ],
    });

    return {
      success: true,
      analysis: analysis.content || "(no analysis)",
      method: "vision",
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}