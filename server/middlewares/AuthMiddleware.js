import {
  SESSION_COOKIE_NAME,
  hashValue,
  logSecurityEvent,
  validateSessionRecord,
  verifyAppJwt,
} from "../utils/AuthSecurity.js";
import User from "../models/UserModel.js";

export const verifyToken = async (req, res, next) => {
  const token =
    req.cookies?.[SESSION_COOKIE_NAME] ||
    req.header("Authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = verifyAppJwt(token);
    const validation = await validateSessionRecord({ decoded, req });

    if (!validation.ok) {
      return res.status(validation.status).json({ message: validation.message });
    }

    req.userId = decoded.userId;
    req.authSessionId = decoded.sid || decoded.jti;
    req.authSession = validation.session;

    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const csrfToken = req.header("X-CSRF-Token");
      if (!csrfToken || hashValue(csrfToken) !== validation.session.csrfTokenHash) {
        await logSecurityEvent({
          req,
          type: "csrf_validation_failed",
          severity: "high",
          userId: decoded.userId,
          metadata: { path: req.originalUrl, method: req.method },
        });
        return res.status(403).json({ message: "Invalid request." });
      }
    }

    return next();
  } catch (err) {
    await logSecurityEvent({
      req,
      type: "invalid_token",
      severity: "medium",
      metadata: { name: err.name },
    });
    return res.status(401).json({ message: "Unauthorized" });
  }
};

export const requireRole = (...allowedRoles) => async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("role");
    if (!user || !allowedRoles.includes(user.role || "user")) {
      await logSecurityEvent({
        req,
        type: "authorization_denied",
        severity: "medium",
        userId: req.userId || null,
        metadata: { allowedRoles, path: req.originalUrl },
      });
      return res.status(403).json({ message: "Forbidden" });
    }

    req.userRole = user.role || "user";
    return next();
  } catch (error) {
    console.error("Role authorization failed:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
