import { test, expect } from "@playwright/test";

/**
 * Food search flow (MASTER_PLAN.md §2 MVP scope: "messes and tiffin
 * services"), parity with core-flow.spec.ts's accommodation journey:
 * search -> add to plan -> budget reflects the food line item.
 */
test.describe("food search journey", () => {
  test("food search returns real results with prices and reasons", async ({ page }) => {
    const destId = await getInfoparkId(page);
    await page.goto(`/food?destinationId=${destId}&radiusKm=15`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Food near Infopark Phase 1");
    const cards = page.locator("li", { has: page.getByText("Add to plan") });
    await expect(cards.first()).toBeVisible();
    await expect(cards.first().getByText(/₹[\d,]+/).first()).toBeVisible();
  });

  test("veg only filter narrows results to veg-only food plans", async ({ page }) => {
    const destId = await getInfoparkId(page);
    await page.goto(`/food?destinationId=${destId}&radiusKm=15`);
    await page.getByLabel("Veg only").check();
    await page.getByRole("button", { name: "Update" }).click();

    await expect(page).toHaveURL(/vegOnly=true/);
    const cards = page.locator("li", { has: page.getByText("Add to plan") });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).getByText("Veg only", { exact: true })).toBeVisible();
    }
  });

  test("add a food plan to a new plan and see it reflected in the real budget", async ({ page }) => {
    const destId = await getInfoparkId(page);
    await page.goto(`/food?destinationId=${destId}&radiusKm=15`);
    const firstCard = page.locator("li").filter({ hasText: "Add to plan" }).first();
    await firstCard.getByRole("button", { name: "Add to plan" }).click();

    await expect(page).toHaveURL(/\/plan\//);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Stay near Infopark Phase 1");
    await expect(page.getByText("meal plan")).toBeVisible();
    await expect(page.getByText("Budget")).toBeVisible();
    await expect(page.getByText(/₹[\d,]+/).first()).toBeVisible();
  });

  test("cross-links between accommodation and food search work", async ({ page }) => {
    const destId = await getInfoparkId(page);
    await page.goto(`/search?destinationId=${destId}&radiusKm=15`);
    await page.getByRole("link", { name: /find food nearby/i }).click();
    await expect(page).toHaveURL(/\/food\?/);

    await page.getByRole("link", { name: /back to places to stay/i }).click();
    await expect(page).toHaveURL(/\/search\?/);
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
