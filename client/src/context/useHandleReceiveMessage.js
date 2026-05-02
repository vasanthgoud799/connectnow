import { useEffect } from "react";
import { useAppStore } from "@/store";
import {
  decryptIncomingMessage,
  preloadRecentEncryptedMedia,
} from "@/crypto/e2eeService";

const useHandleReceiveMessage = (socket) => {
  const {
    addMessages,
    updateMessageStatus,
    setUnreadCount,
    replaceMessage,
    removeMessageById,
    updateSelectedGroupData,
    upsertChatSummary,
    selectedConversationKey,
    removeChatSummary,
    setSelectedChatData,
    selectedChatData,
    setSelectedChatMessages,
  } = useAppStore();

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message) => {
      decryptIncomingMessage({
        message,
        currentUserId: useAppStore.getState().userInfo?.id,
      })
        .then((nextMessage) => {
          addMessages(nextMessage);
          preloadRecentEncryptedMedia({
            messages: [nextMessage],
            currentUserId: useAppStore.getState().userInfo?.id,
            limit: 1,
          })
            .then(([hydratedMessage]) => {
              if (hydratedMessage) {
                replaceMessage(hydratedMessage);
              }
            })
            .catch(() => {});
        })
        .catch(() => addMessages(message));
    };

    const handleDelivered = (payload) => {
      updateMessageStatus(payload.messageId, {
        status: payload.status,
        deliveredAt: payload.deliveredAt,
      });
    };

    const handleSeen = (payload) => {
      updateMessageStatus(payload.messageId, {
        status: payload.status,
        seenAt: payload.seenAt,
        deliveredAt: payload.seenAt,
      });
      setUnreadCount(payload.conversationKey, 0);
    };

    const handlePollUpdated = (message) => {
      decryptIncomingMessage({
        message,
        currentUserId: useAppStore.getState().userInfo?.id,
      })
        .then((nextMessage) => replaceMessage(nextMessage))
        .catch(() => replaceMessage(message));
    };

    const handleMessageUpdated = (message) => {
      decryptIncomingMessage({
        message,
        currentUserId: useAppStore.getState().userInfo?.id,
      })
        .then((nextMessage) => replaceMessage(nextMessage))
        .catch(() => replaceMessage(message));
    };

    const handleMessageDeletedForMe = (payload) => {
      removeMessageById(payload.messageId);
    };

    const handleGroupUpdated = ({ group, conversationKey }) => {
      if (!group || !conversationKey) return;

      updateSelectedGroupData(group);
      upsertChatSummary({
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

      removeChatSummary(conversationKey);

      const selectedGroupId = selectedChatData?._id || selectedChatData?.id;
      if (
        selectedChatData?.isGroup &&
        String(selectedGroupId) === String(groupId) &&
        selectedConversationKey === conversationKey
      ) {
        setSelectedChatData(undefined);
        setSelectedChatMessages([]);
      }
    };

    socket.on("receive_message", handleReceiveMessage);
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
  }, [
    socket,
    addMessages,
    updateMessageStatus,
    setUnreadCount,
    replaceMessage,
    removeMessageById,
    updateSelectedGroupData,
    upsertChatSummary,
    selectedConversationKey,
    removeChatSummary,
    selectedChatData,
    setSelectedChatData,
    setSelectedChatMessages,
  ]);
};

export default useHandleReceiveMessage;
