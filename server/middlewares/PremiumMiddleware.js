import User from "../models/UserModel.js";
import {
  consumeAIUsage,
  getSubscriptionSnapshot,
  syncSubscriptionState,
} from "../services/SubscriptionService.js";

const buildErrorPayload = (message, code, details) => ({
  message,
  code,
  subscription: details,
});

export const requirePremium = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("subscription aiUsage");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    await syncSubscriptionState(user);
    const snapshot = getSubscriptionSnapshot(user);

    if (!snapshot.isPremium) {
      return res
        .status(402)
        .json(
          buildErrorPayload(
            "Upgrade to Premium to use AI features.",
            "PREMIUM_REQUIRED",
            snapshot
          )
        );
    }

    req.subscriptionUser = user;
    req.subscriptionSnapshot = snapshot;
    next();
  } catch (error) {
    console.error("Error validating premium subscription:", error);
    return res.status(500).json({ message: "Failed to validate subscription." });
  }
};

export const enforceAIUsageLimit = async (req, res, next) => {
  try {
    const user = req.subscriptionUser;
    if (!user) {
      return res.status(500).json({ message: "Subscription context missing." });
    }

    const snapshot = await consumeAIUsage(user);
    req.subscriptionSnapshot = snapshot;
    next();
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json(
      buildErrorPayload(
        error.message || "Failed to process AI usage.",
        error.code || "AI_USAGE_ERROR",
        error.details || null
      )
    );
  }
};

