import User from "../models/UserModel.js";
import { logSecurityEvent } from "../utils/AuthSecurity.js";

export const PERMISSIONS = Object.freeze({
  "security:read_own": ["user", "admin"],
  "security:manage_own": ["user", "admin"],
  "security:read_all": ["admin"],
  "security:export_all": ["admin"],
  "security:dashboard_read": ["admin"],
  "account:delete_own": ["user", "admin"],
  "admin:read": ["admin"],
});

export const requirePermission = (permission) => async (req, res, next) => {
  try {
    const allowedRoles = PERMISSIONS[permission] || [];
    const user = await User.findById(req.userId).select("role");
    const role = user?.role || "user";

    if (!allowedRoles.includes(role)) {
      await logSecurityEvent({
        req,
        type: "permission_denied",
        severity: "medium",
        userId: req.userId || null,
        metadata: { permission, role, path: req.originalUrl },
      });
      return res.status(403).json({ message: "Forbidden" });
    }

    req.userRole = role;
    return next();
  } catch (error) {
    console.error("Permission check failed:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const requireStrongSession = async (req, res, next) => {
  const minAssuranceLevel = Number(process.env.SENSITIVE_ACTION_ASSURANCE_LEVEL || 2);
  const sessionAssurance = Number(req.authSession?.assuranceLevel || 1);

  if (!req.authSession?.mfaVerified || sessionAssurance < minAssuranceLevel) {
    await logSecurityEvent({
      req,
      type: "strong_session_required",
      severity: "medium",
      userId: req.userId || null,
      metadata: { path: req.originalUrl, sessionAssurance },
    });
    return res.status(403).json({
      message: "Additional verification is required.",
      mfaRequired: true,
    });
  }

  return next();
};

export const requireAdminStrongSession = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("role email");
    if ((user?.role || "user") !== "admin") {
      return next();
    }

    if (!req.authSession?.mfaVerified || Number(req.authSession?.assuranceLevel || 1) < 2) {
      await logSecurityEvent({
        req,
        type: "admin_mfa_required",
        severity: "high",
        userId: req.userId || null,
        email: user?.email || null,
        metadata: { path: req.originalUrl },
      });
      return res.status(403).json({
        message: "Admin accounts must complete MFA.",
        mfaRequired: true,
      });
    }

    return next();
  } catch (error) {
    console.error("Admin strong-session check failed:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
