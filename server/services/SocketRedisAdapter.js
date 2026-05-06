import { logRuntimeEvent } from "../utils/RuntimeLogger.js";

let adapterConfigured = false;
let adapterStatus = "not_configured";

export const configureSocketRedisAdapter = async (io) => {
  if (adapterConfigured) {
    adapterStatus = "ready";
    return true;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    adapterStatus = "skipped";
    logRuntimeEvent("info", "socket.redis_adapter.skipped", {
      reason: "missing_redis_url",
    });
    return false;
  }

  try {
    const [{ createAdapter }, { createClient }] = await Promise.all([
      import("@socket.io/redis-adapter"),
      import("redis"),
    ]);

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));

    adapterConfigured = true;
    adapterStatus = "ready";
    logRuntimeEvent("info", "socket.redis_adapter.ready", {
      redisUrlConfigured: true,
    });
    return true;
  } catch (error) {
    adapterStatus = "failed";
    logRuntimeEvent("warn", "socket.redis_adapter.failed", {
      message: error?.message || "unknown_error",
    });
    return false;
  }
};

export const getSocketRedisAdapterStatus = () => ({
  configured: adapterConfigured,
  status: adapterStatus,
  redisUrlConfigured: Boolean(process.env.REDIS_URL),
});
