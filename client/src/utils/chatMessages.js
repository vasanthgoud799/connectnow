const toStringId = (value) =>
  value === undefined || value === null ? "" : String(value);

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

  const normalizedId = getMessageId(message);
  const normalizedClientMessageId = getMessageClientId(message);
  const normalizedConversationKey =
    toStringId(conversationKey) || getMessageConversationKey(message);
  const normalizedTimestampValue =
    message.timestamp || message.createdAt || new Date().toISOString();

  return {
    ...message,
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

  return normalizeMessage({
    ...normalizedCurrent,
    ...normalizedNext,
    localPreviewUrl:
      normalizedNext.localPreviewUrl || normalizedCurrent.localPreviewUrl || null,
    resolvedMedia: normalizedNext.resolvedMedia || normalizedCurrent.resolvedMedia || null,
    uploadStatus:
      normalizedNext.uploadStatus ||
      (normalizedNext.status === "sent" || normalizedNext.status === "delivered"
        ? null
        : normalizedCurrent.uploadStatus) ||
      null,
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
