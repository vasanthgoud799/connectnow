import Chat from "../models/ChatModel.js";
import User from "../models/UserModel.js";
import { getRelationshipStatusMap, sendFriendRequest } from "../services/FriendRequestService.js";

export const searchContacts = async (req, res) => {
  try {
    const { searchTerm } = req.validated?.contactSearch || {};

    if (!searchTerm) {
      return res.status(400).send("searchTerm is required.");
    }

    const sanitizedSearchTerm = searchTerm.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const regex = new RegExp(sanitizedSearchTerm, "i");

    const currentUser = await User.findById(req.userId).select(
      "friends blockedUsers sentRequests receivedRequests"
    );

    const contacts = await User.find({
      $and: [{ _id: { $ne: req.userId } }], // Ensure you're using the correct field name for user ID
      $or: [{ firstName: regex }, { lastName: regex }, { email: regex }],
    }).select("firstName lastName email image about birthday");

    const existingFriendIds = new Set(
      (currentUser?.friends || []).map((friendId) => friendId.toString())
    );
    const blockedIds = new Set(
      (currentUser?.blockedUsers || []).map((userId) => userId.toString())
    );

    const filteredContacts = contacts.filter((contact) => {
      const contactId = contact._id.toString();
      return !existingFriendIds.has(contactId) && !blockedIds.has(contactId);
    });

    const relationStatusMap = await getRelationshipStatusMap({
      currentUserId: req.userId,
      targetIds: filteredContacts.map((contact) => contact._id),
    });

    const contactsWithStatus = filteredContacts.map((contact) => ({
      ...contact.toObject(),
      relationStatus: relationStatusMap[String(contact._id)] || "none",
    }));

    return res.status(200).json({ contacts: contactsWithStatus });
  } catch (error) {
    console.error("Error searching contacts", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const addFriend = async (req, res) => {
  try {
    const contactId = req.validated?.contactId;
    const userId = req.userId;

    if (!contactId) {
      return res.status(400).send("contactId is required.");
    }

    const request = await sendFriendRequest({
      senderId: userId,
      receiverId: contactId,
    });

    res.status(200).json({
      message: "Friend request sent successfully.",
      request,
    });
  } catch (error) {
    console.error("Error adding friend", error);
    res.status(400).json({ message: error.message || "Error sending friend request" });
  }
};

// export const getUserDetails = async (req, res) => {
//   try {
//     const { userIds, currentUserId } = req.body;
//     const users = await User.find({ _id: { $in: userIds } });

//     const friendsDetailsWithLastMessage = await Promise.all(
//       users.map(async (friend) => {
//         // Fetch the last message between the current user and the friend
//         const lastMessage = await Chat.findOne({
//           $or: [
//             { sender: currentUserId, recipient: friend._id },
//             { sender: friend._id, recipient: currentUserId },
//           ],
//         });
//         // Sort by timestamp to get the latest message
//         // console.log(lastMessage);
//         return {
//           ...friend.toObject(),
//           lastMessage: lastMessage ? lastMessage.message : "", // Add the last message (if available)
//           lastMessageTimestamp: lastMessage ? lastMessage.timestamp : null, // Add the timestamp (if available)
//         };
//       })
//     );

//     res.status(200).json({ users: friendsDetailsWithLastMessage });
//   } catch (error) {
//     console.error("Error fetching user details:", error);
//     res.status(500).json({ message: "Error fetching user details", error });
//   }
// };

export const getUserDetails = async (req, res) => {
  try {
    const userIds = req.validated?.userIds || [];
    const currentUser = await User.findById(req.userId).select("friends");
    const allowedIds = new Set((currentUser?.friends || []).map((id) => String(id)));
    const requestedIds = (Array.isArray(userIds) ? userIds : []).filter((id) =>
      allowedIds.has(String(id))
    );
    const users = await User.find({ _id: { $in: requestedIds } }).select(
      "firstName lastName email image about status lastSeen birthday"
    );

    // Return basic user details without last message
    res.status(200).json({ users });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const listContacts = async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId).select("friends");

    if (!currentUser) {
      return res.status(404).json({ message: "User not found." });
    }

    const users = await User.find({
      _id: { $in: currentUser.friends || [] },
    }).select("firstName lastName email image about status lastSeen birthday");

    res.status(200).json({ contacts: users });
  } catch (error) {
    console.error("Error listing contacts:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getLastMessageForUsers = async (req, res) => {
  try {
    const userIds = req.validated?.userIds || [];
    const currentUserId = req.userId;
    const currentUser = await User.findById(req.userId).select("friends");
    const allowedIds = new Set((currentUser?.friends || []).map((id) => String(id)));
    const requestedIds = (Array.isArray(userIds) ? userIds : []).filter((id) =>
      allowedIds.has(String(id))
    );

    const lastMessages = await Promise.all(
      requestedIds.map(async (friendId) => {
        const lastMessage = await Chat.findOne({
          $or: [
            { sender: currentUserId, recipient: friendId },
            { sender: friendId, recipient: currentUserId },
          ],
        }).sort({ timestamp: -1 }); // Sort by the latest message

        return {
          friendId,
          lastMessage: lastMessage ? lastMessage.message : null,
          lastMessageTimestamp: lastMessage ? lastMessage.timestamp : null,
        };
      })
    );

    res.status(200).json({ lastMessages });
  } catch (error) {
    console.error("Error fetching last messages:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
