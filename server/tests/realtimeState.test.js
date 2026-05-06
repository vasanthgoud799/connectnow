import test from "node:test";
import assert from "node:assert/strict";

import {
  getRealtimeStateStatus,
  realtimeState,
  resetRealtimeStateForTests,
} from "../services/DistributedRealtimeService.js";

test("realtime state falls back to memory when redis is unavailable", async () => {
  delete process.env.REDIS_URL;
  await resetRealtimeStateForTests();

  assert.equal(getRealtimeStateStatus().mode, "memory");

  const firstReserve = await realtimeState.reserveMessageKey("message-key");
  const secondReserve = await realtimeState.reserveMessageKey("message-key");

  assert.equal(firstReserve, true);
  assert.equal(secondReserve, false);

  await realtimeState.storePendingDelivery("delivery-1", { attempts: 0 }, 60);
  assert.deepEqual(await realtimeState.getPendingDelivery("delivery-1"), {
    attempts: 0,
  });
  await realtimeState.clearPendingDelivery("delivery-1");
  assert.equal(await realtimeState.getPendingDelivery("delivery-1"), null);
});
