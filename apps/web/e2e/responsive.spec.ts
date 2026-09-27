import { test, expect } from "@playwright/test";

/**
 * UX_UI_SPEC.md §6: 360px must never scroll horizontally, and the primary
 * CTA must stay reachable. Runs on the "mobile-360" project (see
 * playwright.config.ts) as well as desktop chromium.
 */
test.describe("responsive layout", () => {
  test("landing page has no horizontal scroll at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px tolerance for subpixel rounding
  });

  test("search results have no horizontal scroll at 360px and the Add to plan CTA is reachable", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    const destId = await page
      .locator('select[name="destinationId"] option', { hasText: "Infopark Phase 1" })
      .getAttribute("value");
    await page.goto(`/search?destinationId=${destId}&radiusKm=15`);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    await expect(page.getByRole("button", { name: "Add to plan" }).first()).toBeVisible();
  });
});
