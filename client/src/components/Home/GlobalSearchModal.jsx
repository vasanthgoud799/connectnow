import React, { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Image,
  MessageSquare,
  Search,
  Users,
  X,
} from "lucide-react";

import { useAppStore } from "@/store";
import MobileSafeHeader from "@/components/ui/MobileSafeHeader";

const SEARCH_TABS = [
  { id: "all", label: "All" },
  { id: "messages", label: "Messages" },
  { id: "users", label: "Users" },
  { id: "groups", label: "Groups" },
  { id: "files", label: "Files" },
];

function GlobalSearchModal({ isOpen, onClose, onOpenConversation }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("connectnow-recent-searches") || "[]");
    } catch {
      return [];
    }
  });
  const { chatSummaries, contacts, fetchContacts } = useAppStore();

  useEffect(() => {
    if (!isOpen) return;
    fetchContacts();
  }, [fetchContacts, isOpen]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, 220);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const saveRecentSearch = (value) => {
    if (!value.trim()) return;
    const next = [value, ...recentSearches.filter((item) => item !== value)].slice(0, 6);
    setRecentSearches(next);
    localStorage.setItem("connectnow-recent-searches", JSON.stringify(next));
  };

  const results = useMemo(() => {
    if (!debouncedQuery) {
      return { users: [], groups: [], messages: [], files: [] };
    }

    const matchText = (value) => String(value || "").toLowerCase().includes(debouncedQuery);

    const directChats = [];
    const groupChats = [];
    const messageChats = [];
    const fileChats = [];

    chatSummaries.forEach((chat) => {
      const participant = chat.participant || {};
      const group = chat.group || {};
      const lastMessageText =
        chat.lastMessage?.decryptedContent ||
        chat.lastMessage?.content ||
        chat.lastMessage?.messageType ||
        "";

      if (chat.chatType === "group") {
        if (
          matchText(group.name) ||
          matchText(group.description) ||
          matchText(lastMessageText)
        ) {
          groupChats.push(group);
        }
      } else if (
        matchText(participant.firstName) ||
        matchText(participant.lastName) ||
        matchText(participant.email) ||
        matchText(participant.username) ||
        matchText(lastMessageText)
      ) {
        directChats.push(participant);
      }

      if (matchText(lastMessageText)) {
        messageChats.push({
          _id: chat.conversationKey,
          conversationKey: chat.conversationKey,
          content: lastMessageText,
          createdAt: chat.lastMessage?.timestamp || chat.updatedAt,
          sender: chat.participant,
          group: chat.group,
        });
      }

      if (
        ["image", "video", "audio", "document"].includes(chat.lastMessage?.messageType) &&
        (matchText(chat.lastMessage?.content) || matchText(chat.title))
      ) {
        fileChats.push({
          _id: `${chat.conversationKey}:file`,
          conversationKey: chat.conversationKey,
          content: chat.lastMessage?.content || chat.lastMessage?.messageType,
          createdAt: chat.lastMessage?.timestamp || chat.updatedAt,
          group: chat.group,
        });
      }
    });

    const contactMatches = contacts.filter((contact) =>
      [contact.firstName, contact.lastName, contact.email, contact.username]
        .some((value) => matchText(value))
    );

    const dedupeById = (items) =>
      items.filter(
        (item, index, array) =>
          index ===
          array.findIndex((candidate) => String(candidate._id || candidate.id) === String(item._id || item.id))
      );

    return {
      users: dedupeById([...contactMatches, ...directChats]),
      groups: dedupeById(groupChats),
      messages: messageChats,
      files: fileChats,
    };
  }, [chatSummaries, contacts, debouncedQuery]);

  const flatResults = useMemo(() => {
    const mapped = [];
    if (activeTab === "all" || activeTab === "users") {
      mapped.push(...(results.users || []).map((item) => ({ type: "user", item })));
    }
    if (activeTab === "all" || activeTab === "groups") {
      mapped.push(...(results.groups || []).map((item) => ({ type: "group", item })));
    }
    if (activeTab === "all" || activeTab === "messages") {
      mapped.push(...(results.messages || []).map((item) => ({ type: "message", item })));
    }
    if (activeTab === "all" || activeTab === "files") {
      mapped.push(...(results.files || []).map((item) => ({ type: "file", item })));
    }
    return mapped;
  }, [activeTab, results]);

  const openSearchResult = (type, item) => {
    saveRecentSearch(query);

    if (type === "user") {
      onOpenConversation?.({
        type: "user",
        payload: {
          _id: item._id,
          id: item._id,
          firstName: item.firstName,
          lastName: item.lastName,
          email: item.email,
          image: item.image,
        },
      });
      return;
    }

    if (type === "group") {
      const existingChat = chatSummaries.find(
        (chat) => String(chat.group?._id) === String(item._id)
      );
      onOpenConversation?.({
        type: "group",
        payload: {
          _id: item._id,
          id: item._id,
          name: item.name,
          description: item.description,
          image: item.image,
          members: item.members,
          memberCount: item.memberCount || item.members?.length || 0,
          isGroup: true,
          conversationKey: existingChat?.conversationKey || `group:${item._id}`,
        },
      });
      return;
    }

    const existingChat = chatSummaries.find(
      (chat) => chat.conversationKey === item.conversationKey
    );
    if (existingChat) {
      onOpenConversation?.({
        type: existingChat.chatType,
        payload:
          existingChat.chatType === "group"
            ? {
                _id: existingChat.group?._id,
                id: existingChat.group?._id,
                name: existingChat.group?.name,
                description: existingChat.group?.description,
                image: existingChat.group?.image,
                members: existingChat.group?.members,
                memberCount:
                  existingChat.group?.memberCount ||
                  existingChat.group?.members?.length ||
                  0,
                isGroup: true,
                conversationKey: existingChat.conversationKey,
              }
            : existingChat.participant,
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-md md:items-center md:p-4">
      <div className="themed-modal-surface flex h-[var(--app-viewport-height,88vh)] w-full max-w-5xl flex-col overflow-hidden rounded-t-[32px] shadow-[0_35px_90px_rgba(2,8,23,0.28)] md:h-[min(82vh,760px)] md:rounded-[32px]">
        <MobileSafeHeader className="md:rounded-t-[32px]">
          <div>
            <p className="themed-title font-['Space_Grotesk'] text-2xl font-semibold">
              Global search
            </p>
            <p className="themed-subtitle text-sm">
              Search across messages, users, groups, files, and dates.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="themed-panel-soft ml-auto rounded-full p-3"
          >
            <X className="h-4 w-4" />
          </button>
        </MobileSafeHeader>

        <div className="mb-4 flex items-center gap-3 px-5 pt-5 md:px-6">
          <div className="themed-input flex h-13 flex-1 items-center rounded-[22px] px-4 py-3">
            <Search className="themed-subtitle h-4 w-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users, groups, files, dates..."
              className="themed-title flex-1 bg-transparent px-3 outline-none"
            />
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2 px-5 md:px-6">
          {SEARCH_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-2 text-sm transition ${
                activeTab === tab.id
                  ? "bg-cyan-400 text-slate-950"
                  : "themed-panel-soft themed-subtitle"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!debouncedQuery ? (
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 pb-5 pr-1 lg:grid-cols-[1.2fr_0.8fr] lg:overflow-visible lg:px-6 lg:pb-6 lg:pr-6">
            <div className="themed-page-card rounded-[28px] p-6">
              <p className="themed-title mb-3 text-lg font-semibold">Recent searches</p>
              <div className="flex flex-wrap gap-2">
                {recentSearches.length ? (
                  recentSearches.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setQuery(item)}
                      className="themed-chip rounded-full px-3 py-2 text-sm"
                    >
                      {item}
                    </button>
                  ))
                ) : (
                  <p className="themed-subtitle text-sm">
                    Your recent searches will appear here.
                  </p>
                )}
              </div>
            </div>
            <div className="themed-page-card rounded-[28px] p-6">
              <p className="themed-title mb-3 text-lg font-semibold">Saved filters</p>
              <div className="flex flex-wrap gap-2">
                {["today", "images", "groups", "documents"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setQuery(item)}
                    className="themed-chip rounded-full px-3 py-2 text-sm"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="scrollbar-hide grid flex-1 gap-3 overflow-y-auto px-5 pb-5 pr-2 md:px-6 md:pb-6">
            {flatResults.length ? (
              flatResults.map(({ type, item }) => {
                const title =
                  type === "user"
                    ? [item.firstName, item.lastName].filter(Boolean).join(" ") || item.email
                    : type === "group"
                      ? item.name
                      : item.content || item.meta?.poll?.question || item.fileUrl || "Result";

                const subtitle =
                  type === "user"
                    ? item.email
                    : type === "group"
                      ? item.description
                      : item.group?.name ||
                        item.sender?.email ||
                        new Date(item.createdAt || item.timestamp).toLocaleString();

                const Icon =
                  type === "file"
                    ? Image
                    : type === "message"
                      ? MessageSquare
                      : Users;

                return (
                  <button
                    key={`${type}-${item._id}`}
                    type="button"
                    onClick={() => openSearchResult(type, item)}
                    className="themed-conversation-card flex items-center gap-4 rounded-[24px] p-4 text-left"
                  >
                    <div className="themed-panel-soft flex h-12 w-12 items-center justify-center rounded-2xl">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="themed-title truncate font-medium">{title}</p>
                      <p className="themed-subtitle truncate text-sm">{subtitle}</p>
                    </div>
                    <span className="themed-chip rounded-full px-3 py-1 text-[10px] uppercase">
                      {type}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="themed-page-card flex flex-1 items-center justify-center rounded-[28px] text-sm">
                No matches found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GlobalSearchModal;
