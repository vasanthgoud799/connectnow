import React, { useEffect, useMemo, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/store";
import { Search as SearchIcon, Sparkles, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { SEARCH_MESSAGES_ROUTE } from "@/utils/constants";

function highlightMatch(text, query) {
  if (!query.trim()) return text;

  const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${safeQuery})`, "ig");
  const parts = String(text).split(regex);

  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="rounded bg-cyan-300/35 px-1 text-inherit">
        {part}
      </mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    )
  );
}

function Search({ onClose }) {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const {
    selectedChatData,
    selectedConversationKey,
    selectedChatMessages = [],
    setSelectedChatMessages,
    setFocusedMessageId,
  } = useAppStore();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [searchText]);

  useEffect(() => {
    const runSearch = async () => {
      if (!debouncedSearch || !selectedChatData?._id) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await apiClient.post(
          SEARCH_MESSAGES_ROUTE,
          selectedChatData?.isGroup
            ? { groupId: selectedChatData._id, query: debouncedSearch, conversationKey: selectedConversationKey }
            : { userId: selectedChatData._id, query: debouncedSearch, conversationKey: selectedConversationKey },
          { withCredentials: true }
        );

        setResults(response.data.messages || []);
      } catch (error) {
        console.error("Error searching messages:", error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    runSearch();
  }, [debouncedSearch, selectedChatData, selectedConversationKey]);

  const localMessageIds = useMemo(
    () => new Set(selectedChatMessages.map((message) => String(message._id || message.id))),
    [selectedChatMessages]
  );

  const resolvePreviewText = (message) => {
    if (message.messageType === "poll") {
      return message.meta?.poll?.question || "Poll";
    }

    return message.content || "Attachment";
  };

  const jumpToMessage = (message) => {
    const targetId = String(message._id || message.id);
    if (!localMessageIds.has(targetId)) {
      const mergedMessages = [...selectedChatMessages, message].sort(
        (a, b) => new Date(a.timestamp || a.createdAt || 0).getTime() - new Date(b.timestamp || b.createdAt || 0).getTime()
      );
      setSelectedChatMessages(mergedMessages);
    }

    setFocusedMessageId(targetId);
  };

  return (
    <div className="flex h-full flex-col bg-[#08111f]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#08111f] px-4 py-4">
        <button
          type="button"
          className="themed-panel-soft inline-flex h-10 w-10 items-center justify-center rounded-2xl"
          onClick={onClose}
          aria-label="Close search"
        >
          <X className="themed-title h-[18px] w-[18px]" />
        </button>
        <div className="flex-1">
          <p className="themed-title font-['Space_Grotesk'] text-xl font-semibold">Search messages</p>
          <p className="themed-subtitle text-xs">Find text inside the current conversation</p>
        </div>
      </div>

      <div className="p-4">
        <div className="themed-input flex items-center rounded-[24px] px-4 py-3">
          <SearchIcon className="themed-subtitle h-4 w-4" />
          <input
            type="text"
            placeholder="Search in this chat"
            className="themed-title themed-subtitle flex-1 bg-transparent px-3 outline-none"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>

      <Separator className="bg-white/10" />

      <div className="scrollbar-hide flex-1 overflow-y-auto p-4">
        {!searchText.trim() ? (
          <div className="themed-page-card flex h-full flex-col items-center justify-center rounded-[28px] border-dashed px-6 text-center">
            <Sparkles className="h-10 w-10 text-cyan-200/70" />
            <p className="themed-title mt-4 font-medium">Search inside this conversation</p>
            <p className="themed-subtitle mt-2 text-sm leading-6">
              Results will appear here as you type. This keeps search focused and fast.
            </p>
          </div>
        ) : isLoading ? (
          <div className="themed-page-card themed-subtitle rounded-[24px] px-4 py-6 text-center">
            Searching messages...
          </div>
        ) : results.length === 0 ? (
          <div className="themed-page-card themed-subtitle rounded-[24px] px-4 py-6 text-center">
            No matching messages found.
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((message) => (
              <div
                key={message._id || message.id || message.timestamp}
                className="themed-page-card cursor-pointer rounded-[24px] p-4 transition hover:scale-[1.01]"
                onClick={() => jumpToMessage(message)}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="themed-title text-sm leading-6">
                    {highlightMatch(resolvePreviewText(message), searchText)}
                  </p>
                  {!localMessageIds.has(String(message._id || message.id)) && (
                    <span className="themed-chip shrink-0 rounded-full px-2 py-1 text-[10px]">
                      Older
                    </span>
                  )}
                </div>
                <p className="themed-subtitle mt-2 text-xs">
                  {new Date(message.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Search;
