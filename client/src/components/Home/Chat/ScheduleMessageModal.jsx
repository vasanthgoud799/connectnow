import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, Gift, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { SCHEDULED_MESSAGES_ROUTE } from "@/utils/constants";

function getDefaultScheduleDate() {
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  return nextHour;
}

function getNextBirthdayDate(birthday) {
  if (!birthday) return "";

  const source = new Date(birthday);
  if (Number.isNaN(source.getTime())) return "";

  const now = new Date();
  const nextBirthday = new Date(now.getFullYear(), source.getMonth(), source.getDate(), 9, 0, 0, 0);
  if (nextBirthday < now) {
    nextBirthday.setFullYear(now.getFullYear() + 1);
  }

  return nextBirthday;
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function toTimeInputValue(date) {
  return date.toTimeString().slice(0, 5);
}

function ScheduleMessageModal({
  isOpen,
  onClose,
  selectedChatData,
  isGroupChat,
  conversationKey,
  draftText = "",
  occasionType = "general",
  onScheduled,
}) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const defaultDate = useMemo(() => {
    if (occasionType === "birthday" && selectedChatData?.birthday) {
      const birthdayDate = getNextBirthdayDate(selectedChatData.birthday);
      if (birthdayDate) return birthdayDate;
    }

    return getDefaultScheduleDate();
  }, [occasionType, selectedChatData?.birthday]);

  const defaultMessage = useMemo(() => {
    if (draftText?.trim()) return draftText;
    if (occasionType !== "birthday") return "";

    const friendName =
      [selectedChatData?.firstName, selectedChatData?.lastName].filter(Boolean).join(" ") ||
      selectedChatData?.name ||
      "there";
    return `Happy Birthday ${friendName}! Wishing you a wonderful day filled with happiness.`;
  }, [draftText, occasionType, selectedChatData]);

  const [selectedDate, setSelectedDate] = useState(toDateInputValue(defaultDate));
  const [selectedTime, setSelectedTime] = useState(toTimeInputValue(defaultDate));
  const [message, setMessage] = useState(defaultMessage);
  const [loading, setLoading] = useState(false);
  const [scheduledMessages, setScheduledMessages] = useState([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);

  useEffect(() => {
    setSelectedDate(toDateInputValue(defaultDate));
    setSelectedTime(toTimeInputValue(defaultDate));
    setMessage(defaultMessage);
  }, [defaultDate, defaultMessage, isOpen]);

  useEffect(() => {
    if (!isOpen || !conversationKey) return;

    const loadScheduledMessages = async () => {
      try {
        setLoadingScheduled(true);
        const response = await apiClient.get(
          `${SCHEDULED_MESSAGES_ROUTE}?conversationKey=${encodeURIComponent(
            conversationKey
          )}`,
          { withCredentials: true }
        );
        setScheduledMessages(response.data.scheduledMessages || []);
      } catch (error) {
        console.error("Error loading scheduled messages:", error);
        setScheduledMessages([]);
      } finally {
        setLoadingScheduled(false);
      }
    };

    loadScheduledMessages();
  }, [conversationKey, isOpen]);

  if (!isOpen) return null;

  const refreshScheduledMessages = async () => {
    if (!conversationKey) return;

    try {
      const response = await apiClient.get(
        `${SCHEDULED_MESSAGES_ROUTE}?conversationKey=${encodeURIComponent(
          conversationKey
        )}`,
        { withCredentials: true }
      );
      setScheduledMessages(response.data.scheduledMessages || []);
    } catch (error) {
      console.error("Error refreshing scheduled messages:", error);
    }
  };

  const handleSchedule = async () => {
    if (!selectedDate || !selectedTime || !message.trim()) {
      toast.error("Choose a date, time, and message.");
      return;
    }

    const scheduledFor = new Date(`${selectedDate}T${selectedTime}:00`);

    try {
      setLoading(true);
      await apiClient.post(
        SCHEDULED_MESSAGES_ROUTE,
        {
          recipientId: !isGroupChat ? selectedChatData?._id || selectedChatData?.id : null,
          groupId: isGroupChat ? selectedChatData?._id || selectedChatData?.id : null,
          content: message.trim(),
          scheduledFor: scheduledFor.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          occasionType,
          meta:
            occasionType === "birthday"
              ? {
                  birthdayFor: selectedChatData?._id || selectedChatData?.id,
                }
              : {},
        },
        { withCredentials: true }
      );

      toast.success(
        occasionType === "birthday"
          ? "Birthday message scheduled"
          : "Message scheduled"
      );
      await refreshScheduledMessages();
      onScheduled?.();
      onClose?.();
    } catch (error) {
      console.error("Error scheduling message:", error);
      toast.error(error.response?.data?.message || "Unable to schedule message.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelScheduled = async (scheduledMessageId) => {
    try {
      await apiClient.delete(`${SCHEDULED_MESSAGES_ROUTE}/${scheduledMessageId}`, {
        withCredentials: true,
      });
      setScheduledMessages((currentMessages) =>
        currentMessages.filter(
          (scheduledMessage) => String(scheduledMessage._id) !== String(scheduledMessageId)
        )
      );
      toast.success("Scheduled message cancelled");
    } catch (error) {
      console.error("Error cancelling scheduled message:", error);
      toast.error(
        error.response?.data?.message || "Unable to cancel scheduled message."
      );
    }
  };

  const title =
    isGroupChat
      ? selectedChatData?.name
      : [selectedChatData?.firstName, selectedChatData?.lastName]
          .filter(Boolean)
          .join(" ") || selectedChatData?.email;

  return (
    <div className={`fixed inset-0 z-50 flex bg-slate-950/70 backdrop-blur-sm ${isMobile ? "items-end justify-center p-0" : "items-center justify-center p-4"}`}>
      <div
        className={`themed-modal-surface w-full shadow-[0_30px_80px_rgba(2,8,23,0.25)] ${
          isMobile
            ? "max-h-[94vh] rounded-t-[30px] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            : "max-w-5xl rounded-[30px] p-6"
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="themed-accent-text text-xs uppercase tracking-[0.28em]">
              {occasionType === "birthday" ? "Birthday reminder" : "Send later"}
            </p>
            <h3 className="themed-title mt-2 text-2xl font-semibold">
              {occasionType === "birthday" ? "Schedule birthday message" : "Schedule message"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="themed-panel-soft rounded-full p-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={`grid gap-6 ${isMobile ? "max-h-[calc(94vh-72px)] overflow-y-auto pr-1" : "lg:grid-cols-[1.05fr_0.95fr]"}`}>
          <div className="min-w-0">
            {!isMobile && (
              <div className="themed-page-card mb-5 flex items-center gap-3 rounded-[24px] p-4">
                <div className="themed-panel-soft flex h-12 w-12 items-center justify-center rounded-2xl">
                  {occasionType === "birthday" ? (
                    <Gift className="h-5 w-5" />
                  ) : (
                    <CalendarClock className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="themed-title truncate text-sm font-semibold">{title}</p>
                  <p className="themed-subtitle text-sm">
                    {occasionType === "birthday"
                      ? "Send a birthday message automatically on the selected day."
                      : "This message will be delivered automatically at the chosen time."}
                  </p>
                </div>
              </div>
            )}

            {isMobile && (
              <div className="mb-3">
                <p className="themed-title truncate text-sm font-semibold">{title}</p>
                <p className="themed-subtitle mt-1 text-xs leading-5">
                  {occasionType === "birthday"
                    ? "Send this automatically on the selected birthday."
                    : "This message will be delivered at the chosen time."}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="themed-input h-12 rounded-2xl px-4"
              />
              <input
                type="time"
                value={selectedTime}
                onChange={(event) => setSelectedTime(event.target.value)}
                className="themed-input h-12 rounded-2xl px-4"
              />
            </div>

            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={isMobile ? 4 : 6}
              placeholder="Write your message..."
              className="themed-input mt-4 w-full rounded-[24px] px-4 py-4 text-sm outline-none"
            />

            <div className={`mt-4 flex gap-3 ${isMobile ? "sticky bottom-0 bg-inherit pb-1 pt-1" : "items-center justify-end"}`}>
              <button
                type="button"
                onClick={onClose}
                className={`themed-action-neutral rounded-full px-4 py-2.5 text-sm font-medium ${isMobile ? "flex-1" : ""}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSchedule}
                disabled={loading}
                className={`themed-action-info rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50 ${isMobile ? "flex-1" : ""}`}
              >
                {loading ? "Scheduling..." : "Schedule"}
              </button>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-3">
              <div className="themed-panel-soft flex h-11 w-11 items-center justify-center rounded-2xl">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <p className="themed-title text-base font-semibold">Scheduled in this chat</p>
                <p className="themed-subtitle text-sm">
                  Review or cancel upcoming scheduled messages.
                </p>
              </div>
            </div>

            <div className={`themed-page-card space-y-3 overflow-y-auto my-3 rounded-[24px] p-4 ${isMobile ? "max-h-[320px]" : "max-h-[430px]"}`}>
              {loadingScheduled ? (
                <div className="themed-subtitle rounded-2xl px-3 py-4 text-sm">
                  Loading scheduled messages...
                </div>
              ) : scheduledMessages.length ? (
                scheduledMessages.map((scheduledMessage) => (
                  <div
                    key={scheduledMessage._id}
                    className="themed-panel-soft rounded-[22px] px-4 py-3 my-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="themed-title line-clamp-2 text-sm font-medium">
                          {scheduledMessage.content}
                        </p>
                        <p className="themed-subtitle mt-2 text-xs">
                          {new Date(scheduledMessage.scheduledFor).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                   
                      <button
                        type="button"
                        onClick={() => handleCancelScheduled(scheduledMessage._id)}
                        className="themed-action-neutral rounded-full p-2"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="themed-panel-soft rounded-full px-3 py-1 text-[11px] font-medium">
                        {scheduledMessage.occasionType === "birthday"
                          ? "Birthday"
                          : "Scheduled"}
                      </span>
                      <span className="themed-subtitle text-[11px] uppercase tracking-[0.18em]">
                        {scheduledMessage.timezone || "UTC"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex h-full min-h-[220px] items-center justify-center text-center bg-slate-500">
                  <div>
                    <p className="themed-title text-base font-medium">
                      No scheduled messages yet
                    </p>
                    <p className="themed-subtitle mt-2 text-sm">
                      Schedule something here and it will show up in this list.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScheduleMessageModal;
