import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  enforceAIUsageLimit,
  requirePremium,
} from "../middlewares/PremiumMiddleware.js";
import {
  autocompleteDraft,
  generateSmartReplies,
  getAISettings,
  getToneOptions,
  rewriteMessage,
  saveAISettings,
  summarizeChat,
  translateMessage,
} from "../controllers/AIController.js";

const aiRoutes = Router();

aiRoutes.get("/settings", verifyToken, getAISettings);
aiRoutes.post("/settings", verifyToken, saveAISettings);
aiRoutes.post(
  "/smart-replies",
  verifyToken,
  requirePremium,
  enforceAIUsageLimit,
  generateSmartReplies
);
aiRoutes.post(
  "/autocomplete",
  verifyToken,
  requirePremium,
  enforceAIUsageLimit,
  autocompleteDraft
);
aiRoutes.post(
  "/tone-suggestions",
  verifyToken,
  requirePremium,
  enforceAIUsageLimit,
  getToneOptions
);
aiRoutes.post(
  "/rewrite",
  verifyToken,
  requirePremium,
  enforceAIUsageLimit,
  rewriteMessage
);
aiRoutes.post(
  "/translate",
  verifyToken,
  requirePremium,
  enforceAIUsageLimit,
  translateMessage
);
aiRoutes.post(
  "/summarize",
  verifyToken,
  requirePremium,
  enforceAIUsageLimit,
  summarizeChat
);

export default aiRoutes;
