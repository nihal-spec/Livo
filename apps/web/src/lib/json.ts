import { NextResponse } from "next/server";

/**
 * Converts bigint (and, transitively, Date) values into JSON-safe form.
 * `JSON.stringify`/`NextResponse.json` throw on BigInt outright, and every
 * money field in the API is a bigint paise value that API_SPEC.md §0 says
 * must cross the wire as a string. Used both by `jsonResponse` (HTTP) and
 * anywhere a BudgetResult needs to be persisted as JSON (e.g. a
 * BudgetSnapshot row) — the corresponding Zod schemas' `paiseSchema`
 * accepts a numeric string back, so `BudgetResult.parse(toPlainJson(x))`
 * round-trips cleanly.
 */
export function toPlainJson<T>(value: T): T {
  if (typeof value === "bigint") return value.toString() as unknown as T;
  if (value instanceof Date) return value as T; // JSON.stringify handles Date via toISOString natively
  if (Array.isArray(value)) return value.map(toPlainJson) as unknown as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlainJson(v)])) as T;
  }
  return value;
}

export function jsonResponse<T>(body: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(toPlainJson(body), init);
}
