import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/NotificationService.js";
import { getIO, getUserRoom } from "../socket.js";

export const getNotifications = async (req, res) => {
  try {
    const unreadOnly = String(req.query.unreadOnly || "false") === "true";
    const notifications = await listNotifications({
      userId: req.userId,
      unreadOnly,
    });
    const unreadCount = await getUnreadNotificationCount({ userId: req.userId });

    return res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({ message: "Failed to fetch notifications." });
  }
};

export const readNotification = async (req, res) => {
  try {
    const notification = await markNotificationRead({
      userId: req.userId,
      notificationId: req.params.notificationId,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    const unreadCount = await getUnreadNotificationCount({ userId: req.userId });
    const io = getIO();
    io?.to(getUserRoom(req.userId)).emit("notification_read", {
      notificationId: notification._id,
      unreadCount,
    });

    return res.status(200).json({ notification, unreadCount });
  } catch (error) {
    console.error("Error marking notification read:", error);
    return res.status(500).json({ message: "Failed to update notification." });
  }
};

export const readAllNotifications = async (req, res) => {
  try {
    const notifications = await markAllNotificationsRead({
      userId: req.userId,
    });
    const unreadCount = await getUnreadNotificationCount({ userId: req.userId });
    const io = getIO();

    io?.to(getUserRoom(req.userId)).emit("notification_update", {
      unreadCount,
    });

    return res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    console.error("Error marking all notifications read:", error);
    return res.status(500).json({ message: "Failed to update notifications." });
  }
};
