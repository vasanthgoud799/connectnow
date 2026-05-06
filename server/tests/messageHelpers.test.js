import test from "node:test";
import assert from "node:assert/strict";

const { buildClientMessageLookupQuery } = await import(
  "../services/MessageService.js"
);
const { buildMessagesPaginationQuery } = await import(
  "../controllers/MessagesController.js"
);

test("buildClientMessageLookupQuery creates deterministic lookup fields", () => {
  const query = buildClientMessageLookupQuery({
    senderId: "user-1",
    conversationKey: "user-1:user-2",
    clientMessageId: 42,
  });

  assert.deepEqual(query, {
    sender: "user-1",
    conversationKey: "user-1:user-2",
    clientMessageId: "42",
  });
});

test("buildClientMessageLookupQuery returns null when no clientMessageId is provided", () => {
  assert.equal(
    buildClientMessageLookupQuery({
      senderId: "user-1",
      conversationKey: "conversation",
      clientMessageId: "",
    }),
    null
  );
});

test("buildMessagesPaginationQuery includes before cursor when valid", () => {
  const before = new Date("2026-05-05T10:15:00.000Z");
  const query = buildMessagesPaginationQuery({
    conversationKey: "user-1:user-2",
    userId: "user-1",
    before,
  });

  assert.deepEqual(query, {
    conversationKey: "user-1:user-2",
    deletedFor: { $ne: "user-1" },
    createdAt: { $lt: before },
  });
});

test("buildMessagesPaginationQuery omits invalid before cursor", () => {
  const query = buildMessagesPaginationQuery({
    conversationKey: "group:abc",
    userId: "user-2",
    before: new Date("invalid"),
  });

  assert.deepEqual(query, {
    conversationKey: "group:abc",
    deletedFor: { $ne: "user-2" },
  });
});
