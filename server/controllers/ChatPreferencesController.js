import { updateChatPreference } from "../services/MessageService.js";

export const saveChatPreference = async (req, res) => {
  try {
    const {
      conversationKey,
      archived,
      mutedUntil,
      favorite,
      pinnedOrder,
    } = req.body;

    if (!conversationKey) {
      return res.status(400).json({ message: "conversationKey is required." });
    }

    const preference = await updateChatPreference({
      userId: req.userId,
      conversationKey,
      archived,
      mutedUntil,
      favorite,
      pinnedOrder,
    });

    return res.status(200).json({ preference });
  } catch (error) {
    console.error("Error saving chat preference:", error);
    return res.status(500).json({ message: "Failed to save chat preference." });
  }
};
