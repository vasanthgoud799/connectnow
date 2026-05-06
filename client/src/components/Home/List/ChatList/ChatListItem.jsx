import { BellOff, MoreHorizontal, Pin, Star } from "lucide-react";

function ChatListItem({
  chat,
  isActive,
  onOpenChat,
  onOpenMenu,
}) {
  const participant = chat.participant || {};
  const isGroup = chat.chatType === "group";
  const group = chat.group || {};
  const title =
    chat.title ||
    group.name ||
    [participant.firstName, participant.lastName].filter(Boolean).join(" ") ||
    participant.email;
  const subtitle =
    chat.lastMessage?.content ||
    (isGroup ? group.description || "Tap to start group chatting" : "Tap to start chatting");
  const avatar = isGroup ? group.image || "/avatar.png" : participant.image || "/avatar.png";
  const isMuted = chat.mutedUntil && new Date(chat.mutedUntil).getTime() > Date.now();

  return (
    <div
      className={`themed-conversation-card relative flex items-center gap-3 overflow-visible rounded-[26px] p-3 ${
        isActive ? "z-40 themed-conversation-card-active" : "z-0"
      }`}
    >
      <button
        type="button"
        data-testid={`chat-list-item-${chat.conversationKey}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onOpenChat}
      >
        <img
          src={avatar}
          alt="avatar"
          className="themed-glow-avatar h-14 w-14 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="themed-title truncate text-[1.03rem] font-semibold">
                {title}
              </span>
              {Boolean(chat.favorite) && (
                <Star className="h-3.5 w-3.5 fill-current text-amber-300" />
              )}
              {Number(chat.pinnedOrder || 0) > 0 && (
                <Pin className="h-3.5 w-3.5 text-cyan-300" />
              )}
              {isMuted && <BellOff className="h-3.5 w-3.5 text-slate-400" />}
            </div>
            {chat.lastMessage?.timestamp && (
              <span className="themed-subtitle shrink-0 text-[11px]">
                {new Date(chat.lastMessage.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="themed-subtitle truncate text-[0.95rem]">{subtitle}</p>
            {chat.unreadCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1.5 text-[10px] font-semibold text-slate-950">
                {chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="relative z-20 shrink-0">
        <button
          type="button"
          className="themed-panel-soft rounded-full p-2"
          onClick={onOpenMenu}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default ChatListItem;
