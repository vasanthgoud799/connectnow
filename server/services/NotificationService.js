import ChatPreference from "../models/ChatPreferenceModel.js";
import Notification from "../models/NotificationModel.js";

export const createNotification = async ({
  userId,
  type,
  entityId,
  senderId = null,
  referenceId = null,
  meta = {},
  conversationKey,
}) => {
  if (!userId || !type || !entityId) return null;

  if (conversationKey) {
    const preference = await ChatPreference.findOne({
      userId,
      conversationKey,
    }).lean();

    if (preference?.mutedUntil && new Date(preference.mutedUntil) > new Date()) {
      return null;
    }
  }

  return Notification.create({
    userId,
    type,
    entityId,
    senderId,
    referenceId,
    meta,
  });
};

export const listNotifications = async ({ userId, unreadOnly = false }) => {
  const query = { userId };
  if (unreadOnly) {
    query.readAt = null;
  }

  return Notification.find(query)
    .populate("senderId", "id email firstName lastName image")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
};

export const markNotificationRead = async ({ userId, notificationId }) => {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();
};

export const markAllNotificationsRead = async ({ userId }) => {
  const now = new Date();
  await Notification.updateMany(
    {
      userId,
      readAt: null,
    },
    {
      $set: { readAt: now },
    }
  );

  return Notification.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
};

export const getUnreadNotificationCount = async ({ userId }) => {
  return Notification.countDocuments({ userId, readAt: null });
};

export const markNotificationReadByReference = async ({ userId, type, referenceId }) => {
  return Notification.findOneAndUpdate(
    {
      userId,
      type,
      referenceId,
      readAt: null,
    },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();
};

export const updateNotificationMetaByReference = async ({
  userId,
  type,
  referenceId,
  metaPatch = {},
}) => {
  return Notification.findOneAndUpdate(
    {
      userId,
      type,
      referenceId,
    },
    {
      $set: {
        readAt: new Date(),
        ...Object.entries(metaPatch).reduce(
          (accumulator, [key, value]) => ({
            ...accumulator,
            [`meta.${key}`]: value,
          }),
          {}
        ),
      },
    },
    { new: true }
  ).lean();
};
