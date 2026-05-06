import test from "node:test";
import assert from "node:assert/strict";

delete process.env.REDIS_URL;

const {
  realtimeState,
  getRealtimeStateStatus,
  resetRealtimeStateForTests,
} = await import("../services/DistributedRealtimeService.js");

test("realtime state falls back to memory mode when redis is not configured", async () => {
  await resetRealtimeStateForTests();

  const status = getRealtimeStateStatus();

  assert.equal(status.mode, "memory");
  assert.equal(status.redisEnabled, false);
  assert.equal(status.redisUrlConfigured, false);
});

test("reserveMessageKey prevents duplicate idempotency claims in memory mode", async () => {
  await resetRealtimeStateForTests();

  const first = await realtimeState.reserveMessageKey("message:key:1", 1000);
  const second = await realtimeState.reserveMessageKey("message:key:1", 1000);

  assert.equal(first, true);
  assert.equal(second, false);
});

test("pending delivery payloads can be stored and cleared in memory mode", async () => {
  await resetRealtimeStateForTests();

  await realtimeState.storePendingDelivery("delivery-1", {
    messageId: "message-1",
    recipientId: "user-9",
  });

  assert.deepEqual(await realtimeState.getPendingDelivery("delivery-1"), {
    messageId: "message-1",
    recipientId: "user-9",
  });

  await realtimeState.clearPendingDelivery("delivery-1");

  assert.equal(await realtimeState.getPendingDelivery("delivery-1"), null);
});
