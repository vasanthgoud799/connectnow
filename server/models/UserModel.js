import { genSalt, hash } from "bcrypt";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  clerkId: {
    type: String,
    unique: true,
    sparse: true,
    default: null,
  },
  authProvider: {
    type: String,
    enum: ["local", "clerk"],
    default: "local",
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: false,
    default: null,
  },
  about: {
    type: String,
    required: false,
  },
  firstName: {
    type: String,
    required: false,
  },
  lastName: {
    type: String,
    required: false,
  },
  image: {
    type: String,
    required: false,
  },
  imageStorageProvider: {
    type: String,
    enum: ["local", "supabase"],
    default: null,
  },
  imageStoragePath: {
    type: String,
    default: null,
  },
  imageStorageBucket: {
    type: String,
    default: null,
  },
  profileSetup: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    required: false,
    default: "Offline",
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
    index: true,
  },
  emailVerified: {
    type: Boolean,
    default: false,
    index: true,
  },
  lastLoginAt: {
    type: Date,
    default: null,
  },
  lastLoginIpHash: {
    type: String,
    default: null,
  },
  lastDeviceFingerprint: {
    type: String,
    default: null,
  },
  backupRecoveryCodes: [
    {
      codeHash: {
        type: String,
        required: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      usedAt: {
        type: Date,
        default: null,
      },
    },
  ],
  deletionRequestedAt: {
    type: Date,
    default: null,
  },
  lastSeen: {
    type: Date,
    required: false,
  },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
  sentRequests: [
    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] },
  ],
  receivedRequests: [
    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] },
  ],
  blockedUsers: [
    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] },
  ],
  birthday: {
    type: Date,
    default: null,
  },
  aiPreferences: {
    enabled: {
      type: Boolean,
      default: false,
    },
    preferredTone: {
      type: String,
      default: "friendly",
    },
    translationLanguage: {
      type: String,
      default: "English",
    },
  },
  subscription: {
    plan: {
      type: String,
      enum: ["free", "premium"],
      default: "free",
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  aiUsage: {
    count: {
      type: Number,
      default: 0,
    },
    resetAt: {
      type: Date,
      default: () => {
        const nextReset = new Date();
        nextReset.setHours(24, 0, 0, 0);
        return nextReset;
      },
    },
  },
  e2eePublicKeyJwk: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  e2eeKeyAlgorithm: {
    type: String,
    default: null,
  },
  e2eeKeyVersion: {
    type: Number,
    default: 1,
  },
  e2eePublicKeyFingerprint: {
    type: String,
    default: null,
  },
  e2eeEcdhPublicKeyJwk: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  e2eeEcdhKeyVersion: {
    type: Number,
    default: 1,
  },
  e2eeEcdhPublicKeyFingerprint: {
    type: String,
    default: null,
  },
});

userSchema.index({
  firstName: "text",
  lastName: "text",
  email: "text",
});
userSchema.index({ email: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
userSchema.index({ clerkId: 1 }, { unique: true, sparse: true });
userSchema.index({ birthday: 1 });
userSchema.index({ "subscription.expiresAt": 1 });
userSchema.index({ "aiUsage.resetAt": 1 });

userSchema.pre("save", async function (next) {
  if (this.password && this.isModified("password")) {
    const salt = await genSalt();
    this.password = await hash(this.password, salt);
  }
  next();
});

const User = mongoose.model("User", userSchema);

export default User;
