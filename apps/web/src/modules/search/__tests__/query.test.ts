import { describe, expect, it } from "vitest";
import { parseAccommodationSearchParams } from "../query.js";

describe("parseAccommodationSearchParams", () => {
  it("parses a minimal valid query", () => {
    const result = parseAccommodationSearchParams({ destinationId: "dest_1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.destinationId).toBe("dest_1");
      expect(result.data.radiusKm).toBe(10); // default
    }
  });

  it("coerces comma-separated kinds into an array", () => {
    const result = parseAccommodationSearchParams({ destinationId: "d", kinds: "PG,HOSTEL" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kinds).toEqual(["PG", "HOSTEL"]);
  });

  it("coerces boolean and numeric string params", () => {
    const result = parseAccommodationSearchParams({
      destinationId: "d",
      foodIncluded: "true",
      ac: "false",
      priceMax: "8000",
      radiusKm: "5.5",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.foodIncluded).toBe(true);
      expect(result.data.ac).toBe(false);
      expect(result.data.priceMax).toBe(8000);
      expect(result.data.radiusKm).toBe(5.5);
    }
  });

  it("handles URLSearchParams-style array values by taking the first", () => {
    const result = parseAccommodationSearchParams({ destinationId: ["d1", "d2"] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.destinationId).toBe("d1");
  });

  it("fails without a destinationId", () => {
    const result = parseAccommodationSearchParams({});
    expect(result.success).toBe(false);
  });
});
