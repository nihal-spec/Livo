import { describe, expect, it } from "vitest";
import type { BudgetInput, LineItemInput } from "@livo/schemas";
import { calculateBudget, daysBetween } from "../index.js";

function line(overrides: Partial<LineItemInput> & Pick<LineItemInput, "id" | "category" | "label" | "amountPaise" | "frequency" | "kind">): LineItemInput {
  return {
    quantityPerFrequency: 1,
    refundable: false,
    provenance: { sourceType: "VERIFIED", ref: "test", stale: false },
    ...overrides,
  };
}

const VERIFIED = { sourceType: "VERIFIED" as const, ref: "t", stale: false };
const ESTIMATED = { sourceType: "ESTIMATED" as const, ref: "t", stale: false };

function baseInput(overrides: Partial<BudgetInput> = {}): BudgetInput {
  return {
    startDate: "2026-11-01",
    endDate: "2026-12-01", // 30 days
    people: 1,
    bufferPercent: 10,
    lineItems: [],
    ...overrides,
  };
}

describe("calculateBudget", () => {
  it("computes a straightforward 3-month PG stay (P1 Arjun scenario)", () => {
    const input = baseInput({
      startDate: "2026-11-01",
      endDate: "2027-01-30", // 90 days
      monthlyIncomePaise: 1_500_000n, // ₹15,000
      cashOnHandPaise: 1_000_000n, // ₹10,000
      accommodation: { priceBasis: "PER_MONTH", hasPerDayRate: false },
      lineItems: [
        line({
          id: "rent",
          category: "ACCOMMODATION",
          label: "PG rent",
          amountPaise: 650_000n, // ₹6,500/mo
          frequency: "MONTHLY",
          kind: "FIXED",
          provenance: VERIFIED,
        }),
        line({
          id: "deposit",
          category: "DEPOSIT",
          label: "Deposit",
          amountPaise: 1_300_000n, // ₹13,000
          frequency: "ONE_TIME",
          kind: "FIXED",
          refundable: true,
          provenance: VERIFIED,
        }),
        line({
          id: "commute",
          category: "TRANSPORT",
          label: "Bus to office",
          amountPaise: 1_500n,
          quantityPerFrequency: 10, // 5 trips/week * 2 legs
          frequency: "WEEKLY",
          kind: "VARIABLE",
          provenance: VERIFIED,
        }),
      ],
    });

    const result = calculateBudget(input);
    expect(result.days).toBe(90);
    expect(result.setupPaise).toBe(1_300_000n); // deposit only, food included via rent
    expect(result.refundablePaise).toBe(1_300_000n);
    expect(result.recurring.monthlyPaise).toBeGreaterThan(650_000n); // rent + commute
    expect(result.affordability).not.toBeNull();
    expect(result.affordability!.upfrontShortfallPaise).toBe(300_000n); // 13,000 - 10,000
    expect(result.affordability!.flags).toContain("UPFRONT_EXCEEDS_CASH");
    expect(result.confidence.level).toBe("HIGH");
  });

  it("flags MONTHLY_MIN_CHARGE for a short stay at a monthly-only PG", () => {
    const input = baseInput({
      startDate: "2026-11-01",
      endDate: "2026-11-11", // 10 days
      accommodation: { priceBasis: "PER_MONTH", hasPerDayRate: false },
      lineItems: [
        line({
          id: "rent",
          category: "ACCOMMODATION",
          label: "PG rent",
          amountPaise: 900_000n,
          frequency: "MONTHLY",
          kind: "FIXED",
        }),
      ],
    });
    const result = calculateBudget(input);
    // Full month charged even though the stay is 10 days.
    expect(result.byCategory.ACCOMMODATION).toBe(900_000n);
    expect(result.affordability).toBeNull(); // no income supplied -> flags live nowhere visible,
    // but MONTHLY_MIN_CHARGE must still be surfaced somewhere: re-run with income to check flags.
    const withIncome = calculateBudget({ ...input, monthlyIncomePaise: 2_000_000n });
    expect(withIncome.affordability!.flags).toContain("MONTHLY_MIN_CHARGE");
  });

  it("does not charge a full month when a per-day rate is available", () => {
    const input = baseInput({
      startDate: "2026-11-01",
      endDate: "2026-11-11", // 10 days
      accommodation: { priceBasis: "PER_MONTH", hasPerDayRate: true },
      lineItems: [
        line({
          id: "rent",
          category: "ACCOMMODATION",
          label: "PG rent",
          amountPaise: 900_000n,
          frequency: "MONTHLY",
          kind: "FIXED",
        }),
      ],
    });
    const result = calculateBudget(input);
    // 10/30 of the monthly rate, not the full month.
    expect(result.byCategory.ACCOMMODATION).toBe(300_000n);
  });

  it("food included in rent contributes zero food cost, with a partial top-up line allowed", () => {
    const input = baseInput({
      lineItems: [
        line({
          id: "rent",
          category: "ACCOMMODATION",
          label: "PG rent (food included)",
          amountPaise: 800_000n,
          frequency: "MONTHLY",
          kind: "FIXED",
        }),
        line({
          id: "lunch-topup",
          category: "FOOD",
          label: "Lunch (not included)",
          amountPaise: 8_000n,
          frequency: "DAILY",
          kind: "VARIABLE",
          provenance: ESTIMATED,
        }),
      ],
    });
    const result = calculateBudget(input);
    expect(result.byCategory.FOOD).toBe(8_000n * 30n);
    expect(result.confidence.level).toBe("MEDIUM"); // one estimated line
  });

  it("returns no affordability block when income is not supplied (guest, no salary given)", () => {
    const result = calculateBudget(baseInput({ lineItems: [] }));
    expect(result.affordability).toBeNull();
    expect(result.tripTotalPaise).toBe(0n); // buffer of 10% of 0 recurring = 0
  });

  it("flags a deposit that exceeds cash on hand even with healthy income", () => {
    const input = baseInput({
      monthlyIncomePaise: 5_000_000n,
      cashOnHandPaise: 100_000n,
      lineItems: [
        line({
          id: "deposit",
          category: "DEPOSIT",
          label: "Deposit",
          amountPaise: 2_000_000n,
          frequency: "ONE_TIME",
          kind: "FIXED",
          refundable: true,
        }),
      ],
    });
    const result = calculateBudget(input);
    expect(result.affordability!.upfrontShortfallPaise).toBe(1_900_000n);
    expect(result.affordability!.flags).toContain("UPFRONT_EXCEEDS_CASH");
  });

  it("divides the trip total across people for a family/group stay", () => {
    const input = baseInput({
      people: 4,
      lineItems: [
        line({
          id: "unit",
          category: "ACCOMMODATION",
          label: "Whole unit",
          amountPaise: 4_000_00n,
          frequency: "MONTHLY",
          kind: "FIXED",
        }),
      ],
    });
    const result = calculateBudget(input);
    expect(result.perPersonTotalPaise).toBe(result.tripTotalPaise / 4n);
  });

  it("handles a single-night stay priced per night", () => {
    const input = baseInput({
      startDate: "2026-11-01",
      endDate: "2026-11-02", // 1 day
      lineItems: [
        line({
          id: "hotel",
          category: "ACCOMMODATION",
          label: "Budget hotel",
          amountPaise: 150_000n,
          frequency: "PER_NIGHT",
          kind: "FIXED",
        }),
      ],
    });
    const result = calculateBudget(input);
    expect(result.days).toBe(1);
    expect(result.byCategory.ACCOMMODATION).toBe(150_000n);
  });

  it("handles a long 180-day stay without overflow or precision loss", () => {
    const input = baseInput({
      startDate: "2026-11-01",
      endDate: "2027-04-30", // 180 days
      lineItems: [
        line({
          id: "rent",
          category: "ACCOMMODATION",
          label: "Room rental",
          amountPaise: 700_000n,
          frequency: "MONTHLY",
          kind: "FIXED",
        }),
      ],
    });
    const result = calculateBudget(input);
    expect(result.days).toBe(180);
    // 180/30 = 6 whole months exactly.
    expect(result.byCategory.ACCOMMODATION).toBe(700_000n * 6n);
  });

  it("daysBetween never returns less than 1", () => {
    expect(daysBetween("2026-11-01", "2026-11-01")).toBe(1);
  });

  it("keeps visible totals internally consistent (sum of category lines includes buffer)", () => {
    const input = baseInput({
      lineItems: [
        line({
          id: "rent",
          category: "ACCOMMODATION",
          label: "Rent",
          amountPaise: 600_000n,
          frequency: "MONTHLY",
          kind: "FIXED",
        }),
      ],
    });
    const result = calculateBudget(input);
    const categorySum = Object.values(result.byCategory).reduce((a, b) => a + b, 0n);
    expect(categorySum).toBe(result.tripTotalPaise);
  });
});
