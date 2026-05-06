import { expect } from "@playwright/test";

export const openChatByQuery = async (page, query) => {
  const matchingChatButton = page
    .locator('[data-testid^="chat-list-item-"]')
    .filter({ hasText: query })
    .first();

  await expect(
    matchingChatButton,
    `Expected a visible chat list item matching "${query}"`
  ).toBeVisible();
  await matchingChatButton.click();
};

export const sendChatMessage = async (page, messageText) => {
  await page.getByTestId("chat-composer-input").fill(messageText);
  await page.getByTestId("chat-send-button").click();
};

export const expectMessageVisible = async (page, messageText) => {
  await expect(page.getByText(messageText, { exact: true }).last()).toBeVisible();
};
