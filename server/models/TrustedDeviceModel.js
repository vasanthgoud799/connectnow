import mongoose from "mongoose";

const trustedDeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deviceFingerprint: {
      type: String,
      required: true,
      index: true,
    },
    label: {
      type: String,
      default: "Trusted device",
    },
    userAgentHash: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    trustedAt: {
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
  },
  { timestamps: true }
);

trustedDeviceSchema.index(
  { userId: 1, deviceFingerprint: 1, revokedAt: 1 },
  { unique: false }
);
trustedDeviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TrustedDevice = mongoose.model("TrustedDevice", trustedDeviceSchema);

export default TrustedDevice;
