import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  antiReplay,
  sensitiveActionRateLimiter,
  userWriteRateLimiter,
} from "../middlewares/SecurityMiddleware.js";
import {
  validateContactId,
} from "../middlewares/ValidationMiddleware.js";
import {
  blockUser,
  deleteChat,
  unblockUser,
  unfriend,
} from "../controllers/ContactDetailController.js";

const detailRoutes = Router();

detailRoutes.post("/delete-chat", verifyToken, validateContactId, antiReplay, userWriteRateLimiter, deleteChat);
detailRoutes.post("/unfriend", verifyToken, validateContactId, antiReplay, sensitiveActionRateLimiter, unfriend);
detailRoutes.post("/block", verifyToken, validateContactId, antiReplay, sensitiveActionRateLimiter, blockUser);
detailRoutes.post("/unblock", verifyToken, validateContactId, antiReplay, sensitiveActionRateLimiter, unblockUser);

export default detailRoutes;
