import { test, expect } from "@playwright/test";
import { e2eEnv, hasPrimaryAuth, hasPrimaryContactTarget } from "./support/env";
import { openChatByQuery } from "./support/chat";

test.describe("call UI", () => {
  test.skip(
    !hasPrimaryAuth || !hasPrimaryContactTarget,
    "Set primary auth and E2E_PRIMARY_CONTACT_QUERY to run live call UI coverage."
  );

  test("opens the direct call UI when starting an audio call", async ({ page }) => {
    await page.goto("/home");
    await openChatByQuery(page, e2eEnv.primaryContactQuery);

    await page.getByTitle(/audio call/i).click();
    await expect(page.getByText(/calling|connecting|ringing/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /end call/i })).toBeVisible();
  });
});
