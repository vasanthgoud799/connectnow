import Group from "../models/GroupModel.js";
import Message from "../models/MessagesModel.js";
import User from "../models/UserModel.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const getGeminiKey = () =>
  process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

const hasOpenAIConfig = () =>
  Boolean(process.env.OPENAI_API_KEY || getGeminiKey());

const inferLanguageLocally = (text = "") => {
  const sample = String(text || "").trim();
  if (!sample) return "English";
  if (/[\u0900-\u097F]/.test(sample)) return "Hindi";
  if (/[\u0C00-\u0C7F]/.test(sample)) return "Telugu";
  if (/[\u0600-\u06FF]/.test(sample)) return "Arabic";
  return "English";
};

const formatConversation = (messages = []) =>
  messages
    .map((message) => {
      const senderName =
        [message.sender?.firstName, message.sender?.lastName]
          .filter(Boolean)
          .join(" ") ||
        message.sender?.email ||
        "User";

      return `${senderName}: ${
        message.content ||
        message.meta?.poll?.question ||
        message.messageType ||
        "message"
      }`;
    })
    .join("\n");

const uniqueNonEmpty = (items = []) => [
  ...new Set(items.map((item) => String(item || "").trim()).filter(Boolean)),
];

const getFallbackSmartReplies = ({ messages = [] }) => {
  const lastMessage = messages[messages.length - 1];
  const lastContent = String(lastMessage?.content || "").toLowerCase();
  const previousContent = String(
    messages[messages.length - 2]?.content || "",
  ).toLowerCase();

  if (lastContent.includes("?")) {
    return uniqueNonEmpty([
      "Yes, that works for me.",
      "Let me check and get back to you.",
      "Can you share a bit more detail?",
      previousContent.includes("meeting") ? "That timing works for me." : "",
    ]);
  }

  if (lastContent.includes("thanks") || lastContent.includes("thank you")) {
    return uniqueNonEmpty(["You're welcome!", "Anytime.", "Happy to help."]);
  }

  if (lastContent.includes("meeting") || previousContent.includes("meeting")) {
    return uniqueNonEmpty([
      "That timing works for me.",
      "I’ll join on time.",
      "Let’s lock it in.",
    ]);
  }

  if (lastContent.includes("okay") || lastContent.includes("ok")) {
    return uniqueNonEmpty(["Perfect.", "Sounds good.", "Alright, noted."]);
  }

  return uniqueNonEmpty([
    "Sounds good to me.",
    "I’ll get back to you shortly.",
    "Thanks for the update.",
  ]);
};

const getFallbackAutocomplete = ({ text = "" }) => {
  const source = String(text || "").trim();
  if (!source) return "";

  const lowerSource = source.toLowerCase();

  if (lowerSource.endsWith("can you")) {
    return `${source} share a bit more detail?`;
  }

  if (lowerSource.endsWith("i will")) {
    return `${source} send you the update shortly.`;
  }

  if (lowerSource.endsWith("let's")) {
    return `${source} finalize this today.`;
  }

  if (lowerSource.endsWith("happy birthday")) {
    return `${source}! Wishing you a wonderful year ahead.`;
  }

  return `${source}${/[.!?]$/.test(source) ? "" : ","} and I’ll follow up shortly.`;
};

const getFallbackToneSuggestions = ({ text = "" }) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return { formal: "", friendly: "", concise: "" };
  }

  return {
    formal: `Hello, ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`,
    friendly: `${trimmed} 😊`,
    concise: trimmed.replace(/\s+/g, " ").trim(),
  };
};

const extractJSONFromText = (text = "") => {
  const cleaned = String(text || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
};

const callOpenAIJSON = async ({ system, input, schemaName, properties }) => {
  const prompt = `
${system}

${input}

Return ONLY valid JSON.
Do not include markdown.
Do not include explanation.

JSON object name: ${schemaName}

Required JSON structure:
${JSON.stringify(properties, null, 2)}
`;

  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 0.4,
          input: prompt,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "OpenAI request failed");
      }

      const payload = await response.json();
      const outputText =
        payload.output_text ||
        payload.output
          ?.flatMap((item) => item.content || [])
          .map((item) => item.text || "")
          .join("\n") ||
        "{}";

      return extractJSONFromText(outputText);
    } catch (error) {
      if (!getGeminiKey()) {
        throw error;
      }

      console.warn("OpenAI AI provider failed, falling back to Gemini:", error.message);
    }
  }

  const geminiKey = getGeminiKey();
  if (!geminiKey) {
    throw new Error("AI provider key not configured");
  }

  const response = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Gemini request failed");
  }

  const payload = await response.json();
  const outputText = payload.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return extractJSONFromText(outputText);
};

const ensureConversationAccess = async ({ userId, conversationKey }) => {
  if (!conversationKey) {
    throw new Error("conversationKey is required");
  }

  if (conversationKey.startsWith("group:")) {
    const groupId = conversationKey.replace("group:", "");
    const group = await Group.findById(groupId).select("members");
    const isMember = group?.members?.some(
      (member) => String(member.user?._id || member.user) === String(userId),
    );

    if (!group || !isMember) {
      throw new Error("You do not have access to this conversation");
    }

    return;
  }

  const participants = conversationKey.split(":");
  if (!participants.includes(String(userId))) {
    throw new Error("You do not have access to this conversation");
  }
};

export const getUserAIPreferences = async ({ userId }) => {
  const user = await User.findById(userId).select("aiPreferences");
  return (
    user?.aiPreferences || {
      enabled: false,
      preferredTone: "friendly",
      translationLanguage: "English",
    }
  );
};

export const updateUserAIPreferences = async ({ userId, preferences }) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      aiPreferences: {
        enabled: Boolean(preferences?.enabled),
        preferredTone: preferences?.preferredTone || "friendly",
        translationLanguage: preferences?.translationLanguage || "English",
      },
    },
    { new: true, runValidators: true },
  ).select("aiPreferences");

  return user?.aiPreferences;
};

export const getConversationMessagesForAI = async ({
  userId,
  conversationKey,
  limit = 12,
}) => {
  await ensureConversationAccess({ userId, conversationKey });

  const messages = await Message.find({
    conversationKey,
    deletedFor: { $ne: userId },
    isDeletedForEveryone: false,
  })
    .populate("sender", "firstName lastName email")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return messages.reverse();
};

export const getSmartReplies = async ({ userId, conversationKey }) => {
  const messages = await getConversationMessagesForAI({
    userId,
    conversationKey,
    limit: 10,
  });

  const transcript = formatConversation(messages);
  const fallbackLanguage = inferLanguageLocally(transcript);

  if (!hasOpenAIConfig()) {
    return {
      language: fallbackLanguage,
      suggestions: getFallbackSmartReplies({ messages }).slice(0, 3),
      mode: "fallback",
    };
  }

  const result = await callOpenAIJSON({
    schemaName: "smart_replies",
    system:
      "You generate concise smart reply suggestions for chat apps. Return 3 short replies only, in the user's conversation language.",
    input: `Conversation:\n${transcript}\n\nReturn 3 replies and the detected language.`,
    properties: {
      language: { type: "string" },
      suggestions: { type: "array", items: { type: "string" } },
    },
  });

  return {
    language: result.language || fallbackLanguage,
    suggestions: uniqueNonEmpty(result.suggestions || []).slice(0, 3),
    mode: "gemini",
  };
};

export const autocompleteMessage = async ({
  text,
  conversationKey,
  userId,
}) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Text is required");
  }

  if (conversationKey) {
    await ensureConversationAccess({ userId, conversationKey });
  }

  if (!hasOpenAIConfig()) {
    return {
      text: getFallbackAutocomplete({ text: trimmed }),
      mode: "fallback",
    };
  }

  const result = await callOpenAIJSON({
    schemaName: "autocomplete_message",
    system:
      "Complete the user's draft message naturally for a chat app. Keep the same intent and style, and return only one completed sentence or short paragraph.",
    input: `Draft: ${trimmed}`,
    properties: {
      text: { type: "string" },
    },
  });

  return { text: result.text || trimmed, mode: "gemini" };
};

export const getToneSuggestions = async ({ text }) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Text is required");
  }

  if (!hasOpenAIConfig()) {
    return {
      ...getFallbackToneSuggestions({ text: trimmed }),
      mode: "fallback",
    };
  }

  const result = await callOpenAIJSON({
    schemaName: "tone_suggestions",
    system:
      "Rewrite the same chat message in three tones: formal, friendly, and concise. Return each version as plain text.",
    input: `Message: ${trimmed}`,
    properties: {
      formal: { type: "string" },
      friendly: { type: "string" },
      concise: { type: "string" },
    },
  });

  return {
    formal: result.formal || trimmed,
    friendly: result.friendly || trimmed,
    concise: result.concise || trimmed,
    mode: "gemini",
  };
};

export const rewriteMessageTone = async ({ text, tone }) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Text is required");
  }

  if (!hasOpenAIConfig()) {
    return {
      text:
        getFallbackToneSuggestions({ text: trimmed })[tone] ||
        `${trimmed} (${tone} tone)`,
      mode: "fallback",
    };
  }

  const result = await callOpenAIJSON({
    schemaName: "rewrite_message",
    system:
      "Rewrite chat text in the requested tone. Keep the meaning, keep it natural, and return only the rewritten text.",
    input: `Tone: ${tone}\nText: ${trimmed}`,
    properties: {
      text: { type: "string" },
    },
  });

  return { text: result.text || trimmed, mode: "gemini" };
};

export const translateMessageText = async ({ text, targetLanguage }) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Text is required");
  }

  if (!hasOpenAIConfig()) {
    return {
      text: trimmed,
      language: targetLanguage || "English",
      mode: "fallback",
    };
  }

  const result = await callOpenAIJSON({
    schemaName: "translate_message",
    system:
      "Translate chat text accurately into the requested language. Return only the translated text and target language.",
    input: `Target language: ${targetLanguage}\nText: ${trimmed}`,
    properties: {
      text: { type: "string" },
      language: { type: "string" },
    },
  });

  return {
    text: result.text || trimmed,
    language: result.language || targetLanguage || "English",
    mode: "gemini",
  };
};

export const summarizeConversation = async ({ userId, conversationKey }) => {
  const messages = await getConversationMessagesForAI({
    userId,
    conversationKey,
    limit: 30,
  });

  const transcript = formatConversation(messages);

  if (!hasOpenAIConfig()) {
    console.log("No Gemini API key");

    const lastLines = messages
      .slice(-5)
      .map((message) => message.content)
      .filter(Boolean);

    return {
      summary:
        lastLines.join(" ").slice(0, 220) ||
        "No meaningful conversation to summarize yet.",
      bullets: lastLines.slice(0, 3),
      mode: "fallback",
    };
  }

  const result = await callOpenAIJSON({
    schemaName: "conversation_summary",
    system:
      "Summarize chat conversations for messaging apps. Keep it concise, helpful, and action-oriented.",
    input: `Conversation:\n${transcript}\n\nReturn a short summary and up to 3 bullet points.`,
    properties: {
      summary: { type: "string" },
      bullets: { type: "array", items: { type: "string" } },
    },
  });

  return {
    summary: result.summary || "No summary available.",
    bullets: (result.bullets || []).filter(Boolean).slice(0, 3),
    mode: "gemini",
  };
};
