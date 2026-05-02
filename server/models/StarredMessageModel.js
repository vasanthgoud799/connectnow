import mongoose from "mongoose";

const starredMessageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Messages",
      required: true,
      index: true,
    },
    conversationKey: {
      type: String,
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

starredMessageSchema.index({ userId: 1, messageId: 1 }, { unique: true });

const StarredMessage = mongoose.model("StarredMessage", starredMessageSchema);
export default StarredMessage;
