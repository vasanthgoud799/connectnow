import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_KEY ||= "test-jwt-key-abcdefghijklmnopqrstuvwxyz123456";
process.env.JWT_ISSUER ||= "connectnow-test";
process.env.MEDIA_TOKEN_SECRET ||= "test-media-secret-abcdefghijklmnopqrstuvwxyz123456";

const {
  createSignedMediaAccessToken,
  verifySignedMediaAccessToken,
} = await import("../utils/AuthSecurity.js");

test("signed media tokens round-trip with expected claims", () => {
  const token = createSignedMediaAccessToken({
    messageId: "message-123",
    storageProvider: "local",
    storagePath: "uploads/private/file.png",
    expiresInSeconds: 120,
  });

  const payload = verifySignedMediaAccessToken(token);

  assert.equal(payload.messageId, "message-123");
  assert.equal(payload.storageProvider, "local");
  assert.equal(payload.storagePath, "uploads/private/file.png");
  assert.equal(payload.scope, "media_access");
  assert.equal(payload.iss, process.env.JWT_ISSUER);
  assert.equal(payload.aud, "connectnow-media");
});

test("signed media tokens reject tampered values", () => {
  const token = createSignedMediaAccessToken({
    messageId: "message-456",
    storageProvider: "supabase",
    storagePath: "bucket/path/file.pdf",
    expiresInSeconds: 120,
  });

  const tampered = `${token}broken`;

  assert.throws(() => verifySignedMediaAccessToken(tampered));
});
