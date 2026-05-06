import { expect } from "@playwright/test";

const inputSelectors = {
  identifier: [
    'input[name="identifier"]',
    'input[name="emailAddress"]',
    'input[type="email"]',
    'input[autocomplete="username"]',
  ],
  password: [
    'input[name="password"]',
    'input[type="password"]',
    'input[autocomplete="current-password"]',
  ],
};

const buttonSelectors = [
  'button:has-text("Continue")',
  'button:has-text("Next")',
  'button:has-text("Sign in")',
  'button:has-text("Log in")',
  'button:has-text("Create account")',
];

const getFirstVisibleLocator = async (page, selectors) => {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      return locator;
    }
  }

  return null;
};

export const clearClientState = async (page) => {
  await page.goto("/auth");
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    if (window.indexedDB?.databases) {
      const databases = await window.indexedDB.databases();
      await Promise.all(
        databases
          .filter((database) => database.name)
          .map(
            (database) =>
              new Promise((resolve) => {
                const request = window.indexedDB.deleteDatabase(database.name);
                request.onsuccess = request.onerror = request.onblocked = () => resolve();
              })
          )
      );
    }
  });
  await page.context().clearCookies();
};

export const signInWithClerk = async (page, { email, password }) => {
  await page.goto("/auth");

  const signInTab = page.getByRole("tab", { name: /sign in/i });
  if (await signInTab.isVisible().catch(() => false)) {
    await signInTab.click();
  }

  const identifierInput = await getFirstVisibleLocator(page, inputSelectors.identifier);
  await expect(identifierInput, "Clerk sign-in email input should be visible").not.toBeNull();
  await identifierInput.fill(email);

  let passwordInput = await getFirstVisibleLocator(page, inputSelectors.password);
  if (!passwordInput) {
    const nextButton = await getFirstVisibleLocator(page, buttonSelectors);
    if (nextButton) {
      await nextButton.click();
    }
    passwordInput = await getFirstVisibleLocator(page, inputSelectors.password);
  }

  await expect(passwordInput, "Clerk password input should be visible").not.toBeNull();
  await passwordInput.fill(password);

  const submitButton = await getFirstVisibleLocator(page, buttonSelectors);
  await expect(submitButton, "Clerk submit button should be visible").not.toBeNull();
  await submitButton.click();

  await page.waitForURL(/\/home(?:$|[?#])/, { timeout: 60_000 });
};

export const logoutFromHome = async (page) => {
  await page.getByTestId("home-profile-menu-button").click();
  await page.getByTestId("home-logout-button").click();
  await page.waitForURL(/\/auth(?:$|[?#])/, { timeout: 30_000 });
};
