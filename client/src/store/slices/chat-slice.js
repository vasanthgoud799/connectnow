import {
  getMessageConversationKey,
  getMessageId,
  mergeMessages,
  normalizeMessage,
  removeMessage,
} from "@/utils/chatMessages";

const sortChats = (items = []) =>
  [...items].sort((a, b) => {
    const pinDelta = Number(b.pinnedOrder || 0) - Number(a.pinnedOrder || 0);
    if (pinDelta !== 0) return pinDelta;

    return (
      new Date(b.lastMessage?.timestamp || b.updatedAt || 0).getTime() -
      new Date(a.lastMessage?.timestamp || a.updatedAt || 0).getTime()
    );
  });

const updateCachedMessages = (messagesByConversationKey = {}, updater) =>
  Object.fromEntries(
    Object.entries(messagesByConversationKey).map(([conversationKey, messages]) => [
      conversationKey,
      updater(Array.isArray(messages) ? messages : [], conversationKey),
    ])
  );

const getConversationKeyForSelection = (chatSummaries = [], selectedChatData, fallbackKey) => {
  const selectedChatId = selectedChatData?._id || selectedChatData?.id;
  return (
    chatSummaries.find((chat) => {
      if (selectedChatData?.isGroup) {
        return chat.conversationKey === selectedChatData?.conversationKey;
      }

      const participantId = chat.participant?._id || chat.participant?.id;
      return String(participantId) === String(selectedChatId);
    })?.conversationKey || fallbackKey
  );
};

export const createChatSlice = (set, get) => ({
  selectedChatData: undefined,
  selectedConversationKey: undefined,
  focusedMessageId: undefined,
  messagesByConversationKey: {},
  messagesLoadedByConversationKey: {},
  messagesLoadingByConversationKey: {},
  setSelectedConversationKey: (selectedConversationKey) =>
    set((state) => ({
      selectedConversationKey,
      selectedChatMessages: Array.isArray(
        state.messagesByConversationKey?.[selectedConversationKey]
      )
        ? state.messagesByConversationKey[selectedConversationKey]
        : [],
    })),
  setFocusedMessageId: (focusedMessageId) => set({ focusedMessageId }),
  setSelectedChatData: (selectedChatData) =>
    set((state) => {
      const nextConversationKey = getConversationKeyForSelection(
        state.chatSummaries,
        selectedChatData,
        state.selectedConversationKey
      );

      return {
        selectedChatData,
        selectedConversationKey: nextConversationKey,
        selectedChatMessages: Array.isArray(
          state.messagesByConversationKey?.[nextConversationKey]
        )
          ? state.messagesByConversationKey[nextConversationKey]
          : [],
      };
    }),
  selectedChatMessages: [],
  setSelectedChatMessages: (selectedChatMessages) =>
    set((state) => {
      const normalizedMessages = mergeMessages([], selectedChatMessages);
      const conversationKey = state.selectedConversationKey;

      return {
        selectedChatMessages: normalizedMessages,
        messagesByConversationKey: conversationKey
          ? {
              ...state.messagesByConversationKey,
              [conversationKey]: normalizedMessages,
            }
          : state.messagesByConversationKey,
      };
    }),
  setConversationMessages: (conversationKey, messages, { loaded = true } = {}) =>
    set((state) => {
      const normalizedMessages = mergeMessages([], messages);
      return {
        messagesByConversationKey: {
          ...state.messagesByConversationKey,
          [conversationKey]: normalizedMessages,
        },
        messagesLoadedByConversationKey: {
          ...state.messagesLoadedByConversationKey,
          [conversationKey]: loaded,
        },
        messagesLoadingByConversationKey: {
          ...state.messagesLoadingByConversationKey,
          [conversationKey]: false,
        },
        selectedChatMessages:
          state.selectedConversationKey === conversationKey
            ? normalizedMessages
            : state.selectedChatMessages,
      };
    }),
  setConversationMessagesLoading: (conversationKey, isLoading) =>
    set((state) => ({
      messagesLoadingByConversationKey: {
        ...state.messagesLoadingByConversationKey,
        [conversationKey]: isLoading,
      },
    })),
  invalidateConversationMessages: (conversationKey) =>
    set((state) => ({
      messagesLoadedByConversationKey: {
        ...state.messagesLoadedByConversationKey,
        [conversationKey]: false,
      },
    })),
  updateSelectedGroupData: (groupPayload) =>
    set((state) => {
      if (!state.selectedChatData?.isGroup) {
        return {};
      }

      const selectedGroupId = state.selectedChatData?._id || state.selectedChatData?.id;
      const nextGroupId = groupPayload?._id || groupPayload?.id;
      if (String(selectedGroupId) !== String(nextGroupId)) {
        return {};
      }

      return {
        selectedChatData: {
          ...state.selectedChatData,
          _id: groupPayload._id,
          id: groupPayload._id,
          name: groupPayload.name,
          description: groupPayload.description,
          image: groupPayload.image,
          members: groupPayload.members,
          inviteToken: groupPayload.inviteToken,
          role: groupPayload.role,
          createdBy: groupPayload.createdBy,
          isGroup: true,
          conversationKey:
            state.selectedChatData?.conversationKey || `group:${groupPayload._id}`,
        },
      };
    }),
  chatSummaries: [],
  setChatSummaries: (chatSummaries) => set({ chatSummaries }),
  removeChatSummary: (conversationKey) =>
    set((state) => ({
      chatSummaries: state.chatSummaries.filter(
        (chat) => chat.conversationKey !== conversationKey
      ),
    })),
  notifications: [],
  notificationUnreadCount: 0,
  setNotifications: (notifications) => set({ notifications }),
  setNotificationUnreadCount: (notificationUnreadCount) =>
    set({ notificationUnreadCount }),
  upsertChatSummary: (nextChat) =>
    set((state) => {
      const existingIndex = state.chatSummaries.findIndex(
        (chat) => chat.conversationKey === nextChat.conversationKey
      );

      if (existingIndex === -1) {
        return {
          chatSummaries: sortChats([nextChat, ...state.chatSummaries]),
        };
      }

      const updatedChats = [...state.chatSummaries];
      updatedChats[existingIndex] = {
        ...updatedChats[existingIndex],
        ...nextChat,
      };

      return { chatSummaries: sortChats(updatedChats) };
    }),
  updateChatPreference: (conversationKey, preference) =>
    set((state) => ({
      chatSummaries: sortChats(
        state.chatSummaries.map((chat) =>
          chat.conversationKey === conversationKey
            ? {
                ...chat,
                ...preference,
              }
            : chat
        )
      ),
    })),
  updateMessageStatus: (messageId, statusPayload) =>
    set((state) => ({
      selectedChatMessages: mergeMessages(
        state.selectedChatMessages,
        state.selectedChatMessages
          .filter((message) => getMessageId(message) === String(messageId))
          .map((message) => ({ ...message, ...statusPayload }))
      ),
      messagesByConversationKey: updateCachedMessages(
        state.messagesByConversationKey,
        (messages) =>
          mergeMessages(
            messages,
            messages
              .filter((message) => getMessageId(message) === String(messageId))
              .map((message) => ({ ...message, ...statusPayload }))
          )
      ),
      chatSummaries: state.chatSummaries.map((chat) => {
        if (String(chat.lastMessage?.messageId) !== String(messageId)) return chat;

        return {
          ...chat,
          lastMessage: {
            ...chat.lastMessage,
            ...statusPayload,
          },
        };
      }),
    })),
  replaceMessage: (nextMessage) =>
    set((state) => {
      const normalizedNextMessage = normalizeMessage(nextMessage);
      if (!normalizedNextMessage) return {};
      const nextMessageId = getMessageId(normalizedNextMessage);
      const conversationKey = getMessageConversationKey(normalizedNextMessage);
      if (!conversationKey) return {};

      return {
        selectedChatMessages:
          state.selectedConversationKey === conversationKey
            ? mergeMessages(state.selectedChatMessages, normalizedNextMessage)
            : state.selectedChatMessages,
        messagesByConversationKey: {
          ...state.messagesByConversationKey,
          [conversationKey]: mergeMessages(
            Array.isArray(state.messagesByConversationKey?.[conversationKey])
              ? state.messagesByConversationKey[conversationKey]
              : [],
            normalizedNextMessage
          ),
        },
        chatSummaries: state.chatSummaries.map((chat) =>
          String(chat.lastMessage?.messageId) === nextMessageId
            ? {
                ...chat,
                lastMessage: {
                  ...chat.lastMessage,
                  messageId: nextMessageId,
                  sender: normalizedNextMessage.sender,
                  content: normalizedNextMessage.content,
                  messageType: normalizedNextMessage.messageType,
                  timestamp: normalizedNextMessage.timestamp,
                  status: normalizedNextMessage.status,
                },
                updatedAt: normalizedNextMessage.timestamp || chat.updatedAt,
              }
            : chat
        ),
      };
    }),
  removeMessageById: (messageId) =>
    set((state) => ({
      selectedChatMessages: removeMessage(state.selectedChatMessages, { _id: messageId }),
      messagesByConversationKey: updateCachedMessages(
        state.messagesByConversationKey,
        (messages) => removeMessage(messages, { _id: messageId })
      ),
    })),
  setUnreadCount: (conversationKey, unreadCount) =>
    set((state) => ({
      chatSummaries: state.chatSummaries.map((chat) =>
        chat.conversationKey === conversationKey
          ? {
              ...chat,
              unreadCount,
            }
          : chat
      ),
    })),
  addNotification: (notificationPayload, unreadCount) =>
    set((state) => ({
      notifications: [notificationPayload, ...state.notifications].slice(0, 100),
      notificationUnreadCount:
        unreadCount !== undefined ? unreadCount : state.notificationUnreadCount + 1,
    })),
  markNotificationRead: (notificationId, unreadCount) =>
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        String(notification._id) === String(notificationId)
          ? { ...notification, readAt: new Date().toISOString() }
          : notification
      ),
      notificationUnreadCount:
        unreadCount !== undefined
          ? unreadCount
          : Math.max(0, state.notificationUnreadCount - 1),
    })),
  addMessages: (message) => {
    const {
      selectedConversationKey,
      messagesLoadedByConversationKey,
      chatSummaries,
      userInfo,
      setUnreadCount,
    } = get();

    const normalizedMessage = normalizeMessage(message);
    if (!normalizedMessage) return;
    const isGroupMessage = normalizedMessage.chatType === "group";
    const recipientId =
      typeof normalizedMessage.recipient === "string"
        ? normalizedMessage.recipient
        : normalizedMessage.recipient?._id || normalizedMessage.recipient?.id;
    const senderId =
      typeof normalizedMessage.sender === "string"
        ? normalizedMessage.sender
        : normalizedMessage.sender?._id || normalizedMessage.sender?.id;
    const messageId = getMessageId(normalizedMessage);
    const conversationKey = getMessageConversationKey(normalizedMessage);
    const isActiveConversation = selectedConversationKey === conversationKey;

    set((state) => ({
      selectedChatMessages: isActiveConversation
        ? mergeMessages(state.selectedChatMessages, normalizedMessage)
        : state.selectedChatMessages,
      messagesByConversationKey:
        isActiveConversation || state.messagesLoadedByConversationKey?.[conversationKey]
          ? {
              ...state.messagesByConversationKey,
              [conversationKey]: mergeMessages(
                Array.isArray(state.messagesByConversationKey?.[conversationKey])
                  ? state.messagesByConversationKey[conversationKey]
                  : [],
                normalizedMessage
              ),
            }
          : state.messagesByConversationKey,
      messagesLoadedByConversationKey:
        isActiveConversation || state.messagesLoadedByConversationKey?.[conversationKey]
          ? {
              ...state.messagesLoadedByConversationKey,
              [conversationKey]: true,
            }
          : state.messagesLoadedByConversationKey,
    }));

    const existingChat = chatSummaries.find(
      (chat) => chat.conversationKey === conversationKey
    );

    if (existingChat) {
      const isIncomingForCurrentUser = isGroupMessage
        ? senderId !== userInfo?.id
        : recipientId === userInfo?.id && senderId !== userInfo?.id;
      const nextUnreadCount = isActiveConversation
        ? 0
        : isIncomingForCurrentUser
          ? (existingChat.unreadCount || 0) + 1
          : existingChat.unreadCount;

      get().upsertChatSummary({
        ...existingChat,
        lastMessage: {
          messageId,
          sender: normalizedMessage.sender,
          content: normalizedMessage.content,
          messageType: normalizedMessage.messageType,
          timestamp: normalizedMessage.timestamp,
          status: normalizedMessage.status,
        },
        updatedAt: normalizedMessage.timestamp,
        unreadCount: nextUnreadCount,
      });

      if (isActiveConversation) {
        setUnreadCount(conversationKey, 0);
      }
    } else {
      const otherParticipant =
        senderId === userInfo?.id ? normalizedMessage.recipient : normalizedMessage.sender;

      get().upsertChatSummary({
        conversationKey,
        chatType: isGroupMessage ? "group" : "direct",
        group: isGroupMessage ? normalizedMessage.group : undefined,
        title: isGroupMessage ? normalizedMessage.group?.name : undefined,
        image: isGroupMessage ? normalizedMessage.group?.image : undefined,
        participant: otherParticipant,
        lastMessage: {
          messageId,
          sender: normalizedMessage.sender,
          content: normalizedMessage.content,
          messageType: normalizedMessage.messageType,
          timestamp: normalizedMessage.timestamp,
          status: normalizedMessage.status,
        },
        unreadCount: recipientId === userInfo?.id ? 1 : 0,
        updatedAt: normalizedMessage.timestamp,
      });
    }
  },
});
