import Chat from "../models/ChatModel.js";
import User from "../models/UserModel.js";

export const searchContacts = async (req, res) => {
  try {
    const { searchTerm } = req.body;

    if (!searchTerm) {
      return res.status(400).send("searchTerm is required.");
    }

    const sanitizedSearchTerm = searchTerm.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const regex = new RegExp(sanitizedSearchTerm, "i");

    const contacts = await User.find({
      $and: [{ _id: { $ne: req.userId } }], // Ensure you're using the correct field name for user ID
      $or: [{ firstName: regex }, { lastName: regex }, { email: regex }],
    });

    return res.status(200).json({ contacts });
  } catch (error) {
    console.error("Error searching contacts", error);
    res.status(500).json({ message: "Error searching contacts", error });
  }
};

export const addFriend = async (req, res) => {
  try {
    const { contactId } = req.body;
    const userId = req.userId; // Assuming userId is attached to req object after authentication

    if (!contactId) {
      return res.status(400).send("contactId is required.");
    }

    const user = await User.findById(userId);
    const contact = await User.findById(contactId);

    if (!user || !contact) {
      return res.status(404).send("User or contact not found.");
    }

    if (user.friends.includes(contactId)) {
      return res.status(400).send("Already friends.");
    }

    user.friends.push(contactId);
    contact.friends.push(userId);

    await user.save();
    await contact.save();

    res.status(200).send("Friend added successfully.");
  } catch (error) {
    console.error("Error adding friend", error);
    res.status(500).json({ message: "Error adding friend", error });
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
    const { userIds } = req.body;
    const users = await User.find({ _id: { $in: userIds } });

    // Return basic user details without last message
    res.status(200).json({ users });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ message: "Error fetching user details", error });
  }
};

export const getLastMessageForUsers = async (req, res) => {
  try {
    const { userIds, currentUserId } = req.body;

    const lastMessages = await Promise.all(
      userIds.map(async (friendId) => {
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
    res.status(500).json({ message: "Error fetching last messages", error });
  }
};
