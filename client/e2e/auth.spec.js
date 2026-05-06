import { test, expect } from "@playwright/test";
import { e2eEnv, hasPrimaryAuth } from "./support/env";
import { clearClientState, logoutFromHome, signInWithClerk } from "./support/auth";

test.describe("auth", () => {
  test.skip(
    !hasPrimaryAuth,
    "Set E2E_PRIMARY_EMAIL and E2E_PRIMARY_PASSWORD to run live auth E2E coverage."
  );

  test("sign in persists across reloads", async ({ page }) => {
    await clearClientState(page);
    await signInWithClerk(page, {
      email: e2eEnv.primaryEmail,
      password: e2eEnv.primaryPassword,
    });

    await expect(page).toHaveURL(/\/home(?:$|[?#])/);
    await page.reload();
    await expect(page).toHaveURL(/\/home(?:$|[?#])/);
    await expect(page.getByText(/messages/i).first()).toBeVisible();
  });

  test("logout returns the user to auth", async ({ page }) => {
    await clearClientState(page);
    await signInWithClerk(page, {
      email: e2eEnv.primaryEmail,
      password: e2eEnv.primaryPassword,
    });
    await logoutFromHome(page);
    await expect(page.getByRole("tab", { name: /sign in/i })).toBeVisible();
  });
});
