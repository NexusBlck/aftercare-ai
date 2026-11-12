/** Lists Gemini models available to GEMINI_API_KEY so GEMINI_MODEL can be verified. Run: npm run gemini:models */
import { GoogleGenAI } from "@google/genai";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set. Example: GEMINI_API_KEY=... npm run gemini:models");
    process.exit(1);
  }
  const ai = new GoogleGenAI({ apiKey });
  const pager = await ai.models.list();
  for await (const model of pager) {
    if (model.supportedActions?.includes("generateContent")) console.log(model.name);
  }
  console.log(`\nConfigured GEMINI_MODEL: ${process.env.GEMINI_MODEL ?? "(default gemini-3.5-flash)"}`);
}

void main();
