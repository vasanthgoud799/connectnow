import test from "node:test";
import assert from "node:assert/strict";

const { buildClientMessageLookupQuery } = await import(
  "../services/MessageService.js"
);
const { buildMessagesPaginationQuery } = await import(
  "../controllers/MessagesController.js"
);
const { buildGlobalMessageSearchQuery } = await import(
  "../controllers/SearchController.js"
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
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: query.$or[2].expiresAt },
    ],
    createdAt: { $lt: before },
  });
  assert.ok(query.$or[2].expiresAt.$gt instanceof Date);
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
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: query.$or[2].expiresAt },
    ],
  });
  assert.ok(query.$or[2].expiresAt.$gt instanceof Date);
});

test("global message search keeps non-expired and content filters together", () => {
  const regex = /hello/i;
  const query = buildGlobalMessageSearchQuery({
    userId: "user-1",
    accessibleConversationKeys: ["user-1:user-2", "group:1"],
    tab: "messages",
    regex,
  });

  assert.deepEqual(query.deletedFor, { $ne: "user-1" });
  assert.deepEqual(query.conversationKey, {
    $in: ["user-1:user-2", "group:1"],
  });
  assert.equal(query.$and.length, 2);
  assert.deepEqual(query.$and[0], {
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: query.$and[0].$or[2].expiresAt },
    ],
  });
  assert.ok(query.$and[0].$or[2].expiresAt.$gt instanceof Date);
  assert.deepEqual(query.$and[1], {
    $or: [
      { content: regex },
      { "meta.poll.question": regex },
      { "meta.poll.options.text": regex },
      { fileUrl: regex },
      { "encryption.originalFileName": regex },
      { "mediaEncryption.originalFileName": regex },
    ],
  });
});

test("global file search filters expired attachment messages", () => {
  const regex = /invoice/i;
  const query = buildGlobalMessageSearchQuery({
    userId: "user-2",
    accessibleConversationKeys: ["group:1"],
    tab: "files",
    regex,
  });

  assert.deepEqual(query.messageType, {
    $in: ["image", "video", "audio", "document"],
  });
  assert.deepEqual(query.$and[1], {
    $or: [
      { fileUrl: regex },
      { content: regex },
      { "encryption.originalFileName": regex },
      { "mediaEncryption.originalFileName": regex },
    ],
  });
  assert.ok(query.$and[0].$or[2].expiresAt.$gt instanceof Date);
});
