import { NextResponse } from "next/server";

/**
 * `NextResponse.json` (like `JSON.stringify`) throws on BigInt. Every money
 * field in the API is a bigint paise value that API_SPEC.md §0 says must
 * cross the wire as a string ("amountPaise as string (bigint-safe)"), so
 * every route handler serializes its response through this helper instead
 * of calling `NextResponse.json` directly.
 */
function bigIntToString<T>(value: T): T {
  if (typeof value === "bigint") return value.toString() as unknown as T;
  if (Array.isArray(value)) return value.map(bigIntToString) as unknown as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, bigIntToString(v)])) as T;
  }
  return value;
}

export function jsonResponse<T>(body: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(bigIntToString(body), init);
}
