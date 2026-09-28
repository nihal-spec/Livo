import { test, expect } from "@playwright/test";

/**
 * Real sign-in (ADR-007/008: Auth.js v5, Google OAuth, database sessions).
 * The interactive Google consent screen itself can't be driven here — it
 * needs a real Google account and lives on accounts.google.com, outside
 * anything this suite controls — so these tests cover what's actually
 * ours to verify: the landing page offers sign-in, and clicking it
 * produces a real, correctly-formed redirect to Google (not a broken
 * link or a 500), with guest mode fully unaffected either way.
 */
test.describe("sign-in", () => {
  test("landing page offers Google sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  });

  test("clicking sign-in redirects to Google's real OAuth endpoint with the right client and callback", async ({
    page,
  }) => {
    // This sandbox's outbound TLS proxy uses a CA Chromium doesn't trust,
    // so actually completing the handshake into accounts.google.com fails
    // with ERR_CERT_AUTHORITY_INVALID — confirmed by hand, and expected
    // here (see MapView.tsx / e2e/map.spec.ts for the same category of
    // sandbox limitation). Intercepting the request lets this test assert
    // on the real, fully-formed redirect URL without needing that
    // handshake to succeed.
    let googleRequestUrl: string | undefined;
    await page.route("https://accounts.google.com/**", async (route) => {
      googleRequestUrl = route.request().url();
      await route.fulfill({ status: 200, body: "" });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.waitForTimeout(2000);

    expect(googleRequestUrl).toBeDefined();
    const url = new URL(googleRequestUrl!);
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("client_id")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toContain("/api/auth/callback/google");
    expect(url.searchParams.get("scope")).toContain("email");
  });

  test("guest mode still works fully for a visitor who never signs in", async ({ page }) => {
    await page.goto("/");
    await page.selectOption('select[name="destinationId"]', { label: "Infopark Phase 1" });
    await page.getByRole("button", { name: /see places/i }).click();
    const firstCard = page.locator("li").filter({ hasText: "Add to plan" }).first();
    await firstCard.getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(/\/plan\//);
    await expect(page.getByText("Budget")).toBeVisible();
  });
});
