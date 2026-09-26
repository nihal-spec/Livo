import { describe, expect, it } from "vitest";
import { addPaise, clampPaise, formatPaise, formatPaiseRange, paiseToRupees, rupeesToPaise } from "../money.js";

describe("money helpers", () => {
  it("converts rupees to paise and back", () => {
    expect(rupeesToPaise(6500)).toBe(650_000n);
    expect(paiseToRupees(650_000n)).toBe(6500);
  });

  it("formats paise as en-IN rupees with lakh grouping", () => {
    expect(formatPaise(650_000n)).toBe("₹6,500");
    expect(formatPaise(150_000_00n)).toBe("₹1,50,000");
    expect(formatPaise(650_000n, { withSymbol: false })).toBe("6,500");
  });

  it("formats a range, collapsing when min equals max", () => {
    expect(formatPaiseRange(600_000n, 700_000n)).toBe("₹6,000–7,000");
    expect(formatPaiseRange(600_000n, 600_000n)).toBe("₹6,000");
  });

  it("adds several paise values", () => {
    expect(addPaise(100n, 200n, 300n)).toBe(600n);
    expect(addPaise()).toBe(0n);
  });

  it("clamps a value to a range", () => {
    expect(clampPaise(50n, 100n, 200n)).toBe(100n);
    expect(clampPaise(250n, 100n, 200n)).toBe(200n);
    expect(clampPaise(150n, 100n, 200n)).toBe(150n);
  });
});
