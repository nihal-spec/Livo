import { test, expect } from "@playwright/test";

/**
 * The core guest journey (MASTER_PLAN.md §7, journey J1): landing -> search
 * -> add to plan -> budget -> compare -> what-if -> share. Everything here
 * runs against a real Postgres-backed server, exercising the exact flow
 * verified by hand with curl during development.
 */

test.describe("core guest journey", () => {
  test("landing page lists real seeded destinations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan your stay");
    const select = page.locator('select[name="destinationId"]');
    await expect(select.locator("option", { hasText: "Infopark Phase 1" })).toHaveCount(1);
  });

  test("search returns results with real prices, commute and reasons", async ({ page }) => {
    await page.goto("/");
    await page.selectOption('select[name="destinationId"]', { label: "Infopark Phase 1" });
    await page.getByRole("button", { name: /see places/i }).click();

    await expect(page).toHaveURL(/\/search\?/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Places to stay near");
    const cards = page.locator("li", { has: page.getByText("Add to plan") });
    await expect(cards.first()).toBeVisible();
    await expect(cards.first().getByText(/₹[\d,]+/).first()).toBeVisible();
  });

  test("add to plan creates a plan and shows a real budget", async ({ page }) => {
    await page.goto("/search?destinationId=" + (await getInfoparkId(page)) + "&radiusKm=15");
    const firstCard = page.locator("li").filter({ hasText: "Add to plan" }).first();
    await firstCard.getByRole("button", { name: "Add to plan" }).click();

    await expect(page).toHaveURL(/\/plan\//);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Stay near Infopark Phase 1");
    await expect(page.getByText("Budget")).toBeVisible();
    await expect(page.getByText("Trip total")).toBeVisible();
    await expect(page.getByText(/₹[\d,]+/).first()).toBeVisible();
  });

  test("compare shows two listings side by side with a trade-off sentence", async ({ page }) => {
    const destId = await getInfoparkId(page);
    await page.goto(`/search?destinationId=${destId}&radiusKm=15`);

    // Compare checkboxes are the ones inside listing cards; select the first two.
    const compareCheckboxes = page.locator("li").filter({ hasText: "Add to plan" }).locator('input[type="checkbox"]');
    await compareCheckboxes.nth(0).check();
    await compareCheckboxes.nth(1).check();

    await page.getByRole("link", { name: /Compare \(2\)/ }).click();
    await expect(page).toHaveURL(/\/compare\?/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Compare 2 places");
    await expect(page.getByText("Price")).toBeVisible();
    await expect(page.getByText(/is cheaper than/)).toBeVisible();
  });

  test("what-if lever produces a scenario card with a delta or an honest not-found note", async ({ page }) => {
    const destId = await getInfoparkId(page);
    await page.goto(`/search?destinationId=${destId}&radiusKm=15`);
    // Pick the most expensive-looking card by adding the last one (dev fixtures put pricier PGs later).
    const cards = page.locator("li").filter({ hasText: "Add to plan" });
    await cards.nth(await cards.count() - 1).getByRole("button", { name: "Add to plan" }).click();

    await expect(page).toHaveURL(/\/plan\//);
    const cheaperButton = page.getByRole("button", { name: "Cheaper" });
    await expect(cheaperButton).toBeVisible();
    await cheaperButton.click();

    await expect(page).toHaveURL(/scenario=/);
    // Either a found alternative with a cost delta, or an honest "no place found" note.
    await expect(page.getByText(/₹[\d,]+|No place at least/).first()).toBeVisible();
  });

  test("share link is read-only for a different visitor", async ({ page, browser }) => {
    const destId = await getInfoparkId(page);
    await page.goto(`/search?destinationId=${destId}&radiusKm=15`);
    await page.locator("li").filter({ hasText: "Add to plan" }).first().getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(/\/plan\//);

    await page.getByRole("button", { name: "Get a share link" }).click();
    const shareCode = page.locator("code");
    await expect(shareCode).toBeVisible();
    const shareHref = await shareCode.textContent();
    expect(shareHref).toContain("?share=");

    // A different browser context = a different guest cookie = a different visitor.
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await otherPage.goto(shareHref!.trim());
    await expect(otherPage.getByText("You're viewing a shared, read-only copy of this plan.")).toBeVisible();
    await expect(otherPage.getByRole("button", { name: "Remove" })).toHaveCount(0);
    await expect(otherPage.getByText("Trip total")).toBeVisible(); // budget still shown (see MASTER_PLAN §7 journey J3)
    await otherContext.close();

    // No token at all -> forbidden.
    const thirdContext = await browser.newContext();
    const thirdPage = await thirdContext.newPage();
    const planUrl = page.url();
    await thirdPage.goto(planUrl);
    await expect(thirdPage.getByText("This plan is private")).toBeVisible();
    await thirdContext.close();
  });
});

async function getInfoparkId(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/");
  const value = await page
    .locator('select[name="destinationId"] option', { hasText: "Infopark Phase 1" })
    .getAttribute("value");
  if (!value) throw new Error("Infopark Phase 1 destination not found in seed data");
  return value;
}
