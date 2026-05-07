import { Bell, MessageSquare, UserPlus, X } from "lucide-react";
import MobileSafeHeader from "@/components/ui/MobileSafeHeader";
import StatePanel from "@/components/ui/StatePanel";

function NotificationDrawer({
  isOpen,
  notifications = [],
  unreadCount = 0,
  onClose,
  onReadAllNotifications,
  onReadNotification,
  onOpenNotification,
  onAcceptRequest,
  onRejectRequest,
  onAcceptGroupInvite,
  onRejectGroupInvite,
}) {
  if (!isOpen) return null;

  const getIcon = (type) => {
    if (type === "friend_request") return UserPlus;
    return MessageSquare;
  };

  const actionableNotifications = notifications.filter((notification) =>
    ["friend_request", "group_invite"].includes(notification.type)
  );
  const pendingActionableCount = actionableNotifications.filter(
    (notification) => (notification.meta?.requestStatus || "pending") === "pending"
  ).length;
  const otherNotifications = notifications.filter(
    (notification) => !["friend_request", "group_invite"].includes(notification.type)
  );

  return (
    <div className="fixed inset-0 z-[115] bg-slate-950/45 backdrop-blur-sm" onClick={onClose}>
      <div
        className="themed-modal-surface themed-chat-canvas absolute inset-x-0 bottom-0 top-auto flex h-[min(88dvh,760px)] w-full flex-col overflow-hidden rounded-t-[28px] p-0 shadow-[0_28px_80px_rgba(2,8,23,0.28)] md:inset-auto md:right-4 md:top-20 md:h-[min(78vh,720px)] md:w-[min(420px,calc(100vw-2rem))] md:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <MobileSafeHeader className="md:rounded-t-[28px]">
          <div className="min-w-0">
            <p className="themed-title font-['Space_Grotesk'] text-xl font-semibold">
              Notifications
            </p>
            <p className="themed-subtitle text-sm">
              {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onReadAllNotifications}
                className="themed-action-info rounded-full px-3 py-1.5 text-xs"
              >
                Mark all as read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="themed-panel-soft rounded-full p-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </MobileSafeHeader>

        <div className="scrollbar-hide flex-1 space-y-5 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 pr-1 md:px-5 md:pb-5">
          {actionableNotifications.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="themed-title text-sm font-semibold">Requests</p>
                <span className="themed-subtitle text-xs">
                  {pendingActionableCount} pending
                </span>
              </div>
              <div className="space-y-3">
                {actionableNotifications.map((notification) => {
                  const requestStatus = notification.meta?.requestStatus || "pending";
                  const isHandled = requestStatus !== "pending";
                  const senderLabel =
                    notification.type === "group_invite"
                      ? notification.meta?.groupName || "Group invite"
                      :
                    notification.meta?.senderLabel ||
                    notification.senderId?.firstName ||
                    notification.senderId?.email ||
                    "New request";

                  return (
                    <div
                      key={notification._id}
                      className="themed-conversation-card rounded-[22px] p-4 text-left ring-1 ring-cyan-300/30"
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={notification.meta?.senderImage || notification.senderId?.image || "/avatar.png"}
                          alt="sender avatar"
                          className="h-11 w-11 rounded-2xl object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="themed-title truncate text-sm font-medium">{senderLabel}</p>
                          <p className="themed-subtitle mt-1 text-sm">
                            {isHandled
                              ? requestStatus === "accepted"
                                ? notification.type === "group_invite"
                                  ? "You accepted this group invite."
                                  : "You accepted this friend request."
                                : notification.type === "group_invite"
                                  ? "You rejected this group invite."
                                  : "You rejected this friend request."
                              : notification.type === "group_invite"
                                ? "invited you to join a group."
                                : "wants to be your friend."}
                          </p>
                          {isHandled ? (
                            <div className="mt-3">
                              <span
                                className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium ${
                                  requestStatus === "accepted"
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "bg-rose-500/15 text-rose-300"
                                }`}
                              >
                                {requestStatus === "accepted" ? "Accepted" : "Rejected"}
                              </span>
                            </div>
                          ) : (
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                className="themed-action-info rounded-full px-4 py-2 text-xs"
                                onClick={() =>
                                  notification.type === "group_invite"
                                    ? onAcceptGroupInvite?.(notification)
                                    : onAcceptRequest?.(notification)
                                }
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="themed-action-neutral rounded-full px-4 py-2 text-xs"
                                onClick={() =>
                                  notification.type === "group_invite"
                                    ? onRejectGroupInvite?.(notification)
                                    : onRejectRequest?.(notification)
                                }
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {otherNotifications.length ? (
            <div>
              {actionableNotifications.length > 0 && (
                <div className="mb-3 flex items-center justify-between">
                  <p className="themed-title text-sm font-semibold">Activity</p>
                </div>
              )}
              <div className="space-y-3">
            {otherNotifications.map((notification) => {
              const Icon = getIcon(notification.type);
              const isUnread = !notification.readAt;
              return (
                <div
                  key={notification._id}
                  onClick={() => onOpenNotification?.(notification)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenNotification?.(notification);
                    }
                  }}
                  className={`themed-conversation-card w-full rounded-[22px] p-4 text-left ${
                    isUnread ? "ring-1 ring-cyan-300/30" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="themed-panel-soft flex h-10 w-10 items-center justify-center rounded-2xl">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="themed-title truncate text-sm font-medium">
                          {notification.meta?.groupName ||
                            notification.meta?.senderLabel ||
                            notification.type.replace(/_/g, " ")}
                        </p>
                        {isUnread && (
                          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                        )}
                      </div>
                      <p className="themed-subtitle line-clamp-2 text-sm">
                        {notification.meta?.messagePreview ||
                          notification.type.replace(/_/g, " ")}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="themed-subtitle text-xs">
                          {new Date(notification.createdAt).toLocaleString()}
                        </span>
                        {!notification.readAt && (
                          <button
                            type="button"
                            className="themed-action-info rounded-full px-3 py-1.5 text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              onReadNotification?.(notification);
                            }}
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
              </div>
            </div>
          ) : (
            <StatePanel
              icon={Bell}
              title="No notifications yet"
              description="New messages, mentions, and updates will appear here."
              className="h-full rounded-[24px] px-5"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationDrawer;
