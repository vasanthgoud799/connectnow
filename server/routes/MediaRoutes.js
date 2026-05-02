import { Router } from "express";
import {
  createUploadIntent,
  getGroupImage,
  getUserImage,
} from "../controllers/MediaController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  antiReplay,
  uploadIntentRateLimiter,
  userWriteRateLimiter,
} from "../middlewares/SecurityMiddleware.js";
import { validateUploadIntent } from "../middlewares/ValidationMiddleware.js";

const mediaRoutes = Router();

mediaRoutes.get("/user/:userId/image", getUserImage);
mediaRoutes.get("/group/:groupId/image", getGroupImage);
mediaRoutes.post(
  "/upload-intent",
  verifyToken,
  validateUploadIntent,
  antiReplay,
  uploadIntentRateLimiter,
  userWriteRateLimiter,
  createUploadIntent
);

export default mediaRoutes;
