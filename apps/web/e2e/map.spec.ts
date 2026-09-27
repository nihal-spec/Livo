import { test, expect } from "@playwright/test";

/**
 * Base map (ADR-010: MapLibre + OSM tiles), parity across /search and
 * /food. This sandbox's network policy blocks tile.openstreetmap.org, so
 * these tests can't assert tiles actually render — that's expected here,
 * not a bug (see MapView.tsx's own comment). What they verify instead is
 * exactly the contract UX_UI_SPEC.md §5.6 requires: a map (or its tile
 * fetch failing) must never take the results list down with it, and must
 * never throw an uncaught error that could break the page.
 */
test.describe("map view", () => {
  test("search page renders a map alongside a fully working list, with no page errors", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    const destId = await getInfoparkId(page);
    await page.goto(`/search?destinationId=${destId}&radiusKm=15`);

    await expect(page.locator('[data-testid="map-view"]').or(page.getByText("Map unavailable"))).toBeVisible();

    const firstCard = page.locator("li").filter({ hasText: "Add to plan" }).first();
    await expect(firstCard).toBeVisible();
    await firstCard.getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(/\/plan\//);

    expect(pageErrors).toEqual([]);
  });

  test("food page renders a map alongside a fully working list, with no page errors", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    const destId = await getInfoparkId(page);
    await page.goto(`/food?destinationId=${destId}&radiusKm=15`);

    await expect(page.locator('[data-testid="map-view"]').or(page.getByText("Map unavailable"))).toBeVisible();

    const firstCard = page.locator("li").filter({ hasText: "Add to plan" }).first();
    await expect(firstCard).toBeVisible();
    await firstCard.getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(/\/plan\//);

    expect(pageErrors).toEqual([]);
  });

  test("an empty result set shows no map, only the empty state", async ({ page }) => {
    const destId = await getInfoparkId(page);
    await page.goto(`/search?destinationId=${destId}&radiusKm=15&priceMax=1`);

    await expect(page.getByText("Nothing matches those filters yet.")).toBeVisible();
    await expect(page.locator('[data-testid="map-view"]')).toHaveCount(0);
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
