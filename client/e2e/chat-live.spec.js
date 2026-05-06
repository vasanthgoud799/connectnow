import { test, expect } from "@playwright/test";
import {
  e2eEnv,
  hasPrimaryAuth,
  hasPrimaryContactTarget,
  hasSecondaryAuth,
} from "./support/env";
import { signInWithClerk } from "./support/auth";
import { expectMessageVisible, openChatByQuery, sendChatMessage } from "./support/chat";
import { goOffline, goOnline } from "./support/network";

test.describe("chat and realtime", () => {
  test.skip(
    !hasPrimaryAuth || !hasPrimaryContactTarget,
    "Set primary auth and E2E_PRIMARY_CONTACT_QUERY to run live chat coverage."
  );

  test("sends a message and renders it after client-side decryption", async ({ page }) => {
    const uniqueMessage = `e2e-${Date.now()}-encrypted-message`;

    await page.goto("/home");
    await openChatByQuery(page, e2eEnv.primaryContactQuery);
    await sendChatMessage(page, uniqueMessage);
    await expectMessageVisible(page, uniqueMessage);
  });

  test("recovers after a temporary network disconnect without losing the chat view", async ({
    page,
  }) => {
    await page.goto("/home");
    await openChatByQuery(page, e2eEnv.primaryContactQuery);

    await goOffline(page);
    await page.waitForTimeout(1000);
    await goOnline(page);

    await expect(page.getByTestId("chat-composer-input")).toBeVisible();
  });

  test("can receive a message from a second signed-in user when secondary creds are configured", async ({
    browser,
    page,
  }) => {
    test.skip(
      !hasSecondaryAuth || !e2eEnv.secondaryContactQuery,
      "Set E2E_SECONDARY_EMAIL, E2E_SECONDARY_PASSWORD, and E2E_SECONDARY_CONTACT_QUERY for live two-user coverage."
    );

    const uniqueMessage = `e2e-${Date.now()}-reply`;
    await page.goto("/home");
    await openChatByQuery(page, e2eEnv.primaryContactQuery);

    const secondContext = await browser.newContext({
      baseURL: e2eEnv.baseUrl,
      permissions: ["clipboard-read", "clipboard-write", "microphone", "camera"],
    });
    const secondPage = await secondContext.newPage();

    try {
      await signInWithClerk(secondPage, {
        email: e2eEnv.secondaryEmail,
        password: e2eEnv.secondaryPassword,
      });
      await secondPage.goto("/home");
      await openChatByQuery(secondPage, e2eEnv.secondaryContactQuery);
      await sendChatMessage(secondPage, uniqueMessage);
      await expectMessageVisible(page, uniqueMessage);
    } finally {
      await secondContext.close();
    }
  });
});
