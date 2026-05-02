import React, { useEffect, useState } from "react";
import { ArrowUpRight, Forward, MessageSquareText, Star } from "lucide-react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { useAppStore } from "@/store";
import { STARRED_MESSAGES_ROUTE } from "@/utils/constants";

function StarredPage({ onOpenChat }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const { userInfo, setFocusedMessageId, setSelectedChatData } = useAppStore();

  useEffect(() => {
    const loadStarredMessages = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get(STARRED_MESSAGES_ROUTE, {
          withCredentials: true,
        });
        setMessages(response.data.messages || []);
      } catch (error) {
        console.error("Error loading starred messages:", error);
        toast.error("Unable to load starred messages.");
        setMessages([]);
      } finally {
        setLoading(false);
      }
    };

    loadStarredMessages();
  }, []);

  const openStarredMessage = (message) => {
    if (message.chatType === "group") {
      setSelectedChatData({
        _id: message.group?._id,
        id: message.group?._id,
        name: message.group?.name,
        description: message.group?.description,
        image: message.group?.image,
        members: message.group?.members,
        isGroup: true,
        conversationKey: message.conversationKey,
      });
    } else {
      const senderId = String(message.sender?._id || message.sender?.id || message.sender);
      const otherParticipant =
        senderId === String(userInfo?.id) ? message.recipient : message.sender;
      setSelectedChatData(otherParticipant);
    }

    setFocusedMessageId(String(message._id || message.id));
    onOpenChat?.();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-24 pt-4 md:px-6 md:pb-5">
      <div className="mb-4 flex items-center justify-end">
        <div className="themed-stat-chip inline-flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-300" />
          <span>{messages.length} saved</span>
        </div>
      </div>

      <div className="scrollbar-hide space-y-3 overflow-y-auto">
        {loading ? (
          <div className="themed-page-card themed-subtitle rounded-[24px] p-5">
            Loading starred messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="themed-page-card rounded-[28px] px-5 py-9 text-center md:px-6 md:py-10">
            <Star className="mx-auto h-10 w-10 text-slate-500" />
            <p className="themed-title mt-4 text-lg font-medium">No starred messages yet</p>
            <p className="themed-subtitle mt-2 text-sm">
              Star important messages from any conversation and they will show up here.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const title =
              message.chatType === "group"
                ? message.group?.name || "Group conversation"
                : [message.sender?.firstName, message.sender?.lastName]
                    .filter(Boolean)
                    .join(" ") || message.sender?.email || "Conversation";

            const preview =
              message.replyPreview?.content ||
              message.content ||
              message.meta?.poll?.question ||
              message.fileUrl ||
              "Message";

            return (
              <button
                key={String(message._id || message.id)}
                type="button"
                onClick={() => openStarredMessage(message)}
                className="themed-page-card themed-card-hover w-full rounded-[26px] p-5 text-left"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="themed-icon-chip h-9 w-9">
                        <MessageSquareText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="themed-title truncate text-base font-semibold">{title}</p>
                        <p className="themed-subtitle truncate text-xs">
                          {new Date(message.timestamp || message.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <p className="themed-subtitle line-clamp-2 text-sm">{preview}</p>
                    <div className="mt-3 flex items-center gap-3 text-xs">
                      <span className="themed-chip rounded-full px-3 py-1.5 capitalize">
                        {message.chatType}
                      </span>
                      {message.isForwarded && (
                        <span className="themed-chip inline-flex items-center gap-1 rounded-full px-3 py-1.5">
                          <Forward className="h-3 w-3" />
                          Forwarded
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowUpRight className="themed-subtitle mt-1 h-4 w-4 shrink-0" />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default StarredPage;
