import Group from "../models/GroupModel.js";
import Chat from "../models/ChatModel.js";
import Message from "../models/MessagesModel.js";
import User from "../models/UserModel.js";
import {
  buildNonExpiredMessageQuery,
  hydrateMessagesMediaForUser,
} from "../services/MessageService.js";

export const buildGlobalMessageSearchQuery = ({
  userId,
  accessibleConversationKeys = [],
  tab = "all",
  regex,
  isDateSearch = false,
  dateValue = null,
}) => {
  const messageQuery = {
    deletedFor: { $ne: userId },
    deletedAt: null,
    isDeletedForEveryone: { $ne: true },
    conversationKey: { $in: accessibleConversationKeys },
  };
  const contentFilters =
    tab === "files"
      ? [
          { fileUrl: regex },
          { content: regex },
          { "encryption.originalFileName": regex },
          { "mediaEncryption.originalFileName": regex },
        ]
      : [
          { content: regex },
          { "meta.poll.question": regex },
          { "meta.poll.options.text": regex },
          { fileUrl: regex },
          { "encryption.originalFileName": regex },
          { "mediaEncryption.originalFileName": regex },
        ];

  if (tab === "files") {
    messageQuery.messageType = { $in: ["image", "video", "audio", "document"] };
  }

  messageQuery.$and = [buildNonExpiredMessageQuery()];

  if (!isDateSearch) {
    messageQuery.$and.push({ $or: contentFilters });
  }

  if (isDateSearch) {
    const start = new Date(dateValue);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateValue);
    end.setHours(23, 59, 59, 999);
    messageQuery.createdAt = { $gte: start, $lte: end };
  }

  return messageQuery;
};

const FILE_MESSAGE_TYPES = new Set(["image", "video", "audio", "document"]);

const getObjectId = (value) => String(value?._id || value || "");

const getMessageFileName = (message) => {
  const explicitName =
    message.fileName ||
    message.originalFileName ||
    message.mediaMetadata?.originalFileName ||
    message.mediaEncryption?.originalFileName;

  if (explicitName) return explicitName;

  const fileUrl = String(message.fileUrl || message.secureUrl || "");
  if (!fileUrl) return "";

  try {
    return decodeURIComponent(fileUrl.split("/").pop() || "");
  } catch {
    return fileUrl.split("/").pop() || "";
  }
};

const getMessageSnippet = (message) => {
  const fileName = getMessageFileName(message);
  const text =
    message.content ||
    message.decryptedContent ||
    message.meta?.poll?.question ||
    fileName ||
    message.messageType ||
    "";

  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177)}...`;
};

export const serializeGlobalSearchMessage = (message = {}, currentUserId) => {
  const senderId = getObjectId(message.sender);
  const recipientId = getObjectId(message.recipient);
  const groupId = getObjectId(message.group);
  const chatType = message.chatType || (groupId ? "group" : "direct");
  const messageId = getObjectId(message);
  const fileName = getMessageFileName(message);

  return {
    _id: messageId,
    id: messageId,
    messageId,
    conversationKey: message.conversationKey,
    chatType,
    chatId:
      chatType === "group"
        ? groupId
        : senderId === String(currentUserId)
          ? recipientId
          : senderId,
    groupId: chatType === "group" ? groupId : undefined,
    sender: message.sender,
    recipient: message.recipient,
    group: message.group,
    content: message.content || message.decryptedContent || "",
    snippet: getMessageSnippet(message),
    messageType: message.messageType || "text",
    fileUrl: message.fileUrl || message.secureUrl || "",
    fileName,
    mediaMetadata: message.mediaMetadata,
    createdAt: message.createdAt,
    timestamp: message.timestamp || message.createdAt,
  };
};

export const globalSearch = async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    const tab = String(req.query.tab || "all");
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 12, 25);
    const skip = (page - 1) * limit;

    if (!query) {
      return res.status(400).json({ message: "Search query is required." });
    }

    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const normalizedQuery = query.toLowerCase();
    const dateValue = normalizedQuery === "today" ? new Date() : new Date(query);
    const isDateSearch = !Number.isNaN(dateValue.getTime());

    const accessibleChats = await Chat.find({
      participants: req.userId,
    })
      .select("conversationKey chatType group participants")
      .lean();

    const accessibleConversationKeys = accessibleChats.map(
      (chat) => chat.conversationKey
    );
    const accessibleGroupIds = accessibleChats
      .filter((chat) => chat.chatType === "group" && chat.group)
      .map((chat) => chat.group);
    const accessibleDirectParticipantIds = accessibleChats
      .filter((chat) => chat.chatType !== "group")
      .flatMap((chat) => chat.participants || [])
      .map((participantId) => String(participantId))
      .filter((participantId) => participantId !== String(req.userId));

    const currentUser = await User.findById(req.userId).select("friends").lean();
    const contactIds = [
      ...new Set([
        ...(currentUser?.friends || []).map((friendId) => String(friendId)),
        ...accessibleDirectParticipantIds,
      ]),
    ];

    const results = {
      users: [],
      groups: [],
      messages: [],
      files: [],
    };

    if (tab === "all" || tab === "users") {
      results.users = await User.find({
        _id: { $in: contactIds },
        $or: [{ firstName: regex }, { lastName: regex }, { email: regex }],
      })
        .select("firstName lastName email image status")
        .limit(limit)
        .skip(skip)
        .lean();
    }

    if (tab === "all" || tab === "groups") {
      results.groups = await Group.find({
        _id: { $in: accessibleGroupIds },
        $or: [{ name: regex }, { description: regex }],
      })
        .select("name description image inviteToken members")
        .limit(limit)
        .skip(skip)
        .lean();
    }

    if (tab === "all" || tab === "messages" || tab === "files") {
      const messageQuery = buildGlobalMessageSearchQuery({
        userId: req.userId,
        accessibleConversationKeys,
        tab,
        regex,
        isDateSearch,
        dateValue,
      });

      const messageResults = await Message.find(messageQuery)
        .populate("sender", "firstName lastName email image")
        .populate("recipient", "firstName lastName email image")
        .populate("group", "name image")
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      await hydrateMessagesMediaForUser({ messages: messageResults, req });
      const serializedMessages = messageResults.map((message) =>
        serializeGlobalSearchMessage(message, req.userId)
      );

      if (tab === "files") {
        results.files = serializedMessages;
      } else {
        results.messages = serializedMessages.filter(
          (message) => !FILE_MESSAGE_TYPES.has(message.messageType)
        );
        results.files = serializedMessages.filter((message) =>
          FILE_MESSAGE_TYPES.has(message.messageType)
        );
      }
    }

    return res.status(200).json({ results, page, limit });
  } catch (error) {
    console.error("Error performing global search:", error);
    return res.status(500).json({ message: "Failed to perform global search." });
  }
};
