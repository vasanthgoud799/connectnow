import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import { getConversationKeys, upsertPublicKey } from "../controllers/E2EEController.js";

const e2eeRoutes = Router();

e2eeRoutes.post("/public-key", verifyToken, upsertPublicKey);
e2eeRoutes.get("/conversation-keys", verifyToken, getConversationKeys);

export default e2eeRoutes;
