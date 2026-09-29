import { test, expect } from "@playwright/test";

/**
 * AI intake (AI_ARCHITECTURE.md §4): free text -> extractTripRequirements
 * (Groq) -> resolveDestinationByText (real DB match) -> the ordinary
 * /search query string. This sandbox's network policy blocks
 * api.groq.com, so the live extraction call itself cannot succeed here —
 * that's a disclosed environment limitation, not a code path this test
 * pretends works. What it verifies is the contract that has to hold
 * either way: the form is there, submitting it never crashes the page,
 * and a failed/unavailable extraction redirects back to /intake with a
 * plain-English message instead of a 500 or a stuck page.
 */
test.describe("AI intake", () => {
  test("intake page renders the form", async ({ page }) => {
    await page.goto("/intake");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Tell us about your trip");
    await expect(page.getByRole("textbox")).toBeVisible();
    await expect(page.getByRole("button", { name: "Find places for me" })).toBeVisible();
  });

  test("submitting text never crashes the page, even when extraction can't complete", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    await page.goto("/intake");
    await page.getByRole("textbox").fill("I need a place near Infopark Phase 1, budget 8000 per month");
    await page.getByRole("button", { name: "Find places for me" }).click();

    // Either it actually worked (search results) or it degraded gracefully
    // (back on /intake with an error banner) — never a 500 or a blank page.
    await page.waitForURL(/\/(intake|search)/, { timeout: 30_000 });
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Internal Server Error");
    expect(pageErrors).toEqual([]);
  });

  test("submitting empty text redirects back with a validation message", async ({ page }) => {
    await page.goto("/intake");
    // The textarea is `required`, so bypass native validation to exercise
    // the server-side empty-text branch directly.
    await page.evaluate(() => {
      const form = document.querySelector("form:has(textarea)");
      form?.removeAttribute("novalidate");
      const textarea = form?.querySelector("textarea");
      textarea?.removeAttribute("required");
    });
    await page.getByRole("button", { name: "Find places for me" }).click();
    await page.waitForURL(/\/intake\?error=/, { timeout: 10_000 });
    await expect(page.getByText("Tell us a bit about your trip first.")).toBeVisible();
  });
});
