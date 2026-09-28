import { generateObject } from "ai";
import { TripRequirementsV1, emptyTripRequirements } from "@livo/schemas";
import type { TripRequirements } from "@livo/schemas";
import { aiConfigured, groq, INTENT_EXTRACTION_MODEL } from "@/config/ai.js";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI intake is not configured (no GROQ_API_KEY)");
  }
}

/**
 * NL text -> structured TripRequirements (AI_ARCHITECTURE.md §4). The
 * model's only job is to fill in this schema — it never sees or returns
 * search results, prices, or place IDs, so there is nothing here for the
 * "never invent a number/ID" guardrail to police: those only enter the
 * pipeline downstream, from the real database, once buildSearchParams
 * hands this off to the existing deterministic search.
 */
const SYSTEM_PROMPT = `You extract structured trip/relocation requirements from a person's own description of their situation, for a website that helps people find temporary housing near a destination in Kerala, India.

Rules:
- Only fill in fields the text actually supports. Leave anything unstated as null (or an empty array/list default) — never guess a destination, date, or price that wasn't mentioned.
- "destinationText" should be the person's own words for where they need to be (a company name, area, hospital, college, station) — do not normalize it to a database ID; that happens separately.
- Money amounts are in INR. If the person gives a range, use the midpoint.
- List every field you left null (or defaulted) in "missing" as a short human label (e.g. "move-in date", "budget"), so the UI can ask a follow-up.
- Set "confidence" only for fields you did fill in, as HIGH/MEDIUM/LOW.`;

export async function extractTripRequirements(text: string): Promise<TripRequirements> {
  if (!aiConfigured || !groq) throw new AiNotConfiguredError();

  const { object } = await generateObject({
    model: groq(INTENT_EXTRACTION_MODEL),
    schema: TripRequirementsV1.omit({ v: true }),
    system: SYSTEM_PROMPT,
    prompt: text,
  });

  return TripRequirementsV1.parse({ ...emptyTripRequirements(), ...object, v: 1 });
}
