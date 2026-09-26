import { describe, expect, it } from "vitest";
import { jsonResponse } from "../json.js";

describe("jsonResponse", () => {
  it("serializes top-level and nested bigint values as strings", async () => {
    const res = jsonResponse({ amountPaise: 650_000n, nested: { depositPaise: 1_300_000n } });
    const body = await res.json();
    expect(body).toEqual({ amountPaise: "650000", nested: { depositPaise: "1300000" } });
  });

  it("serializes bigints inside arrays", async () => {
    const res = jsonResponse({ items: [{ price: 100n }, { price: 200n }] });
    const body = await res.json();
    expect(body.items).toEqual([{ price: "100" }, { price: "200" }]);
  });

  it("leaves null and non-bigint values untouched", async () => {
    const res = jsonResponse({ a: null, b: 1, c: "text", d: true });
    const body = await res.json();
    expect(body).toEqual({ a: null, b: 1, c: "text", d: true });
  });

  it("passes through the response init (status code)", async () => {
    const res = jsonResponse({ error: true }, { status: 422 });
    expect(res.status).toBe(422);
  });
});
