import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  BellOff,
  MessageSquareMore,
  Pin,
  Plus,
  Search,
  Star,
  Trash2,
  UsersRound,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import RouteLoader from "@/components/ui/RouteLoader";
import StatePanel from "@/components/ui/StatePanel";
import ChatListItem from "./ChatListItem";
import { useAppStore } from "@/store";
import { apiClient } from "@/lib/api-client.js";
import {
  CHAT_PREFERENCES_ROUTE,
  DELETE_CHAT_ROUTE,
} from "@/utils/constants.js";
import { useSocket } from "@/context/SocketContext";
import { blurActiveTextInputOnMobile } from "@/hooks/useMobileFocusGuard";

const AddUser = lazy(() => import("./AddUser"));
const CreateGroup = lazy(() => import("./CreateGroup"));

const CHAT_TABS = ["All", "Unread", "Groups", "Favorites"];

function ChatList({ onOpenChat }) {
  const [searchText, setSearchText] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [activeTab, setActiveTab] = useState("All");
  const [activeMenuConversationKey, setActiveMenuConversationKey] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const socket = useSocket();

  const {
    chatSummaries,
    chatSummariesLoaded,
    chatSummariesLoading,
    setSelectedChatData,
    setSelectedConversationKey,
    setChatSummaries,
    setUnreadCount,
    selectedConversationKey,
    updateChatPreference,
    userInfo,
    fetchChatSummaries,
    invalidateContacts,
  } = useAppStore();

  useEffect(() => {
    if (userInfo?.id) {
      fetchChatSummaries({ currentUserId: userInfo.id });
    }
  }, [fetchChatSummaries, userInfo?.id]);

  const filteredChats = useMemo(() => {
    const tabFiltered = chatSummaries.filter((chat) => {
      if (activeTab === "Unread") return Number(chat.unreadCount || 0) > 0;
      if (activeTab === "Groups") return chat.chatType === "group";
      if (activeTab === "Favorites") return Boolean(chat.favorite);
      if (activeTab === "Archived") return Boolean(chat.archived);
      return !chat.archived;
    });

    const normalizedSearch = searchText.trim().toLowerCase();
    if (!normalizedSearch) return tabFiltered;

    return tabFiltered.filter((chat) => {
      const participant = chat.participant || {};
      const group = chat.group || {};
      const haystack =
        `${participant.firstName || ""} ${participant.lastName || ""} ${participant.email || ""} ${group.name || ""} ${group.description || ""} ${chat.title || ""} ${chat.lastMessage?.content || ""}`.toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [activeTab, chatSummaries, searchText]);

  const archivedCount = useMemo(
    () => chatSummaries.filter((chat) => Boolean(chat.archived)).length,
    [chatSummaries]
  );

  const openAddUser = () => {
    blurActiveTextInputOnMobile();
    setShowAddUser(true);
  };

  const openCreateGroup = () => {
    blurActiveTextInputOnMobile();
    setShowCreateGroup(true);
  };

  const savePreference = async (chat, updates) => {
    try {
      const payload = {
        conversationKey: chat.conversationKey,
        ...updates,
      };
      const response = await apiClient.post(CHAT_PREFERENCES_ROUTE, payload, {
        withCredentials: true,
      });
      updateChatPreference(chat.conversationKey, response.data.preference);
      socket?.emit("chat_settings_updated", { conversationKey: chat.conversationKey });
    } catch (error) {
      console.error("Error saving chat preference:", error);
    }
  };

  const handleDeleteChat = async (chat) => {
    try {
      if (chat.chatType === "group") {
        setChatSummaries(
          chatSummaries.filter((item) => item.conversationKey !== chat.conversationKey)
        );
      } else {
        const participantId = chat.participant?._id || chat.participant?.id;
        await apiClient.post(
          DELETE_CHAT_ROUTE,
          { id: participantId },
          { withCredentials: true }
        );
        setChatSummaries(
          chatSummaries.filter((item) => item.conversationKey !== chat.conversationKey)
        );
      }

      if (selectedConversationKey === chat.conversationKey) {
        setSelectedChatData(undefined);
        setSelectedConversationKey(undefined);
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
    } finally {
      setActiveMenuConversationKey(null);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden px-4 pb-2 pt-3 md:px-5 md:pb-5">
     <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-4 md:mb-0">
        <div className="mb-4 flex items-center gap-2.5 md:mb-5 md:gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search conversations..."
              className="themed-input h-12 rounded-[22px] pl-11"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={openAddUser}
            className="themed-panel-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-cyan-300 transition"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={openCreateGroup}
            className="themed-panel-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-pink-300 transition"
          >
            <UsersRound className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2 md:mb-4">
          {CHAT_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                activeTab === tab
                  ? "bg-cyan-400 text-slate-950"
                  : "themed-panel-soft themed-subtitle"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setActiveTab((current) => (current === "Archived" ? "All" : "Archived"))}
          className={`mb-4 flex w-full items-center justify-between rounded-[20px] px-4 py-3 text-sm transition ${
            activeTab === "Archived"
              ? "bg-cyan-400/18 text-cyan-200"
              : "themed-panel-soft themed-subtitle"
          }`}
        >
          <span className="flex items-center gap-3">
            <Archive className="h-4 w-4" />
            <span className="font-medium">Archived</span>
          </span>
          <span
            className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-1 text-[11px] font-semibold ${
              activeTab === "Archived"
                ? "bg-cyan-400 text-slate-950"
                : "bg-white/10 text-slate-300"
            }`}
          >
            {archivedCount}
          </span>
        </button>
        </div>

        <div className="min-h-0 flex-1 pr-1">
          {!chatSummariesLoaded && chatSummariesLoading ? (
            <StatePanel
              title="Loading conversations..."
              description="Preparing your recent chats, unread counts, and pinned threads."
            />
          ) : filteredChats.length === 0 ? (
            <StatePanel
              icon={MessageSquareMore}
              title={searchText.trim() ? "No chats match your search" : "No chats yet"}
              description={
                searchText.trim()
                  ? "Try a different name, email, group, or message keyword."
                  : "Add a contact to start your first conversation."
              }
              dashed
            />
          ) : (
            <div className="no-scrollbar h-full min-h-[260px] space-y-3 overflow-y-auto scroll-smooth pr-1">
              {filteredChats.map((chat) => {
                const participant = chat.participant || {};
                const isGroup = chat.chatType === "group";
                const group = chat.group || {};

                return (
                  <div key={chat.conversationKey}>
                    <ChatListItem
                      chat={chat}
                      isActive={selectedConversationKey === chat.conversationKey}
                      onOpenChat={() => {
                        setSelectedConversationKey(chat.conversationKey);
                        setSelectedChatData(
                          isGroup
                            ? {
                                _id: group._id,
                                id: group._id,
                                name: group.name,
                                description: group.description,
                                image: group.image,
                                members: group.members,
                                memberCount: group.memberCount || group.members?.length || 0,
                                inviteToken: group.inviteToken,
                                isGroup: true,
                                conversationKey: chat.conversationKey,
                              }
                            : participant
                        );
                        setUnreadCount(chat.conversationKey, 0);
                        onOpenChat?.();
                      }}
                      onOpenMenu={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const menuWidth = 208;
                        const menuHeight = 236;
                        const viewportPadding = 16;
                        const fitsBelow =
                          rect.bottom + 8 + menuHeight <= window.innerHeight - viewportPadding;
                        const fitsRight = rect.right >= menuWidth + viewportPadding;

                        setMenuPosition({
                          top: fitsBelow
                            ? rect.bottom + 8
                            : Math.max(viewportPadding, rect.top - menuHeight - 8),
                          left: fitsRight
                            ? Math.max(viewportPadding, rect.right - menuWidth)
                            : viewportPadding,
                        });
                        setActiveMenuConversationKey((current) =>
                          current === chat.conversationKey ? null : chat.conversationKey
                        );
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {activeMenuConversationKey &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[95]"
              onClick={() => setActiveMenuConversationKey(null)}
            />
            {(() => {
              const chat = chatSummaries.find(
                (item) => item.conversationKey === activeMenuConversationKey
              );
              if (!chat) return null;
              const isMuted =
                chat.mutedUntil && new Date(chat.mutedUntil).getTime() > Date.now();

              return (
                <div
                  className="themed-modal-surface fixed z-[100] w-52 rounded-[18px] border border-white/10 p-2 shadow-[0_24px_70px_rgba(2,8,23,0.32)]"
                  style={{ top: menuPosition.top, left: menuPosition.left }}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5"
                    onClick={() => {
                      savePreference(chat, { favorite: !chat.favorite });
                      setActiveMenuConversationKey(null);
                    }}
                  >
                    <Star className="h-4 w-4" />
                    {chat.favorite ? "Remove favorite" : "Add favorite"}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5"
                    onClick={() => {
                      savePreference(chat, {
                        pinnedOrder: Number(chat.pinnedOrder || 0) > 0 ? 0 : Date.now(),
                      });
                      setActiveMenuConversationKey(null);
                    }}
                  >
                    <Pin className="h-4 w-4" />
                    {Number(chat.pinnedOrder || 0) > 0 ? "Unpin chat" : "Pin chat"}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5"
                    onClick={() => {
                      savePreference(chat, {
                        archived: !chat.archived,
                      });
                      setActiveMenuConversationKey(null);
                    }}
                  >
                    <Archive className="h-4 w-4" />
                    {chat.archived ? "Unarchive" : "Archive"}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-white/5"
                    onClick={() => {
                      savePreference(chat, {
                        mutedUntil: isMuted
                          ? null
                          : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
                      });
                      setActiveMenuConversationKey(null);
                    }}
                  >
                    <BellOff className="h-4 w-4" />
                    {isMuted ? "Unmute" : "Mute 8 hours"}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10"
                    onClick={() => handleDeleteChat(chat)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete chat
                  </button>
                </div>
              );
            })()}
          </>,
          document.body
        )}

      {showAddUser &&
        createPortal(
          <Suspense fallback={<RouteLoader message="Loading contacts..." />}>
            <AddUser
              onFriendAdded={() => {
                invalidateContacts();
                fetchChatSummaries({ force: true, currentUserId: userInfo?.id });
                setShowAddUser(false);
              }}
              onClose={() => setShowAddUser(false)}
            />
          </Suspense>,
          document.body
        )}

      {showCreateGroup &&
        createPortal(
          <Suspense fallback={<RouteLoader message="Loading group creator..." />}>
            <CreateGroup
              onClose={() => setShowCreateGroup(false)}
              onCreated={() => {
                fetchChatSummaries({ force: true, currentUserId: userInfo?.id });
                setShowCreateGroup(false);
              }}
            />
          </Suspense>,
          document.body
        )}
    </div>
  );
}

export default ChatList;
