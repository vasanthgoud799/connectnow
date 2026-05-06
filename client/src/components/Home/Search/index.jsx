import React, { useEffect, useMemo, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/store";
import { ChevronDown, ChevronUp, Search as SearchIcon, Sparkles, X } from "lucide-react";
import MobileSafeHeader from "@/components/ui/MobileSafeHeader";

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
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const {
    selectedChatData,
    selectedChatMessages = [],
    setFocusedMessageId,
  } = useAppStore();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [searchText]);

  const localMessageIds = useMemo(
    () => new Set(selectedChatMessages.map((message) => String(message._id || message.id))),
    [selectedChatMessages]
  );

  const results = useMemo(() => {
    if (!debouncedSearch || !selectedChatData?._id) {
      return [];
    }

    const normalizedQuery = debouncedSearch.toLowerCase();
    return selectedChatMessages.filter((message) => {
      const previewText = [
        message.decryptedContent,
        message.content,
        message.meta?.poll?.question,
        ...(Array.isArray(message.meta?.poll?.options)
          ? message.meta.poll.options.map((option) => option.text)
          : []),
        message.fileName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return previewText.includes(normalizedQuery);
    });
  }, [debouncedSearch, selectedChatData?._id, selectedChatMessages]);

  useEffect(() => {
    setActiveResultIndex(0);
  }, [debouncedSearch, selectedChatData?._id]);

  const resolvePreviewText = (message) => {
    if (message.messageType === "poll") {
      return message.meta?.poll?.question || "Poll";
    }

    return message.content || "Attachment";
  };

  const jumpToMessage = (message) => {
    const targetId = String(message._id || message.id);
    setFocusedMessageId(targetId);
  };

  const jumpToResultIndex = (nextIndex) => {
    if (!results.length) return;
    const boundedIndex = (nextIndex + results.length) % results.length;
    setActiveResultIndex(boundedIndex);
    jumpToMessage(results[boundedIndex]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#08111f]">
      <MobileSafeHeader>
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
        {results.length > 0 && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => jumpToResultIndex(activeResultIndex - 1)}
              className="themed-panel-soft inline-flex h-9 w-9 items-center justify-center rounded-xl"
              aria-label="Previous match"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => jumpToResultIndex(activeResultIndex + 1)}
              className="themed-panel-soft inline-flex h-9 w-9 items-center justify-center rounded-xl"
              aria-label="Next match"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}
      </MobileSafeHeader>

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
        ) : results.length === 0 ? (
          <div className="themed-page-card themed-subtitle rounded-[24px] px-4 py-6 text-center">
            No matching messages found.
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((message, index) => (
              <div
                key={message._id || message.id || message.timestamp}
                className={`themed-page-card cursor-pointer rounded-[24px] p-4 transition hover:scale-[1.01] ${
                  index === activeResultIndex ? "ring-1 ring-cyan-300/40" : ""
                }`}
                onClick={() => {
                  setActiveResultIndex(index);
                  jumpToMessage(message);
                }}
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
