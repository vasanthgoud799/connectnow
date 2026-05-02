import Chat from "../models/ChatModel.js";
import Message from "../models/MessagesModel.js";
import User from "../models/UserModel.js";
import { getConversationKey } from "../services/MessageService.js";

export const deleteChat = async (req, res) => {
  try {
    const user1 = req.userId;
    const user2 = req.validated?.contactId;

    if (!user1 || !user2) {
      return res.status(400).send("Both user IDs are required.");
    }

    const conversationKey = getConversationKey(user1, user2);

    await Message.updateMany({
      $or: [
        { sender: user1, recipient: user2 },
        { sender: user2, recipient: user1 },
      ],
      deletedFor: { $ne: user1 },
    }, {
      $addToSet: { deletedFor: user1 },
    });

    await Chat.updateOne(
      { conversationKey, participants: user1 },
      { $set: { [`unreadCounts.${user1}`]: 0 } }
    );

    return res.status(200).json({
      success: true,
      conversationKey,
      messages: [],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const unfriend = async (req, res) => {
  try {
    const user1 = req.userId; // Get the current user's ID
    const user2 = req.validated?.contactId;

    if (!user1 || !user2) {
      return res.status(400).send("Both user IDs are required.");
    }

    // Find user1 and remove user2 from their friends list
    await User.findByIdAndUpdate(user1, {
      $pull: { friends: user2 },
    });

    await User.findByIdAndUpdate(user2, {
      $pull: { friends: user1 },
    });

    return res.status(200).json({ message: "Unfriended successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const blockUser = async (req, res) => {
  try {
    const user1 = req.userId; // Get the current user's ID
    const user2 = req.validated?.contactId;

    // console.log("User1 (current user):", user1); // Log user1
    // console.log("User2 (to block):", user2); // Log user2

    if (!user1 || !user2) {
      return res.status(400).send("Both user IDs are required.");
    }

    const currentUser = await User.findById(user1).select("friends");
    const isFriend = (currentUser?.friends || []).some(
      (friendId) => String(friendId) === String(user2)
    );

    if (!isFriend) {
      return res
        .status(400)
        .json({ message: "Only current contacts can be blocked." });
    }

    // Add user2 to the blockedUsers list of user1
    await User.findByIdAndUpdate(user1, {
      $addToSet: { blockedUsers: user2 },
    });

    return res.status(200).json({ message: "User blocked successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const user1 = req.userId; // Get the current user's ID
    const user2 = req.validated?.contactId;

    // console.log("User1 (current user):", user1); // Log user1
    // console.log("User2 (to unblock):", user2); // Log user2

    if (!user1 || !user2) {
      return res.status(400).send("Both user IDs are required.");
    }

    // Remove user2 from the blockedUsers list of user1
    await User.findByIdAndUpdate(user1, {
      $pull: { blockedUsers: user2 },
    });

    await User.findByIdAndUpdate(user2, {
      $pull: { blockedUsers: user1 },
    });

    return res.status(200).json({ message: "User unblocked successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
