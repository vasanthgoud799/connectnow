import { Router } from "express";

import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  createPremiumOrder,
  getSubscriptionStatus,
  handleRazorpayWebhook,
  verifyPremiumPayment,
} from "../controllers/SubscriptionController.js";

const subscriptionRoutes = Router();

subscriptionRoutes.get("/status", verifyToken, getSubscriptionStatus);
subscriptionRoutes.post("/create-order", verifyToken, createPremiumOrder);
subscriptionRoutes.post("/verify-payment", verifyToken, verifyPremiumPayment);
subscriptionRoutes.post("/webhook", handleRazorpayWebhook);

export default subscriptionRoutes;

