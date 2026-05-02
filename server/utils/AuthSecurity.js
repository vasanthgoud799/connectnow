import crypto from "crypto";
import jwt from "jsonwebtoken";
import AuthSession from "../models/AuthSessionModel.js";
import SecurityEvent from "../models/SecurityEventModel.js";
import TrustedDevice from "../models/TrustedDeviceModel.js";
import { getJwtSigningKey, getJwtVerificationKeys } from "../config/env.js";
import { sendSecurityAlert } from "../services/SecurityAlertService.js";

export const SESSION_COOKIE_NAME = "jwt";
export const CSRF_COOKIE_NAME = "csrf_token";
export const getSessionDurationMs = () =>
  Number(process.env.SESSION_DURATION_MS || 3 * 24 * 60 * 60 * 1000);
export const getIdleTimeoutMs = () =>
  Number(process.env.IDLE_TIMEOUT_MS || 30 * 60 * 1000);
const getSessionTouchIntervalMs = () =>
  Number(process.env.SESSION_TOUCH_INTERVAL_MS || 60 * 1000);

const getJwtIssuer = () => process.env.JWT_ISSUER || "connectnow-api";
const getJwtAudience = () => process.env.JWT_AUDIENCE || "connectnow-web";
const getRateLimitWindowMs = () =>
  Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const AUTH_IP_LIMIT = Number(process.env.AUTH_IP_LIMIT || 30);
const AUTH_DEVICE_LIMIT = Number(process.env.AUTH_DEVICE_LIMIT || 12);
const LOCK_WINDOW_MS = Number(process.env.AUTH_LOCK_WINDOW_MS || 15 * 60 * 1000);
const LOCK_THRESHOLD = Number(process.env.AUTH_LOCK_THRESHOLD || 8);
const TEMP_LOCK_MS = Number(process.env.AUTH_TEMP_LOCK_MS || 15 * 60 * 1000);

const sensitiveKeys = new Set([
  "password",
  "token",
  "jwt",
  "secret",
  "authorization",
  "cookie",
  "csrf",
  "sessiontoken",
]);

const memoryBuckets = new Map();
const lockedKeys = new Map();

export const hashValue = (value = "") =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

export const generateOpaqueToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("base64url");

export const getClientIp = (req) => {
  const forwardedFor = req.headers?.["x-forwarded-for"];
  const rawIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || req.ip || req.socket?.remoteAddress || "");
  return rawIp.split(",")[0].trim().replace(/^::ffff:/, "") || "unknown";
};

export const getUserAgentHash = (req) =>
  hashValue(req.headers?.["user-agent"] || "unknown-user-agent");

export const getLocationHint = (req) =>
  [
    req.headers?.["x-vercel-ip-country"] || req.headers?.["cf-ipcountry"] || "",
    req.headers?.["x-vercel-ip-country-region"] || "",
    req.headers?.["x-vercel-ip-city"] || "",
    req.headers?.["x-client-timezone"] || "",
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" / ") || null;

export const getDeviceFingerprint = (req) =>
  hashValue(
    [
      req.headers?.["user-agent"] || "",
      req.headers?.["accept-language"] || "",
    ].join("|")
  );

export const getCookieOptions = (maxAge = getSessionDurationMs(), httpOnly = true) => {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly,
    maxAge,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
    path: "/",
  };
};

export const getRequestFingerprint = (req) =>
  hashValue(
    [
      getClientIp(req),
      req.headers?.["user-agent"] || "",
      req.headers?.["accept-language"] || "",
      req.headers?.origin || "",
      req.userId || "anonymous",
    ].join("|")
  );

const sanitizeMetadata = (value) => {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeMetadata).slice(0, 25);

  return Object.entries(value).reduce((accumulator, [key, item]) => {
    const normalizedKey = key.toLowerCase();
    if ([...sensitiveKeys].some((sensitiveKey) => normalizedKey.includes(sensitiveKey))) {
      accumulator[key] = "[redacted]";
      return accumulator;
    }

    accumulator[key] = sanitizeMetadata(item);
    return accumulator;
  }, {});
};

export const logSecurityEvent = async ({
  req,
  type,
  severity = "info",
  userId = null,
  email = null,
  metadata = {},
}) => {
  try {
    await SecurityEvent.create({
      type,
      severity,
      userId,
      email: email ? String(email).toLowerCase() : null,
      ipAddress: req ? getClientIp(req) : null,
      deviceFingerprint: req ? getDeviceFingerprint(req) : null,
      userAgentHash: req ? getUserAgentHash(req) : null,
      metadata: sanitizeMetadata(metadata),
    });
  } catch (error) {
    console.error("Security event logging failed:", error.message);
  }
};

const pruneBucket = (bucket, now) => {
  bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < getRateLimitWindowMs());
  return bucket;
};

export const createRateLimiter = ({
  name,
  limit,
  windowMs = getRateLimitWindowMs(),
  keyGenerator = getClientIp,
  message = "Too many requests. Please try again later.",
}) => {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${keyGenerator(req)}`;
    const bucket = buckets.get(key) || { hits: [] };
    bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < windowMs);
    bucket.hits.push(now);
    buckets.set(key, bucket);

    if (bucket.hits.length > limit) {
      logSecurityEvent({
        req,
        type: "rate_limit_exceeded",
        severity: "medium",
        metadata: { limiter: name },
      });
      return res.status(429).json({ message });
    }

    return next();
  };
};

export const consumeAuthAttempt = ({ req, identity = "unknown" }) => {
  const now = Date.now();
  const keys = [
    `ip:${getClientIp(req)}`,
    `device:${getDeviceFingerprint(req)}`,
    `identity:${String(identity).toLowerCase()}`,
  ];

  const lockedUntil = keys
    .map((key) => lockedKeys.get(key) || 0)
    .find((expiresAt) => expiresAt > now);

  if (lockedUntil) {
    return {
      allowed: false,
      lockedUntil: new Date(lockedUntil),
      retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000),
    };
  }

  for (const key of keys) {
    const bucket = pruneBucket(memoryBuckets.get(key) || { hits: [] }, now);
    bucket.hits.push(now);
    memoryBuckets.set(key, bucket);

    const limit = key.startsWith("ip:")
      ? AUTH_IP_LIMIT
      : key.startsWith("device:")
        ? AUTH_DEVICE_LIMIT
        : LOCK_THRESHOLD;

    if (bucket.hits.length > limit) {
      const lockedUntilTimestamp = now + TEMP_LOCK_MS;
      lockedKeys.set(key, lockedUntilTimestamp);
      return {
        allowed: false,
        lockedUntil: new Date(lockedUntilTimestamp),
        retryAfterSeconds: Math.ceil(TEMP_LOCK_MS / 1000),
      };
    }
  }

  return { allowed: true };
};

export const recordAuthFailure = ({ req, identity = "unknown" }) => {
  const now = Date.now();
  const keys = [
    `ip:${getClientIp(req)}`,
    `device:${getDeviceFingerprint(req)}`,
    `identity:${String(identity).toLowerCase()}`,
  ];

  for (const key of keys) {
    const bucket = pruneBucket(memoryBuckets.get(key) || { hits: [] }, now);
    bucket.hits.push(now);
    memoryBuckets.set(key, bucket);

    if (bucket.hits.length >= LOCK_THRESHOLD) {
      lockedKeys.set(key, now + TEMP_LOCK_MS);
    }
  }
};

export const clearAuthFailures = ({ req, identity = "unknown" }) => {
  [`ip:${getClientIp(req)}`, `device:${getDeviceFingerprint(req)}`, `identity:${String(identity).toLowerCase()}`].forEach(
    (key) => {
      memoryBuckets.delete(key);
      lockedKeys.delete(key);
    }
  );
};

export const createSessionToken = async ({
  req,
  user,
  mfaVerified = false,
  assuranceLevel = 1,
  deviceLabel = null,
}) => {
  const jti = crypto.randomUUID();
  const csrfToken = generateOpaqueToken(32);
  const sessionDurationMs = getSessionDurationMs();
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  const deviceFingerprint = getDeviceFingerprint(req);
  const ipAddress = getClientIp(req);
  const locationHint = getLocationHint(req);
  const trustedDevice = await TrustedDevice.findOne({
    userId: user._id,
    deviceFingerprint,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ trustedAt: -1 })
    .lean();
  const previousSession = await AuthSession.findOne({
    userId: user._id,
    revokedAt: null,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!trustedDevice && previousSession && previousSession.deviceFingerprint !== deviceFingerprint) {
    await logSecurityEvent({
      req,
      type: "new_device_login",
      severity: "medium",
      userId: user._id,
      email: user.email,
      metadata: { previousSessionId: previousSession.jti, locationHint },
    });
    await sendSecurityAlert({
      to: user.email,
      subject: "New device sign-in detected",
      text: `A new device signed in to your ConnectNow account${locationHint ? ` from ${locationHint}` : ""}. If this was not you, revoke sessions immediately.`,
    });
  }

  if (
    previousSession &&
    previousSession.ipAddress &&
    previousSession.ipAddress !== ipAddress &&
    Date.now() - new Date(previousSession.createdAt).getTime() <
      Number(process.env.IMPOSSIBLE_TRAVEL_WINDOW_MS || 60 * 60 * 1000)
  ) {
    await logSecurityEvent({
      req,
      type: "impossible_travel_candidate",
      severity: "high",
      userId: user._id,
      email: user.email,
      metadata: {
        previousSessionId: previousSession.jti,
        previousIpAddress: previousSession.ipAddress,
        previousLocationHint: previousSession.locationHint || null,
        locationHint,
      },
    });
    await sendSecurityAlert({
      to: user.email,
      subject: "Suspicious sign-in pattern detected",
      text: `ConnectNow detected a suspicious sign-in pattern${locationHint ? ` near ${locationHint}` : ""}. Please review your active sessions.`,
    });
  }

  await AuthSession.create({
    userId: user._id,
    jti,
    csrfTokenHash: hashValue(csrfToken),
    userAgentHash: getUserAgentHash(req),
    deviceFingerprint,
    deviceLabel: deviceLabel || trustedDevice?.label || null,
    ipAddress,
    locationHint,
    assuranceLevel,
    mfaVerified,
    trustedDeviceId: trustedDevice?._id || null,
    expiresAt,
  });

  const token = jwt.sign(
    {
      userId: String(user._id),
      email: user.email,
      sid: jti,
    },
    getJwtSigningKey(),
    {
      expiresIn: Math.floor(sessionDurationMs / 1000),
      jwtid: jti,
      issuer: getJwtIssuer(),
      audience: getJwtAudience(),
      keyid: process.env.JWT_KEY_ID || "current",
    }
  );

  return { token, csrfToken, sessionId: jti, expiresAt };
};

export const verifyAppJwt = (token) => {
  const keys = getJwtVerificationKeys();
  let lastError = null;

  for (const key of keys) {
    try {
      return jwt.verify(token, key, {
        issuer: getJwtIssuer(),
        audience: getJwtAudience(),
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("JWT verification failed.");
};

export const revokeSession = async ({ sessionId, reason = "logout" }) => {
  if (!sessionId) return null;

  return AuthSession.findOneAndUpdate(
    { jti: sessionId, revokedAt: null },
    { revokedAt: new Date(), revokedReason: reason },
    { new: true }
  );
};

export const revokeUserSessions = async ({ userId, exceptSessionId = null, reason = "rotated" }) => {
  const query = {
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  };

  if (exceptSessionId) {
    query.jti = { $ne: exceptSessionId };
  }

  return AuthSession.updateMany(query, {
    revokedAt: new Date(),
    revokedReason: reason,
  });
};

export const validateSessionRecord = async ({ decoded, req }) => {
  const sessionId = decoded?.sid || decoded?.jti;
  if (!decoded?.userId || !sessionId) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  const session = await AuthSession.findOne({ jti: sessionId });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  const currentUserAgentHash = getUserAgentHash(req);
  const currentDeviceFingerprint = getDeviceFingerprint(req);
  const userAgentMismatch =
    session.userAgentHash && session.userAgentHash !== currentUserAgentHash;
  const deviceFingerprintMismatch =
    session.deviceFingerprint && session.deviceFingerprint !== currentDeviceFingerprint;

  if (userAgentMismatch) {
    await revokeSession({ sessionId, reason: "session_fingerprint_mismatch" });
    await logSecurityEvent({
      req,
      type: "session_hijack_suspected",
      severity: "critical",
      userId: decoded.userId,
      metadata: {
        sessionId,
        locationHint: getLocationHint(req),
        userAgentMismatch: Boolean(userAgentMismatch),
        deviceFingerprintMismatch: Boolean(deviceFingerprintMismatch),
      },
    });
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  if (deviceFingerprintMismatch) {
    await logSecurityEvent({
      req,
      type: "session_fingerprint_changed",
      severity: "low",
      userId: decoded.userId,
      metadata: { sessionId, locationHint: getLocationHint(req) },
    });
  }

  if (Date.now() - new Date(session.lastSeenAt).getTime() > getIdleTimeoutMs()) {
    await revokeSession({ sessionId, reason: "idle_timeout" });
    await logSecurityEvent({
      req,
      type: "session_idle_timeout",
      severity: "low",
      userId: decoded.userId,
      metadata: { sessionId },
    });
    return { ok: false, status: 401, message: "Session expired" };
  }

  const now = Date.now();
  if (
    !session.lastSeenAt ||
    now - new Date(session.lastSeenAt).getTime() >= getSessionTouchIntervalMs()
  ) {
    session.lastSeenAt = new Date(now);
    session.ipAddress = getClientIp(req);
    session.locationHint = getLocationHint(req);
    await session.save();
  }

  return { ok: true, session };
};

export const csrfProtection = async (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  if (req.path === "/clerk/sync") {
    return next();
  }

  const headerToken = req.header("X-CSRF-Token");
  const session = req.authSession;

  if (!headerToken || !session || hashValue(headerToken) !== session.csrfTokenHash) {
    await logSecurityEvent({
      req,
      type: "csrf_validation_failed",
      severity: "high",
      userId: req.userId || null,
      metadata: { path: req.originalUrl, method: req.method },
    });
    return res.status(403).json({ message: "Invalid request." });
  }

  return next();
};

export const parseCookieHeader = (cookieHeader = "") =>
  String(cookieHeader)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return cookies;
      cookies[decodeURIComponent(part.slice(0, separatorIndex))] = decodeURIComponent(
        part.slice(separatorIndex + 1)
      );
      return cookies;
    }, {});
