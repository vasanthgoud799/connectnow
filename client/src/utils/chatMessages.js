const toStringId = (value) =>
  value === undefined || value === null ? "" : String(value);

const LEGACY_DECRYPT_PLACEHOLDERS = new Set([
  "[Unable to decrypt message on this device]",
  "Unable to decrypt message on this device",
  "[Unable to decrypt this message on this device]",
  "Unable to decrypt this message on this device",
  "[Unable to decrypt media on this device]",
  "Unable to decrypt media on this device",
]);

const MESSAGE_STATUS_RANK = {
  failed: -1,
  sending: 0,
  sent: 1,
  delivered: 2,
  seen: 3,
};

const getStatusRank = (status) =>
  Object.prototype.hasOwnProperty.call(MESSAGE_STATUS_RANK, status)
    ? MESSAGE_STATUS_RANK[status]
    : 1;

const getNewestStatus = (currentStatus, nextStatus) =>
  getStatusRank(nextStatus) >= getStatusRank(currentStatus)
    ? nextStatus || currentStatus || "sent"
    : currentStatus || nextStatus || "sent";

const mergeReadBy = (currentReadBy = [], nextReadBy = []) => {
  const byUser = new Map();
  [...currentReadBy, ...nextReadBy].forEach((entry) => {
    const userId =
      typeof entry === "string"
        ? entry
        : toStringId(entry?.userId?._id || entry?.userId || entry?._id || entry?.id);
    if (!userId) return;
    const existing = byUser.get(userId);
    const existingTime = new Date(existing?.readAt || 0).getTime();
    const nextTime = new Date(entry?.readAt || 0).getTime();
    byUser.set(userId, !existing || nextTime >= existingTime ? entry : existing);
  });
  return [...byUser.values()];
};

export const sanitizeEncryptedMessageText = (value, message = {}) => {
  const text = toStringId(value).trim();
  if (!text) return "";

  if ((message?.encryption?.enabled || message?.decryptionError) && LEGACY_DECRYPT_PLACEHOLDERS.has(text)) {
    return "";
  }

  return value === undefined || value === null ? "" : String(value);
};

const getRecoverableMessageText = (message = {}) => {
  const content = sanitizeEncryptedMessageText(message.content, message);
  const decryptedContent = sanitizeEncryptedMessageText(message.decryptedContent, message);

  if (content || decryptedContent) {
    return { content, decryptedContent };
  }

  if (message?.encryption?.enabled || message?.mediaEncryption?.enabled) {
    return {
      content: "Old encrypted message",
      decryptedContent: "",
    };
  }

  return { content: "", decryptedContent: "" };
};

export const getMessageId = (message) =>
  toStringId(message?._id || message?.id);

export const getMessageClientId = (message) =>
  toStringId(
    message?.clientMessageId ||
      message?.clientTempId ||
      message?.requestId ||
      message?.messageRequestId
  );

export const getMessageConversationKey = (message) =>
  toStringId(message?.conversationKey);

export const getMessageTimestamp = (message) => {
  const rawValue = message?.timestamp || message?.createdAt || message?.updatedAt;
  const nextValue = new Date(rawValue || Date.now()).getTime();
  return Number.isNaN(nextValue) ? Date.now() : nextValue;
};

export const normalizeMessage = (message, { conversationKey } = {}) => {
  if (!message || typeof message !== "object") return null;

  const recoveredText = getRecoverableMessageText(message);
  const normalizedId = getMessageId(message);
  const normalizedClientMessageId = getMessageClientId(message);
  const normalizedConversationKey =
    toStringId(conversationKey) || getMessageConversationKey(message);
  const normalizedTimestampValue =
    message.timestamp || message.createdAt || new Date().toISOString();

  return {
    ...message,
    content: recoveredText.content,
    decryptedContent: recoveredText.decryptedContent,
    _id: normalizedId || message._id,
    id: normalizedId || message.id || normalizedClientMessageId,
    clientMessageId: normalizedClientMessageId || null,
    clientTempId: toStringId(message?.clientTempId || normalizedClientMessageId || null) || null,
    requestId: toStringId(message?.requestId || normalizedClientMessageId || null) || null,
    conversationKey: normalizedConversationKey || undefined,
    timestamp: normalizedTimestampValue,
    createdAt: message.createdAt || normalizedTimestampValue,
    updatedAt: message.updatedAt || normalizedTimestampValue,
    status: message.status || "sent",
  };
};

export const areSameMessage = (leftMessage, rightMessage) => {
  const leftId = getMessageId(leftMessage);
  const rightId = getMessageId(rightMessage);

  if (leftId && rightId && leftId === rightId) {
    return true;
  }

  const leftClientId = getMessageClientId(leftMessage);
  const rightClientId = getMessageClientId(rightMessage);

  if (leftClientId && rightClientId && leftClientId === rightClientId) {
    return true;
  }

  return false;
};

export const sortMessagesChronologically = (messages = []) =>
  [...messages].sort((leftMessage, rightMessage) => {
    const timestampDelta = getMessageTimestamp(leftMessage) - getMessageTimestamp(rightMessage);
    if (timestampDelta !== 0) return timestampDelta;

    const leftId = getMessageId(leftMessage) || getMessageClientId(leftMessage);
    const rightId = getMessageId(rightMessage) || getMessageClientId(rightMessage);
    return leftId.localeCompare(rightId);
  });

export const mergeMessageRecords = (currentMessage, nextMessage) => {
  const normalizedCurrent = normalizeMessage(currentMessage) || {};
  const normalizedNext = normalizeMessage(nextMessage) || {};
  const nextContent = sanitizeEncryptedMessageText(
    normalizedNext.content,
    normalizedNext
  );
  const nextDecryptedContent = sanitizeEncryptedMessageText(
    normalizedNext.decryptedContent,
    normalizedNext
  );
  const currentContent = sanitizeEncryptedMessageText(
    normalizedCurrent.content,
    normalizedCurrent
  );
  const currentDecryptedContent = sanitizeEncryptedMessageText(
    normalizedCurrent.decryptedContent,
    normalizedCurrent
  );
  const nextUploadStatus =
    normalizedNext.uploadStatus ||
    (["sent", "delivered", "seen"].includes(normalizedNext.status)
      ? null
      : normalizedCurrent.uploadStatus) ||
    null;

  const mergedStatus = getNewestStatus(
    normalizedCurrent.status,
    normalizedNext.status
  );

  return normalizeMessage({
    ...normalizedCurrent,
    ...normalizedNext,
    status: mergedStatus,
    deliveredAt: normalizedNext.deliveredAt || normalizedCurrent.deliveredAt || null,
    seenAt: normalizedNext.seenAt || normalizedCurrent.seenAt || null,
    readBy: mergeReadBy(normalizedCurrent.readBy, normalizedNext.readBy),
    content: nextContent || currentContent || "",
    decryptedContent: nextDecryptedContent || currentDecryptedContent || "",
    localPreviewUrl:
      normalizedNext.localPreviewUrl ||
      (nextUploadStatus ? normalizedCurrent.localPreviewUrl : null),
    resolvedMedia: normalizedNext.resolvedMedia || normalizedCurrent.resolvedMedia || null,
    uploadStatus: nextUploadStatus,
    uploadError: normalizedNext.uploadError || null,
  });
};

export const mergeMessages = (currentMessages = [], incomingMessages = []) => {
  const sourceMessages = Array.isArray(currentMessages) ? currentMessages : [];
  const nextMessages = Array.isArray(incomingMessages)
    ? incomingMessages
    : [incomingMessages];

  const mergedMessages = sourceMessages.map((message) => normalizeMessage(message)).filter(Boolean);

  nextMessages
    .map((message) => normalizeMessage(message))
    .filter(Boolean)
    .forEach((nextMessage) => {
      const existingIndex = mergedMessages.findIndex((currentMessage) =>
        areSameMessage(currentMessage, nextMessage)
      );

      if (existingIndex === -1) {
        mergedMessages.push(nextMessage);
        return;
      }

      mergedMessages[existingIndex] = mergeMessageRecords(
        mergedMessages[existingIndex],
        nextMessage
      );
    });

  return sortMessagesChronologically(mergedMessages);
};

export const removeMessage = (currentMessages = [], messageLike) => {
  const normalizedMessages = Array.isArray(currentMessages) ? currentMessages : [];
  return normalizedMessages.filter(
    (currentMessage) => !areSameMessage(currentMessage, messageLike)
  );
};
