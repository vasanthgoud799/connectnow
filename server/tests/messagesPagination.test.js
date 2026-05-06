import test from "node:test";
import assert from "node:assert/strict";

import { buildMessagesPaginationQuery } from "../controllers/MessagesController.js";

test("message pagination query includes before cursor when provided", () => {
  const before = new Date("2026-05-05T10:00:00.000Z");
  const query = buildMessagesPaginationQuery({
    conversationKey: "group:123",
    userId: "user-1",
    before,
  });

  assert.equal(query.conversationKey, "group:123");
  assert.equal(query.deletedFor.$ne, "user-1");
  assert.deepEqual(query.createdAt, { $lt: before });
});

test("message pagination query omits before cursor when not provided", () => {
  const query = buildMessagesPaginationQuery({
    conversationKey: "user-a:user-b",
    userId: "user-1",
  });

  assert.equal(query.createdAt, undefined);
});
