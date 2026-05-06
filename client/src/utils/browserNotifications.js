const BROWSER_NOTIFICATIONS_STORAGE_KEY = "connectnow.browserNotificationsEnabled";
const CONNECTNOW_OPEN_CHAT_EVENT = "connectnow:open-chat-from-notification";
const CONNECTNOW_FOCUS_CALL_EVENT = "connectnow:focus-call-from-notification";

export const getBrowserNotificationStorageKey = () =>
  BROWSER_NOTIFICATIONS_STORAGE_KEY;

export const isBrowserNotificationSupported = () =>
  typeof window !== "undefined" && "Notification" in window;

export const getStoredBrowserNotificationsEnabled = () => {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(BROWSER_NOTIFICATIONS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

export const setStoredBrowserNotificationsEnabled = (enabled) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      BROWSER_NOTIFICATIONS_STORAGE_KEY,
      enabled ? "true" : "false"
    );
  } catch {
    // Ignore storage failures.
  }
};

export const requestBrowserNotificationPermission = async () => {
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }

  try {
    return await window.Notification.requestPermission();
  } catch {
    return "denied";
  }
};

export const showBrowserNotification = ({
  title,
  body,
  tag,
  data,
  onClick,
}) => {
  if (!isBrowserNotificationSupported() || Notification.permission !== "granted") {
    return null;
  }

  const notification = new Notification(title, {
    body,
    tag,
    data,
    icon: "/pwa-icon.svg",
    badge: "/pwa-icon.svg",
    renotify: false,
    silent: true,
  });

  notification.onclick = (event) => {
    event?.preventDefault?.();
    try {
      window.focus?.();
    } catch {
      // Ignore focus failures.
    }
    notification.close();
    onClick?.();
  };

  return notification;
};

export const dispatchOpenChatFromNotification = (detail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONNECTNOW_OPEN_CHAT_EVENT, { detail }));
};

export const dispatchFocusCallFromNotification = (detail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONNECTNOW_FOCUS_CALL_EVENT, { detail }));
};

export const getOpenChatFromNotificationEventName = () =>
  CONNECTNOW_OPEN_CHAT_EVENT;

export const getFocusCallFromNotificationEventName = () =>
  CONNECTNOW_FOCUS_CALL_EVENT;
