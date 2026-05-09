import mongoose from "mongoose";
import Chat from "../models/ChatModel.js";
import ChatPreference from "../models/ChatPreferenceModel.js";
import Group from "../models/GroupModel.js";
import Message from "../models/MessagesModel.js";
import StarredMessage from "../models/StarredMessageModel.js";
import { areUsersFriends } from "./FriendRequestService.js";
import {
  deleteStoredMedia,
  resolveMediaUrl,
  resolveMediaUrlsForMessages,
} from "./MediaStorageService.js";

export const getConversationKey = (userA, userB) => {
  return [String(userA), String(userB)].sort().join(":");
};

export const getGroupConversationKey = (groupId) => {
  return `group:${String(groupId)}`;
};

export const ALLOWED_DISAPPEARING_DURATIONS = [3600, 86400, 604800];

export const buildNonExpiredMessageQuery = (now = new Date()) => ({
  $or: [
    { expiresAt: { $exists: false } },
    { expiresAt: null },
    { expiresAt: { $gt: now } },
  ],
});

const getExpiryForDisappearingSetting = (settingSource) => {
  const duration = Number(settingSource?.disappearingMessageDuration || 0);
  if (
    !settingSource?.disappearingMessagesEnabled ||
    !ALLOWED_DISAPPEARING_DURATIONS.includes(duration)
  ) {
    return null;
  }

  return new Date(Date.now() + duration * 1000);
};

export const buildClientMessageLookupQuery = ({
  senderId,
  conversationKey,
  clientMessageId,
}) => {
  if (!clientMessageId) return null;

  return {
    sender: senderId,
    conversationKey,
    clientMessageId: String(clientMessageId),
  };
};

const buildLastMessagePayload = (messageDoc) => ({
  messageId: messageDoc._id,
  sender: messageDoc.sender,
  content: getMessageDisplayContent(messageDoc),
  messageType: messageDoc.messageType,
  timestamp: messageDoc.timestamp,
  status: messageDoc.status,
});

const ensureObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value);

const getEntityId = (value) => {
  if (!value) return null;

  if (typeof value === "string") return value;

  if (value instanceof mongoose.Types.ObjectId) {
    return String(value);
  }

  return String(value._id || value.id || value.user || value);
};

const getUnreadCountForUser = (unreadCounts, userId) => {
  if (!unreadCounts) return 0;

  if (typeof unreadCounts.get === "function") {
    return Number(unreadCounts.get(String(userId)) || 0);
  }

  return Number(unreadCounts[String(userId)] || 0);
};

const getMessageDisplayContent = (messageDoc) =>
  messageDoc.isDeletedForEveryone
    ? "This message was deleted"
    : messageDoc.encryption?.enabled && messageDoc.messageType === "poll"
      ? "Old encrypted message"
    : messageDoc.encryption?.enabled &&
        messageDoc.encryption?.payloadType === "attachment-caption"
      ? messageDoc.content ||
        (messageDoc.messageType === "audio" ? "Audio" : "Attachment")
    : messageDoc.encryption?.enabled && messageDoc.messageType === "text"
      ? "Old encrypted message"
    : messageDoc.content ||
      (messageDoc.messageType === "poll"
        ? messageDoc.meta?.poll?.question || "Poll"
        : messageDoc.messageType === "image"
          ? "Image"
          : messageDoc.messageType === "video"
            ? "Video"
            : messageDoc.messageType === "audio"
              ? "Audio"
              : messageDoc.messageType === "document"
                ? "Document"
                : "");

const canAccessMessage = async (messageDoc, userId) => {
  const normalizedUserId = String(userId);

  if (
    messageDoc.expiresAt instanceof Date &&
    messageDoc.expiresAt.getTime() <= Date.now()
  ) {
    return false;
  }

  if (messageDoc.chatType === "group") {
    const group = await Group.findById(messageDoc.group).select("members");
    return Boolean(
      group?.members?.some(
        (member) => getEntityId(member.user) === normalizedUserId
      )
    );
  }

  return [getEntityId(messageDoc.sender), getEntityId(messageDoc.recipient)].includes(
    normalizedUserId
  );
};

const buildReplyPreview = async (replyToMessageId, userId) => {
  if (!replyToMessageId) return null;

  const replyMessage = await Message.findById(replyToMessageId)
    .select(
      "content messageType sender recipient group chatType isDeletedForEveryone meta"
    )
    .populate("sender", "firstName lastName email");

  if (!replyMessage) {
    throw new Error("Reply target not found");
  }

  const allowed = await canAccessMessage(replyMessage, userId);
  if (!allowed) {
    throw new Error("You cannot reply to this message");
  }

  return {
    messageId: replyMessage._id,
    content: getMessageDisplayContent(replyMessage),
    messageType: replyMessage.messageType,
    sender: replyMessage.sender?._id || replyMessage.sender,
  };
};

const normalizePollMeta = (pollMeta = {}, creatorId) => {
  const question = String(pollMeta.question || "").trim();
  const rawOptions = Array.isArray(pollMeta.options) ? pollMeta.options : [];
  const options = rawOptions
    .map((option, index) => ({
      id: String(option.id || `option-${index + 1}`),
      text: String(option.text || "").trim(),
      voterIds: Array.isArray(option.voterIds)
        ? [...new Set(option.voterIds.map((voterId) => String(voterId)))]
        : [],
    }))
    .filter((option) => option.text);

  if (!question) {
    throw new Error("Poll question is required");
  }

  if (options.length < 2) {
    throw new Error("Poll requires at least two options");
  }

  return {
    poll: {
      question,
      allowMultipleAnswers: Boolean(pollMeta.allowMultipleAnswers),
      createdBy: String(creatorId),
      options: options.map((option) => ({
        ...option,
        voterCount: option.voterIds.length,
      })),
      totalVotes: [...new Set(options.flatMap((option) => option.voterIds))].length,
    },
  };
};

const buildDirectChatUpsert = (message, senderId, recipientId) => ({
  $set: {
    chatType: "direct",
    participants: [senderId, recipientId],
    lastMessage: buildLastMessagePayload(message),
  },
  $inc: {
    [`unreadCounts.${String(recipientId)}`]: 1,
  },
});

const buildGroupChatUpsert = ({ message, group, senderId }) => {
  const unreadIncrements = {};

  group.members.forEach((member) => {
    const memberId = String(member.user?._id || member.user);
    if (memberId !== String(senderId)) {
      unreadIncrements[`unreadCounts.${memberId}`] = 1;
    }
  });

  return {
    $set: {
      chatType: "group",
      group: group._id,
      title: group.name,
      image: group.image || "",
      participants: group.members.map((member) => member.user?._id || member.user),
      lastMessage: buildLastMessagePayload(message),
    },
    ...(Object.keys(unreadIncrements).length ? { $inc: unreadIncrements } : {}),
  };
};

export const createDirectMessage = async ({
  senderId,
  recipientId,
  clientMessageId = null,
  content,
  messageType,
  fileUrl,
  storageProvider,
  storagePath,
  storageBucket,
  timestamp,
  meta,
  replyTo,
  forwardedFromMessageId,
  isForwarded = false,
  encryption,
  mediaEncryption,
}) => {
  const canMessage = await areUsersFriends(senderId, recipientId);
  if (!canMessage) {
    throw new Error("Send friend request to start chatting");
  }

  const conversationKey = getConversationKey(senderId, recipientId);
  const directLookupQuery = buildClientMessageLookupQuery({
    senderId,
    conversationKey,
    clientMessageId,
  });
  if (directLookupQuery) {
    const existingMessage = await Message.findOne(directLookupQuery);

    if (existingMessage) {
      return existingMessage;
    }
  }
  const createdAt = timestamp ? new Date(timestamp) : new Date();
  const replyPreview = await buildReplyPreview(replyTo, senderId);
  const chatSetting = await Chat.findOne({ conversationKey })
    .select("disappearingMessagesEnabled disappearingMessageDuration")
    .lean();
  const expiresAt = getExpiryForDisappearingSetting(chatSetting);

  const message = await Message.create({
    conversationKey,
    chatType: "direct",
    clientMessageId: clientMessageId ? String(clientMessageId) : null,
    sender: senderId,
    recipient: recipientId,
    content: encryption?.enabled ? "" : content,
    messageType,
    fileUrl,
    storageProvider: storageProvider || null,
    storagePath: storagePath || null,
    storageBucket: storageBucket || null,
    timestamp: createdAt,
    status: "sent",
    meta: messageType === "poll" ? normalizePollMeta(meta?.poll || meta, senderId) : meta || null,
    replyTo: replyTo || null,
    replyPreview,
    forwardedFromMessageId: forwardedFromMessageId || null,
    isForwarded: Boolean(isForwarded || forwardedFromMessageId),
    expiresAt,
    encryption: encryption?.enabled
      ? {
          enabled: true,
          algorithm: encryption.algorithm,
          iv: encryption.iv,
          ciphertext: encryption.ciphertext,
          encryptedKeys: encryption.encryptedKeys || {},
          ephPublicKeyJwk: encryption.ephPublicKeyJwk || null,
          keyWrapIv: encryption.keyWrapIv || null,
          selfEncryptedKey: encryption.selfEncryptedKey || null,
          payloadType: encryption.payloadType || "text",
          sessionId: encryption.sessionId || null,
          originalMimeType: encryption.originalMimeType || null,
          originalFileName: encryption.originalFileName || null,
          fileSize: Number(encryption.fileSize || 0) || null,
          keyVersion: Number(encryption.keyVersion || 1),
        }
      : null,
    mediaEncryption: mediaEncryption?.enabled
      ? {
          enabled: true,
          algorithm: mediaEncryption.algorithm,
          iv: mediaEncryption.iv,
          ciphertext: mediaEncryption.ciphertext || null,
          encryptedKeys: mediaEncryption.encryptedKeys || {},
          ephPublicKeyJwk: mediaEncryption.ephPublicKeyJwk || null,
          keyWrapIv: mediaEncryption.keyWrapIv || null,
          selfEncryptedKey: mediaEncryption.selfEncryptedKey || null,
          payloadType: mediaEncryption.payloadType || "media-file",
          sessionId: mediaEncryption.sessionId || null,
          originalMimeType: mediaEncryption.originalMimeType || null,
          originalFileName: mediaEncryption.originalFileName || null,
          fileSize: Number(mediaEncryption.fileSize || 0) || null,
          keyVersion: Number(mediaEncryption.keyVersion || 1),
        }
      : null,
  });

  await Chat.findOneAndUpdate(
    { conversationKey },
    buildDirectChatUpsert(message, senderId, recipientId),
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return message;
};

export const createGroupSystemMessage = async ({
  group,
  senderId,
  content,
  meta = null,
}) => {
  const conversationKey = getGroupConversationKey(group._id);

  const message = await Message.create({
    conversationKey,
    chatType: "group",
    sender: senderId,
    group: group._id,
    content,
    messageType: "system",
    fileUrl: "__system__",
    timestamp: new Date(),
    status: "delivered",
    deliveredAt: new Date(),
    meta,
  });

  await Chat.findOneAndUpdate(
    { conversationKey },
    buildGroupChatUpsert({ message, group, senderId }),
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return message;
};

export const createGroupMessage = async ({
  groupId,
  senderId,
  clientMessageId = null,
  content,
  messageType,
  fileUrl,
  storageProvider,
  storagePath,
  storageBucket,
  timestamp,
  meta,
  replyTo,
  forwardedFromMessageId,
  isForwarded = false,
  encryption,
  mediaEncryption,
}) => {
  const group = await Group.findById(groupId).populate("members.user", "firstName lastName email image");
  if (!group) {
    throw new Error("Group not found");
  }

  const isMember = group.members.some(
    (member) => String(member.user?._id || member.user) === String(senderId)
  );

  if (!isMember) {
    throw new Error("You are not a member of this group");
  }

  const conversationKey = getGroupConversationKey(groupId);
  const groupLookupQuery = buildClientMessageLookupQuery({
    senderId,
    conversationKey,
    clientMessageId,
  });
  if (groupLookupQuery) {
    const existingMessage = await Message.findOne(groupLookupQuery);

    if (existingMessage) {
      return existingMessage;
    }
  }
  const createdAt = timestamp ? new Date(timestamp) : new Date();
  const replyPreview = await buildReplyPreview(replyTo, senderId);
  const expiresAt = getExpiryForDisappearingSetting(group);

  const message = await Message.create({
    conversationKey,
    chatType: "group",
    clientMessageId: clientMessageId ? String(clientMessageId) : null,
    sender: senderId,
    group: groupId,
    content: encryption?.enabled ? "" : content,
    messageType,
    fileUrl,
    storageProvider: storageProvider || null,
    storagePath: storagePath || null,
    storageBucket: storageBucket || null,
    timestamp: createdAt,
    status: "delivered",
    deliveredAt: createdAt,
    meta: messageType === "poll" ? normalizePollMeta(meta?.poll || meta, senderId) : meta || null,
    replyTo: replyTo || null,
    replyPreview,
    forwardedFromMessageId: forwardedFromMessageId || null,
    isForwarded: Boolean(isForwarded || forwardedFromMessageId),
    expiresAt,
    encryption: encryption?.enabled
      ? {
          enabled: true,
          algorithm: encryption.algorithm,
          iv: encryption.iv,
          ciphertext: encryption.ciphertext,
          encryptedKeys: encryption.encryptedKeys || {},
          ephPublicKeyJwk: encryption.ephPublicKeyJwk || null,
          keyWrapIv: encryption.keyWrapIv || null,
          selfEncryptedKey: encryption.selfEncryptedKey || null,
          payloadType: encryption.payloadType || "text",
          sessionId: encryption.sessionId || null,
          originalMimeType: encryption.originalMimeType || null,
          originalFileName: encryption.originalFileName || null,
          fileSize: Number(encryption.fileSize || 0) || null,
          keyVersion: Number(encryption.keyVersion || 1),
        }
      : null,
    mediaEncryption: mediaEncryption?.enabled
      ? {
          enabled: true,
          algorithm: mediaEncryption.algorithm,
          iv: mediaEncryption.iv,
          ciphertext: mediaEncryption.ciphertext || null,
          encryptedKeys: mediaEncryption.encryptedKeys || {},
          ephPublicKeyJwk: mediaEncryption.ephPublicKeyJwk || null,
          keyWrapIv: mediaEncryption.keyWrapIv || null,
          selfEncryptedKey: mediaEncryption.selfEncryptedKey || null,
          payloadType: mediaEncryption.payloadType || "media-file",
          sessionId: mediaEncryption.sessionId || null,
          originalMimeType: mediaEncryption.originalMimeType || null,
          originalFileName: mediaEncryption.originalFileName || null,
          fileSize: Number(mediaEncryption.fileSize || 0) || null,
          keyVersion: Number(mediaEncryption.keyVersion || 1),
        }
      : null,
  });

  await Chat.findOneAndUpdate(
    { conversationKey },
    buildGroupChatUpsert({ message, group, senderId }),
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return message;
};

export const getMessageByIdForUser = async ({ messageId, userId }) => {
  const message = await Message.findOne({
    _id: messageId,
    ...buildNonExpiredMessageQuery(),
  })
    .populate("sender", "id email firstName lastName image")
    .populate("recipient", "id email firstName lastName image")
    .populate("group", "name description image members");

  if (!message) {
    throw new Error("Message not found");
  }

  const allowed = await canAccessMessage(message, userId);
  if (!allowed) {
    throw new Error("You do not have access to this message");
  }

  return message;
};

export const hydrateMessageMediaForUser = async ({ message, req = null }) => {
  if (!message) return message;
  await resolveMediaUrl({ message, req });
  return message;
};

export const hydrateMessagesMediaForUser = async ({ messages, req = null }) => {
  await resolveMediaUrlsForMessages({ messages, req });
  return messages;
};

export const reactToMessage = async ({ messageId, userId, emoji }) => {
  const message = await getMessageByIdForUser({ messageId, userId });
  const normalizedEmoji = String(emoji || "").trim();

  if (!normalizedEmoji) {
    throw new Error("Reaction emoji is required");
  }

  message.reactions = (message.reactions || []).filter(
    (reaction) =>
      !(
        String(reaction.userId) === String(userId) &&
        String(reaction.emoji) === normalizedEmoji
      )
  );

  message.reactions.push({
    emoji: normalizedEmoji,
    userId: ensureObjectId(userId),
    createdAt: new Date(),
  });

  message.markModified("reactions");
  await message.save();

  return getMessageByIdForUser({ messageId, userId });
};

export const removeReactionFromMessage = async ({ messageId, userId, emoji }) => {
  const message = await getMessageByIdForUser({ messageId, userId });
  const normalizedEmoji = String(emoji || "").trim();

  message.reactions = (message.reactions || []).filter(
    (reaction) =>
      !(
        String(reaction.userId) === String(userId) &&
        String(reaction.emoji) === normalizedEmoji
      )
  );

  message.markModified("reactions");
  await message.save();

  return getMessageByIdForUser({ messageId, userId });
};

export const editMessage = async ({ messageId, userId, content, encryption }) => {
  const message = await getMessageByIdForUser({ messageId, userId });
  const normalizedContent = String(content || "").trim();

  if (String(message.sender?._id || message.sender) !== String(userId)) {
    throw new Error("Only the sender can edit this message");
  }

  if (message.messageType !== "text") {
    throw new Error("Only text messages can be edited");
  }

  if (message.isDeletedForEveryone) {
    throw new Error("Deleted messages cannot be edited");
  }

  if (!normalizedContent && !encryption?.enabled) {
    throw new Error("Message content is required");
  }

  message.content = encryption?.enabled ? "" : normalizedContent;
  message.editedAt = new Date();
  if (encryption?.enabled) {
    message.encryption = {
      enabled: true,
      algorithm: encryption.algorithm,
      iv: encryption.iv,
      ciphertext: encryption.ciphertext,
      encryptedKeys: encryption.encryptedKeys || {},
      ephPublicKeyJwk: encryption.ephPublicKeyJwk || null,
      keyWrapIv: encryption.keyWrapIv || null,
      selfEncryptedKey: encryption.selfEncryptedKey || null,
      payloadType: encryption.payloadType || "text",
      sessionId: encryption.sessionId || null,
      keyVersion: Number(encryption.keyVersion || 1),
    };
  }
  await message.save();

  await Chat.updateOne(
    { conversationKey: message.conversationKey, "lastMessage.messageId": message._id },
    {
      $set: {
        "lastMessage.content": getMessageDisplayContent(message),
      },
    }
  );

  return getMessageByIdForUser({ messageId, userId });
};

export const deleteMessage = async ({ messageId, userId, scope = "me" }) => {
  const message = await getMessageByIdForUser({ messageId, userId });
  const now = new Date();

  if (scope === "everyone") {
    if (String(message.sender?._id || message.sender) !== String(userId)) {
      throw new Error("Only the sender can delete for everyone");
    }

    message.isDeletedForEveryone = true;
    message.deletedAt = now;
    message.deletedBy = ensureObjectId(userId);
    message.content = "This message was deleted";
    message.messageType = "text";
    const previousStorage = {
      storageProvider: message.storageProvider,
      storagePath: message.storagePath,
      storageBucket: message.storageBucket,
    };
    message.fileUrl = undefined;
    message.storageProvider = null;
    message.storagePath = null;
    message.storageBucket = null;
    message.meta = null;
    message.encryption = null;
    message.mediaEncryption = null;
    message.replyPreview = null;
    message.replyTo = null;
    message.forwardedFromMessageId = null;
    message.isForwarded = false;
    await message.save();

    await Chat.updateOne(
      { conversationKey: message.conversationKey, "lastMessage.messageId": message._id },
      {
        $set: {
          "lastMessage.content": message.content,
          "lastMessage.messageType": "text",
        },
      }
    );

    if (previousStorage.storageProvider && previousStorage.storagePath) {
      try {
        await deleteStoredMedia(previousStorage);
      } catch (error) {
        console.error("Error deleting stored media:", error.message);
      }
    }

    return { mode: "everyone", message: await getMessageByIdForUser({ messageId, userId }) };
  }

  if (!(message.deletedFor || []).some((deletedUserId) => String(deletedUserId) === String(userId))) {
    message.deletedFor.push(ensureObjectId(userId));
    await message.save();
  }

  return { mode: "me", messageId: String(message._id), conversationKey: message.conversationKey };
};

export const togglePinMessage = async ({ messageId, userId }) => {
  const message = await getMessageByIdForUser({ messageId, userId });
  const conversationKey = message.conversationKey;
  const existing = (message.pinnedByChat || []).find(
    (item) => item.conversationKey === conversationKey
  );

  if (existing) {
    message.pinnedByChat = (message.pinnedByChat || []).filter(
      (item) => item.conversationKey !== conversationKey
    );
  } else {
    message.pinnedByChat = [
      ...(message.pinnedByChat || []),
      {
        conversationKey,
        pinnedBy: ensureObjectId(userId),
        pinnedAt: new Date(),
      },
    ];
  }

  message.markModified("pinnedByChat");
  await message.save();
  return getMessageByIdForUser({ messageId, userId });
};

export const toggleStarredMessage = async ({ messageId, userId }) => {
  const message = await getMessageByIdForUser({ messageId, userId });
  const existing = await StarredMessage.findOne({
    userId,
    messageId,
  });

  if (existing) {
    await StarredMessage.deleteOne({ _id: existing._id });
    return { starred: false, messageId: String(message._id) };
  }

  await StarredMessage.create({
    userId,
    messageId,
    conversationKey: message.conversationKey,
  });

  return { starred: true, messageId: String(message._id) };
};

export const getStarredMessages = async ({ userId, conversationKey }) => {
  const query = { userId };
  if (conversationKey) {
    query.conversationKey = conversationKey;
  }

  const starred = await StarredMessage.find(query)
    .populate({
      path: "messageId",
      populate: [
        { path: "sender", select: "id email firstName lastName image" },
        { path: "recipient", select: "id email firstName lastName image" },
        { path: "group", select: "name description image members" },
      ],
    })
    .sort({ createdAt: -1 });

  return starred
    .map((entry) => entry.messageId)
    .filter(Boolean)
    .filter((message) => {
      const expiresAt = message.expiresAt ? new Date(message.expiresAt) : null;
      return !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt > new Date();
    })
    .filter((message) => !(message.deletedFor || []).some((deletedUserId) => String(deletedUserId) === String(userId)));
};

export const getPinnedMessages = async ({ userId, conversationKey }) => {
  if (!conversationKey) {
    throw new Error("conversationKey is required");
  }

  if (String(conversationKey).startsWith("group:")) {
    const groupId = String(conversationKey).slice("group:".length);
    const group = await Group.findById(groupId).select("members");
    const isMember = group?.members?.some(
      (member) => getEntityId(member.user) === String(userId)
    );
    if (!group || !isMember) {
      throw new Error("You do not have access to this conversation");
    }
  } else if (!String(conversationKey).split(":").includes(String(userId))) {
    throw new Error("You do not have access to this conversation");
  }

  return Message.find({
    conversationKey,
    deletedFor: { $ne: userId },
    "pinnedByChat.conversationKey": conversationKey,
    ...buildNonExpiredMessageQuery(),
  })
    .populate("sender", "id email firstName lastName image")
    .populate("recipient", "id email firstName lastName image")
    .populate("group", "name description image members")
    .sort({ createdAt: -1 });
};

export const updateChatPreference = async ({
  userId,
  conversationKey,
  archived,
  mutedUntil,
  favorite,
  pinnedOrder,
}) => {
  const update = {};

  if (typeof archived === "boolean") {
    update.archived = archived;
  }

  if (mutedUntil !== undefined) {
    update.mutedUntil = mutedUntil ? new Date(mutedUntil) : null;
  }

  if (typeof favorite === "boolean") {
    update.favorite = favorite;
  }

  if (pinnedOrder !== undefined) {
    update.pinnedOrder = Number(pinnedOrder) || 0;
  }

  return ChatPreference.findOneAndUpdate(
    { userId, conversationKey },
    { $set: update },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
};

export const voteOnPollMessage = async ({
  messageId,
  userId,
  optionIds,
}) => {
  const message = await Message.findById(messageId)
    .populate("group", "members")
    .populate("sender", "firstName lastName email image")
    .populate("recipient", "firstName lastName email image");

  if (!message) {
    throw new Error("Poll not found");
  }

  if (message.messageType !== "poll") {
    throw new Error("Message is not a poll");
  }

  if (message.chatType === "group") {
    const isMember = message.group?.members?.some(
      (member) => String(member.user?._id || member.user) === String(userId)
    );

    if (!isMember) {
      throw new Error("You are not a member of this group");
    }
  } else {
    const allowedUsers = [
      String(message.sender?._id || message.sender),
      String(message.recipient?._id || message.recipient),
    ];

    if (!allowedUsers.includes(String(userId))) {
      throw new Error("You cannot vote on this poll");
    }
  }

  const poll = message.meta?.poll;
  if (!poll) {
    throw new Error("Poll data is missing");
  }

  const normalizedOptionIds = [...new Set((optionIds || []).map((optionId) => String(optionId)))];
  const validOptionIds = new Set((poll.options || []).map((option) => String(option.id)));

  if (!normalizedOptionIds.length) {
    throw new Error("Select at least one option");
  }

  if (!poll.allowMultipleAnswers && normalizedOptionIds.length > 1) {
    throw new Error("This poll allows only one answer");
  }

  if (normalizedOptionIds.some((optionId) => !validOptionIds.has(optionId))) {
    throw new Error("Invalid poll option selected");
  }

  poll.options = (poll.options || []).map((option) => {
    const currentVoters = [...new Set((option.voterIds || []).map((voterId) => String(voterId)))].filter(
      (voterId) => voterId !== String(userId)
    );

    if (normalizedOptionIds.includes(String(option.id))) {
      currentVoters.push(String(userId));
    }

    return {
      ...option,
      voterIds: currentVoters,
      voterCount: currentVoters.length,
    };
  });

  poll.totalVotes = [
    ...new Set(poll.options.flatMap((option) => option.voterIds || []).map((voterId) => String(voterId))),
  ].length;

  message.markModified("meta");
  await message.save();

  return Message.findById(message._id)
    .populate("sender", "id email firstName lastName image")
    .populate("recipient", "id email firstName lastName image")
    .populate("group", "name description image members");
};

export const markMessagesDelivered = async ({ recipientId, conversationKey }) => {
  const filter = {
    recipient: recipientId,
    chatType: "direct",
    status: "sent",
    deletedFor: { $ne: ensureObjectId(recipientId) },
    ...buildNonExpiredMessageQuery(),
  };

  if (conversationKey) {
    filter.conversationKey = conversationKey;
  }

  const pendingMessages = await Message.find(filter).select("_id conversationKey sender");

  if (!pendingMessages.length) {
    return [];
  }

  const messageIds = pendingMessages.map((message) => message._id);
  const deliveredAt = new Date();

  await Message.updateMany(
    { _id: { $in: messageIds } },
    {
      $set: {
        status: "delivered",
        deliveredAt,
      },
    }
  );

  await Promise.all(
    [...new Set(pendingMessages.map((message) => message.conversationKey))].map(
      async (key) => {
        await Chat.updateOne(
          {
            conversationKey: key,
            "lastMessage.messageId": { $in: messageIds },
          },
          {
            $set: {
              "lastMessage.status": "delivered",
            },
          }
        );
      }
    )
  );

  return pendingMessages.map((message) => ({
    messageId: String(message._id),
    senderId: String(message.sender),
    recipientId: String(recipientId),
    conversationKey: message.conversationKey,
    status: "delivered",
    deliveredAt,
  }));
};

export const markMessageDelivered = async ({ messageId, recipientId }) => {
  const deliveredAt = new Date();
  const message = await Message.findOneAndUpdate(
    {
      _id: messageId,
      recipient: recipientId,
      chatType: "direct",
      status: "sent",
      deletedFor: { $ne: ensureObjectId(recipientId) },
      ...buildNonExpiredMessageQuery(),
    },
    {
      $set: {
        status: "delivered",
        deliveredAt,
      },
    },
    { new: true }
  );

  if (!message) {
    return null;
  }

  await Chat.updateOne(
    {
      conversationKey: message.conversationKey,
      "lastMessage.messageId": message._id,
    },
    {
      $set: {
        "lastMessage.status": "delivered",
      },
    }
  );

  return {
    messageId: String(message._id),
    senderId: String(message.sender),
    recipientId: String(recipientId),
    conversationKey: message.conversationKey,
    status: "delivered",
    deliveredAt,
  };
};

export const markConversationSeen = async ({ recipientId, conversationKey }) => {
  const isGroupConversation = String(conversationKey).startsWith("group:");
  const seenAt = new Date();

  if (isGroupConversation) {
    await Chat.updateOne(
      { conversationKey },
      {
        $set: {
          [`unreadCounts.${String(recipientId)}`]: 0,
        },
      }
    );

    await Message.updateMany(
      {
        conversationKey,
        chatType: "group",
        sender: { $ne: ensureObjectId(recipientId) },
        deletedFor: { $ne: ensureObjectId(recipientId) },
        "readBy.userId": { $ne: ensureObjectId(recipientId) },
        ...buildNonExpiredMessageQuery(),
      },
      {
        $push: {
          readBy: {
            userId: ensureObjectId(recipientId),
            readAt: seenAt,
          },
        },
      }
    );

    return [];
  }

  const pendingMessages = await Message.find({
    recipient: recipientId,
    conversationKey,
    chatType: "direct",
    deletedFor: { $ne: ensureObjectId(recipientId) },
    status: { $ne: "seen" },
    ...buildNonExpiredMessageQuery(),
  }).select("_id sender");

  if (pendingMessages.length) {
    await Message.updateMany(
      {
        _id: { $in: pendingMessages.map((message) => message._id) },
      },
      {
        $set: {
          status: "seen",
          seenAt,
          deliveredAt: seenAt,
        },
        $addToSet: {
          readBy: {
            userId: ensureObjectId(recipientId),
            readAt: seenAt,
          },
        },
      }
    );
  }

  const setPayload = {
    [`unreadCounts.${String(recipientId)}`]: 0,
  };

  if (pendingMessages.length) {
    setPayload["lastMessage.status"] = "seen";
  }

  await Chat.updateOne(
    { conversationKey },
    {
      $set: setPayload,
    }
  );

  return pendingMessages.map((message) => ({
    messageId: String(message._id),
    senderId: String(message.sender),
    recipientId: String(recipientId),
    conversationKey,
    status: "seen",
    seenAt,
  }));
};

export const getChatSummariesForUser = async (userId) => {
  const chats = await Chat.find({
    participants: userId,
  })
    .populate("participants", "firstName lastName email image status lastSeen")
    .populate({
      path: "group",
      select: "name description image members inviteToken",
    })
    .sort({ updatedAt: -1 })
    .lean();

  const lastMessageIds = chats
    .map((chat) => chat.lastMessage?.messageId)
    .filter(Boolean);
  const lastMessages = lastMessageIds.length
    ? await Message.find({ _id: { $in: lastMessageIds } })
        .select(
          "_id content messageType timestamp status meta encryption mediaEncryption group"
        )
        .lean()
    : [];
  const lastMessageMap = new Map(
    lastMessages.map((message) => [String(message._id), message])
  );

  const summaries = chats.map((chat) => {
    const participants = Array.isArray(chat.participants) ? chat.participants : [];
    const otherParticipant = participants.find(
      (participant) => String(participant._id) !== String(userId)
    );
    const fullLastMessage = chat.lastMessage?.messageId
      ? lastMessageMap.get(String(chat.lastMessage.messageId))
      : null;
    const hydratedLastMessage = chat.lastMessage
      ? {
          ...chat.lastMessage,
          ...(fullLastMessage
            ? {
                encryption: fullLastMessage.encryption || null,
                mediaEncryption: fullLastMessage.mediaEncryption || null,
                meta: fullLastMessage.meta || null,
                group: fullLastMessage.group || null,
                content:
                  fullLastMessage.encryption?.enabled ||
                  fullLastMessage.mediaEncryption?.enabled
                    ? chat.lastMessage.content
                    : fullLastMessage.content || chat.lastMessage.content,
              }
            : {}),
        }
      : null;

    if (chat.chatType === "group" && chat.group) {
      return {
        _id: chat._id,
        conversationKey: chat.conversationKey,
        chatType: "group",
        group: {
          _id: chat.group._id,
          name: chat.group.name,
          description: chat.group.description,
          image: chat.group.image,
          inviteToken: chat.group.inviteToken,
          memberCount: Array.isArray(chat.group.members) ? chat.group.members.length : 0,
        },
        participant: null,
        participants,
        title: chat.title || chat.group.name,
        image: chat.image || chat.group.image,
        lastMessage: hydratedLastMessage,
        unreadCount: getUnreadCountForUser(chat.unreadCounts, userId),
        updatedAt: chat.updatedAt,
      };
    }

    return {
      _id: chat._id,
      conversationKey: chat.conversationKey,
      chatType: "direct",
      participant: otherParticipant,
      participants,
      lastMessage: hydratedLastMessage,
      unreadCount: getUnreadCountForUser(chat.unreadCounts, userId),
      updatedAt: chat.updatedAt,
    };
  });

  const dedupedChats = new Map();

  summaries.forEach((chat) => {
    const dedupeKey =
      chat.chatType === "group"
        ? `group:${chat.group?._id || chat.conversationKey}`
        : `direct:${chat.participant?._id || chat.participant?.id || chat.conversationKey}`;

    const existing = dedupedChats.get(dedupeKey);
    if (!existing) {
      dedupedChats.set(dedupeKey, chat);
      return;
    }

    const existingTime = new Date(
      existing.lastMessage?.timestamp || existing.updatedAt || 0
    ).getTime();
    const nextTime = new Date(
      chat.lastMessage?.timestamp || chat.updatedAt || 0
    ).getTime();

    if (nextTime > existingTime) {
      dedupedChats.set(dedupeKey, chat);
    }
  });

  const chatList = [...dedupedChats.values()];
  const preferences = await ChatPreference.find({
    userId,
    conversationKey: { $in: chatList.map((chat) => chat.conversationKey) },
  }).lean();

  const preferenceMap = new Map(
    preferences.map((preference) => [preference.conversationKey, preference])
  );

  return chatList
    .map((chat) => {
      const preference = preferenceMap.get(chat.conversationKey);
      return {
        ...chat,
        archived: Boolean(preference?.archived),
        mutedUntil: preference?.mutedUntil || null,
        favorite: Boolean(preference?.favorite),
        pinnedOrder: Number(preference?.pinnedOrder || 0),
      };
    })
    .sort((a, b) => {
      const pinDelta = Number(b.pinnedOrder || 0) - Number(a.pinnedOrder || 0);
      if (pinDelta !== 0) return pinDelta;

      return (
        new Date(b.lastMessage?.timestamp || b.updatedAt || 0).getTime() -
        new Date(a.lastMessage?.timestamp || a.updatedAt || 0).getTime()
      );
    });
};
