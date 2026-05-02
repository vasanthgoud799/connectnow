import mongoose from "mongoose";

const authSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jti: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    csrfTokenHash: {
      type: String,
      required: true,
    },
    userAgentHash: {
      type: String,
      default: null,
    },
    deviceFingerprint: {
      type: String,
      default: null,
      index: true,
    },
    deviceLabel: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    locationHint: {
      type: String,
      default: null,
    },
    assuranceLevel: {
      type: Number,
      default: 1,
      index: true,
    },
    mfaVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    trustedDeviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrustedDevice",
      default: null,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
    revokedReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
authSessionSchema.index({ userId: 1, deviceFingerprint: 1, createdAt: -1 });

const AuthSession = mongoose.model("AuthSession", authSessionSchema);

export default AuthSession;
