import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import {
  areSameMessage,
  normalizeMessage,
  sanitizeEncryptedMessageText,
} from "@/utils/chatMessages";
import {
  dispatchOpenChatFromNotification,
  showBrowserNotification,
} from "@/utils/browserNotifications";

const isDevelopment = import.meta.env.DEV;

const debugRealtime = (event, payload = {}) => {
  if (!isDevelopment) return;
  console.debug(`[realtime:${event}]`, payload);
};

const getMessageNotificationPreview = (message) => {
  const decryptedContent = sanitizeEncryptedMessageText(
    message?.decryptedContent,
    message
  );
  if (decryptedContent) {
    return String(decryptedContent);
  }

  if (message?.messageType === "image") return "Sent an image";
  if (message?.messageType === "video") return "Sent a video";
  if (message?.messageType === "audio") return "Sent an audio message";
  if (message?.messageType === "file") return "Sent a file";
  if (message?.content) return String(message.content);

  return "New message";
};

const getNotificationPayloadForMessage = (message, currentUserId) => {
  if (message?.chatType === "group" && message?.group) {
    return {
      _id: message.group?._id || message.group?.id,
      id: message.group?._id || message.group?.id,
      name: message.group?.name,
      description: message.group?.description,
      image: message.group?.image,
      members: message.group?.members,
      memberCount:
        message.group?.memberCount || message.group?.members?.length || 0,
      inviteToken: message.group?.inviteToken,
      isGroup: true,
      conversationKey: message.conversationKey,
    };
  }

  const senderId =
    typeof message?.sender === "string"
      ? message.sender
      : message?.sender?._id || message?.sender?.id;
  const recipient =
    senderId === currentUserId ? message?.recipient : message?.sender;

  return recipient;
};

const useHandleReceiveMessage = (socket) => {
  const processedReceiveEventsRef = useRef(new Set());

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message) => {
      const currentState = useAppStore.getState();
      const normalizedIncomingMessage = normalizeMessage(message);
      if (!normalizedIncomingMessage) {
        debugRealtime("message_ignored", { reason: "normalization_failed" });
        return;
      }

      if (!normalizedIncomingMessage.conversationKey) {
        debugRealtime("message_ignored", {
          reason: "missing_conversation_key",
          messageId: normalizedIncomingMessage._id || normalizedIncomingMessage.id,
        });
        return;
      }

      const receiveEventKey =
        normalizedIncomingMessage._id ||
        normalizedIncomingMessage.id ||
        normalizedIncomingMessage.clientMessageId ||
        `${normalizedIncomingMessage.conversationKey}:${normalizedIncomingMessage.timestamp}`;

      if (receiveEventKey && processedReceiveEventsRef.current.has(receiveEventKey)) {
        debugRealtime("message_duplicate_event", {
          eventKey: receiveEventKey,
          conversationKey: normalizedIncomingMessage.conversationKey,
        });
        return;
      }

      if (receiveEventKey) {
        processedReceiveEventsRef.current.add(receiveEventKey);
        window.setTimeout(() => {
          processedReceiveEventsRef.current.delete(receiveEventKey);
        }, 1500);
      }

      socket.emit("message_received_ack", {
        messageId: normalizedIncomingMessage?._id || normalizedIncomingMessage?.id,
        conversationKey: normalizedIncomingMessage?.conversationKey,
      });

      const conversationMessages = Array.isArray(
        currentState.messagesByConversationKey?.[normalizedIncomingMessage?.conversationKey]
      )
        ? currentState.messagesByConversationKey[normalizedIncomingMessage.conversationKey]
        : [];
      const duplicateExists = conversationMessages.some((item) =>
        areSameMessage(item, normalizedIncomingMessage)
      );

      if (duplicateExists) {
        currentState.replaceMessage(normalizedIncomingMessage);
      } else {
        currentState.addMessages(normalizedIncomingMessage);
      }

      debugRealtime("message_received", {
        messageId: normalizedIncomingMessage._id || normalizedIncomingMessage.id,
        conversationKey: normalizedIncomingMessage.conversationKey,
        selectedConversationKey: currentState.selectedConversationKey,
        action: duplicateExists ? "reconciled" : "appended",
      });

      const isIncomingFromOtherUser = senderIdIsOtherUser(
        normalizedIncomingMessage,
        currentState.userInfo?.id
      );
      const isCurrentConversationVisible =
        document.visibilityState === "visible" &&
        currentState.activeHomeSection === "chats" &&
        currentState.selectedConversationKey === normalizedIncomingMessage?.conversationKey &&
        (!window.matchMedia?.("(max-width: 768px)")?.matches ||
          currentState.mobileChatView === "chat");

      if (
        isCurrentConversationVisible &&
        isIncomingFromOtherUser &&
        normalizedIncomingMessage?.conversationKey
      ) {
        socket.emit(
          "mark_messages_seen",
          { conversationKey: normalizedIncomingMessage.conversationKey },
          (ack = {}) => {
            if (!ack?.ok) return;
            (ack.updates || []).forEach((update) => {
              useAppStore.getState().updateMessageStatus(update.messageId, {
                status: update.status,
                seenAt: update.seenAt,
                deliveredAt: update.seenAt,
              });
            });
            useAppStore
              .getState()
              .setUnreadCount(normalizedIncomingMessage.conversationKey, 0);
          }
        );
      }

      if (
        currentState.browserNotificationsEnabled &&
        !isCurrentConversationVisible &&
        isIncomingFromOtherUser
      ) {
        const title =
          normalizedIncomingMessage?.chatType === "group"
            ? normalizedIncomingMessage?.group?.name || "Group message"
            : [
                normalizedIncomingMessage?.sender?.firstName,
                normalizedIncomingMessage?.sender?.lastName,
              ]
                .filter(Boolean)
                .join(" ") ||
              normalizedIncomingMessage?.sender?.email ||
              "New message";
        const body = getMessageNotificationPreview(normalizedIncomingMessage);
        const payload = getNotificationPayloadForMessage(
          normalizedIncomingMessage,
          currentState.userInfo?.id
        );

        showBrowserNotification({
          title,
          body,
          tag: `message:${normalizedIncomingMessage?.conversationKey}`,
          data: {
            notificationKind: "message",
            conversationKey: normalizedIncomingMessage?.conversationKey,
            messageId: normalizedIncomingMessage?._id || normalizedIncomingMessage?.id,
          },
          onClick: () =>
            dispatchOpenChatFromNotification({
              payload,
              messageId: normalizedIncomingMessage?._id || normalizedIncomingMessage?.id,
            }),
        });
      }
    };

    const handleDelivered = (payload) => {
      useAppStore.getState().updateMessageStatus(payload.messageId, {
        status: payload.status,
        deliveredAt: payload.deliveredAt,
      });
    };

    const handleSeen = (payload) => {
      const state = useAppStore.getState();
      state.updateMessageStatus(payload.messageId, {
        status: payload.status,
        seenAt: payload.seenAt,
        deliveredAt: payload.seenAt,
      });
      state.setUnreadCount(payload.conversationKey, 0);
    };

    const handlePollUpdated = (message) => {
      const normalizedMessage = normalizeMessage(message);
      if (normalizedMessage) {
        useAppStore.getState().replaceMessage(normalizedMessage);
      }
    };

    const handleMessageUpdated = (message) => {
      const normalizedMessage = normalizeMessage(message);
      if (normalizedMessage) {
        useAppStore.getState().replaceMessage(normalizedMessage);
      }
    };

    const handleMessageDeletedForMe = (payload) => {
      useAppStore.getState().removeMessageById(payload.messageId);
    };

    const handleGroupUpdated = ({ group, conversationKey }) => {
      if (!group || !conversationKey) return;

      const state = useAppStore.getState();
      state.updateSelectedGroupData(group);
      state.upsertChatSummary({
        conversationKey,
        chatType: "group",
        group,
        title: group.name,
        image: group.image,
        updatedAt: new Date().toISOString(),
      });
    };

    const handleGroupRemoved = ({ groupId, conversationKey }) => {
      if (!conversationKey) return;

      const state = useAppStore.getState();
      state.removeChatSummary(conversationKey);

      const selectedGroupId = state.selectedChatData?._id || state.selectedChatData?.id;
      if (
        state.selectedChatData?.isGroup &&
        String(selectedGroupId) === String(groupId) &&
        state.selectedConversationKey === conversationKey
      ) {
        state.setSelectedChatData(undefined);
        state.setSelectedChatMessages([]);
      }
    };

    socket.on("receive_message", handleReceiveMessage);
    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("message_delivered", handleDelivered);
    socket.on("message_seen", handleSeen);
    socket.on("poll_updated", handlePollUpdated);
    socket.on("message_reacted", handleMessageUpdated);
    socket.on("message_reaction_removed", handleMessageUpdated);
    socket.on("message_edited", handleMessageUpdated);
    socket.on("message_deleted", handleMessageUpdated);
    socket.on("message_pinned", handleMessageUpdated);
    socket.on("message_deleted_for_me", handleMessageDeletedForMe);
    socket.on("group_updated", handleGroupUpdated);
    socket.on("group_removed", handleGroupRemoved);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("message_delivered", handleDelivered);
      socket.off("message_seen", handleSeen);
      socket.off("poll_updated", handlePollUpdated);
      socket.off("message_reacted", handleMessageUpdated);
      socket.off("message_reaction_removed", handleMessageUpdated);
      socket.off("message_edited", handleMessageUpdated);
      socket.off("message_deleted", handleMessageUpdated);
      socket.off("message_pinned", handleMessageUpdated);
      socket.off("message_deleted_for_me", handleMessageDeletedForMe);
      socket.off("group_updated", handleGroupUpdated);
      socket.off("group_removed", handleGroupRemoved);
    };
  }, [socket]);
};

const senderIdIsOtherUser = (message, currentUserId) => {
  const senderId =
    typeof message?.sender === "string"
      ? message.sender
      : message?.sender?._id || message?.sender?.id;

  return String(senderId) !== String(currentUserId);
};

export default useHandleReceiveMessage;
