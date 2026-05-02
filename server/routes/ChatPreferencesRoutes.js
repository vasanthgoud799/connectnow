import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import { saveChatPreference } from "../controllers/ChatPreferencesController.js";

const chatPreferencesRoutes = Router();

chatPreferencesRoutes.post("/", verifyToken, saveChatPreference);

export default chatPreferencesRoutes;
