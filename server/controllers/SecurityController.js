import crypto from "crypto";
import AuthSession from "../models/AuthSessionModel.js";
import SecurityEvent from "../models/SecurityEventModel.js";
import TrustedDevice from "../models/TrustedDeviceModel.js";
import User from "../models/UserModel.js";
import Chat from "../models/ChatModel.js";
import {
  getClientIp,
  getDeviceFingerprint,
  getUserAgentHash,
  hashValue,
  logSecurityEvent,
  revokeSession,
  revokeUserSessions,
} from "../utils/AuthSecurity.js";
import { sendSecurityAlert } from "../services/SecurityAlertService.js";

const SESSION_SELECT =
  "jti deviceLabel deviceFingerprint ipAddress locationHint assuranceLevel mfaVerified trustedDeviceId lastSeenAt expiresAt revokedAt revokedReason createdAt";

const sanitizeSession = (session, currentSessionId) => ({
  id: session.jti,
  deviceLabel: session.deviceLabel || "Unknown device",
  deviceFingerprint: session.deviceFingerprint,
  ipAddress: session.ipAddress,
  locationHint: session.locationHint,
  assuranceLevel: session.assuranceLevel,
  mfaVerified: Boolean(session.mfaVerified),
  trusted: Boolean(session.trustedDeviceId),
  current: session.jti === currentSessionId,
  lastSeenAt: session.lastSeenAt,
  expiresAt: session.expiresAt,
  revokedAt: session.revokedAt,
  revokedReason: session.revokedReason,
  createdAt: session.createdAt,
});

const generateRecoveryCode = () =>
  crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "").slice(0, 10).toUpperCase();

export const listMySessions = async (req, res) => {
  const sessions = await AuthSession.find({
    userId: req.userId,
    expiresAt: { $gt: new Date() },
  })
    .select(SESSION_SELECT)
    .sort({ lastSeenAt: -1 })
    .lean();

  return res.status(200).json({
    sessions: sessions.map((session) => sanitizeSession(session, req.authSessionId)),
  });
};

export const revokeMySession = async (req, res) => {
  const sessionId = req.validated?.sessionId || req.params.sessionId;

  const session = await AuthSession.findOne({
    userId: req.userId,
    jti: sessionId,
    revokedAt: null,
  });

  if (!session) {
    return res.status(404).json({ message: "Session not found." });
  }

  await revokeSession({ sessionId, reason: "remote_logout" });
  await logSecurityEvent({
    req,
    type: "session_remote_logout",
    severity: "info",
    userId: req.userId,
    metadata: { sessionId, current: sessionId === req.authSessionId },
  });

  return res.status(200).json({ revoked: true });
};

export const revokeOtherSessions = async (req, res) => {
  await revokeUserSessions({
    userId: req.userId,
    exceptSessionId: req.authSessionId,
    reason: "remote_logout_all",
  });

  await logSecurityEvent({
    req,
    type: "session_remote_logout_all",
    severity: "info",
    userId: req.userId,
    metadata: { exceptSessionId: req.authSessionId },
  });

  return res.status(200).json({ revoked: true });
};

export const listTrustedDevices = async (req, res) => {
  const devices = await TrustedDevice.find({
    userId: req.userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select("label deviceFingerprint ipAddress trustedAt expiresAt createdAt")
    .sort({ trustedAt: -1 })
    .lean();

  return res.status(200).json({ devices });
};

export const trustCurrentDevice = async (req, res) => {
  const label = req.validated?.trustedDevice?.label || "Trusted device";
  const deviceFingerprint = getDeviceFingerprint(req);
  const expiresAt = new Date(Date.now() + Number(process.env.TRUSTED_DEVICE_DURATION_MS || 30 * 24 * 60 * 60 * 1000));

  const device = await TrustedDevice.create({
    userId: req.userId,
    deviceFingerprint,
    label,
    userAgentHash: getUserAgentHash(req),
    ipAddress: getClientIp(req),
    expiresAt,
  });

  await AuthSession.findOneAndUpdate(
    { jti: req.authSessionId, userId: req.userId },
    { trustedDeviceId: device._id, deviceLabel: label }
  );

  await logSecurityEvent({
    req,
    type: "trusted_device_added",
    severity: "info",
    userId: req.userId,
    metadata: { deviceId: device._id },
  });

  return res.status(201).json({ device });
};

export const revokeTrustedDevice = async (req, res) => {
  const deviceId = req.validated?.trustedDevice?.deviceId || req.params.deviceId;

  const device = await TrustedDevice.findOneAndUpdate(
    { _id: deviceId, userId: req.userId, revokedAt: null },
    { revokedAt: new Date() },
    { new: true }
  );

  if (!device) {
    return res.status(404).json({ message: "Device not found." });
  }

  await AuthSession.updateMany(
    { userId: req.userId, trustedDeviceId: device._id, revokedAt: null },
    { revokedAt: new Date(), revokedReason: "trusted_device_revoked" }
  );

  await logSecurityEvent({
    req,
    type: "trusted_device_revoked",
    severity: "info",
    userId: req.userId,
    metadata: { deviceId },
  });

  return res.status(200).json({ revoked: true });
};

export const listMySecurityEvents = async (req, res) => {
  const limit = Math.min(Number(req.validated?.securityQuery?.limit) || 100, 250);
  const events = await SecurityEvent.find({ userId: req.userId })
    .select("type severity ipAddress deviceFingerprint metadata createdAt")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.status(200).json({ events });
};

export const generateBackupCodes = async (req, res) => {
  const codes = Array.from({ length: 10 }, generateRecoveryCode);
  const backupRecoveryCodes = codes.map((code) => ({
    codeHash: hashValue(`${req.userId}:${code}`),
  }));

  await User.findByIdAndUpdate(req.userId, { backupRecoveryCodes });
  await logSecurityEvent({
    req,
    type: "backup_codes_rotated",
    severity: "medium",
    userId: req.userId,
  });

  return res.status(201).json({ codes });
};

export const exportMyData = async (req, res) => {
  const [user, sessions, trustedDevices, securityEvents, chats] = await Promise.all([
    User.findById(req.userId)
      .select("-password -backupRecoveryCodes")
      .lean(),
    AuthSession.find({ userId: req.userId }).select(SESSION_SELECT).sort({ createdAt: -1 }).lean(),
    TrustedDevice.find({ userId: req.userId }).select("-userAgentHash").sort({ createdAt: -1 }).lean(),
    SecurityEvent.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(1000).lean(),
    Chat.find({ participants: req.userId }).select("conversationKey chatType participants group title createdAt updatedAt").lean(),
  ]);

  await logSecurityEvent({
    req,
    type: "data_export_requested",
    severity: "medium",
    userId: req.userId,
  });

  return res.status(200).json({
    exportedAt: new Date().toISOString(),
    user,
    sessions: sessions.map((session) => sanitizeSession(session, req.authSessionId)),
    trustedDevices,
    securityEvents,
    chats,
  });
};

export const deleteMyAccount = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  const originalEmail = user.email;
  const deletedEmail = `deleted-${user._id}@deleted.connectnow.local`;
  user.email = deletedEmail;
  user.clerkId = null;
  user.firstName = "Deleted";
  user.lastName = "Account";
  user.image = null;
  user.about = "";
  user.status = "Offline";
  user.friends = [];
  user.sentRequests = [];
  user.receivedRequests = [];
  user.blockedUsers = [];
  user.backupRecoveryCodes = [];
  user.deletionRequestedAt = new Date();
  await user.save();

  await Promise.all([
    revokeUserSessions({ userId: req.userId, reason: "account_deleted" }),
    TrustedDevice.updateMany({ userId: req.userId, revokedAt: null }, { revokedAt: new Date() }),
  ]);

  await logSecurityEvent({
    req,
    type: "account_deleted",
    severity: "high",
    userId: req.userId,
  });

  await sendSecurityAlert({
    to: originalEmail,
    subject: "ConnectNow account deletion processed",
    text: "Your ConnectNow account deletion request has been processed.",
  });

  return res.status(200).json({ deleted: true });
};

export const listSecurityEventsForAdmin = async (req, res) => {
  const limit = Math.min(Number(req.validated?.securityQuery?.limit) || 200, 1000);
  const severity = req.validated?.securityQuery?.severity || null;
  const query = severity ? { severity } : {};

  const events = await SecurityEvent.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.status(200).json({ events });
};

export const getSecurityDashboardForAdmin = async (req, res) => {
  const hours = Number(req.validated?.securityQuery?.hours) || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const recentEvents = await SecurityEvent.find({ createdAt: { $gte: since } })
    .select("type severity ipAddress userId createdAt")
    .sort({ createdAt: -1 })
    .limit(2000)
    .lean();

  const countsByType = recentEvents.reduce((accumulator, event) => {
    accumulator[event.type] = (accumulator[event.type] || 0) + 1;
    return accumulator;
  }, {});

  const countsBySeverity = recentEvents.reduce((accumulator, event) => {
    accumulator[event.severity] = (accumulator[event.severity] || 0) + 1;
    return accumulator;
  }, {});

  const hotspotMap = recentEvents.reduce((accumulator, event) => {
    const key = `${event.ipAddress || "unknown"}:${event.type}`;
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  const suspiciousHotspots = Object.entries(hotspotMap)
    .filter(([, count]) => count >= 5)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([key, count]) => {
      const separatorIndex = key.indexOf(":");
      return {
        ipAddress: key.slice(0, separatorIndex),
        type: key.slice(separatorIndex + 1),
        count,
      };
    });

  return res.status(200).json({
    windowHours: hours,
    countsByType,
    countsBySeverity,
    suspiciousHotspots,
    alerts: {
      bruteForce: (countsByType.login_failed || 0) + (countsByType.auth_sync_temporarily_locked || 0),
      tokenAbuse:
        (countsByType.invalid_token || 0) +
        (countsByType.replay_attempt_blocked || 0) +
        (countsByType.replay_protection_failed || 0),
      sessionHijackingIndicators:
        (countsByType.session_hijack_suspected || 0) +
        (countsByType.impossible_travel_candidate || 0),
      massFailedRequests:
        (countsByType.rate_limit_exceeded || 0) +
        (countsByType.bot_detection_blocked || 0),
    },
    recentEvents: recentEvents.slice(0, 25),
  });
};

export const exportSecurityEventsForAdmin = async (req, res) => {
  const events = await SecurityEvent.find({})
    .sort({ createdAt: -1 })
    .limit(Number(process.env.AUDIT_LOG_EXPORT_LIMIT || 10000))
    .lean();

  await logSecurityEvent({
    req,
    type: "admin_audit_export",
    severity: "high",
    userId: req.userId,
    metadata: { count: events.length },
  });

  return res.status(200).json({
    exportedAt: new Date().toISOString(),
    events,
  });
};
