import crypto from "crypto";

import User from "../models/UserModel.js";

export const FREE_PLAN = "free";
export const PREMIUM_PLAN = "premium";
export const PREMIUM_VALIDITY_DAYS = 30;
export const DAILY_AI_LIMITS = {
  [FREE_PLAN]: 0,
  [PREMIUM_PLAN]: 50,
};

const getNextUsageResetAt = () => {
  const nextReset = new Date();
  nextReset.setHours(24, 0, 0, 0);
  return nextReset;
};

export const getSubscriptionSnapshot = (user) => {
  const plan = user?.subscription?.plan || FREE_PLAN;
  const expiresAt = user?.subscription?.expiresAt || null;
  const isPremium =
    plan === PREMIUM_PLAN &&
    expiresAt &&
    new Date(expiresAt).getTime() > Date.now();

  const usageCount = Number(user?.aiUsage?.count || 0);
  const resetAt = user?.aiUsage?.resetAt || getNextUsageResetAt();
  const dailyLimit = DAILY_AI_LIMITS[isPremium ? PREMIUM_PLAN : FREE_PLAN] ?? 0;

  return {
    plan: isPremium ? PREMIUM_PLAN : FREE_PLAN,
    expiresAt: isPremium ? expiresAt : null,
    isPremium,
    dailyLimit,
    remaining: Math.max(dailyLimit - usageCount, 0),
    aiUsage: {
      count: usageCount,
      resetAt,
    },
  };
};

export const syncSubscriptionState = async (user) => {
  if (!user) return null;

  let changed = false;
  const now = Date.now();

  if (
    user.subscription?.plan === PREMIUM_PLAN &&
    user.subscription?.expiresAt &&
    new Date(user.subscription.expiresAt).getTime() <= now
  ) {
    user.subscription.plan = FREE_PLAN;
    user.subscription.expiresAt = null;
    changed = true;
  }

  if (!user.aiUsage?.resetAt || new Date(user.aiUsage.resetAt).getTime() <= now) {
    user.aiUsage = {
      count: 0,
      resetAt: getNextUsageResetAt(),
    };
    changed = true;
  }

  if (changed) {
    await user.save();
  }

  return user;
};

export const consumeAIUsage = async (user) => {
  await syncSubscriptionState(user);

  const snapshot = getSubscriptionSnapshot(user);
  if (!snapshot.isPremium) {
    const error = new Error("Premium subscription required for AI features.");
    error.statusCode = 402;
    error.code = "PREMIUM_REQUIRED";
    error.details = snapshot;
    throw error;
  }

  if (snapshot.aiUsage.count >= snapshot.dailyLimit) {
    const error = new Error("Daily AI usage limit reached.");
    error.statusCode = 429;
    error.code = "AI_LIMIT_REACHED";
    error.details = snapshot;
    throw error;
  }

  user.aiUsage.count = snapshot.aiUsage.count + 1;
  await user.save();

  return getSubscriptionSnapshot(user);
};

export const activatePremiumForUser = async ({
  userId,
  paymentId,
  orderId,
}) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const nextExpiry = new Date();
  nextExpiry.setDate(nextExpiry.getDate() + PREMIUM_VALIDITY_DAYS);

  user.subscription = {
    plan: PREMIUM_PLAN,
    expiresAt: nextExpiry,
  };

  user.aiUsage = {
    count: 0,
    resetAt: getNextUsageResetAt(),
  };

  await user.save();

  return {
    user,
    paymentId,
    orderId,
  };
};

export const verifyRazorpaySignature = ({
  orderId,
  paymentId,
  signature,
}) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new Error("Razorpay secret is not configured.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return expectedSignature === signature;
};

export const verifyRazorpayWebhookSignature = ({ rawBody, signature }) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Razorpay webhook secret is not configured.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return expectedSignature === signature;
};

