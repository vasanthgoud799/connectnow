import React, { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Image,
  MessageSquare,
  Search,
  Users,
  X,
} from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { useAppStore } from "@/store";
import { GLOBAL_SEARCH_ROUTE } from "@/utils/constants";

const SEARCH_TABS = [
  { id: "all", label: "All" },
  { id: "messages", label: "Messages" },
  { id: "users", label: "Users" },
  { id: "groups", label: "Groups" },
  { id: "files", label: "Files" },
];

function GlobalSearchModal({ isOpen, onClose, onOpenConversation }) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [results, setResults] = useState({
    users: [],
    groups: [],
    messages: [],
    files: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("connectnow-recent-searches") || "[]");
    } catch {
      return [];
    }
  });
  const { chatSummaries } = useAppStore();

  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = setTimeout(async () => {
      if (!query.trim()) {
        setResults({ users: [], groups: [], messages: [], files: [] });
        return;
      }

      try {
        setIsLoading(true);
        const response = await apiClient.get(GLOBAL_SEARCH_ROUTE, {
          params: {
            q: query,
            tab: activeTab,
          },
          withCredentials: true,
        });
        setResults(response.data.results || {});
      } catch (error) {
        console.error("Error running global search:", error);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [activeTab, isOpen, query]);

  const saveRecentSearch = (value) => {
    if (!value.trim()) return;
    const next = [value, ...recentSearches.filter((item) => item !== value)].slice(0, 6);
    setRecentSearches(next);
    localStorage.setItem("connectnow-recent-searches", JSON.stringify(next));
  };

  const flatResults = useMemo(
    () => [
      ...(results.users || []).map((item) => ({ type: "user", item })),
      ...(results.groups || []).map((item) => ({ type: "group", item })),
      ...(results.messages || []).map((item) => ({ type: "message", item })),
      ...(results.files || []).map((item) => ({ type: "file", item })),
    ],
    [results]
  );

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
      <div className="themed-modal-surface flex h-[88vh] w-full max-w-5xl flex-col rounded-t-[32px] p-5 shadow-[0_35px_90px_rgba(2,8,23,0.28)] md:h-[min(82vh,760px)] md:rounded-[32px] md:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
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
            className="themed-panel-soft rounded-full p-3"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3">
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

        <div className="mb-5 flex flex-wrap gap-2">
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

        {!query.trim() ? (
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-[1.2fr_0.8fr] lg:overflow-visible lg:pr-0">
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
        ) : isLoading ? (
          <div className="themed-page-card flex flex-1 items-center justify-center rounded-[28px] text-sm">
            Searching...
          </div>
        ) : (
          <div className="scrollbar-hide grid flex-1 gap-3 overflow-y-auto pr-2">
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
