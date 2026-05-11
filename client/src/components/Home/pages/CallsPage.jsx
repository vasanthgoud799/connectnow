import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { connect } from "react-redux";
import {
  History,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  Search,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import PageScaffold from "@/components/ui/PageScaffold";
import StatePanel from "@/components/ui/StatePanel";
import {
  CALLS_LOG_ROUTE,
} from "@/utils/constants";
import { useAppStore } from "@/store";
import { isDirectCallBusy } from "@/store/actions/callActions";
import useMobileFocusGuard, {
  blurActiveTextInputOnMobile,
} from "@/hooks/useMobileFocusGuard";

function formatCallDate(value) {
  if (!value) return "";

  const date = new Date(value);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  if (isYesterday) {
    return "Yesterday";
  }

  return date.toLocaleDateString([], {
    day: "2-digit",
    month: "short",
  });
}

function findActiveUserMatch(contact, activeUsers = []) {
  const contactId = contact?._id || contact?.id;
  const contactEmail = contact?.email;
  const contactName =
    [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ||
    contact?.email;

  return (activeUsers || []).find((activeUserItem) => {
    const activeUserId = activeUserItem?.userId;
    const activeUserEmail = activeUserItem?.email;
    const activeUserName =
      activeUserItem?.displayName || activeUserItem?.username;

    return (
      (contactId && activeUserId && String(contactId) === String(activeUserId)) ||
      (contactEmail && activeUserEmail && contactEmail === activeUserEmail) ||
      (contactName && activeUserName && contactName === activeUserName) ||
      (contact?.firstName && activeUserItem?.username === contact.firstName)
    );
  });
}

function getCallDirectionLabel(call, currentUserId) {
  const isCaller = String(call.caller?._id || call.caller?.id) === String(currentUserId);

  if (call.status === "missed" || call.status === "rejected") {
    return "Missed";
  }

  return isCaller ? "Outgoing" : "Incoming";
}

function CallContactPicker({
  isOpen,
  onClose,
  contacts = [],
  onlineUsers = [],
  onCall,
}) {
  const [searchText, setSearchText] = useState("");
  useMobileFocusGuard(isOpen);

  useEffect(() => {
    if (!isOpen) {
      setSearchText("");
    }
  }, [isOpen]);

  const filteredContacts = useMemo(() => {
    if (!searchText.trim()) return contacts;

    return contacts.filter((contact) =>
      `${contact.firstName || ""} ${contact.lastName || ""} ${contact.email || ""}`
        .toLowerCase()
        .includes(searchText.toLowerCase())
    );
  }, [contacts, searchText]);

  if (!isOpen) return null;

  return createPortal(
    <div className="mobile-viewport-overlay z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm md:items-center md:p-4">
      <div className="themed-modal-surface flex h-full max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] md:h-auto md:max-h-[80vh] md:rounded-[30px] md:p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <div>
            <p className="themed-title text-xl font-semibold">Start a call</p>
            <p className="themed-subtitle mt-1 text-sm">
              Choose a friend and start an audio or video call.
            </p>
          </div>
          <button
            type="button"
            className="themed-panel-soft rounded-full p-2"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mb-4 shrink-0">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search contacts"
            className="themed-input h-12 w-full rounded-[22px] pl-11"
          />
        </div>

        <div className="mobile-safe-scroll scrollbar-hide flex-1 space-y-3 pr-1">
          {filteredContacts.length === 0 ? (
            <div className="themed-panel-soft rounded-[24px] px-4 py-8 text-center">
              <p className="themed-title text-sm font-medium">No contacts found</p>
              <p className="themed-subtitle mt-1 text-sm">
                Try another search term.
              </p>
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const onlineMatch = findActiveUserMatch(contact, onlineUsers);
              const displayName =
                [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
                contact.email;

              return (
                <div
                  key={contact._id}
                  className="themed-conversation-card flex items-center gap-3 rounded-[24px] p-3"
                >
                  <img
                    src={contact.image || "/avatar.png"}
                    alt={displayName}
                    className="themed-glow-avatar h-12 w-12 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="themed-title truncate text-base font-semibold">
                      {displayName}
                    </p>
                    <p className="themed-subtitle mt-0.5 truncate text-sm">
                      {onlineMatch || contact.status === "Online" ? "Online now" : "Offline"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onCall(contact, "audio", onlineMatch)}
                      className="themed-panel-soft flex h-11 w-11 items-center justify-center rounded-full text-cyan-300 transition hover:text-white"
                    >
                      <Phone className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onCall(contact, "video", onlineMatch)}
                      className="themed-panel-soft flex h-11 w-11 items-center justify-center rounded-full text-cyan-300 transition hover:text-white"
                    >
                      <Video className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function CallsPage({ activeUsers = [], callState }) {
  const [searchText, setSearchText] = useState("");
  const [showCallPicker, setShowCallPicker] = useState(false);
  useMobileFocusGuard();
  const {
    userInfo,
    calls,
    callsLoaded,
    callsLoading,
    contacts,
    contactsLoading,
    fetchCalls,
    fetchContacts,
    invalidateCalls,
  } = useAppStore();
  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const openCallPicker = async () => {
    blurActiveTextInputOnMobile();
    if (!contacts.length) {
      await fetchContacts();
    }
    setShowCallPicker(true);
  };

  const getStatusIcon = (call) => {
    const direction = getCallDirectionLabel(call, userInfo?.id);

    if (direction === "Missed") {
      return <PhoneMissed className="h-4 w-4 text-rose-300" />;
    }

    return direction === "Incoming" ? (
      <PhoneIncoming className="h-4 w-4 text-emerald-300" />
    ) : (
      <PhoneCall className="h-4 w-4 text-cyan-300" />
    );
  };

  const filteredCalls = useMemo(() => {
    if (!searchText.trim()) return calls;

    return calls.filter((call) => {
      const isCaller = String(call.caller?._id || call.caller?.id) === String(userInfo?.id);
      const otherUser = isCaller ? call.recipient : call.caller;
      const haystack = `${otherUser?.firstName || ""} ${otherUser?.lastName || ""} ${otherUser?.email || ""}`
        .toLowerCase();

      return haystack.includes(searchText.toLowerCase());
    });
  }, [calls, searchText, userInfo?.id]);

  const startDirectCall = async (contact, type, onlineMatch) => {
    if (isDirectCallBusy(callState)) {
      toast.error("Finish the current call before starting another one.");
      return;
    }

    if (!onlineMatch) {
      toast.error("This user is not available for calling right now.");
      return;
    }

    let callLogId = null;
    try {
      const response = await apiClient.post(
        CALLS_LOG_ROUTE,
        { recipientId: contact._id, type, status: "initiated" },
        { withCredentials: true }
      );
      callLogId = response.data?.call?._id || response.data?.call?.id || null;
      invalidateCalls();
      fetchCalls({ force: true });
    } catch (error) {
      console.error("Error logging call:", error);
    }

    const { callToOtherUser } = await import("@/utils/webRTC/webRTCHandler");
    callToOtherUser(
      {
        userId: contact._id,
        callLogId,
        socketId: onlineMatch?.socketId,
        username: contact.firstName,
        displayName:
          [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
          contact.email,
        email: contact.email,
      },
      type
    );
    setShowCallPicker(false);
  };

  const redialCall = async (call) => {
    const isCaller = String(call.caller?._id || call.caller?.id) === String(userInfo?.id);
    const otherUser = isCaller ? call.recipient : call.caller;
    const onlineMatch = findActiveUserMatch(
      {
        _id: otherUser?._id || otherUser?.id,
        firstName: otherUser?.firstName,
        lastName: otherUser?.lastName,
        email: otherUser?.email,
      },
      activeUsers
    );

    await startDirectCall(
      {
        _id: otherUser?._id || otherUser?.id,
        firstName: otherUser?.firstName,
        lastName: otherUser?.lastName,
        email: otherUser?.email,
        image: otherUser?.image,
      },
      call.type === "video" ? "video" : "audio",
      onlineMatch
    );
  };

  return (
    <PageScaffold
      bodyClassName="no-scrollbar flex min-h-0 flex-col overflow-x-hidden overflow-y-auto pb-3"
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search"
            className="themed-input h-12 w-full rounded-[22px] pl-11"
          />
        </div>
        <button
          type="button"
          onClick={openCallPicker}
          className="themed-panel-soft flex h-12 min-w-12 shrink-0 items-center justify-center rounded-[22px] px-4 text-cyan-300 transition hover:text-white"
          aria-label="Start call"
        >
          <Phone className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-5">
        <div className="inline-flex items-center gap-2">
          <History className="h-4 w-4 text-cyan-200" />
          <p className="themed-title text-xl font-semibold">Recent</p>
        </div>
      </div>

      <div className="scrollbar-hide space-y-1 overflow-x-hidden pr-1">
        {!callsLoaded && callsLoading ? (
          <StatePanel title="Loading calls..." description="Pulling your latest call history and contact availability." />
        ) : filteredCalls.length === 0 ? (
          <StatePanel
            title="No recent calls yet"
            description="Start an audio or video conversation and your history will appear here."
            dashed
          />
        ) : (
          filteredCalls.map((call) => {
            const isCaller = String(call.caller?._id || call.caller?.id) === String(userInfo?.id);
            const otherUser = isCaller ? call.recipient : call.caller;
            const displayName =
              [otherUser?.firstName, otherUser?.lastName].filter(Boolean).join(" ") ||
              otherUser?.email;
            const direction = getCallDirectionLabel(call, userInfo?.id);

            return (
              <button
                key={call._id}
                type="button"
                onClick={() => redialCall(call)}
                className="flex w-full items-center gap-3 border-b border-white/8 px-1 py-3 text-left transition hover:bg-white/5"
              >
                <img
                  src={otherUser?.image || "/avatar.png"}
                  alt={displayName}
                  className="themed-glow-avatar h-12 w-12 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-base font-semibold ${
                      direction === "Missed" ? "text-rose-300" : "themed-title"
                    }`}
                  >
                    {displayName}
                  </p>
                  <div className="themed-subtitle mt-1 flex items-center gap-2 text-sm">
                    {getStatusIcon(call)}
                    <span>{direction}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 md:gap-3">
                  <span className="themed-subtitle text-sm">
                    {formatCallDate(call.createdAt)}
                  </span>
                  <span className="themed-panel-soft flex h-10 w-10 items-center justify-center rounded-full text-cyan-300">
                    {call.type === "video" ? (
                      <Video className="h-4 w-4" />
                    ) : (
                      <Phone className="h-4 w-4" />
                    )}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      <CallContactPicker
        isOpen={showCallPicker}
        onClose={() => setShowCallPicker(false)}
        contacts={contacts}
        onlineUsers={activeUsers}
        onCall={startDirectCall}
      />

      {contactsLoading && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-950/80 px-4 py-2 text-xs text-white shadow-lg backdrop-blur-sm">
          Loading contacts...
        </div>
      )}
    </PageScaffold>
  );
}

const mapStateToProps = ({ Home, call }) => ({
  ...Home,
  ...call,
});

export default connect(mapStateToProps)(CallsPage);
