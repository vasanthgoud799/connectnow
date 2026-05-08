import VirtualizedMessageList from "./VirtualizedMessageList";
import TypingIndicator from "./TypingIndicator";
import NewMessagesIndicator from "./NewMessagesIndicator";
import EmptyChatState from "./EmptyChatState";
import ChatErrorState from "./ChatErrorState";
import StatePanel from "@/components/ui/StatePanel";

function MessageList({
  isMobile = false,
  pinnedMessage,
  onJumpToPinned,
  error,
  loading = false,
  messages = [],
  renderMessageRow,
  messageListRef,
  typingLabel,
  hasPendingNewMessages,
  isAtMessageBottom,
  onJumpToLatest,
  onRetry,
}) {
  const hasMessages = Array.isArray(messages) && messages.length > 0;

  return (
    <div className="chat-message-region">
      <div className={`shrink-0 ${isMobile ? "px-3 pt-4" : "px-7 pt-8"}`}>
        <div className={`${isMobile ? "max-w-full" : "mx-auto max-w-5xl"}`}>
          {pinnedMessage ? (
            <div className="themed-page-card flex items-center justify-between gap-4 rounded-[22px] px-4 py-3">
              <div className="min-w-0">
                <p className="themed-section-label mb-1">Pinned message</p>
                <p className="themed-title truncate text-sm font-medium">
                  {pinnedMessage.content ||
                    pinnedMessage.replyPreview?.content ||
                    pinnedMessage.meta?.poll?.question ||
                    "Pinned message"}
                </p>
              </div>
              <button
                type="button"
                className="themed-action-neutral rounded-full px-3 py-1.5 text-xs"
                onClick={onJumpToPinned}
              >
                Jump
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <ChatErrorState message={error} onRetry={onRetry} />
      ) : loading && !hasMessages ? (
        <StatePanel
          title="Loading messages"
          description="Fetching your conversation securely."
          className="mx-4 my-6 rounded-[24px] md:mx-7"
        />
      ) : !hasMessages && !loading ? (
        <EmptyChatState hasSelection />
      ) : (
        <>
          <VirtualizedMessageList
            ref={messageListRef}
            isMobile={isMobile}
            messages={messages}
            renderMessageRow={renderMessageRow}
          />
        </>
      )}
      {!error ? <TypingIndicator label={typingLabel} /> : null}
      {!error && hasPendingNewMessages ? (
        <NewMessagesIndicator
          isAtBottom={isAtMessageBottom}
          onClick={onJumpToLatest}
        />
      ) : null}
    </div>
  );
}

export default MessageList;
