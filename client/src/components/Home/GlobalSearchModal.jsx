import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Loader2,
  MessageSquare,
  Search,
  Users,
  X,
} from "lucide-react";

import { useAppStore } from "@/store";
import { apiClient } from "@/lib/api-client";
import MobileSafeHeader from "@/components/ui/MobileSafeHeader";
import StatePanel from "@/components/ui/StatePanel";
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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [results, setResults] = useState({
    users: [],
    groups: [],
    messages: [],
    files: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("connectnow-recent-searches") || "[]");
    } catch {
      return [];
    }
  });
  const { chatSummaries, userInfo } = useAppStore();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 220);

    return () => clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return undefined;

    if (!debouncedQuery) {
      setResults({ users: [], groups: [], messages: [], files: [] });
      setIsLoading(false);
      setErrorMessage("");
      return undefined;
    }

    const controller = new AbortController();
    let isActive = true;

    setIsLoading(true);
    setErrorMessage("");

    apiClient
      .get(GLOBAL_SEARCH_ROUTE, {
        params: {
          q: debouncedQuery,
          tab: activeTab,
          limit: 25,
        },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!isActive) return;
        setResults({
          users: data?.results?.users || [],
          groups: data?.results?.groups || [],
          messages: data?.results?.messages || [],
          files: data?.results?.files || [],
        });
      })
      .catch((error) => {
        if (!isActive || error?.name === "CanceledError") return;
        setResults({ users: [], groups: [], messages: [], files: [] });
        setErrorMessage(
          error?.response?.data?.message || "Search is unavailable right now."
        );
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [activeTab, debouncedQuery, isOpen]);

  const saveRecentSearch = (value) => {
    if (!value.trim()) return;
    const next = [value, ...recentSearches.filter((item) => item !== value)].slice(0, 6);
    setRecentSearches(next);
    localStorage.setItem("connectnow-recent-searches", JSON.stringify(next));
  };

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
    saveRecentSearch(query.trim());

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

    const messageId = item.messageId || item._id || item.id;
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
        messageId,
      });
      return;
    }

    if (item.chatType === "group" && item.group) {
      onOpenConversation?.({
        type: "group",
        payload: {
          _id: item.group._id,
          id: item.group._id,
          name: item.group.name,
          image: item.group.image,
          isGroup: true,
          conversationKey: item.conversationKey,
        },
        messageId,
      });
      return;
    }

    const currentUserId = String(userInfo?.id || userInfo?._id || "");
    const candidate =
      String(item.sender?._id || item.sender?.id) === currentUserId
        ? item.recipient
        : item.sender;

    if (candidate?._id || candidate?.id) {
      onOpenConversation?.({
        type: "user",
        payload: {
          _id: candidate._id || candidate.id,
          id: candidate._id || candidate.id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          image: candidate.image,
          conversationKey: item.conversationKey,
        },
        messageId,
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-md md:items-center md:p-4">
      <div className="themed-modal-surface themed-chat-canvas flex h-[var(--app-viewport-height,88vh)] w-full max-w-5xl flex-col overflow-hidden rounded-t-[32px] shadow-[0_35px_90px_rgba(2,8,23,0.28)] md:h-[min(82vh,760px)] md:rounded-[32px]">
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
          <div className="grid min-h-0 flex-1 gap-4 overflow-x-hidden overflow-y-auto px-5 pb-5 pr-1 lg:grid-cols-[1.2fr_0.8fr] lg:px-6 lg:pb-6 lg:pr-6">
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
          <div className="scrollbar-hide grid min-h-0 flex-1 gap-3 overflow-x-hidden overflow-y-auto px-5 pb-5 pr-2 md:px-6 md:pb-6">
            {isLoading ? (
              <StatePanel
                icon={Loader2}
                title="Searching"
                description="Looking through your conversations and contacts."
                className="flex-1 rounded-[28px]"
              />
            ) : errorMessage ? (
              <StatePanel
                title="Search failed"
                description={errorMessage}
                className="flex-1 rounded-[28px]"
              />
            ) : flatResults.length ? (
              flatResults.map(({ type, item }) => {
                const title =
                  type === "user"
                    ? [item.firstName, item.lastName].filter(Boolean).join(" ") || item.email
                    : type === "group"
                      ? item.name
                      : item.snippet ||
                        item.content ||
                        item.meta?.poll?.question ||
                        item.fileName ||
                        item.fileUrl ||
                        "Result";

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
                    className="themed-conversation-card flex min-w-0 items-center gap-4 overflow-hidden rounded-[24px] p-4 text-left"
                  >
                    <div className="themed-panel-soft flex h-12 w-12 items-center justify-center rounded-2xl">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="themed-title line-clamp-2 break-words font-medium [overflow-wrap:anywhere]">
                        {title}
                      </p>
                      <p className="themed-subtitle line-clamp-2 break-words text-sm [overflow-wrap:anywhere]">
                        {subtitle}
                      </p>
                    </div>
                    <span className="themed-chip rounded-full px-3 py-1 text-[10px] uppercase">
                      {type}
                    </span>
                  </button>
                );
              })
            ) : (
              <StatePanel
                title="No matches found"
                description="Try a different name, group, email, or message keyword."
                className="flex-1 rounded-[28px]"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GlobalSearchModal;
