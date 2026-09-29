import { test, expect } from "@playwright/test";

/**
 * The guided plan wizard: landing form -> one plan -> step 1 pick a stay
 * -> step 2 pick food -> budget updates -> edit trip details. Picking again
 * in a step replaces that step's choice instead of piling up items.
 */
test.describe("guided plan wizard", () => {
  test("start a plan, fill stay and food, see the budget, edit trip details", async ({ page }) => {
    await page.goto("/");
    await page.selectOption('select[name="destinationId"]', { label: "Infopark Phase 1" });
    await page.fill('input[name="budget"]', "12000");
    await page.getByRole("button", { name: /see places/i }).click();

    await expect(page).toHaveURL(/\/plan\//);
    const planUrl = page.url();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Stay near Infopark Phase 1");

    // Step 1: stay.
    await page.getByRole("link", { name: /find a place to stay/i }).click();
    await expect(page).toHaveURL(/\/search\?.*planId=/);
    await expect(page.getByText(/Step 1/)).toBeVisible();
    await page.locator("li").filter({ hasText: "Add to plan" }).first().getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(planUrl);
    await expect(page.getByText("Trip total")).toBeVisible();

    // Changing the stay replaces it rather than adding a second one.
    await page.getByRole("link", { name: /^change$/i }).first().click();
    await expect(page).toHaveURL(/\/search\?.*planId=/);
    await page.locator("li").filter({ hasText: "Add to plan" }).nth(1).getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(planUrl);

    // Step 2: food (skipped automatically when the stay includes meals).
    const findFood = page.getByRole("link", { name: /find food nearby/i });
    if (await findFood.count()) {
      await findFood.click();
      await expect(page).toHaveURL(/\/food\?.*planId=/);
      await expect(page.getByText(/Step 2/)).toBeVisible();
      await page.locator("li").filter({ hasText: "Add to plan" }).first().getByRole("button", { name: "Add to plan" }).click();
      await expect(page).toHaveURL(planUrl);
      await expect(page.getByText("meal plan")).toBeVisible();
    }

    await page.goto("/plans");
    await expect(page.getByText(/^2 items$|^1 item$/).first()).toBeVisible();
    await expect(page.getByText(/3 items/)).toHaveCount(0);

    // Edit trip details.
    await page.goto(planUrl);
    await page.getByText("Trip details").click();
    await page.fill('input[name="budget"]', "25000");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page).toHaveURL(planUrl);
    await expect(page.locator('input[name="budget"]')).toHaveValue("25000");
  });

  test("an end date before the start date is rejected with a message", async ({ page }) => {
    await page.goto("/");
    await page.selectOption('select[name="destinationId"]', { label: "Infopark Phase 1" });
    await page.getByRole("button", { name: /see places/i }).click();
    await expect(page).toHaveURL(/\/plan\//);

    await page.getByText("Trip details").click();
    await page.fill('input[name="startDate"]', "2026-12-10");
    await page.fill('input[name="endDate"]', "2026-12-01");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page).toHaveURL(/detailsError=/);
    await expect(page.locator("form p.text-red-700")).toBeVisible();
  });
});
