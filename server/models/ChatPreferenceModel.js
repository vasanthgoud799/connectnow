import mongoose from "mongoose";

const chatPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    conversationKey: {
      type: String,
      required: true,
      index: true,
    },
    archived: {
      type: Boolean,
      default: false,
    },
    mutedUntil: {
      type: Date,
      default: null,
    },
    favorite: {
      type: Boolean,
      default: false,
    },
    pinnedOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

chatPreferenceSchema.index({ userId: 1, conversationKey: 1 }, { unique: true });

const ChatPreference = mongoose.model("ChatPreference", chatPreferenceSchema);
export default ChatPreference;
