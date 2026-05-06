import fs from "node:fs";
import path from "node:path";
import { test as setup, expect } from "@playwright/test";
import { authStatePath, e2eEnv, hasPrimaryAuth } from "./support/env";
import { clearClientState, signInWithClerk } from "./support/auth";

setup("authenticate primary user for dependent specs", async ({ page }) => {
  fs.mkdirSync(path.dirname(authStatePath), { recursive: true });
  if (!fs.existsSync(authStatePath)) {
    fs.writeFileSync(authStatePath, JSON.stringify({ cookies: [], origins: [] }, null, 2));
  }

  setup.skip(
    !hasPrimaryAuth,
    "Set E2E_PRIMARY_EMAIL and E2E_PRIMARY_PASSWORD to enable live auth setup."
  );

  await clearClientState(page);
  await signInWithClerk(page, {
    email: e2eEnv.primaryEmail,
    password: e2eEnv.primaryPassword,
  });

  await expect(page).toHaveURL(/\/home(?:$|[?#])/);
  await page.context().storageState({ path: authStatePath });
});
