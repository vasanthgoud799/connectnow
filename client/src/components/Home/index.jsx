import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/clerk-react";
import { AnimatePresence, motion } from "framer-motion";
import { connect } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  Home as HomeIcon,
  LogOut,
  MessageSquare,
  PencilLine,
  Phone,
  Settings,
  Star,
  UsersRound,
  Waves,
} from "lucide-react";
import { toast } from "sonner";

import List from "./List";
import UserInfo from "./List/UserInfo";

import { apiClient } from "@/lib/api-client";
import { clearPersistedAppSession } from "@/lib/api-client";
import { clearE2EEClientState } from "@/crypto/e2eeService";
import { useAppStore } from "@/store";
import { isDirectCallVisible } from "@/store/actions/callActions";
import {
  ACCEPT_FRIEND_REQUEST_ROUTE,
  ACCEPT_GROUP_INVITE_ROUTE,
  JOIN_GROUP_INVITE_ROUTE,
  LOGOUT_ROUTE,
  NOTIFICATIONS_ROUTE,
  REJECT_FRIEND_REQUEST_ROUTE,
  REJECT_GROUP_INVITE_ROUTE,
} from "@/utils/constants";
import { registerNewUser } from "@/utils/wssConnection/wssConnection";
import { useSocket } from "@/context/SocketContext";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";
import RouteLoader from "@/components/ui/RouteLoader";
import {
  getFocusCallFromNotificationEventName,
  getOpenChatFromNotificationEventName,
} from "@/utils/browserNotifications";

const Chat = lazy(() => import("./Chat"));
const Detail = lazy(() => import("./Detail"));
const Search = lazy(() => import("./Search"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const CallsPage = lazy(() => import("./pages/CallsPage"));
const StarredPage = lazy(() => import("./pages/StarredPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const DirectCall = lazy(() => import("./Dashboard/components/DirectCall/DirectCall"));
const GlobalSearchModal = lazy(() => import("./GlobalSearchModal"));
const NotificationDrawer = lazy(() => import("./NotificationDrawer"));

function Home({ activeUsers = [], callState }) {
  const { signOut } = useClerk();
  const {
    userInfo,
    setUserInfo,
    setNotifications,
    setNotificationUnreadCount,
    addNotification,
    markNotificationRead,
    notifications,
    notificationUnreadCount,
    setSelectedChatData,
    setFocusedMessageId,
    chatSummaries,
    selectedChatData,
    setActiveHomeSection: setStoredActiveHomeSection,
    setMobileChatView: setStoredMobileChatView,
  } = useAppStore();
  const navigate = useNavigate();
  const socket = useSocket();
  const { isMobile } = useResponsiveLayout();
  useVisualViewportHeight();

  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [activeSection, setActiveSection] = useState("chats");
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileChatView, setMobileChatView] = useState(() =>
    window.innerWidth <= 768 ? "list" : "chat"
  );
  const [forceOpenMobileChat, setForceOpenMobileChat] = useState(false);
  const previousSectionRef = useRef(activeSection);

  useEffect(() => {
    document.body.classList.add("app-shell-body");

    return () => {
      document.body.classList.remove("app-shell-body");
    };
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileChatView("chat");
    }
  }, [isMobile]);

  useEffect(() => {
    setStoredActiveHomeSection(activeSection);
  }, [activeSection, setStoredActiveHomeSection]);

  useEffect(() => {
    setStoredMobileChatView(mobileChatView);
  }, [mobileChatView, setStoredMobileChatView]);

  useEffect(() => {
    if (!isMobile) return;

    if (activeSection === "chats" && forceOpenMobileChat && selectedChatData) {
      setMobileChatView("chat");
      previousSectionRef.current = activeSection;
      setForceOpenMobileChat(false);
      return;
    }

    if (activeSection !== "chats") {
      setMobileChatView("list");
      previousSectionRef.current = activeSection;
      return;
    }

    if (previousSectionRef.current !== "chats") {
      setMobileChatView("list");
      previousSectionRef.current = activeSection;
      return;
    }

    if (selectedChatData) {
      setMobileChatView("chat");
      previousSectionRef.current = activeSection;
      return;
    }

    setMobileChatView("list");
    previousSectionRef.current = activeSection;
  }, [activeSection, forceOpenMobileChat, isMobile, selectedChatData]);

  useEffect(() => {
    if (userInfo?.id) {
      registerNewUser(userInfo);
    }
  }, [userInfo]);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const response = await apiClient.get(NOTIFICATIONS_ROUTE, {
          withCredentials: true,
        });
        setNotifications(response.data.notifications || []);
        setNotificationUnreadCount(response.data.unreadCount || 0);
      } catch (error) {
        console.error("Error loading notifications:", error);
      }
    };

    if (userInfo?.id) {
      loadNotifications();
    }
  }, [setNotificationUnreadCount, setNotifications, userInfo?.id]);

  useEffect(() => {
    if (!socket) return;

    const handleNotificationCreated = ({ notification, unreadCount }) => {
      addNotification(notification, unreadCount);

    };

    const handleNotificationRead = ({ notificationId, unreadCount }) => {
      markNotificationRead(notificationId, unreadCount);
    };

    const handleChatSettingsUpdated = () => {};
    const handleFriendRequestReceived = ({ request }) => {
      if (!userInfo) return;
      setUserInfo({
        ...userInfo,
        receivedRequests: [
          ...new Set([
            ...(userInfo.receivedRequests || []),
            String(request.senderId?._id || request.senderId),
          ]),
        ],
      });
    };
    const handleFriendRequestAccepted = ({ request }) => {
      const senderId = String(request.senderId?._id || request.senderId);
      const receiverId = String(request.receiverId?._id || request.receiverId);

      if (!userInfo) return;
      setUserInfo({
        ...userInfo,
        friends: [
          ...new Set([
            ...(userInfo.friends || []),
            userInfo.id === senderId ? receiverId : senderId,
          ]),
        ],
        sentRequests: (userInfo.sentRequests || []).filter(
          (id) => String(id) !== receiverId && String(id) !== senderId
        ),
        receivedRequests: (userInfo.receivedRequests || []).filter(
          (id) => String(id) !== receiverId && String(id) !== senderId
        ),
      });
    };
    const handleNotificationUpdate = async () => {
      try {
        const response = await apiClient.get(NOTIFICATIONS_ROUTE, {
          withCredentials: true,
        });
        setNotifications(response.data.notifications || []);
        setNotificationUnreadCount(response.data.unreadCount || 0);
      } catch (error) {
        console.error("Error refreshing notifications:", error);
      }
    };

    socket.on("notification_created", handleNotificationCreated);
    socket.on("notification_read", handleNotificationRead);
    socket.on("chat_settings_updated", handleChatSettingsUpdated);
    socket.on("friend_request_received", handleFriendRequestReceived);
    socket.on("friend_request_accepted", handleFriendRequestAccepted);
    socket.on("notification_update", handleNotificationUpdate);

    return () => {
      socket.off("notification_created", handleNotificationCreated);
      socket.off("notification_read", handleNotificationRead);
      socket.off("chat_settings_updated", handleChatSettingsUpdated);
      socket.off("friend_request_received", handleFriendRequestReceived);
      socket.off("friend_request_accepted", handleFriendRequestAccepted);
      socket.off("notification_update", handleNotificationUpdate);
    };
  }, [
    addNotification,
    markNotificationRead,
    setNotificationUnreadCount,
    setNotifications,
    setUserInfo,
    socket,
    userInfo,
  ]);

  useEffect(() => {
    const handleOpenConversation = (event) => {
      const payload = event?.detail?.payload;
      const messageId = event?.detail?.messageId;
      if (!payload) return;

      setActiveSection("chats");
      setSelectedChatData(payload);
      setFocusedMessageId(messageId || undefined);
      if (isMobile) {
        setForceOpenMobileChat(true);
        setMobileChatView("chat");
      }
      setIsGlobalSearchOpen(false);
      setIsNotificationsOpen(false);
      setIsDetailVisible(false);
      setIsSearchVisible(false);
    };

    const openConversationByKey = (conversationKey, messageId) => {
      const matchingChat = chatSummaries.find(
        (chat) => chat.conversationKey === conversationKey
      );
      if (!matchingChat) return false;

      setActiveSection("chats");
      setSelectedChatData(
        matchingChat.chatType === "group"
          ? {
              _id: matchingChat.group?._id,
              id: matchingChat.group?._id,
              name: matchingChat.group?.name,
              description: matchingChat.group?.description,
              image: matchingChat.group?.image,
              members: matchingChat.group?.members,
              memberCount:
                matchingChat.group?.memberCount ||
                matchingChat.group?.members?.length ||
                0,
              inviteToken: matchingChat.group?.inviteToken,
              isGroup: true,
              conversationKey: matchingChat.conversationKey,
            }
          : matchingChat.participant
      );
      setFocusedMessageId(messageId || undefined);
      if (isMobile) {
        setForceOpenMobileChat(true);
        setMobileChatView("chat");
      }
      setIsGlobalSearchOpen(false);
      setIsNotificationsOpen(false);
      setIsDetailVisible(false);
      setIsSearchVisible(false);
      return true;
    };

    const handleServiceWorkerNotificationClick = (event) => {
      if (event?.data?.type !== "CONNECTNOW_NOTIFICATION_CLICK") return;
      const data = event.data.data || {};
      if (data.notificationKind === "call") {
        handleFocusCall();
        return;
      }
      if (data.conversationKey) {
        openConversationByKey(data.conversationKey, data.messageId);
      }
    };

    const handleFocusCall = () => {
      setActiveSection("chats");
      if (isMobile) {
        setForceOpenMobileChat(true);
        setMobileChatView("chat");
      }
      setIsGlobalSearchOpen(false);
      setIsNotificationsOpen(false);
    };

    window.addEventListener(
      getOpenChatFromNotificationEventName(),
      handleOpenConversation
    );
    window.addEventListener(
      getFocusCallFromNotificationEventName(),
      handleFocusCall
    );
    navigator.serviceWorker?.addEventListener?.(
      "message",
      handleServiceWorkerNotificationClick
    );

    const notificationConversation = new URLSearchParams(window.location.search).get(
      "conversation"
    );
    const notificationMessage = new URLSearchParams(window.location.search).get("message");
    const notificationFocus = new URLSearchParams(window.location.search).get("focus");
    if (notificationFocus === "call") {
      handleFocusCall();
      window.history.replaceState(null, "", window.location.pathname);
    } else if (notificationConversation) {
      if (openConversationByKey(notificationConversation, notificationMessage)) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    return () => {
      window.removeEventListener(
        getOpenChatFromNotificationEventName(),
        handleOpenConversation
      );
      window.removeEventListener(
        getFocusCallFromNotificationEventName(),
        handleFocusCall
      );
      navigator.serviceWorker?.removeEventListener?.(
        "message",
        handleServiceWorkerNotificationClick
      );
    };
  }, [chatSummaries, isMobile, setFocusedMessageId, setSelectedChatData]);

  useEffect(() => {
    if (!userInfo.profileSetUp) {
      toast("Please setup profile to continue.");
      navigate("/profile");
    }
  }, [userInfo, navigate]);

  const toggleDetail = () => {
    setIsSearchVisible(false);
    setIsDetailVisible((prev) => !prev);
  };

  const toggleSearch = () => {
    setIsDetailVisible(false);
    setIsSearchVisible((prev) => !prev);
  };

  const returnToMobileChatList = () => {
    setMobileChatView("list");
    setIsDetailVisible(false);
    setIsSearchVisible(false);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setIsProfileMenuOpen(false);
    setIsNotificationsOpen(false);
    setIsGlobalSearchOpen(false);
    setIsDetailVisible(false);
    setIsSearchVisible(false);
    setSelectedChatData(undefined);
    setFocusedMessageId(undefined);
    setNotifications([]);
    setNotificationUnreadCount(0);
    clearPersistedAppSession();
    await clearE2EEClientState();
    setUserInfo(undefined);
    navigate("/auth", { replace: true });

    try {
      await Promise.allSettled([
        apiClient.post(LOGOUT_ROUTE, {}, { withCredentials: true }),
        signOut(),
      ]);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const openConversationFromGlobalSearch = ({ payload }) => {
    setActiveSection("chats");
    setSelectedChatData(payload);
    setFocusedMessageId(undefined);
    if (isMobile) {
      setForceOpenMobileChat(true);
      setMobileChatView("chat");
    }
    setIsGlobalSearchOpen(false);
  };

  const openNotification = async (notification) => {
    if (notification.type === "friend_request") {
      return;
    }

    if (!notification.readAt) {
      try {
        const response = await apiClient.post(
          `${NOTIFICATIONS_ROUTE}/${notification._id}/read`,
          {},
          { withCredentials: true }
        );
        markNotificationRead(notification._id, response.data.unreadCount);
      } catch (error) {
        console.error("Error marking notification read:", error);
      }
    }

    if (notification.meta?.conversationKey) {
      const matchingChat = chatSummaries.find(
        (chat) => chat.conversationKey === notification.meta?.conversationKey
      );
      if (matchingChat) {
        setSelectedChatData(
          matchingChat.chatType === "group"
            ? {
                _id: matchingChat.group?._id,
                id: matchingChat.group?._id,
                name: matchingChat.group?.name,
                description: matchingChat.group?.description,
                image: matchingChat.group?.image,
                members: matchingChat.group?.members,
                memberCount:
                  matchingChat.group?.memberCount ||
                  matchingChat.group?.members?.length ||
                  0,
                inviteToken: matchingChat.group?.inviteToken,
                isGroup: true,
                conversationKey: matchingChat.conversationKey,
              }
            : matchingChat.participant
        );
      }
      setFocusedMessageId(undefined);
      setActiveSection("chats");
      setIsNotificationsOpen(false);
    }
  };

  const reloadNotifications = async () => {
    try {
      const response = await apiClient.get(NOTIFICATIONS_ROUTE, {
        withCredentials: true,
      });
      setNotifications(response.data.notifications || []);
      setNotificationUnreadCount(response.data.unreadCount || 0);
    } catch (error) {
      console.error("Error loading notifications:", error);
    }
  };

  const handleAcceptFriendRequest = async (notification) => {
    try {
      const requestId = notification.referenceId || notification.meta?.requestId;
      const response = await apiClient.post(
        `${ACCEPT_FRIEND_REQUEST_ROUTE}/${requestId}`,
        {},
        { withCredentials: true }
      );

      const request = response.data.request;
      const senderId = String(request.senderId?._id || request.senderId);

      setUserInfo({
        ...userInfo,
        friends: [...new Set([...(userInfo?.friends || []), senderId])],
        receivedRequests: (userInfo?.receivedRequests || []).filter(
          (id) => String(id) !== senderId
        ),
      });
      setNotifications(
        notifications.map((item) =>
          String(item._id) === String(notification._id)
            ? {
                ...item,
                readAt: new Date().toISOString(),
                meta: {
                  ...item.meta,
                  requestStatus: "accepted",
                  handledAt: new Date().toISOString(),
                },
              }
            : item
        )
      );
      await reloadNotifications();
      toast.success("Friend request accepted");
    } catch (error) {
      console.error("Error accepting friend request:", error);
      toast.error(error.response?.data?.message || "Unable to accept request.");
    }
  };

  const handleRejectFriendRequest = async (notification) => {
    try {
      const requestId = notification.referenceId || notification.meta?.requestId;
      const response = await apiClient.post(
        `${REJECT_FRIEND_REQUEST_ROUTE}/${requestId}`,
        {},
        { withCredentials: true }
      );

      const request = response.data.request;
      const senderId = String(request.senderId?._id || request.senderId);

      setUserInfo({
        ...userInfo,
        receivedRequests: (userInfo?.receivedRequests || []).filter(
          (id) => String(id) !== senderId
        ),
      });
      setNotifications(
        notifications.map((item) =>
          String(item._id) === String(notification._id)
            ? {
                ...item,
                readAt: new Date().toISOString(),
                meta: {
                  ...item.meta,
                  requestStatus: "rejected",
                  handledAt: new Date().toISOString(),
                },
              }
            : item
        )
      );
      await reloadNotifications();
      toast.success("Friend request rejected");
    } catch (error) {
      console.error("Error rejecting friend request:", error);
      toast.error(error.response?.data?.message || "Unable to reject request.");
    }
  };

  const handleAcceptGroupInvite = async (notification) => {
    try {
      const inviteId = notification.referenceId || notification.meta?.inviteId;
      const response = await apiClient.post(
        `${ACCEPT_GROUP_INVITE_ROUTE}/${inviteId}/accept`,
        {},
        { withCredentials: true }
      );

      const acceptedGroup = response.data.group;

      setSelectedChatData({
        _id: acceptedGroup._id,
        id: acceptedGroup._id,
        name: acceptedGroup.name,
        description: acceptedGroup.description,
        image: acceptedGroup.image,
        members: acceptedGroup.members,
        inviteToken: acceptedGroup.inviteToken,
        isGroup: true,
        conversationKey: `group:${acceptedGroup._id}`,
      });
      setActiveSection("chats");
      setIsNotificationsOpen(false);
      setNotifications(
        notifications.map((item) =>
          String(item._id) === String(notification._id)
            ? {
                ...item,
                readAt: new Date().toISOString(),
                meta: {
                  ...item.meta,
                  requestStatus: "accepted",
                  handledAt: new Date().toISOString(),
                },
              }
            : item
        )
      );
      await reloadNotifications();
      toast.success("Joined group");
    } catch (error) {
      console.error("Error accepting group invite:", error);

      const fallbackToken = notification.meta?.inviteToken;
      if (!fallbackToken) {
        toast.error(error.response?.data?.message || "Unable to accept group invite.");
        return;
      }

      try {
        const response = await apiClient.post(
          `${JOIN_GROUP_INVITE_ROUTE}/${fallbackToken}`,
          {},
          { withCredentials: true }
        );
        const acceptedGroup = response.data.group;
        setSelectedChatData({
          _id: acceptedGroup._id,
          id: acceptedGroup._id,
          name: acceptedGroup.name,
          description: acceptedGroup.description,
          image: acceptedGroup.image,
          members: acceptedGroup.members,
          inviteToken: acceptedGroup.inviteToken,
          isGroup: true,
          conversationKey: `group:${acceptedGroup._id}`,
        });
        setActiveSection("chats");
        setIsNotificationsOpen(false);
        setNotifications(
          notifications.map((item) =>
            String(item._id) === String(notification._id)
              ? {
                  ...item,
                  readAt: new Date().toISOString(),
                  meta: {
                    ...item.meta,
                    requestStatus: "accepted",
                    handledAt: new Date().toISOString(),
                  },
                }
              : item
          )
        );
        await reloadNotifications();
        toast.success("Joined group");
      } catch (joinError) {
        console.error("Error accepting group invite through token:", joinError);
        toast.error(joinError.response?.data?.message || "Unable to accept group invite.");
      }
    }
  };

  const handleRejectGroupInvite = async (notification) => {
    try {
      const inviteId = notification.referenceId || notification.meta?.inviteId;
      await apiClient.post(
        `${REJECT_GROUP_INVITE_ROUTE}/${inviteId}/reject`,
        {},
        { withCredentials: true }
      );
      setNotifications(
        notifications.map((item) =>
          String(item._id) === String(notification._id)
            ? {
                ...item,
                readAt: new Date().toISOString(),
                meta: {
                  ...item.meta,
                  requestStatus: "rejected",
                  handledAt: new Date().toISOString(),
                },
              }
            : item
        )
      );
      await reloadNotifications();
      toast.success("Group invite rejected");
    } catch (error) {
      console.error("Error rejecting group invite:", error);
      toast.error(error.response?.data?.message || "Unable to reject group invite.");
    }
  };

  const sidebarItems = [
    { id: "chats", label: "Chats", icon: MessageSquare },
    { id: "contacts", label: "Contacts", icon: UsersRound },
    { id: "calls", label: "Calls", icon: Phone },
    { id: "starred", label: "Starred", icon: Star },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const pageTitleMap = {
    chats: "Messages",
    contacts: "Contacts",
    calls: "Calls",
    starred: "Starred",
    settings: "Settings",
  };

  return (
    <div className="themed-shell mobile-app-shell relative w-full overflow-hidden">
      {isLoggingOut && (
        <div className="absolute inset-0 z-[140] flex items-center justify-center bg-[#07111f]/95 px-6 text-white">
          <div className="glass-panel rounded-[28px] px-8 py-6 text-center">
            <p className="font-['Space_Grotesk'] text-2xl font-semibold">
              Signing you out
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Closing your session and returning to auth.
            </p>
          </div>
        </div>
      )}
      <Suspense fallback={null}>
        <DirectCall />
      </Suspense>

      {!isDirectCallVisible(callState) && (
        <div className="app-viewport-shell relative flex w-full max-w-full overflow-hidden">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              animate={{ x: [0, 60, 0], y: [0, -40, 0] }}
              transition={{ repeat: Infinity, duration: 18 }}
              className="absolute -left-24 -top-20 h-96 w-96 rounded-full bg-pink-500/8 blur-[140px]"
            />
            <motion.div
              animate={{ x: [0, -70, 0], y: [0, 40, 0] }}
              transition={{ repeat: Infinity, duration: 16 }}
              className="absolute right-0 top-16 h-96 w-96 rounded-full bg-cyan-500/8 blur-[140px]"
            />
            <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-indigo-500/8 blur-[140px]" />
          </div>

          <div className="relative z-10 flex min-w-0 w-full">
            <aside className="themed-sidebar hidden w-[98px] flex-col justify-between border-r py-6 md:flex">
              <div className="flex flex-col items-center gap-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br from-[#ef5da8] via-[#9b8cff] to-[#68d8ff] shadow-[0_18px_40px_rgba(104,216,255,0.22)]">
                  <Waves className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col items-center gap-4">
                  {sidebarItems.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setActiveSection(id);
                        setIsDetailVisible(false);
                        setIsSearchVisible(false);
                      }}
                      className={`themed-nav-button flex flex-col items-center gap-2 transition ${
                        activeSection === id ? "themed-nav-button-active" : ""
                      }`}
                    >
                      <span className="themed-nav-icon">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-[11px]">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative flex flex-col items-center gap-5">
                {isProfileMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsProfileMenuOpen(false)}
                    />
                    <div className="themed-modal-surface absolute bottom-16 left-[1.15rem] z-50 w-64 rounded-[22px] border border-white/10 p-4 shadow-[0_24px_70px_rgba(2,8,23,0.32)]">
                      <div className="flex items-center gap-3">
                        <img
                          src={userInfo?.image || "/avatar.png"}
                          alt="profile avatar"
                          className="themed-glow-avatar h-12 w-12 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <p className="themed-title truncate text-sm font-semibold">
                            {userInfo?.firstName || "Guest"}
                          </p>
                          <p className="themed-subtitle truncate text-xs">
                            {userInfo?.email}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <button
                          type="button"
                          data-testid="home-logout-button"
                          className="themed-panel-soft flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition hover:opacity-90"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            navigate("/profile");
                            toast.success("Edit your profile");
                          }}
                        >
                          <PencilLine className="h-4 w-4" />
                          Edit profile
                        </button>
                        <button
                          type="button"
                          className="themed-panel-soft flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition hover:opacity-90"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            handleLogout();
                          }}
                        >
                          <LogOut className="h-4 w-4" />
                          Logout
                        </button>
                      </div>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  data-testid="home-profile-menu-button"
                  onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                  className="themed-glow-avatar flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#6366f1] font-semibold uppercase text-white transition hover:scale-[1.03]"
                >
                  {userInfo?.firstName?.[0] || "C"}
                </button>
              </div>
            </aside>

              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {!(activeSection === "chats" && isMobile && mobileChatView === "chat") && (
                <UserInfo
                  onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
                  onOpenNotifications={() => setIsNotificationsOpen(true)}
                  onLogout={handleLogout}
                  notificationUnreadCount={notificationUnreadCount}
                  activeUsers={activeUsers}
                  pageTitle={pageTitleMap[activeSection] || "Messages"}
                />
              )}

              <div className="flex min-h-0 flex-1">
                {activeSection === "chats" ? (
                  isMobile ? (
                    <AnimatePresence mode="wait" initial={false}>
                      {mobileChatView === "list" ? (
                        <motion.div
                          key="mobile-chat-list"
                          initial={{ x: -32, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          exit={{ x: -32, opacity: 0 }}
                          transition={{ duration: 0.24 }}
                          className="themed-main-panel flex min-h-0 w-full max-w-full flex-1 overflow-hidden"
                        >
                          <List onOpenChat={() => setMobileChatView("chat")} />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="mobile-chat-window"
                          initial={{ x: 48, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          exit={{ x: 48, opacity: 0 }}
                          transition={{ duration: 0.24 }}
                          className="relative flex min-h-0 w-full max-w-full flex-1 overflow-hidden"
                        >
                        <div className="themed-main-panel themed-chat-canvas relative min-h-0 flex-1 overflow-hidden">
                          <Suspense fallback={<RouteLoader message="Loading chat..." />}>
                            <Chat
                              isMobile
                                onBack={returnToMobileChatList}
                                onToggleDetail={toggleDetail}
                                onToggleSearch={toggleSearch}
                              />
                            </Suspense>
                          </div>

                          <AnimatePresence>
                            {(isDetailVisible || isSearchVisible) && (
                              <motion.div
                                initial={{ x: 36, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: 36, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="absolute inset-0 z-[80] overflow-hidden bg-[#08111f]"
                              >
                                {isDetailVisible && (
                                  <Suspense fallback={<RouteLoader message="Loading chat details..." />}>
                                    <Detail onClose={toggleDetail} />
                                  </Suspense>
                                )}
                                {isSearchVisible && (
                                  <Suspense fallback={<RouteLoader message="Loading search..." />}>
                                    <Search onClose={toggleSearch} />
                                  </Suspense>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  ) : (
                    <>
                      <motion.div
                        initial={{ x: -30, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.4 }}
                        className="themed-main-panel border-r"
                      >
                        <List />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.08 }}
                        className="flex min-w-0 flex-1"
                      >
                        <div className="themed-main-panel themed-chat-canvas relative min-h-0 flex-1">
                          <Suspense fallback={<RouteLoader message="Loading chat..." />}>
                            <Chat onToggleDetail={toggleDetail} onToggleSearch={toggleSearch} />
                          </Suspense>
                        </div>
                      </motion.div>

                      <AnimatePresence>
                        {(isDetailVisible || isSearchVisible) && (
                          <motion.div
                            initial={{ x: 60, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 60, opacity: 0 }}
                          transition={{ duration: 0.28 }}
                          className="hidden w-[24rem] border-l border-white/8 bg-[#08111f] xl:block"
                        >
                            {isDetailVisible && (
                              <Suspense fallback={<RouteLoader message="Loading chat details..." />}>
                                <Detail onClose={toggleDetail} />
                              </Suspense>
                            )}
                            {isSearchVisible && (
                              <Suspense fallback={<RouteLoader message="Loading search..." />}>
                                <Search onClose={toggleSearch} />
                              </Suspense>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="themed-main-panel flex min-w-0 w-full max-w-full flex-1 overflow-hidden"
                  >
                    {activeSection === "contacts" && (
                      <Suspense fallback={<RouteLoader message="Loading contacts..." />}>
                        <ContactsPage
                          onOpenChat={() => {
                            if (isMobile) {
                              setForceOpenMobileChat(true);
                              setMobileChatView("chat");
                            }
                            setActiveSection("chats");
                          }}
                        />
                      </Suspense>
                    )}
                    {activeSection === "calls" && (
                      <Suspense fallback={<RouteLoader message="Loading calls..." />}>
                        <CallsPage />
                      </Suspense>
                    )}
                    {activeSection === "starred" && (
                      <Suspense fallback={<RouteLoader message="Loading starred messages..." />}>
                        <StarredPage onOpenChat={() => setActiveSection("chats")} />
                      </Suspense>
                    )}
                    {activeSection === "settings" && (
                      <Suspense fallback={<RouteLoader message="Loading settings..." />}>
                        <SettingsPage />
                      </Suspense>
                    )}
                  </motion.div>
                )}
              </div>

              <div
                className={`grid h-[calc(74px+env(safe-area-inset-bottom))] grid-cols-5 border-t border-white/8 bg-[#060a14]/95 pb-[env(safe-area-inset-bottom)] md:hidden ${
                  activeSection === "chats" && mobileChatView === "chat" ? "hidden" : ""
                }`}
              >
                {[{ id: "chats", label: "Chats", icon: HomeIcon }, ...sidebarItems.slice(1)].map(
                  ({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setActiveSection(id);
                        setIsDetailVisible(false);
                        setIsSearchVisible(false);
                      }}
                      className={`flex flex-col items-center justify-center gap-1 text-xs ${
                        activeSection === id ? "text-cyan-200" : "text-slate-500"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isGlobalSearchOpen && (
        <Suspense fallback={<RouteLoader message="Loading search..." />}>
          <GlobalSearchModal
            isOpen={isGlobalSearchOpen}
            onClose={() => setIsGlobalSearchOpen(false)}
            onOpenConversation={openConversationFromGlobalSearch}
          />
        </Suspense>
      )}

      {isNotificationsOpen && (
        <Suspense fallback={<RouteLoader message="Loading notifications..." />}>
          <NotificationDrawer
            isOpen={isNotificationsOpen}
            notifications={notifications}
            unreadCount={notificationUnreadCount}
            onClose={() => setIsNotificationsOpen(false)}
            onAcceptRequest={handleAcceptFriendRequest}
            onRejectRequest={handleRejectFriendRequest}
            onAcceptGroupInvite={handleAcceptGroupInvite}
            onRejectGroupInvite={handleRejectGroupInvite}
            onReadAllNotifications={async () => {
              try {
                const response = await apiClient.post(
                  `${NOTIFICATIONS_ROUTE}/read-all`,
                  {},
                  { withCredentials: true }
                );
                setNotifications(response.data.notifications || []);
                setNotificationUnreadCount(response.data.unreadCount || 0);
                toast.success("All notifications marked as read");
              } catch (error) {
                console.error("Error marking all notifications read:", error);
                toast.error(
                  error.response?.data?.message || "Unable to mark all notifications as read."
                );
              }
            }}
            onReadNotification={async (notification) => {
              try {
                const response = await apiClient.post(
                  `${NOTIFICATIONS_ROUTE}/${notification._id}/read`,
                  {},
                  { withCredentials: true }
                );
                markNotificationRead(notification._id, response.data.unreadCount);
              } catch (error) {
                console.error("Error marking notification read:", error);
              }
            }}
            onOpenNotification={openNotification}
          />
        </Suspense>
      )}
    </div>
  );
}

const mapStateToProps = ({ call, Home }) => ({
  ...call,
  ...Home,
});

export default connect(mapStateToProps)(Home);
