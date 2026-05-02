import mongoose from "mongoose";

const retentionDays = Math.max(Number(process.env.SECURITY_LOG_RETENTION_DAYS) || 180, 30);

const securityEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["info", "low", "medium", "high", "critical"],
      default: "info",
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    email: {
      type: String,
      default: null,
      index: true,
    },
    ipAddress: {
      type: String,
      default: null,
      index: true,
    },
    deviceFingerprint: {
      type: String,
      default: null,
      index: true,
    },
    userAgentHash: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

securityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });
securityEventSchema.index({ email: 1, type: 1, createdAt: -1 });
securityEventSchema.index({ ipAddress: 1, type: 1, createdAt: -1 });

const SecurityEvent = mongoose.model("SecurityEvent", securityEventSchema);

export default SecurityEvent;
