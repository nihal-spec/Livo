import { describe, expect, it } from "vitest";
import { resolveDestinationByText } from "../resolveDestination.js";

describe("resolveDestinationByText", () => {
  it("returns null for empty/null text", async () => {
    expect(await resolveDestinationByText(null)).toBeNull();
    expect(await resolveDestinationByText("")).toBeNull();
    expect(await resolveDestinationByText("   ")).toBeNull();
  });

  it("matches an exact destination name, case-insensitively", async () => {
    const result = await resolveDestinationByText("infopark phase 1");
    expect(result?.name).toBe("Infopark Phase 1");
  });

  it("matches when the text is a short substring of the destination name", async () => {
    const result = await resolveDestinationByText("Infopark");
    expect(result?.name).toMatch(/Infopark/);
  });

  it("matches when the destination name is a substring of a longer sentence", async () => {
    const result = await resolveDestinationByText("I'll be working near Infopark Phase 1 starting in November");
    expect(result?.name).toBe("Infopark Phase 1");
  });

  it("returns null for a destination that doesn't exist", async () => {
    const result = await resolveDestinationByText("Someplace Completely Fictional Xyzzy");
    expect(result).toBeNull();
  });
});
