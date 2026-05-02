import {
  autocompleteMessage,
  getSmartReplies,
  getToneSuggestions,
  getUserAIPreferences,
  rewriteMessageTone,
  summarizeConversation,
  translateMessageText,
  updateUserAIPreferences,
} from "../services/AIService.js";

export const getAISettings = async (req, res) => {
  try {
    const preferences = await getUserAIPreferences({ userId: req.userId });
    return res.status(200).json({ preferences });
  } catch (error) {
    console.error("Error fetching AI settings:", error);
    return res.status(500).json({ message: "Failed to fetch AI settings." });
  }
};

export const saveAISettings = async (req, res) => {
  try {
    const preferences = await updateUserAIPreferences({
      userId: req.userId,
      preferences: req.body,
    });
    return res.status(200).json({ preferences });
  } catch (error) {
    console.error("Error updating AI settings:", error);
    return res.status(400).json({ message: "Failed to update AI settings." });
  }
};

export const generateSmartReplies = async (req, res) => {
  try {
    const { conversationKey } = req.body;
    const result = await getSmartReplies({
      userId: req.userId,
      conversationKey,
    });

    return res.status(200).json({
      ...result,
      subscription: req.subscriptionSnapshot || null,
    });
  } catch (error) {
    console.error("Error generating smart replies:", error);
    return res.status(400).json({ message: "Failed to generate smart replies." });
  }
};

export const autocompleteDraft = async (req, res) => {
  try {
    const { text, conversationKey } = req.body;
    const result = await autocompleteMessage({
      text,
      conversationKey,
      userId: req.userId,
    });

    return res.status(200).json({
      ...result,
      subscription: req.subscriptionSnapshot || null,
    });
  } catch (error) {
    console.error("Error generating autocomplete:", error);
    return res.status(400).json({ message: "Failed to autocomplete message." });
  }
};

export const getToneOptions = async (req, res) => {
  try {
    const { text } = req.body;
    const result = await getToneSuggestions({ text });
    return res.status(200).json({
      ...result,
      subscription: req.subscriptionSnapshot || null,
    });
  } catch (error) {
    console.error("Error generating tone suggestions:", error);
    return res.status(400).json({ message: "Failed to generate tone suggestions." });
  }
};

export const rewriteMessage = async (req, res) => {
  try {
    const { text, tone } = req.body;
    const result = await rewriteMessageTone({
      text,
      tone: tone || "friendly",
    });

    return res.status(200).json({
      ...result,
      subscription: req.subscriptionSnapshot || null,
    });
  } catch (error) {
    console.error("Error rewriting message:", error);
    return res.status(400).json({ message: "Failed to rewrite message." });
  }
};

export const translateMessage = async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;
    const result = await translateMessageText({
      text,
      targetLanguage: targetLanguage || "English",
    });

    return res.status(200).json({
      ...result,
      subscription: req.subscriptionSnapshot || null,
    });
  } catch (error) {
    console.error("Error translating message:", error);
    return res.status(400).json({ message: "Failed to translate message." });
  }
};

export const summarizeChat = async (req, res) => {
  try {
    const { conversationKey } = req.body;
    const result = await summarizeConversation({
      userId: req.userId,
      conversationKey,
    });

    return res.status(200).json({
      ...result,
      subscription: req.subscriptionSnapshot || null,
    });
  } catch (error) {
    console.error("Error summarizing conversation:", error);
    return res.status(400).json({ message: "Failed to summarize conversation." });
  }
};
