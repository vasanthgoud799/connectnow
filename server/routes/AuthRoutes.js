import { Router } from "express";
import {
  getUserInfo,
  logout,
  syncClerkSession,
  updateProfile,
} from "../controllers/AuthController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  invisibleBotProtection,
} from "../middlewares/SecurityMiddleware.js";
import {
  validateClerkSync,
  validateProfileUpdate,
} from "../middlewares/ValidationMiddleware.js";
import { requireCaptchaIfConfigured } from "../utils/Captcha.js";

const authRoutes = Router();

authRoutes.post(
  "/clerk/sync",
  validateClerkSync,
  invisibleBotProtection,
  requireCaptchaIfConfigured,
  syncClerkSession
);
authRoutes.get("/user-info", verifyToken, getUserInfo);
authRoutes.post("/update-profile", verifyToken, validateProfileUpdate, updateProfile);
authRoutes.post("/logout", verifyToken, logout);
export default authRoutes;
