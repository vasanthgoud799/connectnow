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
      const normalizedMessages = Array.isArray(selectedChatMessages)
        ? selectedChatMessages
        : [];
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
      const normalizedMessages = Array.isArray(messages) ? messages : [];
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
      selectedChatMessages: state.selectedChatMessages.map((message) => {
        const currentId = String(message._id || message.id);
        if (currentId !== String(messageId)) return message;

        return {
          ...message,
          ...statusPayload,
        };
      }),
      messagesByConversationKey: updateCachedMessages(
        state.messagesByConversationKey,
        (messages) =>
          messages.map((message) => {
            const currentId = String(message._id || message.id);
            if (currentId !== String(messageId)) return message;
            return {
              ...message,
              ...statusPayload,
            };
          })
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
      const nextMessageId = String(nextMessage._id || nextMessage.id);

      return {
        selectedChatMessages: state.selectedChatMessages.map((message) =>
          String(message._id || message.id) === nextMessageId
            ? {
                ...message,
                ...nextMessage,
              }
            : message
        ),
        messagesByConversationKey: updateCachedMessages(
          state.messagesByConversationKey,
          (messages) =>
            messages.map((message) =>
              String(message._id || message.id) === nextMessageId
                ? {
                    ...message,
                    ...nextMessage,
                  }
                : message
            )
        ),
        chatSummaries: state.chatSummaries.map((chat) =>
          String(chat.lastMessage?.messageId) === nextMessageId
            ? {
                ...chat,
                lastMessage: {
                  ...chat.lastMessage,
                  messageId: nextMessageId,
                  sender: nextMessage.sender,
                  content: nextMessage.content,
                  messageType: nextMessage.messageType,
                  timestamp: nextMessage.timestamp,
                  status: nextMessage.status,
                },
                updatedAt: nextMessage.timestamp || chat.updatedAt,
              }
            : chat
        ),
      };
    }),
  removeMessageById: (messageId) =>
    set((state) => ({
      selectedChatMessages: state.selectedChatMessages.filter(
        (message) => String(message._id || message.id) !== String(messageId)
      ),
      messagesByConversationKey: updateCachedMessages(
        state.messagesByConversationKey,
        (messages) =>
          messages.filter(
            (message) => String(message._id || message.id) !== String(messageId)
          )
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
      selectedChatData,
      selectedConversationKey,
      selectedChatMessages,
      messagesByConversationKey,
      messagesLoadedByConversationKey,
      chatSummaries,
      userInfo,
      setUnreadCount,
    } = get();

    const isGroupMessage = message.chatType === "group";
    const recipientId =
      typeof message.recipient === "string"
        ? message.recipient
        : message.recipient?._id || message.recipient?.id;
    const senderId =
      typeof message.sender === "string"
        ? message.sender
        : message.sender?._id || message.sender?.id;
    const messageId = message._id || message.id;
    const conversationKey = message.conversationKey;
    const selectedChatId = selectedChatData?._id || selectedChatData?.id;
    const selectedGroupId = selectedChatData?.isGroup ? selectedChatId : null;
    const incomingGroupId =
      typeof message.group === "string"
        ? message.group
        : message.group?._id || message.group?.id;

    const exists = selectedChatMessages.some(
      (msg) => String(msg._id || msg.id) === String(messageId)
    );

    const isActiveConversation = isGroupMessage
      ? selectedConversationKey === conversationKey ||
        (selectedGroupId && String(incomingGroupId) === String(selectedGroupId))
      : recipientId === selectedChatId || senderId === selectedChatId;

    const normalizedMessage = {
      ...message,
      recipient: recipientId,
      sender: senderId,
      id: messageId,
    };

    const currentConversationMessages = Array.isArray(messagesByConversationKey?.[conversationKey])
      ? messagesByConversationKey[conversationKey]
      : [];
    const cachedExists = currentConversationMessages.some(
      (msg) => String(msg._id || msg.id) === String(messageId)
    );

    set((state) => ({
      selectedChatMessages:
        !exists && isActiveConversation
          ? [...selectedChatMessages, normalizedMessage]
          : state.selectedChatMessages,
      messagesByConversationKey:
        isActiveConversation || messagesLoadedByConversationKey?.[conversationKey]
          ? {
              ...state.messagesByConversationKey,
              [conversationKey]: cachedExists
                ? currentConversationMessages
                : [...currentConversationMessages, normalizedMessage],
            }
          : state.messagesByConversationKey,
      messagesLoadedByConversationKey:
        isActiveConversation || messagesLoadedByConversationKey?.[conversationKey]
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
          sender: message.sender,
          content: message.content,
          messageType: message.messageType,
          timestamp: message.timestamp,
          status: message.status,
        },
        updatedAt: message.timestamp,
        unreadCount: nextUnreadCount,
      });

      if (isActiveConversation) {
        setUnreadCount(conversationKey, 0);
      }
    } else {
      const otherParticipant =
        senderId === userInfo?.id ? message.recipient : message.sender;

      get().upsertChatSummary({
        conversationKey,
        chatType: isGroupMessage ? "group" : "direct",
        group: isGroupMessage ? message.group : undefined,
        title: isGroupMessage ? message.group?.name : undefined,
        image: isGroupMessage ? message.group?.image : undefined,
        participant: otherParticipant,
        lastMessage: {
          messageId,
          sender: message.sender,
          content: message.content,
          messageType: message.messageType,
          timestamp: message.timestamp,
          status: message.status,
        },
        unreadCount: recipientId === userInfo?.id ? 1 : 0,
        updatedAt: message.timestamp,
      });
    }
  },
});
