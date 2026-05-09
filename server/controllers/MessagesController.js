import Message from "../models/MessagesModel.js";
import Chat from "../models/ChatModel.js";
import Group from "../models/GroupModel.js";
import { uploadMediaFile } from "../services/MediaStorageService.js";
import { areUsersFriends } from "../services/FriendRequestService.js";
import { getIO, getUserRoom } from "../socket.js";
import {
  ALLOWED_DISAPPEARING_DURATIONS,
  buildNonExpiredMessageQuery,
  deleteMessage,
  editMessage,
  getChatSummariesForUser,
  getConversationKey,
  getMessageByIdForUser,
  hydrateMessagesMediaForUser,
  hydrateMessageMediaForUser,
  getPinnedMessages as getPinnedMessagesForUser,
  getStarredMessages,
  markConversationSeen,
  reactToMessage,
  removeReactionFromMessage,
  togglePinMessage,
  toggleStarredMessage,
} from "../services/MessageService.js";

export const buildMessagesPaginationQuery = ({
  conversationKey,
  userId,
  before = null,
}) => {
  const query = {
    conversationKey,
    deletedFor: { $ne: userId },
    ...buildNonExpiredMessageQuery(),
  };

  if (before instanceof Date && !Number.isNaN(before.getTime())) {
    query.createdAt = { $lt: before };
  }

  return query;
};

export const getMessages = async (req, res) => {
  try {
    const user1 = req.userId;
    const user2 = req.validated?.conversation?.userId;
    const groupId = req.validated?.conversation?.groupId;
    const before = req.validated?.conversation?.before;
    const limit = req.validated?.conversation?.limit || 50;

    if (!user1 || (!user2 && !groupId)) {
      return res.status(400).send("A user ID or group ID is required.");
    }

    if (groupId) {
      const group = await Group.findById(groupId).select("members");
      const isMember = group?.members?.some(
        (member) => String(member.user?._id || member.user) === String(user1)
      );

      if (!group || !isMember) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const conversationKey = groupId
      ? `group:${groupId}`
      : getConversationKey(user1, user2);

    const query = buildMessagesPaginationQuery({
      conversationKey,
      userId: req.userId,
      before,
    });

    const messages = await Message.find(query)
      .populate("sender", "id email firstName lastName image")
      .populate("recipient", "id email firstName lastName image")
      .populate("group", "name description image members")
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = messages.length > limit;
    const trimmedMessages = hasMore ? messages.slice(0, limit) : messages;
    trimmedMessages.reverse();

    await hydrateMessagesMediaForUser({ messages: trimmedMessages, req });

    return res.status(200).json({
      messages: trimmedMessages,
      conversationKey,
      pagination: {
        hasMore,
        nextCursor: hasMore ? trimmedMessages[0]?.createdAt || null : null,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const serializeDisappearingSettings = (record = {}) => ({
  disappearingMessagesEnabled: Boolean(record.disappearingMessagesEnabled),
  disappearingMessageDuration: record.disappearingMessagesEnabled
    ? Number(record.disappearingMessageDuration || 0) || null
    : null,
});

const resolveDisappearingSettingsTarget = async ({ userId, chatType, chatId }) => {
  if (chatType === "group") {
    const group = await Group.findById(chatId).select(
      "members disappearingMessagesEnabled disappearingMessageDuration"
    );
    const member = group?.members?.find(
      (item) => String(item.user?._id || item.user) === String(userId)
    );

    if (!group || !member) {
      const error = new Error("Forbidden");
      error.status = 403;
      throw error;
    }

    return {
      chatType,
      group,
      groupMember: member,
      conversationKey: `group:${chatId}`,
      participantIds: group.members.map((item) => String(item.user?._id || item.user)),
    };
  }

  const conversationKey = getConversationKey(userId, chatId);
  const chat = await Chat.findOne({ conversationKey }).select(
    "participants disappearingMessagesEnabled disappearingMessageDuration"
  );
  const isParticipant = chat?.participants?.some(
    (participant) => String(participant?._id || participant) === String(userId)
  );
  const canUseNewDirectChat = !chat && (await areUsersFriends(userId, chatId));

  if (chat && !isParticipant) {
    const error = new Error("Forbidden");
    error.status = 403;
    throw error;
  }

  if (!chat && !canUseNewDirectChat) {
    const error = new Error("Forbidden");
    error.status = 403;
    throw error;
  }

  return {
    chatType,
    chat,
    conversationKey,
    participantIds: [String(userId), String(chatId)],
  };
};

const emitDisappearingSettingsUpdated = ({ participantIds, payload }) => {
  const io = getIO();
  if (!io) return;

  participantIds.forEach((participantId) => {
    io.to(getUserRoom(String(participantId))).emit(
      "disappearing_settings_updated",
      payload
    );
  });
};

export const getDisappearingMessageSettings = async (req, res) => {
  try {
    const { chatType, chatId } = req.validated?.disappearingSettings || {};
    const target = await resolveDisappearingSettingsTarget({
      userId: req.userId,
      chatType,
      chatId,
    });
    const source = chatType === "group" ? target.group : target.chat;

    return res.status(200).json({
      chatType,
      chatId,
      conversationKey: target.conversationKey,
      ...serializeDisappearingSettings(source),
    });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Unable to load disappearing settings." });
  }
};

export const updateDisappearingMessageSettings = async (req, res) => {
  try {
    const { chatType, chatId, enabled, duration } =
      req.validated?.disappearingSettings || {};
    const target = await resolveDisappearingSettingsTarget({
      userId: req.userId,
      chatType,
      chatId,
    });
    const nextDuration = enabled ? Number(duration) : null;

    if (enabled && !ALLOWED_DISAPPEARING_DURATIONS.includes(nextDuration)) {
      return res.status(400).json({ message: "Invalid disappearing message duration." });
    }

    let updatedRecord;
    if (chatType === "group") {
      const role = target.groupMember?.role || "member";
      if (["owner", "admin"].includes(role) === false) {
        return res.status(403).json({ message: "Only group admins can update this setting." });
      }

      updatedRecord = await Group.findByIdAndUpdate(
        chatId,
        {
          $set: {
            disappearingMessagesEnabled: enabled,
            disappearingMessageDuration: nextDuration,
          },
        },
        { new: true }
      ).select("disappearingMessagesEnabled disappearingMessageDuration");
    } else {
      updatedRecord = await Chat.findOneAndUpdate(
        { conversationKey: target.conversationKey },
        {
          $set: {
            conversationKey: target.conversationKey,
            chatType: "direct",
            participants: target.participantIds,
            disappearingMessagesEnabled: enabled,
            disappearingMessageDuration: nextDuration,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).select("disappearingMessagesEnabled disappearingMessageDuration");
    }

    const settings = serializeDisappearingSettings(updatedRecord);
    const payload = {
      chatType,
      chatId,
      conversationKey: target.conversationKey,
      updatedBy: String(req.userId),
      ...settings,
    };

    emitDisappearingSettingsUpdated({
      participantIds: target.participantIds,
      payload,
    });

    return res.status(200).json(payload);
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Unable to update disappearing settings." });
  }
};

export const getChats = async (req, res) => {
  try {
    const chats = await getChatSummariesForUser(req.userId);
    return res.status(200).json({ chats });
  } catch (error) {
    console.error("Error fetching chats:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const markMessagesSeen = async (req, res) => {
  try {
    const { userId: chatUserId, conversationKey: conversationKeyFromBody } =
      req.validated?.messageSeen || {};

    const conversationKey =
      conversationKeyFromBody ||
      (chatUserId ? getConversationKey(req.userId, chatUserId) : null);

    if (!conversationKey) {
      return res.status(400).json({ message: "conversationKey or userId is required." });
    }

    if (String(conversationKey).startsWith("group:")) {
      const groupId = String(conversationKey).slice("group:".length);
      const group = await Group.findById(groupId).select("members");
      const isMember = group?.members?.some(
        (member) => String(member.user?._id || member.user) === String(req.userId)
      );

      if (!group || !isMember) {
        return res.status(403).json({ message: "Forbidden" });
      }
    } else if (!String(conversationKey).split(":").includes(String(req.userId))) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updates = await markConversationSeen({
      recipientId: req.userId,
      conversationKey,
    });

    return res.status(200).json({ updates, conversationKey });
  } catch (error) {
    console.error("Error marking messages as seen:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const searchMessages = async (req, res) => {
  try {
    const user1 = req.userId;
    const { userId: user2, groupId, query, limit } = req.validated?.messageSearch || {};

    if (!query) {
      return res.status(400).json({ message: "Search query is required." });
    }

    if (!user1 || (!user2 && !groupId)) {
      return res.status(400).json({ message: "A user ID or group ID is required." });
    }

    if (groupId) {
      const group = await Group.findById(groupId).select("members");
      const isMember = group?.members?.some(
        (member) => String(member.user?._id || member.user) === String(user1)
      );

      if (!group || !isMember) {
        return res.status(403).json({ message: "You are not a member of this group." });
      }
    }

    const conversationKey = groupId
      ? `group:${groupId}`
      : getConversationKey(user1, user2);

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedQuery, "i");

    const messages = await Message.find({
      conversationKey,
      deletedFor: { $ne: req.userId },
      $and: [
        buildNonExpiredMessageQuery(),
        {
          $or: [
            { content: searchRegex },
            { "meta.poll.question": searchRegex },
            { "meta.poll.options.text": searchRegex },
          ],
        },
      ],
    })
      .populate("sender", "id email firstName lastName image")
      .populate("recipient", "id email firstName lastName image")
      .populate("group", "name description image members")
      .sort({ createdAt: -1 })
      .limit(limit);

    await hydrateMessagesMediaForUser({ messages, req });

    return res.status(200).json({ messages, conversationKey });
  } catch (error) {
    console.error("Error searching messages:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getStarredMessagesList = async (req, res) => {
  try {
    const { conversationKey } = req.query;
    const messages = await getStarredMessages({
      userId: req.userId,
      conversationKey,
    });

    await hydrateMessagesMediaForUser({ messages, req });

    return res.status(200).json({ messages });
  } catch (error) {
    console.error("Error fetching starred messages:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getPinnedMessages = async (req, res) => {
  try {
    const { conversationKey } = req.validated?.pinnedQuery || {};
    if (!conversationKey) {
      return res.status(400).json({ message: "conversationKey is required." });
    }

    const messages = await getPinnedMessagesForUser({
      userId: req.userId,
      conversationKey,
    });

    await hydrateMessagesMediaForUser({ messages, req });

    return res.status(200).json({ messages });
  } catch (error) {
    console.error("Error fetching pinned messages:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const addReaction = async (req, res) => {
  try {
    const { messageId, emoji } = req.validated?.messageAction || {};
    if (!emoji) {
      return res.status(400).json({ message: "Emoji is required." });
    }
    const message = await reactToMessage({
      messageId,
      userId: req.userId,
      emoji,
    });

    return res.status(200).json({ message });
  } catch (error) {
    console.error("Error adding reaction:", error);
    return res.status(400).json({ message: error.message || "Failed to add reaction." });
  }
};

export const removeReaction = async (req, res) => {
  try {
    const { messageId, emoji } = req.validated?.messageAction || {};
    if (!emoji) {
      return res.status(400).json({ message: "Emoji is required." });
    }
    const message = await removeReactionFromMessage({
      messageId,
      userId: req.userId,
      emoji,
    });

    return res.status(200).json({ message });
  } catch (error) {
    console.error("Error removing reaction:", error);
    return res.status(400).json({ message: error.message || "Failed to remove reaction." });
  }
};

export const updateMessage = async (req, res) => {
  try {
    const { messageId, content } = req.validated?.messageAction || {};
    if (!String(content || "").trim()) {
      return res.status(400).json({ message: "Message content is required." });
    }
    const message = await editMessage({
      messageId,
      userId: req.userId,
      content,
    });

    return res.status(200).json({ message });
  } catch (error) {
    console.error("Error editing message:", error);
    return res.status(400).json({ message: error.message || "Failed to edit message." });
  }
};

export const removeMessage = async (req, res) => {
  try {
    const { messageId, scope } = req.validated?.messageAction || {};
    const result = await deleteMessage({
      messageId,
      userId: req.userId,
      scope,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error deleting message:", error);
    return res.status(400).json({ message: error.message || "Failed to delete message." });
  }
};

export const togglePinnedMessage = async (req, res) => {
  try {
    const { messageId } = req.validated?.messageAction || {};
    const message = await togglePinMessage({
      messageId,
      userId: req.userId,
    });

    return res.status(200).json({ message });
  } catch (error) {
    console.error("Error toggling pin:", error);
    return res.status(400).json({ message: error.message || "Failed to update pin." });
  }
};

export const toggleStarred = async (req, res) => {
  try {
    const { messageId } = req.validated?.messageAction || {};
    const result = await toggleStarredMessage({
      messageId,
      userId: req.userId,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error toggling starred message:", error);
    return res.status(400).json({ message: error.message || "Failed to update starred message." });
  }
};

export const getMessageById = async (req, res) => {
  try {
    const messageId = req.validated?.messageId || req.params.messageId;
    const message = await getMessageByIdForUser({
      messageId,
      userId: req.userId,
    });

    await hydrateMessageMediaForUser({ message, req });

    return res.status(200).json({ message });
  } catch (error) {
    console.error("Error fetching message:", error);
    return res.status(404).json({ message: error.message || "Message not found." });
  }
};

export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("File is required");
    }

    const uploadedFile = await uploadMediaFile({
      file: req.file,
      userId: req.userId,
      req,
      isPrivateMedia: String(req.body?.privateMedia || "false") === "true",
      isStableMedia: String(req.body?.stableMedia || "false") === "true",
      originalMimeType: String(req.body?.originalMimeType || ""),
    });

    return res.status(200).json(uploadedFile);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
