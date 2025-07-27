import Message from "../models/MessagesModel.js";
import User from "../models/UserModel.js";

export const deleteChat = async (req, res) => {
  try {
    const user1 = req.userId;
    const user2 = req.body.id;

    if (!user1 || !user2) {
      return res.status(400).send("Both user IDs are required.");
    }

    const messages = await Message.deleteMany({
      $or: [
        { sender: user1, recipient: user2 },
        { sender: user2, recipient: user1 },
      ],
    });

    return res.status(200).json({ messages });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

export const unfriend = async (req, res) => {
  try {
    const user1 = req.userId; // Get the current user's ID
    const user2 = req.body.id; // Get the other user's ID to unfriend

    if (!user1 || !user2) {
      return res.status(400).send("Both user IDs are required.");
    }

    // Find user1 and remove user2 from their friends list
    await User.findByIdAndUpdate(user1, {
      $pull: { friends: user2 },
    });

    // Find user2 and remove user1 from their friends list
    // await User.findByIdAndUpdate(user2, {
    //   $pull: { friends: user1 },
    // });

    return res.status(200).json({ message: "Unfriended successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

export const blockUser = async (req, res) => {
  try {
    const user1 = req.userId; // Get the current user's ID
    const user2 = req.body.id; // Get the other user's ID to block

    // console.log("User1 (current user):", user1); // Log user1
    // console.log("User2 (to block):", user2); // Log user2

    if (!user1 || !user2) {
      return res.status(400).send("Both user IDs are required.");
    }

    // Add user2 to the blockedUsers list of user1
    await User.findByIdAndUpdate(user1, {
      $addToSet: { blockedUsers: user2 },
    });

    await User.findByIdAndUpdate(user2, {
      $addToSet: { blockedUsers: user1 },
    });

    return res.status(200).json({ message: "User blocked successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const user1 = req.userId; // Get the current user's ID
    const user2 = req.body.id; // Get the other user's ID to unblock

    // console.log("User1 (current user):", user1); // Log user1
    // console.log("User2 (to unblock):", user2); // Log user2

    if (!user1 || !user2) {
      return res.status(400).send("Both user IDs are required.");
    }

    // Remove user2 from the blockedUsers list of user1
    await User.findByIdAndUpdate(user1, {
      $pull: { blockedUsers: user2 },
    });

    return res.status(200).json({ message: "User unblocked successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", error });
  }
};
