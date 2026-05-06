/* eslint-env node */
import path from "node:path";
import { test, expect } from "@playwright/test";
import { e2eEnv, hasPrimaryAuth, hasUploadTarget } from "./support/env";
import { openChatByQuery } from "./support/chat";

test.describe("media", () => {
  test.skip(
    !hasPrimaryAuth || !hasUploadTarget,
    "Set primary auth, E2E_PRIMARY_CONTACT_QUERY, and E2E_UPLOAD_FILE_PATH to run media coverage."
  );

  test("uploads a file and uses a signed media access URL", async ({ page }) => {
    const absoluteFilePath = path.isAbsolute(e2eEnv.uploadFilePath)
      ? e2eEnv.uploadFilePath
      : path.join(process.cwd(), e2eEnv.uploadFilePath);

    await page.goto("/home");
    await openChatByQuery(page, e2eEnv.primaryContactQuery);

    await page.getByTestId("chat-attachment-menu-button").click();

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByTestId("attachment-menu-item-document").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(absoluteFilePath);

    await expect(page.getByText(path.basename(absoluteFilePath))).toBeVisible();
    await page.getByTestId("chat-send-button").click();

    const openLink = page.getByRole("link", { name: /open/i }).last();
    await expect(openLink).toHaveAttribute("href", /\/api\/media\/access\?token=/);
  });
});
