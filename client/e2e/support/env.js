/* eslint-env node */
import path from "node:path";

export const authStatePath = path.join(process.cwd(), "e2e", ".auth", "user.json");

export const e2eEnv = {
  baseUrl: process.env.E2E_BASE_URL || "http://127.0.0.1:4173",
  primaryEmail: process.env.E2E_PRIMARY_EMAIL || "",
  primaryPassword: process.env.E2E_PRIMARY_PASSWORD || "",
  secondaryEmail: process.env.E2E_SECONDARY_EMAIL || "",
  secondaryPassword: process.env.E2E_SECONDARY_PASSWORD || "",
  primaryContactQuery: process.env.E2E_PRIMARY_CONTACT_QUERY || "",
  secondaryContactQuery: process.env.E2E_SECONDARY_CONTACT_QUERY || "",
  uploadFilePath: process.env.E2E_UPLOAD_FILE_PATH || "",
  paginationAnchorText: process.env.E2E_PAGINATION_ANCHOR_TEXT || "",
};

export const hasPrimaryAuth = Boolean(
  e2eEnv.primaryEmail && e2eEnv.primaryPassword
);

export const hasSecondaryAuth = Boolean(
  e2eEnv.secondaryEmail && e2eEnv.secondaryPassword
);

export const hasPrimaryContactTarget = Boolean(e2eEnv.primaryContactQuery);
export const hasUploadTarget = Boolean(
  e2eEnv.primaryContactQuery && e2eEnv.uploadFilePath
);
