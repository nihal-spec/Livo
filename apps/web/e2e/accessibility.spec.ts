import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * ARCHITECTURE.md §14: "axe-core in Playwright ... 0 serious/critical
 * violations on MVP screens" (MASTER_PLAN.md §49 acceptance criteria).
 */
test.describe("accessibility", () => {
  test("landing page has no serious or critical violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("search results page has no serious or critical violations", async ({ page }) => {
    await page.goto("/");
    const destId = await page
      .locator('select[name="destinationId"] option', { hasText: "Infopark Phase 1" })
      .getAttribute("value");
    await page.goto(`/search?destinationId=${destId}&radiusKm=15`);

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
