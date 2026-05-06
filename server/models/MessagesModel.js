import mongoose from "mongoose";

const messageReadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    readAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const messageReactionSchema = new mongoose.Schema(
  {
    emoji: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const replyPreviewSchema = new mongoose.Schema(
  {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Messages",
      required: true,
    },
    content: {
      type: String,
      default: "",
    },
    messageType: {
      type: String,
      enum: ["text", "image", "video", "audio", "document", "system", "poll"],
      required: true,
    },
    clientMessageId: {
      type: String,
      default: null,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { _id: false }
);

const pinnedByChatSchema = new mongoose.Schema(
  {
    conversationKey: {
      type: String,
      required: true,
    },
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pinnedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const messageEncryptionSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    algorithm: {
      type: String,
      enum: [
        "rsa-oaep-aes-gcm-v1",
        "ecdh-rsa-aes-gcm-v2",
        "group-session-aes-gcm-v2",
      ],
      default: null,
    },
    iv: {
      type: String,
      default: null,
    },
    ciphertext: {
      type: String,
      default: null,
    },
    encryptedKeys: {
      type: Map,
      of: String,
      default: {},
    },
    ephPublicKeyJwk: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    keyWrapIv: {
      type: String,
      default: null,
    },
    selfEncryptedKey: {
      type: String,
      default: null,
    },
    payloadType: {
      type: String,
      enum: ["text", "poll", "attachment-caption", "media-file"],
      default: "text",
    },
    sessionId: {
      type: String,
      default: null,
    },
    originalMimeType: {
      type: String,
      default: null,
    },
    originalFileName: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number,
      default: null,
    },
    keyVersion: {
      type: Number,
      default: 1,
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationKey: {
      type: String,
      required: true,
      index: true,
    },
    chatType: {
      type: String,
      enum: ["direct", "group"],
      default: "direct",
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.chatType === "direct";
      },
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: function () {
        return this.chatType === "group";
      },
      index: true,
    },
    messageType: {
      type: String,
      enum: ["text", "image", "video", "audio", "document", "system", "poll"],
      required: true,
    },
    content: {
      type: String,
      required: function () {
        return (
          this.messageType === "system" ||
          (this.messageType === "text" && !(this.encryption?.enabled && this.encryption?.ciphertext))
        );
      },
    },
    fileUrl: {
      type: String,
      required: function () {
        return ["image", "video", "audio", "document"].includes(this.messageType);
      },
    },
    storageProvider: {
      type: String,
      enum: ["local", "supabase"],
      default: null,
    },
    storagePath: {
      type: String,
      default: null,
    },
    storageBucket: {
      type: String,
      default: null,
    },
    storageProvider: {
      type: String,
      enum: ["local", "supabase"],
      default: null,
    },
    storageBucket: {
      type: String,
      default: null,
    },
    storagePath: {
      type: String,
      default: null,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Messages",
      default: null,
    },
    replyPreview: {
      type: replyPreviewSchema,
      default: null,
    },
    forwardedFromMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Messages",
      default: null,
    },
    isForwarded: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    deletedFor: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    isDeletedForEveryone: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reactions: {
      type: [messageReactionSchema],
      default: [],
    },
    pinnedByChat: {
      type: [pinnedByChatSchema],
      default: [],
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
      index: true,
    },
    deliveredAt: {
      type: Date,
      required: false,
    },
    seenAt: {
      type: Date,
      required: false,
    },
    readBy: {
      type: [messageReadSchema],
      default: [],
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    encryption: {
      type: messageEncryptionSchema,
      default: null,
    },
    mediaEncryption: {
      type: messageEncryptionSchema,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ conversationKey: 1, createdAt: 1 });
messageSchema.index(
  { sender: 1, conversationKey: 1, clientMessageId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { clientMessageId: { $type: "string" } },
  }
);
messageSchema.index({ recipient: 1, status: 1, createdAt: 1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ group: 1, createdAt: 1 });
messageSchema.index({ content: "text" });
messageSchema.index({ "reactions.userId": 1, createdAt: -1 });
messageSchema.index({ "pinnedByChat.conversationKey": 1, createdAt: -1 });

const Message = mongoose.model("Messages", messageSchema);
export default Message;
