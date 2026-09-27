import { test, expect } from "@playwright/test";

/**
 * Saved plans list (MASTER_PLAN.md §39 V1 item): "my plans" for a
 * guest-first, not-signed-in visitor means "plans owned by this browser's
 * guest session cookie" (ADR-008) — a fresh browser context has none yet.
 */
test.describe("saved plans list", () => {
  test("a fresh visitor sees the empty state", async ({ page }) => {
    await page.goto("/plans");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("My plans");
    await expect(page.getByText("No plans yet.")).toBeVisible();
  });

  test("a plan created via search shows up in the list, and the list link returns to it", async ({ page }) => {
    await page.goto("/");
    await page.selectOption('select[name="destinationId"]', { label: "Infopark Phase 1" });
    await page.getByRole("button", { name: /see places/i }).click();
    await expect(page).toHaveURL(/\/search\?/);

    const firstCard = page.locator("li").filter({ hasText: "Add to plan" }).first();
    await firstCard.getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(/\/plan\//);
    const planUrl = page.url();

    await page.getByRole("link", { name: /my plans/i }).click();
    await expect(page).toHaveURL(/\/plans$/);
    await expect(page.getByText("No plans yet.")).toHaveCount(0);
    await expect(page.getByText("Job relocation · Infopark Phase 1")).toBeVisible();
    await expect(page.getByText("1 item")).toBeVisible();

    await page.getByRole("link", { name: /stay near infopark phase 1/i }).click();
    await expect(page).toHaveURL(planUrl);
  });

  test("a share-view visitor does not see the My plans link (read-only)", async ({ page, browser }) => {
    await page.goto("/");
    await page.selectOption('select[name="destinationId"]', { label: "Infopark Phase 1" });
    await page.getByRole("button", { name: /see places/i }).click();
    const firstCard = page.locator("li").filter({ hasText: "Add to plan" }).first();
    await firstCard.getByRole("button", { name: "Add to plan" }).click();
    await page.getByRole("button", { name: /get a share link/i }).click();

    const shareUrl = await page.locator("code").innerText();
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await otherPage.goto(shareUrl);
    await expect(otherPage.getByRole("link", { name: /my plans/i })).toHaveCount(0);
    await otherContext.close();
  });
});
