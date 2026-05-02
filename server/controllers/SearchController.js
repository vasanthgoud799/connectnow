import Group from "../models/GroupModel.js";
import Chat from "../models/ChatModel.js";
import Message from "../models/MessagesModel.js";
import User from "../models/UserModel.js";
import { hydrateMessagesMediaForUser } from "../services/MessageService.js";

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
    const dateValue = new Date(query);
    const isDateSearch = !Number.isNaN(dateValue.getTime());

    const accessibleChats = await Chat.find({
      participants: req.userId,
    })
      .select("conversationKey")
      .lean();

    const accessibleConversationKeys = accessibleChats.map(
      (chat) => chat.conversationKey
    );

    const results = {
      users: [],
      groups: [],
      messages: [],
      files: [],
    };

    if (tab === "all" || tab === "users") {
      results.users = await User.find({
        $or: [{ firstName: regex }, { lastName: regex }, { email: regex }],
      })
        .select("firstName lastName email image status")
        .limit(limit)
        .skip(skip)
        .lean();
    }

    if (tab === "all" || tab === "groups") {
      results.groups = await Group.find({
        $or: [{ name: regex }, { description: regex }],
      })
        .select("name description image inviteToken members")
        .limit(limit)
        .skip(skip)
        .lean();
    }

    if (tab === "all" || tab === "messages" || tab === "files") {
      const messageQuery = {
        deletedFor: { $ne: req.userId },
        conversationKey: { $in: accessibleConversationKeys },
      };

      if (tab === "files") {
        messageQuery.messageType = { $in: ["image", "video", "audio", "document"] };
        messageQuery.$or = [{ fileUrl: regex }, { content: regex }];
      } else {
        messageQuery.$or = [
          { content: regex },
          { "meta.poll.question": regex },
          { "meta.poll.options.text": regex },
          { fileUrl: regex },
        ];
      }

      if (isDateSearch) {
        const start = new Date(dateValue);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateValue);
        end.setHours(23, 59, 59, 999);
        messageQuery.createdAt = { $gte: start, $lte: end };
      }

      const messageResults = await Message.find(messageQuery)
        .populate("sender", "firstName lastName email image")
        .populate("recipient", "firstName lastName email image")
        .populate("group", "name image")
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      await hydrateMessagesMediaForUser({ messages: messageResults, req });

      if (tab === "files") {
        results.files = messageResults;
      } else {
        results.messages = messageResults.filter(
          (message) => !["image", "video", "audio", "document"].includes(message.messageType)
        );
        results.files = messageResults.filter((message) =>
          ["image", "video", "audio", "document"].includes(message.messageType)
        );
      }
    }

    return res.status(200).json({ results, page, limit });
  } catch (error) {
    console.error("Error performing global search:", error);
    return res.status(500).json({ message: "Failed to perform global search." });
  }
};
