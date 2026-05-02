import crypto from "crypto";
import mongoose from "mongoose";

const groupMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "member"],
      default: "member",
    },
    mutedUntil: {
      type: Date,
      default: null,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 240,
      default: "",
    },
    image: {
      type: String,
      default: "",
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
    members: {
      type: [groupMemberSchema],
      validate: {
        validator: (members) => Array.isArray(members) && members.length >= 1,
        message: "A group must have at least one member.",
      },
    },
    inviteToken: {
      type: String,
      default: () => crypto.randomBytes(16).toString("hex"),
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    e2eeCurrentSessionId: {
      type: String,
      default: null,
    },
    e2eeSessionVersion: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

groupSchema.index({ "members.user": 1, updatedAt: -1 });
groupSchema.index({
  name: "text",
  description: "text",
});

const Group = mongoose.model("Group", groupSchema);
export default Group;
