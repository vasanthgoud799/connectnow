import User from "../models/UserModel.js";
import mongoose from "mongoose";
import {
  getSubscriptionSnapshot,
  syncSubscriptionState,
} from "../services/SubscriptionService.js";
import {
  buildStableUserAvatarUrl,
  deleteStoredMedia,
} from "../services/MediaStorageService.js";
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  clearAuthFailures,
  consumeAuthAttempt,
  createSessionToken,
  getClientIp,
  getCookieOptions,
  getDeviceFingerprint,
  hashValue,
  logSecurityEvent,
  recordAuthFailure,
  revokeSession,
  revokeUserSessions,
  verifyAppJwt,
} from "../utils/AuthSecurity.js";

const extractBearerToken = (req) =>
  req.header("Authorization")?.replace(/^Bearer\s+/i, "").trim() || "";

const decodeJwtPayload = (token) => {
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) {
    throw new Error("Invalid Clerk session token.");
  }

  return JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));
};

const getClerkSecretKey = () => process.env.CLERK_SECRET_KEY || "";

const fetchClerkResource = async (path) => {
  const secretKey = getClerkSecretKey();
  if (!secretKey) {
    throw new Error("Clerk secret key is not configured.");
  }

  const response = await fetch(`https://api.clerk.com${path}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Clerk API request failed: ${message}`);
  }

  return response.json();
};

const extractPrimaryClerkEmail = (clerkUser) => {
  if (clerkUser?.primary_email_address?.email_address) {
    return clerkUser.primary_email_address.email_address;
  }

  const primaryEmail = clerkUser?.email_addresses?.find(
    (item) => item.id === clerkUser?.primary_email_address_id
  );

  return (
    primaryEmail?.email_address ||
    clerkUser?.email_addresses?.[0]?.email_address ||
    clerkUser?.emailAddress ||
    ""
  );
};

const isClerkEmailVerified = (clerkUser, email) => {
  const normalizedEmail = String(email || "").toLowerCase();
  const emailRecord = clerkUser?.email_addresses?.find(
    (item) => String(item?.email_address || "").toLowerCase() === normalizedEmail
  );

  return (
    emailRecord?.verification?.status === "verified" ||
    emailRecord?.verified === true ||
    clerkUser?.email_verified === true
  );
};

const isBlockedEmailDomain = (email) => {
  const domain = String(email).split("@")[1]?.toLowerCase();
  if (!domain) return true;

  const blockedDomains = String(process.env.DISPOSABLE_EMAIL_DOMAINS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return blockedDomains.includes(domain);
};

const getSessionAssurance = ({ decoded, session }) => {
  const amrValues = [
    ...(Array.isArray(decoded?.amr) ? decoded.amr : []),
    ...(Array.isArray(session?.latest_activity?.amr)
      ? session.latest_activity.amr
      : []),
  ].map((value) => String(value).toLowerCase());

  const fva = decoded?.fva || decoded?.factor_verification_age;
  const hasRecentSecondFactor =
    Array.isArray(fva) &&
    Number(fva[1]) >= 0 &&
    Number(fva[1]) <= Number(process.env.MFA_MAX_AGE_MINUTES || 60);

  const mfaVerified =
    hasRecentSecondFactor ||
    amrValues.some((value) =>
      ["mfa", "otp", "totp", "sms", "email_code", "backup_code", "webauthn"].includes(value)
    );

  return {
    mfaVerified,
    assuranceLevel: mfaVerified ? 2 : 1,
  };
};

const verifyClerkSession = async (sessionToken) => {
  const decoded = decodeJwtPayload(sessionToken);
  const sessionId = decoded.sid || decoded.session_id;
  const userId = decoded.sub;

  if (!sessionId || !userId) {
    throw new Error("Clerk session token is missing session details.");
  }

  if (decoded.exp && decoded.exp * 1000 < Date.now()) {
    throw new Error("Clerk session token has expired.");
  }

  const [session, clerkUser] = await Promise.all([
    fetchClerkResource(`/v1/sessions/${sessionId}`),
    fetchClerkResource(`/v1/users/${userId}`),
  ]);

  if (!session || session.status !== "active" || session.user_id !== userId) {
    throw new Error("Clerk session is not active.");
  }

  return { clerkUser, session, decoded };
};

const ensureDatabaseReady = (res) => {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      message: "Database is not connected. Please start MongoDB and try again.",
    });
    return false;
  }

  return true;
};

const buildUserPayload = (user) => {
  const subscription = getSubscriptionSnapshot(user);

  return {
    id: user.id,
    email: user.email,
    clerkId: user.clerkId,
    authProvider: user.authProvider,
    role: user.role || "user",
    profileSetUp: user.profileSetup,
    friends: user.friends,
    sentRequests: user.sentRequests,
    receivedRequests: user.receivedRequests,
    firstName: user.firstName,
    lastName: user.lastName,
    about: user.about,
    image: user.image,
    blockedUsers: user.blockedUsers,
    birthday: user.birthday,
    aiPreferences: user.aiPreferences,
    status: user.status,
    subscription: {
      plan: subscription.plan,
      expiresAt: subscription.expiresAt,
    },
    aiUsage: subscription.aiUsage,
    aiDailyLimit: subscription.dailyLimit,
    aiRemaining: subscription.remaining,
    e2ee: {
      enabled: Boolean(user.e2eePublicKeyJwk),
      algorithm: user.e2eeKeyAlgorithm || null,
      keyVersion: Number(user.e2eeKeyVersion || 1),
      fingerprint: user.e2eePublicKeyFingerprint || null,
      ecdhEnabled: Boolean(user.e2eeEcdhPublicKeyJwk),
      ecdhKeyVersion: Number(user.e2eeEcdhKeyVersion || 1),
      ecdhFingerprint: user.e2eeEcdhPublicKeyFingerprint || null,
    },
  };
};

const normalizeProfileText = (value, maxLength) =>
  String(value || "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, maxLength);

export const syncClerkSession = async (req, res) => {
  let attemptedIdentity = "unknown";
  try {
    if (!ensureDatabaseReady(res)) return;

    const sessionToken = extractBearerToken(req);
    if (!sessionToken) {
      await logSecurityEvent({
        req,
        type: "auth_sync_missing_token",
        severity: "medium",
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const { clerkUser, session, decoded } = await verifyClerkSession(sessionToken);
    const email = extractPrimaryClerkEmail(clerkUser).toLowerCase().trim();
    attemptedIdentity = email || clerkUser.id || "unknown";
    const authAttempt = consumeAuthAttempt({ req, identity: attemptedIdentity });

    if (!authAttempt.allowed) {
      await logSecurityEvent({
        req,
        type: "auth_sync_temporarily_locked",
        severity: "high",
        email,
        metadata: { lockedUntil: authAttempt.lockedUntil },
      });
      res.setHeader("Retry-After", String(authAttempt.retryAfterSeconds));
      return res.status(429).json({
        message: "Too many attempts. Please try again later.",
        captchaRequired: true,
      });
    }

    if (!email) {
      recordAuthFailure({ req, identity: attemptedIdentity });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (process.env.CLERK_REQUIRE_VERIFIED_EMAIL !== "false" && !isClerkEmailVerified(clerkUser, email)) {
      await logSecurityEvent({
        req,
        type: "auth_sync_unverified_email",
        severity: "medium",
        email,
      });
      recordAuthFailure({ req, identity: attemptedIdentity });
      return res.status(403).json({ message: "Please verify your email before continuing." });
    }

    if (isBlockedEmailDomain(email)) {
      await logSecurityEvent({
        req,
        type: "auth_sync_blocked_email_domain",
        severity: "medium",
        email,
      });
      recordAuthFailure({ req, identity: attemptedIdentity });
      return res.status(403).json({ message: "Unable to create an account with this email." });
    }

    const clerkId = clerkUser.id;
    const firstName = clerkUser.first_name || clerkUser.firstName || "";
    const lastName = clerkUser.last_name || clerkUser.lastName || "";
    const image = clerkUser.image_url || clerkUser.imageUrl || "";

    let user =
      (await User.findOne({ clerkId })) || (await User.findOne({ email }));

    if (!user) {
      user = await User.create({
        email,
        clerkId,
        authProvider: "clerk",
        emailVerified: true,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        image: image || undefined,
        profileSetup: false,
        status: "Online",
        lastLoginAt: new Date(),
        lastLoginIpHash: hashValue(getClientIp(req)),
        lastDeviceFingerprint: getDeviceFingerprint(req),
      });
    } else {
      user.clerkId = clerkId;
      user.authProvider = "clerk";
      user.email = email;
      user.emailVerified = true;
      user.status = "Online";
      user.lastLoginAt = new Date();
      user.lastLoginIpHash = hashValue(getClientIp(req));
      user.lastDeviceFingerprint = getDeviceFingerprint(req);

      if (!user.firstName && firstName) user.firstName = firstName;
      if (!user.lastName && lastName) user.lastName = lastName;
      if (!user.image && image) user.image = image;
      if (!user.profileSetup && user.firstName && user.image) {
        user.profileSetup = true;
      }

      await user.save();
    }

    const sessionAssurance = getSessionAssurance({ decoded, session });
    if ((user.role || "user") === "admin" && !sessionAssurance.mfaVerified) {
      await logSecurityEvent({
        req,
        type: "admin_login_blocked_missing_mfa",
        severity: "high",
        userId: user._id,
        email,
      });
      return res.status(403).json({
        message: "Admin accounts must sign in with MFA.",
        mfaRequired: true,
      });
    }

    await syncSubscriptionState(user);
    if (process.env.SINGLE_SESSION_MODE === "true") {
      await revokeUserSessions({ userId: user._id, reason: "new_login" });
    }
    const { token, csrfToken, sessionId } = await createSessionToken({
      req,
      user,
      ...sessionAssurance,
      deviceLabel: req.header("X-Device-Label")?.slice(0, 80) || null,
    });

    res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
    res.cookie(CSRF_COOKIE_NAME, csrfToken, getCookieOptions(undefined, false));
    clearAuthFailures({ req, identity: attemptedIdentity });
    await logSecurityEvent({
      req,
      type: "login_success",
      severity: "info",
      userId: user._id,
      email,
      metadata: { sessionId },
    });

    return res.status(200).json({
      user: buildUserPayload(user),
      session: {
        token,
        csrfToken,
        sessionId,
      },
    });
  } catch (error) {
    console.error("Error syncing Clerk session:", error.message);
    recordAuthFailure({ req, identity: attemptedIdentity });
    await logSecurityEvent({
      req,
      type: "login_failed",
      severity: "medium",
      email: attemptedIdentity !== "unknown" ? attemptedIdentity : null,
      metadata: { reason: error.name || "auth_sync_failed" },
    });
    return res.status(401).json({ message: "Invalid credentials" });
  }
};

export const getUserInfo = async (req, res, next) => {
  try {
    if (!ensureDatabaseReady(res)) return;

    const userData = await User.findById(req.userId);
    if (!userData) {
      return res.status(404).send("User with given id not found");
    }
    await syncSubscriptionState(userData);
    return res.status(200).json(buildUserPayload(userData));
  } catch (err) {
    console.error("Error during sign up:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// controllers/AuthController.js

export const updateProfile = async (req, res) => {
  try {
    if (!ensureDatabaseReady(res)) return;

    const { userId } = req;
    const profile = req.validated?.profile || {};
    const hasField = (field) =>
      Object.prototype.hasOwnProperty.call(req.body || {}, field);
    const safeFirstName = normalizeProfileText(
      profile.firstName ?? req.body?.first_name,
      80
    );
    const safeLastName = normalizeProfileText(
      profile.lastName ?? req.body?.last_name,
      80
    );
    const safeAbout = normalizeProfileText(profile.about, 500);
    const image = profile.image;
    const imageUpload = profile.imageUpload;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No user ID provided" });
    }

    const existingUser = await User.findById(userId).select(
      "email firstName lastName image about birthday imageStorageProvider imageStoragePath imageStorageBucket"
    );

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const inferredFirstName =
      existingUser.firstName ||
      String(existingUser.email || "")
        .split("@")[0]
        ?.replace(/[._-]+/g, " ")
        .trim() ||
      "ConnectNow";
    const nextFirstName = safeFirstName || inferredFirstName;
    const nextLastName = safeLastName || existingUser.lastName || "";
    const nextImage = imageUpload?.storagePath
      ? `${buildStableUserAvatarUrl({ req, userId })}?v=${Date.now()}`
      : image || existingUser.image || "";
    const nextAbout = hasField("about") ? safeAbout : existingUser.about || "";
    const nextBirthday = hasField("birthday")
      ? profile.birthday instanceof Date && !Number.isNaN(profile.birthday.getTime())
        ? profile.birthday
        : null
      : existingUser.birthday || null;

    const updatePayload = {
      firstName: nextFirstName,
      lastName: nextLastName,
      image: nextImage,
      about: nextAbout,
      birthday: nextBirthday,
      profileSetup: true,
    };

    if (profile.aiPreferences !== undefined) {
      updatePayload.aiPreferences = profile.aiPreferences;
    }

    if (imageUpload?.storagePath) {
      updatePayload.imageStorageProvider = imageUpload.storageProvider || null;
      updatePayload.imageStoragePath = imageUpload.storagePath || null;
      updatePayload.imageStorageBucket = imageUpload.storageBucket || null;
    }

    const userData = await User.findByIdAndUpdate(userId, updatePayload, {
      new: true,
      runValidators: true,
    });

    await syncSubscriptionState(userData);

    if (
      imageUpload?.storagePath &&
      existingUser?.imageStoragePath &&
      existingUser.imageStoragePath !== imageUpload.storagePath
    ) {
      try {
        await deleteStoredMedia({
          storageProvider: existingUser.imageStorageProvider,
          storagePath: existingUser.imageStoragePath,
          storageBucket: existingUser.imageStorageBucket,
        });
      } catch (cleanupError) {
        console.error("Error deleting previous profile image:", cleanupError.message);
      }
    }

    return res.status(200).json(buildUserPayload(userData));
  } catch (error) {
    console.error("Error updating profile:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const logout = async (req, res) => {
  try {
    if (!ensureDatabaseReady(res)) return;

    let userId = req.userId;
    let sessionId = req.authSessionId;

    if (!sessionId && req.cookies?.[SESSION_COOKIE_NAME]) {
      try {
        const decoded = verifyAppJwt(req.cookies[SESSION_COOKIE_NAME]);
        userId = decoded.userId;
        sessionId = decoded.sid || decoded.jti;
      } catch (error) {
        // The cookie is already invalid; still clear it below.
      }
    }

    if (userId) {
      await User.findByIdAndUpdate(userId, { status: "Offline" });
    }

    if (sessionId) {
      await revokeSession({ sessionId, reason: "logout" });
    }

    res.cookie(SESSION_COOKIE_NAME, "", {
      ...getCookieOptions(0),
      expires: new Date(0),
    });
    res.cookie(CSRF_COOKIE_NAME, "", {
      ...getCookieOptions(0, false),
      expires: new Date(0),
    });

    await logSecurityEvent({
      req,
      type: "logout",
      severity: "info",
      userId: userId || null,
      metadata: { sessionId },
    });

    return res.status(200).json({ message: "Logout Successful" });
  } catch (error) {
    console.error("Error logging out", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
