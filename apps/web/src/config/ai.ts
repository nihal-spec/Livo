import { createGroq } from "@ai-sdk/groq";
import { env } from "./env.js";

/**
 * AI provider config (AI_ARCHITECTURE.md §10): model IDs live here, never
 * scattered through the codebase. Intent extraction uses a small/fast
 * model — high volume, simple schema, no need for a frontier model
 * (AI_ARCHITECTURE.md's task->model table).
 */
export const INTENT_EXTRACTION_MODEL = "llama-3.3-70b-versatile";

export const aiConfigured = Boolean(env.GROQ_API_KEY);

export const groq = env.GROQ_API_KEY ? createGroq({ apiKey: env.GROQ_API_KEY }) : null;
