import { logRuntimeEvent } from "../utils/RuntimeLogger.js";

const PREFIX = "connectnow:realtime";
const ACTIVE_USERS_KEY = `${PREFIX}:active_users`;

const memoryState = {
  activeUsers: new Set(),
  userSockets: new Map(),
  socketUsers: new Map(),
  directCallSessions: new Map(),
  userDirectCalls: new Map(),
  groupCallSessions: new Map(),
  userGroupCalls: new Map(),
  idempotencyKeys: new Map(),
  pendingDeliveries: new Map(),
};

let redisClient = null;
let redisEnabled = false;
let initialized = false;

const getRedisKey = (...parts) => `${PREFIX}:${parts.join(":")}`;

const pruneMemoryExpiringMap = (map) => {
  const now = Date.now();
  for (const [key, entry] of map.entries()) {
    if (entry?.expiresAt && entry.expiresAt <= now) {
      map.delete(key);
    }
  }
};

const toJson = (value) => JSON.stringify(value);
const fromJson = (value, fallback = null) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const connectRedis = async () => {
  if (initialized) return redisEnabled;
  initialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logRuntimeEvent("info", "realtime.redis.skipped", {
      reason: "missing_redis_url",
    });
    return false;
  }

  try {
    const { createClient } = await import("redis");
    redisClient = createClient({ url: redisUrl });
    redisClient.on("error", (error) => {
      logRuntimeEvent("warn", "realtime.redis.error", {
        message: error?.message || "unknown_error",
      });
    });
    await redisClient.connect();
    redisEnabled = true;
    logRuntimeEvent("info", "realtime.redis.ready");
    return true;
  } catch (error) {
    redisEnabled = false;
    logRuntimeEvent("warn", "realtime.redis.unavailable", {
      message: error?.message || "unknown_error",
    });
    return false;
  }
};

export const initializeRealtimeState = async () => connectRedis();

export const getRealtimeStateStatus = () => ({
  initialized,
  redisEnabled,
  mode: redisEnabled ? "redis" : "memory",
  redisUrlConfigured: Boolean(process.env.REDIS_URL),
});

export const resetRealtimeStateForTests = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      // ignore redis teardown failures in tests
    }
  }

  redisClient = null;
  redisEnabled = false;
  initialized = false;
  memoryState.activeUsers.clear();
  memoryState.userSockets.clear();
  memoryState.socketUsers.clear();
  memoryState.directCallSessions.clear();
  memoryState.userDirectCalls.clear();
  memoryState.groupCallSessions.clear();
  memoryState.userGroupCalls.clear();
  memoryState.idempotencyKeys.clear();
  memoryState.pendingDeliveries.clear();
};

const setJson = async (key, value, ttlSeconds = null) => {
  if (redisEnabled && redisClient) {
    if (ttlSeconds) {
      await redisClient.set(key, toJson(value), { EX: ttlSeconds });
    } else {
      await redisClient.set(key, toJson(value));
    }
    return;
  }

  memoryState.pendingDeliveries.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
};

const getJson = async (key) => {
  if (redisEnabled && redisClient) {
    return fromJson(await redisClient.get(key));
  }

  pruneMemoryExpiringMap(memoryState.pendingDeliveries);
  return memoryState.pendingDeliveries.get(key)?.value || null;
};

const deleteKey = async (key) => {
  if (redisEnabled && redisClient) {
    await redisClient.del(key);
    return;
  }

  memoryState.pendingDeliveries.delete(key);
};

export const realtimeState = {
  async upsertPresence({ userId, socketId, profile = null }) {
    const normalizedUserId = String(userId);
    const normalizedSocketId = String(socketId);

    if (redisEnabled && redisClient) {
      await redisClient.sAdd(ACTIVE_USERS_KEY, normalizedUserId);
      await redisClient.sAdd(
        getRedisKey("user_sockets", normalizedUserId),
        normalizedSocketId
      );
      await redisClient.set(
        getRedisKey("socket_user", normalizedSocketId),
        normalizedUserId,
        { EX: 60 * 60 * 24 }
      );
      if (profile) {
        await redisClient.set(
          getRedisKey("user_profile", normalizedUserId),
          toJson(profile),
          { EX: 60 * 60 * 24 }
        );
      }
      return;
    }

    memoryState.activeUsers.add(normalizedUserId);
    const sockets = memoryState.userSockets.get(normalizedUserId) || new Set();
    sockets.add(normalizedSocketId);
    memoryState.userSockets.set(normalizedUserId, sockets);
    memoryState.socketUsers.set(normalizedSocketId, normalizedUserId);
  },

  async removePresence({ userId, socketId }) {
    const normalizedUserId = String(userId);
    const normalizedSocketId = String(socketId);

    if (redisEnabled && redisClient) {
      await redisClient.sRem(
        getRedisKey("user_sockets", normalizedUserId),
        normalizedSocketId
      );
      await redisClient.del(getRedisKey("socket_user", normalizedSocketId));

      const remainingSockets = await redisClient.sCard(
        getRedisKey("user_sockets", normalizedUserId)
      );

      if (!remainingSockets) {
        await redisClient.sRem(ACTIVE_USERS_KEY, normalizedUserId);
      }
      return;
    }

    const sockets = memoryState.userSockets.get(normalizedUserId);
    if (sockets) {
      sockets.delete(normalizedSocketId);
      if (!sockets.size) {
        memoryState.userSockets.delete(normalizedUserId);
        memoryState.activeUsers.delete(normalizedUserId);
      } else {
        memoryState.userSockets.set(normalizedUserId, sockets);
      }
    }
    memoryState.socketUsers.delete(normalizedSocketId);
  },

  async getActiveUserIds() {
    if (redisEnabled && redisClient) {
      return (await redisClient.sMembers(ACTIVE_USERS_KEY)).map(String);
    }

    return [...memoryState.activeUsers];
  },

  async getUserSocketIds(userId) {
    const normalizedUserId = String(userId);
    if (redisEnabled && redisClient) {
      return (await redisClient.sMembers(
        getRedisKey("user_sockets", normalizedUserId)
      )).map(String);
    }

    return [...(memoryState.userSockets.get(normalizedUserId) || new Set())];
  },

  async getUserDirectCallSessionId(userId) {
    if (redisEnabled && redisClient) {
      return await redisClient.get(getRedisKey("user_direct_call", String(userId)));
    }

    return memoryState.userDirectCalls.get(String(userId)) || null;
  },

  async setDirectCallSession(session) {
    const sessionId = String(session.id);
    if (redisEnabled && redisClient) {
      await redisClient.set(
        getRedisKey("direct_call_session", sessionId),
        toJson(session),
        { EX: 60 * 60 }
      );
      await redisClient.set(
        getRedisKey("user_direct_call", String(session.callerId)),
        sessionId,
        { EX: 60 * 60 }
      );
      await redisClient.set(
        getRedisKey("user_direct_call", String(session.calleeId)),
        sessionId,
        { EX: 60 * 60 }
      );
      return;
    }

    memoryState.directCallSessions.set(sessionId, session);
    memoryState.userDirectCalls.set(String(session.callerId), sessionId);
    memoryState.userDirectCalls.set(String(session.calleeId), sessionId);
  },

  async getDirectCallSession(sessionId) {
    if (redisEnabled && redisClient) {
      return fromJson(
        await redisClient.get(getRedisKey("direct_call_session", String(sessionId)))
      );
    }

    return memoryState.directCallSessions.get(String(sessionId)) || null;
  },

  async deleteDirectCallSession(session) {
    if (!session) return;

    if (redisEnabled && redisClient) {
      await redisClient.del(
        getRedisKey("direct_call_session", String(session.id)),
        getRedisKey("user_direct_call", String(session.callerId)),
        getRedisKey("user_direct_call", String(session.calleeId))
      );
      return;
    }

    memoryState.directCallSessions.delete(String(session.id));
    memoryState.userDirectCalls.delete(String(session.callerId));
    memoryState.userDirectCalls.delete(String(session.calleeId));
  },

  async setGroupCallSession(session) {
    const serialized = {
      ...session,
      invitedUserIds: [...(session.invitedUserIds || [])],
      participants: [...(session.participants || new Map()).entries()],
    };

    if (redisEnabled && redisClient) {
      await redisClient.set(
        getRedisKey("group_call_session", String(session.id)),
        toJson(serialized),
        { EX: 60 * 60 }
      );
      for (const participant of session.participants?.values?.() || []) {
        await redisClient.set(
          getRedisKey("user_group_call", String(participant.userId)),
          String(session.id),
          { EX: 60 * 60 }
        );
      }
      return;
    }

    memoryState.groupCallSessions.set(String(session.id), serialized);
    for (const participant of session.participants?.values?.() || []) {
      memoryState.userGroupCalls.set(String(participant.userId), String(session.id));
    }
  },

  async getGroupCallSession(sessionId) {
    if (redisEnabled && redisClient) {
      const session = fromJson(
        await redisClient.get(getRedisKey("group_call_session", String(sessionId)))
      );
      if (!session) return null;
      return {
        ...session,
        invitedUserIds: new Set(session.invitedUserIds || []),
        participants: new Map(session.participants || []),
      };
    }

    const session = memoryState.groupCallSessions.get(String(sessionId)) || null;
    if (!session) return null;
    return {
      ...session,
      invitedUserIds: new Set(session.invitedUserIds || []),
      participants: new Map(session.participants || []),
    };
  },

  async getUserGroupCallSessionId(userId) {
    if (redisEnabled && redisClient) {
      return await redisClient.get(getRedisKey("user_group_call", String(userId)));
    }

    return memoryState.userGroupCalls.get(String(userId)) || null;
  },

  async deleteGroupCallSession(session) {
    if (!session) return;

    if (redisEnabled && redisClient) {
      await redisClient.del(getRedisKey("group_call_session", String(session.id)));
      for (const participant of session.participants?.values?.() || []) {
        await redisClient.del(
          getRedisKey("user_group_call", String(participant.userId))
        );
      }
      return;
    }

    memoryState.groupCallSessions.delete(String(session.id));
    for (const participant of session.participants?.values?.() || []) {
      memoryState.userGroupCalls.delete(String(participant.userId));
    }
  },

  async reserveMessageKey(key, ttlMs = 10 * 60 * 1000) {
    if (redisEnabled && redisClient) {
      const result = await redisClient.set(
        getRedisKey("idempotency", key),
        "1",
        {
          NX: true,
          PX: ttlMs,
        }
      );
      return result === "OK";
    }

    pruneMemoryExpiringMap(memoryState.idempotencyKeys);
    if (memoryState.idempotencyKeys.has(key)) {
      return false;
    }

    memoryState.idempotencyKeys.set(key, {
      expiresAt: Date.now() + ttlMs,
    });
    return true;
  },

  async storePendingDelivery(key, payload, ttlSeconds = 120) {
    await setJson(getRedisKey("pending_delivery", key), payload, ttlSeconds);
  },

  async getPendingDelivery(key) {
    return getJson(getRedisKey("pending_delivery", key));
  },

  async clearPendingDelivery(key) {
    await deleteKey(getRedisKey("pending_delivery", key));
  },
};
