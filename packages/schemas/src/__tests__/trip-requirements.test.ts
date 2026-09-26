import { describe, expect, it } from "vitest";
import { emptyTripRequirements, TripRequirements } from "../trip-requirements.js";

describe("emptyTripRequirements", () => {
  it("produces a value that validates against the schema itself", () => {
    // Regression: every optional-but-not-`.optional()` nullable field must
    // be explicitly present, or TripRequirementsV1.parse throws.
    const value = emptyTripRequirements();
    expect(() => TripRequirements.parse(value)).not.toThrow();
    expect(value.food.mealsPerDay).toBeNull();
    expect(value.v).toBe(1);
  });
});
