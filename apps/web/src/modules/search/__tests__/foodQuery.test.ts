import { describe, expect, it } from "vitest";
import { parseFoodSearchParams } from "../foodQuery.js";

describe("parseFoodSearchParams", () => {
  it("parses a minimal valid query", () => {
    const result = parseFoodSearchParams({ destinationId: "dest_1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.destinationId).toBe("dest_1");
      expect(result.data.radiusKm).toBe(3); // default
    }
  });

  it("coerces comma-separated kinds into an array", () => {
    const result = parseFoodSearchParams({ destinationId: "d", kinds: "MESS,TIFFIN" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kinds).toEqual(["MESS", "TIFFIN"]);
  });

  it("coerces boolean and numeric string params", () => {
    const result = parseFoodSearchParams({
      destinationId: "d",
      vegOnly: "true",
      priceMax: "5000",
      radiusKm: "2.5",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vegOnly).toBe(true);
      expect(result.data.priceMax).toBe(5000);
      expect(result.data.radiusKm).toBe(2.5);
    }
  });

  it("fails without a destinationId", () => {
    const result = parseFoodSearchParams({});
    expect(result.success).toBe(false);
  });

  it("treats an empty priceMax field as not set, not as 0", () => {
    const result = parseFoodSearchParams({ destinationId: "d", priceMax: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priceMax).toBeUndefined();
  });
});
