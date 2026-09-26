import { z } from "zod";

/**
 * The app refuses to boot on invalid config (ARCHITECTURE.md §9). Every env
 * var used anywhere in the app is declared here — no `process.env.X` reads
 * elsewhere in the codebase.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgresql://")),

  // Guest session cookie signing (ADR-008). 32+ byte secret in production.
  GUEST_SESSION_SECRET: z
    .string()
    .min(process.env.NODE_ENV === "production" ? 32 : 1)
    .default("dev-only-insecure-secret-change-me"),

  // Auth.js (added when task 4 wires it up); optional until then.
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // External providers — optional in local/dev so the app degrades
  // gracefully (AI_ARCHITECTURE.md §10, ARCHITECTURE.md §9 "config refuses
  // to boot on invalid config" applies to malformed values, not absence).
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_MAPS_SERVER_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration — refusing to start. See errors above.");
  }
  return parsed.data;
}

export const env = loadEnv();
