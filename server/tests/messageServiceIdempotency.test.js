import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClientMessageLookupQuery,
  getConversationKey,
  getGroupConversationKey,
} from "../services/MessageService.js";

test("client message lookup query is stable for idempotent direct and group messages", () => {
  const directConversationKey = getConversationKey("b", "a");
  const groupConversationKey = getGroupConversationKey("group-1");

  assert.equal(directConversationKey, "a:b");
  assert.equal(groupConversationKey, "group:group-1");

  assert.deepEqual(
    buildClientMessageLookupQuery({
      senderId: "sender-1",
      conversationKey: directConversationKey,
      clientMessageId: "client-123",
    }),
    {
      sender: "sender-1",
      conversationKey: "a:b",
      clientMessageId: "client-123",
    }
  );

  assert.equal(
    buildClientMessageLookupQuery({
      senderId: "sender-1",
      conversationKey: groupConversationKey,
      clientMessageId: "",
    }),
    null
  );
});
