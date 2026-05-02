import {
  createRateLimiter,
  getRequestFingerprint,
  logSecurityEvent,
} from "../utils/AuthSecurity.js";

const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const forbiddenKeyPattern = /(^\$)|(\.)/;
const replayCache = new Map();
const botUserAgentPattern = /bot|crawler|spider|headless|python|curl|wget|scrapy/i;

const hasUnsafeMongoKey = (value) => {
  if (!value || typeof value !== "object") return false;

  if (Array.isArray(value)) {
    return value.some(hasUnsafeMongoKey);
  }

  return Object.entries(value).some(
    ([key, item]) => forbiddenKeyPattern.test(key) || hasUnsafeMongoKey(item)
  );
};

export const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");

  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return next();
};

export const attachRequestContext = (req, res, next) => {
  req.requestFingerprint = getRequestFingerprint(req);
  res.setHeader("X-Request-Fingerprint", req.requestFingerprint);
  return next();
};

export const validateHttpMethod = (req, res, next) => {
  if (!allowedMethods.includes(req.method)) {
    return res.status(405).json({ message: "Method not allowed." });
  }

  return next();
};

export const rejectNoSqlInjection = async (req, res, next) => {
  if (hasUnsafeMongoKey(req.body) || hasUnsafeMongoKey(req.params) || hasUnsafeMongoKey(req.query)) {
    await logSecurityEvent({
      req,
      type: "nosql_injection_blocked",
      severity: "high",
      userId: req.userId || null,
      metadata: { path: req.originalUrl, method: req.method },
    });
    return res.status(400).json({ message: "Invalid request." });
  }

  return next();
};

export const globalRateLimiter = createRateLimiter({
  name: "global",
  limit: Number(process.env.GLOBAL_RATE_LIMIT || 500),
  windowMs: Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
});

export const authRateLimiter = createRateLimiter({
  name: "auth",
  limit: Number(process.env.AUTH_SYNC_RATE_LIMIT || 20),
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
});

export const authDeviceRateLimiter = createRateLimiter({
  name: "auth_device",
  limit: Number(process.env.AUTH_DEVICE_RATE_LIMIT || 8),
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  keyGenerator: (req) =>
    `${req.headers?.["user-agent"] || "unknown"}:${req.headers?.["accept-language"] || ""}`,
});

export const authUserIpRateLimiter = createRateLimiter({
  name: "auth_user_ip",
  limit: Number(process.env.AUTH_USER_IP_RATE_LIMIT || 12),
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  keyGenerator: (req) => `${req.requestFingerprint || getRequestFingerprint(req)}`,
});

export const userWriteRateLimiter = createRateLimiter({
  name: "user_write",
  limit: Number(process.env.USER_WRITE_RATE_LIMIT || 240),
  windowMs: Number(process.env.USER_WRITE_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  keyGenerator: (req) => `${req.userId || "anonymous"}:${req.ip || ""}`,
});

export const sensitiveActionRateLimiter = createRateLimiter({
  name: "sensitive_action",
  limit: Number(process.env.SENSITIVE_ACTION_RATE_LIMIT || 20),
  windowMs: Number(process.env.SENSITIVE_ACTION_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  keyGenerator: (req) => `${req.userId || "anonymous"}:${req.ip || ""}`,
});

export const uploadIntentRateLimiter = createRateLimiter({
  name: "upload_intent",
  limit: Number(process.env.UPLOAD_INTENT_RATE_LIMIT || 60),
  windowMs: Number(process.env.UPLOAD_INTENT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  keyGenerator: (req) => `${req.userId || "anonymous"}:${req.requestFingerprint || req.ip || ""}`,
});

export const invisibleBotProtection = async (req, res, next) => {
  const honeypotFields = [req.body?.website, req.body?.company, req.body?.faxNumber];
  const clientRenderTimeMs = Number(req.header("X-Client-Render-Time") || req.body?.clientRenderTimeMs || 0);
  const userAgent = String(req.headers?.["user-agent"] || "");
  const suspiciousAutomation =
    botUserAgentPattern.test(userAgent) ||
    honeypotFields.some((value) => String(value || "").trim().length > 0) ||
    (clientRenderTimeMs > 0 &&
      clientRenderTimeMs < Number(process.env.MIN_HUMAN_RENDER_TIME_MS || 1200));

  if (!suspiciousAutomation) {
    return next();
  }

  await logSecurityEvent({
    req,
    type: "bot_detection_blocked",
    severity: "high",
    userId: req.userId || null,
    metadata: { path: req.originalUrl, userAgent, clientRenderTimeMs },
  });
  return res.status(403).json({
    message: "Request could not be verified.",
    captchaRequired: true,
  });
};

export const antiReplay = async (req, res, next) => {
  const requestId = req.header("X-Request-Id");
  const timestamp = Number(req.header("X-Request-Timestamp") || 0);
  const now = Date.now();
  const maxSkewMs = Number(process.env.REQUEST_REPLAY_WINDOW_MS || 5 * 60 * 1000);

  if (!requestId || !timestamp || Math.abs(now - timestamp) > maxSkewMs) {
    await logSecurityEvent({
      req,
      type: "replay_protection_failed",
      severity: "medium",
      userId: req.userId || null,
      metadata: { reason: "missing_or_stale" },
    });
    return res.status(400).json({ message: "Invalid request." });
  }

  for (const [key, expiresAt] of replayCache.entries()) {
    if (expiresAt <= now) replayCache.delete(key);
  }

  const cacheKey = `${req.authSessionId || req.userId || "anonymous"}:${requestId}`;
  if (replayCache.has(cacheKey)) {
    await logSecurityEvent({
      req,
      type: "replay_attempt_blocked",
      severity: "high",
      userId: req.userId || null,
      metadata: { requestId },
    });
    return res.status(409).json({ message: "Duplicate request." });
  }

  replayCache.set(cacheKey, now + maxSkewMs);
  return next();
};

export const notFoundHandler = (req, res) =>
  res.status(404).json({ message: "Route not found." });

export const errorHandler = async (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  await logSecurityEvent({
    req,
    type: "server_error",
    severity: "medium",
    userId: req.userId || null,
    metadata: { path: req.originalUrl, method: req.method, name: error.name },
  });

  console.error("Unhandled request error:", error);
  return res.status(500).json({ message: "Internal Server Error" });
};
