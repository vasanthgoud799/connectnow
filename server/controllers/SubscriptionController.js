import User from "../models/UserModel.js";
import {
  activatePremiumForUser,
  getSubscriptionSnapshot,
  syncSubscriptionState,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from "../services/SubscriptionService.js";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

const getRazorpayAuthHeader = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured.");
  }

  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
};

const buildSubscriptionResponse = async (userId) => {
  const user = await User.findById(userId).select("subscription aiUsage");
  if (!user) {
    throw new Error("User not found");
  }

  await syncSubscriptionState(user);
  return getSubscriptionSnapshot(user);
};

export const getSubscriptionStatus = async (req, res) => {
  try {
    const subscription = await buildSubscriptionResponse(req.userId);
    return res.status(200).json({ subscription });
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    return res.status(500).json({ message: "Failed to fetch subscription status." });
  }
};

export const createPremiumOrder = async (req, res) => {
  try {
    const amount = Number(process.env.RAZORPAY_PREMIUM_AMOUNT || 29900);
    const currency = process.env.RAZORPAY_CURRENCY || "INR";
    const authHeader = getRazorpayAuthHeader();
    const shortUserId = String(req.userId).slice(-8);
    const shortTimestamp = Date.now().toString().slice(-10);

    const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount,
        currency,
        receipt: `prem_${shortUserId}_${shortTimestamp}`,
        notes: {
          userId: String(req.userId),
          plan: "premium",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to create Razorpay order.");
    }

    const order = await response.json();

    return res.status(200).json({
      order,
      keyId: process.env.RAZORPAY_KEY_ID,
      plan: "premium",
      validityDays: 30,
    });
  } catch (error) {
    console.error("Error creating premium order:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const verifyPremiumPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = req.body;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ message: "Missing payment verification fields." });
    }

    const isValid = verifyRazorpaySignature({
      orderId,
      paymentId,
      signature,
    });

    if (!isValid) {
      return res.status(400).json({ message: "Invalid payment signature." });
    }

    const { user } = await activatePremiumForUser({
      userId: req.userId,
      paymentId,
      orderId,
    });

    const subscription = getSubscriptionSnapshot(user);

    return res.status(200).json({
      message: "Premium activated successfully.",
      subscription,
    });
  } catch (error) {
    console.error("Error verifying premium payment:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const handleRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : JSON.stringify(req.body || {});

    if (!signature) {
      return res.status(400).json({ message: "Missing Razorpay signature." });
    }

    const isValid = verifyRazorpayWebhookSignature({ rawBody, signature });
    if (!isValid) {
      return res.status(400).json({ message: "Invalid webhook signature." });
    }

    const payload = Buffer.isBuffer(req.body)
      ? JSON.parse(rawBody)
      : req.body;

    const event = payload?.event;
    if (event !== "payment.captured") {
      return res.status(200).json({ received: true });
    }

    const payment = payload?.payload?.payment?.entity;
    const userId = payment?.notes?.userId;

    if (!userId || !payment?.id || !payment?.order_id) {
      return res.status(200).json({ received: true });
    }

    await activatePremiumForUser({
      userId,
      paymentId: payment.id,
      orderId: payment.order_id,
    });

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Error handling Razorpay webhook:", error);
    return res.status(500).json({ message: "Failed to handle Razorpay webhook." });
  }
};
