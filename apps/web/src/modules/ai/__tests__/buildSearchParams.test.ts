import { describe, expect, it } from "vitest";
import { emptyTripRequirements } from "@livo/schemas";
import type { TripRequirements } from "@livo/schemas";
import { buildSearchParams } from "../buildSearchParams.js";

function reqs(overrides: Partial<TripRequirements> = {}): TripRequirements {
  return { ...emptyTripRequirements(), ...overrides };
}

describe("buildSearchParams", () => {
  it("always sets destinationId", () => {
    const params = buildSearchParams(reqs(), "dest_1");
    expect(params.get("destinationId")).toBe("dest_1");
  });

  it("maps a monthly budget to priceMax", () => {
    const params = buildSearchParams(reqs({ budget: { amountInr: 8000, period: "MONTH" } }), "dest_1");
    expect(params.get("priceMax")).toBe("8000");
  });

  it("does not set priceMax for a non-monthly budget period", () => {
    const params = buildSearchParams(reqs({ budget: { amountInr: 50000, period: "TRIP" } }), "dest_1");
    expect(params.get("priceMax")).toBeNull();
  });

  it("maps genderPolicyNeeded, skipping ANY", () => {
    expect(buildSearchParams(reqs({ genderPolicyNeeded: "WOMEN" }), "d").get("genderPolicy")).toBe("WOMEN");
    expect(buildSearchParams(reqs({ genderPolicyNeeded: "ANY" }), "d").get("genderPolicy")).toBeNull();
  });

  it("maps required food/AC to boolean filters, but not preferred/no", () => {
    const required = reqs({ accommodation: { kinds: [], occupancy: "ANY", ac: "REQUIRED", privateBath: null, foodIncluded: "REQUIRED" } });
    const params = buildSearchParams(required, "d");
    expect(params.get("ac")).toBe("true");
    expect(params.get("foodIncluded")).toBe("true");

    const preferred = reqs({ accommodation: { kinds: [], occupancy: "ANY", ac: "PREFERRED", privateBath: null, foodIncluded: "NO" } });
    const params2 = buildSearchParams(preferred, "d");
    expect(params2.get("ac")).toBeNull();
    expect(params2.get("foodIncluded")).toBeNull();
  });

  it("joins accommodation kinds with a comma", () => {
    const params = buildSearchParams(
      reqs({ accommodation: { kinds: ["PG", "HOSTEL"], occupancy: "ANY", ac: null, privateBath: null, foodIncluded: null } }),
      "d",
    );
    expect(params.get("kinds")).toBe("PG,HOSTEL");
  });

  it("maps maxCommuteMin", () => {
    const params = buildSearchParams(
      reqs({ transport: { hasVehicle: null, preferredModes: [], maxCommuteMin: 30 } }),
      "d",
    );
    expect(params.get("maxCommuteMin")).toBe("30");
  });
});
