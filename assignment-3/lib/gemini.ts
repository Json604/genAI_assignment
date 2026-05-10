import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY.");
}

const genAI = new GoogleGenerativeAI(apiKey);

export const embeddingModelName = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export const generationModelName = process.env.GEMINI_GENERATION_MODEL || "gemini-2.5-flash";

const embeddingModel = genAI.getGenerativeModel({ model: embeddingModelName });
const generationModel = genAI.getGenerativeModel({
  model: generationModelName,
  systemInstruction:
    "You are a document QA assistant. Answer only from the supplied context. If the context does not contain the answer, say: \"I could not find that in the uploaded document.\" Do not use outside knowledge.",
});

export async function embedText(text: string) {
  const result = await embeddingModel.embedContent(text);
  const values = result.embedding.values;

  if (!values.length) throw new Error("Gemini returned an empty embedding.");
  return values;
}

export async function generateGroundedAnswer(question: string, context: string) {
  const result = await generationModel.generateContent(buildGroundedPrompt(question, context));
  return result.response.text().trim();
}

export async function* streamGroundedAnswer(question: string, context: string) {
  const result = await generationModel.generateContentStream(buildGroundedPrompt(question, context));

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

function buildGroundedPrompt(question: string, context: string) {
  return [
    "Use the context below to answer the user's question.",
    "Rules:",
    "- Only use facts from the context.",
    "- Be concise but complete.",
    "- Cite page or chunk labels when they are present.",
    "- If the context is insufficient, say you could not find the answer in the uploaded document.",
    "",
    "Context:",
    context,
    "",
    `Question: ${question}`,
  ].join("\n");
}
