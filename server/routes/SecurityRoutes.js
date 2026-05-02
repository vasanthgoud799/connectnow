import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  requirePermission,
  requireAdminStrongSession,
  requireStrongSession,
} from "../middlewares/PermissionMiddleware.js";
import {
  antiReplay,
  sensitiveActionRateLimiter,
  userWriteRateLimiter,
} from "../middlewares/SecurityMiddleware.js";
import {
  deleteMyAccount,
  exportMyData,
  exportSecurityEventsForAdmin,
  generateBackupCodes,
  getSecurityDashboardForAdmin,
  listMySecurityEvents,
  listMySessions,
  listSecurityEventsForAdmin,
  listTrustedDevices,
  revokeMySession,
  revokeOtherSessions,
  revokeTrustedDevice,
  trustCurrentDevice,
} from "../controllers/SecurityController.js";
import {
  validateSecurityEventsQuery,
  validateSecuritySessionParam,
  validateTrustedDevicePayload,
} from "../middlewares/ValidationMiddleware.js";

const securityRoutes = Router();
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

securityRoutes.use(verifyToken);

securityRoutes.get(
  "/sessions",
  requirePermission("security:read_own"),
  asyncHandler(listMySessions)
);
securityRoutes.delete(
  "/sessions/:sessionId",
  requirePermission("security:manage_own"),
  validateSecuritySessionParam,
  antiReplay,
  userWriteRateLimiter,
  asyncHandler(revokeMySession)
);
securityRoutes.post(
  "/sessions/revoke-others",
  requirePermission("security:manage_own"),
  antiReplay,
  sensitiveActionRateLimiter,
  asyncHandler(revokeOtherSessions)
);
securityRoutes.get(
  "/trusted-devices",
  requirePermission("security:read_own"),
  asyncHandler(listTrustedDevices)
);
securityRoutes.post(
  "/trusted-devices",
  requirePermission("security:manage_own"),
  requireStrongSession,
  validateTrustedDevicePayload,
  antiReplay,
  sensitiveActionRateLimiter,
  asyncHandler(trustCurrentDevice)
);
securityRoutes.delete(
  "/trusted-devices/:deviceId",
  requirePermission("security:manage_own"),
  validateTrustedDevicePayload,
  antiReplay,
  sensitiveActionRateLimiter,
  asyncHandler(revokeTrustedDevice)
);
securityRoutes.get(
  "/events",
  requirePermission("security:read_own"),
  validateSecurityEventsQuery,
  asyncHandler(listMySecurityEvents)
);
securityRoutes.post(
  "/backup-codes",
  requirePermission("security:manage_own"),
  requireStrongSession,
  antiReplay,
  sensitiveActionRateLimiter,
  asyncHandler(generateBackupCodes)
);
securityRoutes.get(
  "/data-export",
  requirePermission("security:read_own"),
  sensitiveActionRateLimiter,
  asyncHandler(exportMyData)
);
securityRoutes.delete(
  "/account",
  requirePermission("account:delete_own"),
  requireStrongSession,
  antiReplay,
  sensitiveActionRateLimiter,
  asyncHandler(deleteMyAccount)
);
securityRoutes.get(
  "/admin/dashboard",
  requirePermission("security:dashboard_read"),
  requireAdminStrongSession,
  validateSecurityEventsQuery,
  asyncHandler(getSecurityDashboardForAdmin)
);
securityRoutes.get(
  "/admin/events",
  requirePermission("security:read_all"),
  requireAdminStrongSession,
  validateSecurityEventsQuery,
  asyncHandler(listSecurityEventsForAdmin)
);
securityRoutes.get(
  "/admin/events/export",
  requirePermission("security:export_all"),
  requireAdminStrongSession,
  validateSecurityEventsQuery,
  sensitiveActionRateLimiter,
  asyncHandler(exportSecurityEventsForAdmin)
);

export default securityRoutes;
