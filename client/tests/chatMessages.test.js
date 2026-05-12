import test from "node:test";
import assert from "node:assert/strict";

import {
  getDirectConversationKey,
  getMessageConversationKey,
  mergeMessages,
  normalizeMessage,
} from "../src/utils/chatMessages.js";

test("direct conversation keys are deterministic", () => {
  assert.equal(getDirectConversationKey("user-b", "user-a"), "user-a:user-b");
  assert.equal(getDirectConversationKey("user-a", "user-b"), "user-a:user-b");
});

test("normalizes direct socket messages without explicit conversationKey", () => {
  const message = normalizeMessage({
    _id: "message-1",
    sender: { _id: "user-b" },
    recipient: { _id: "user-a" },
    content: "hello",
    messageType: "text",
  });

  assert.equal(message.conversationKey, "user-a:user-b");
  assert.equal(getMessageConversationKey(message), "user-a:user-b");
});

test("normalizes group socket messages without explicit conversationKey", () => {
  const message = normalizeMessage({
    _id: "message-2",
    chatType: "group",
    group: { _id: "group-1" },
    sender: { _id: "user-a" },
    content: "team hello",
    messageType: "text",
  });

  assert.equal(message.conversationKey, "group:group-1");
});

test("mergeMessages reconciles optimistic and server messages by clientMessageId", () => {
  const merged = mergeMessages(
    [
      {
        _id: "temp:client-1",
        clientMessageId: "client-1",
        conversationKey: "user-a:user-b",
        sender: "user-a",
        recipient: "user-b",
        content: "hello",
        messageType: "text",
        status: "sending",
      },
    ],
    {
      _id: "message-1",
      clientMessageId: "client-1",
      conversationKey: "user-a:user-b",
      sender: "user-a",
      recipient: "user-b",
      content: "hello",
      messageType: "text",
      status: "delivered",
    }
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0]._id, "message-1");
  assert.equal(merged[0].status, "delivered");
});
