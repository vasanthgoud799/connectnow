import Message from "../models/MessagesModel.js";
import Group from "../models/GroupModel.js";
import { uploadMediaFile } from "../services/MediaStorageService.js";
import {
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
      $or: [
        { content: searchRegex },
        { "meta.poll.question": searchRegex },
        { "meta.poll.options.text": searchRegex },
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
