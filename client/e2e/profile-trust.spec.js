import { test, expect } from "@playwright/test";
import { hasPrimaryAuth } from "./support/env";

test.describe("profile trust", () => {
  test.skip(!hasPrimaryAuth, "Primary auth credentials are required for profile trust coverage.");

  test("shows a generated security fingerprint in profile", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByTestId("profile-security-fingerprint-card")).toBeVisible();
    await expect(page.getByTestId("profile-fingerprint-value")).toContainText(/\S+/);
    await expect(page.getByTestId("profile-copy-fingerprint-button")).toBeEnabled();
  });
});
