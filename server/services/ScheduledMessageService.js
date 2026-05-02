import schedule from "node-schedule";

import User from "../models/UserModel.js";
import Group from "../models/GroupModel.js";
import Message from "../models/MessagesModel.js";
import ScheduledMessage from "../models/ScheduledMessageModel.js";
import {
  createDirectMessage,
  createGroupMessage,
  getConversationKey,
  getGroupConversationKey,
} from "./MessageService.js";
import { getIO, getUserRoom } from "../socket.js";

const scheduledJobs = new Map();
const birthdayReminderJobs = new Map();

const nextBirthdayDate = (birthdayValue) => {
  if (!birthdayValue) return null;

  const birthday = new Date(birthdayValue);
  if (Number.isNaN(birthday.getTime())) return null;

  const now = new Date();
  const nextBirthday = new Date(
    now.getFullYear(),
    birthday.getMonth(),
    birthday.getDate(),
    9,
    0,
    0,
    0
  );

  if (nextBirthday < now) {
    nextBirthday.setFullYear(now.getFullYear() + 1);
  }

  return nextBirthday;
};

const emitScheduledMessage = async (scheduledMessage) => {
  const io = getIO();
  if (!io) return;

  let message;
  if (scheduledMessage.groupId) {
    message = await createGroupMessage({
      groupId: scheduledMessage.groupId,
      senderId: scheduledMessage.senderId,
      content: scheduledMessage.content,
      messageType: "text",
      timestamp: new Date().toISOString(),
      meta: scheduledMessage.meta?.messageMeta || null,
    });

    const group = await Group.findById(scheduledMessage.groupId).populate(
      "members.user",
      "firstName lastName email image status"
    );

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "id email firstName lastName image")
      .populate("recipient", "id email firstName lastName image")
      .populate("group", "name description image members");

    group?.members?.forEach((member) => {
      const memberId = String(member.user?._id || member.user);
      io.to(getUserRoom(memberId)).emit("receive_message", populatedMessage);
      io.to(getUserRoom(memberId)).emit("receiveMessage", populatedMessage);
    });
  } else {
    message = await createDirectMessage({
      senderId: scheduledMessage.senderId,
      recipientId: scheduledMessage.recipientId,
      content: scheduledMessage.content,
      messageType: "text",
      timestamp: new Date().toISOString(),
      meta: scheduledMessage.meta?.messageMeta || null,
    });

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "id email firstName lastName image")
      .populate("recipient", "id email firstName lastName image")
      .populate("group", "name description image members");

    const senderId = String(scheduledMessage.senderId);
    const recipientId = String(scheduledMessage.recipientId);
    io.to(getUserRoom(senderId)).emit("receive_message", populatedMessage);
    io.to(getUserRoom(senderId)).emit("receiveMessage", populatedMessage);
    io.to(getUserRoom(recipientId)).emit("receive_message", populatedMessage);
    io.to(getUserRoom(recipientId)).emit("receiveMessage", populatedMessage);
  }

  scheduledMessage.status = "sent";
  scheduledMessage.sentAt = new Date();
  scheduledMessage.failureReason = "";
  await scheduledMessage.save();

  io.to(getUserRoom(String(scheduledMessage.senderId))).emit("scheduled_message_due", {
    scheduledMessageId: String(scheduledMessage._id),
    conversationKey: scheduledMessage.conversationKey,
    sentAt: scheduledMessage.sentAt,
  });
};

const runScheduledMessage = async (scheduledMessageId) => {
  const scheduledMessage = await ScheduledMessage.findById(scheduledMessageId);
  if (!scheduledMessage || scheduledMessage.status !== "pending") {
    scheduledJobs.delete(String(scheduledMessageId));
    return;
  }

  try {
    await emitScheduledMessage(scheduledMessage);
  } catch (error) {
    scheduledMessage.status = "failed";
    scheduledMessage.failureReason = error.message || "Failed to send scheduled message";
    await scheduledMessage.save();
    const io = getIO();
    io?.to(getUserRoom(String(scheduledMessage.senderId))).emit("scheduled_message_due", {
      scheduledMessageId: String(scheduledMessage._id),
      conversationKey: scheduledMessage.conversationKey,
      failed: true,
      error: scheduledMessage.failureReason,
    });
  } finally {
    scheduledJobs.delete(String(scheduledMessageId));
  }
};

const scheduleScheduledMessageJob = (scheduledMessage) => {
  if (!scheduledMessage || scheduledMessage.status !== "pending") return;

  const scheduleAt = new Date(scheduledMessage.scheduledFor);
  if (scheduleAt <= new Date()) {
    runScheduledMessage(scheduledMessage._id);
    return;
  }

  const existingJob = scheduledJobs.get(String(scheduledMessage._id));
  if (existingJob) {
    existingJob.cancel();
  }

  const job = schedule.scheduleJob(scheduleAt, () => {
    runScheduledMessage(scheduledMessage._id);
  });
  scheduledJobs.set(String(scheduledMessage._id), job);
};

const buildBirthdayReminderPayload = (friend) => {
  const nextBirthday = nextBirthdayDate(friend.birthday);
  if (!nextBirthday) return null;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfBirthday = new Date(
    nextBirthday.getFullYear(),
    nextBirthday.getMonth(),
    nextBirthday.getDate()
  );
  const diffDays = Math.round((startOfBirthday - startOfToday) / (1000 * 60 * 60 * 24));

  return {
    friendId: String(friend._id),
    friendName: [friend.firstName, friend.lastName].filter(Boolean).join(" ") || friend.email,
    birthday: friend.birthday,
    daysUntilBirthday: diffDays,
    isToday: diffDays === 0,
  };
};

const emitBirthdayReminderForUser = async (userId) => {
  const user = await User.findById(userId).select("friends");
  if (!user?.friends?.length) return;

  const friends = await User.find({
    _id: { $in: user.friends },
    birthday: { $ne: null },
  }).select("firstName lastName email birthday image");

  const reminders = friends
    .map(buildBirthdayReminderPayload)
    .filter(Boolean)
    .filter((item) => item.daysUntilBirthday >= 0 && item.daysUntilBirthday <= 7);

  if (!reminders.length) return;

  const io = getIO();
  io?.to(getUserRoom(String(userId))).emit("birthday_reminder", {
    reminders,
  });
};

export const ensureBirthdayReminderScheduleForUser = async (userId) => {
  const existingJob = birthdayReminderJobs.get(String(userId));
  if (existingJob) {
    existingJob.cancel();
  }

  const now = new Date();
  const nextReminderAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    9,
    0,
    0,
    0
  );

  if (nextReminderAt <= now) {
    nextReminderAt.setDate(nextReminderAt.getDate() + 1);
  }

  const job = schedule.scheduleJob(nextReminderAt, async () => {
    await emitBirthdayReminderForUser(userId);
    await ensureBirthdayReminderScheduleForUser(userId);
  });

  birthdayReminderJobs.set(String(userId), job);
};

export const createScheduledMessage = async ({
  senderId,
  recipientId = null,
  groupId = null,
  content,
  scheduledFor,
  timezone = "UTC",
  occasionType = "general",
  meta = {},
}) => {
  const normalizedContent = String(content || "").trim();
  if (!normalizedContent) {
    throw new Error("Message content is required");
  }

  if (!recipientId && !groupId) {
    throw new Error("Recipient or group is required");
  }

  const scheduleAt = new Date(scheduledFor);
  if (Number.isNaN(scheduleAt.getTime()) || scheduleAt <= new Date()) {
    throw new Error("Scheduled time must be in the future");
  }

  const conversationKey = groupId
    ? getGroupConversationKey(groupId)
    : getConversationKey(senderId, recipientId);

  const scheduledMessage = await ScheduledMessage.create({
    senderId,
    recipientId,
    groupId,
    conversationKey,
    content: normalizedContent,
    scheduledFor: scheduleAt,
    timezone,
    occasionType,
    status: "pending",
    meta,
  });

  scheduleScheduledMessageJob(scheduledMessage);
  return scheduledMessage;
};

export const listScheduledMessages = async ({ userId, conversationKey }) => {
  const query = {
    senderId: userId,
    status: { $in: ["pending", "failed"] },
  };

  if (conversationKey) {
    query.conversationKey = conversationKey;
  }

  return ScheduledMessage.find(query)
    .sort({ scheduledFor: 1 })
    .lean();
};

export const cancelScheduledMessage = async ({ scheduledMessageId, userId }) => {
  const scheduledMessage = await ScheduledMessage.findOne({
    _id: scheduledMessageId,
    senderId: userId,
    status: "pending",
  });

  if (!scheduledMessage) {
    throw new Error("Scheduled message not found");
  }

  scheduledMessage.status = "cancelled";
  scheduledMessage.cancelledAt = new Date();
  await scheduledMessage.save();

  const existingJob = scheduledJobs.get(String(scheduledMessage._id));
  if (existingJob) {
    existingJob.cancel();
    scheduledJobs.delete(String(scheduledMessage._id));
  }

  return scheduledMessage;
};

export const getUpcomingBirthdays = async ({ userId }) => {
  const user = await User.findById(userId).select("friends");
  if (!user?.friends?.length) return [];

  const friends = await User.find({
    _id: { $in: user.friends },
    birthday: { $ne: null },
  }).select("firstName lastName email image birthday status");

  return friends
    .map((friend) => ({
      ...friend.toObject(),
      reminder: buildBirthdayReminderPayload(friend),
    }))
    .filter((friend) => friend.reminder)
    .filter((friend) => friend.reminder.daysUntilBirthday >= 0 && friend.reminder.daysUntilBirthday <= 30)
    .sort((a, b) => a.reminder.daysUntilBirthday - b.reminder.daysUntilBirthday);
};

export const initializeScheduledMessaging = async () => {
  const pendingMessages = await ScheduledMessage.find({ status: "pending" }).lean();
  pendingMessages.forEach((scheduledMessage) => scheduleScheduledMessageJob(scheduledMessage));

  const usersWithFriends = await User.find({ friends: { $exists: true, $not: { $size: 0 } } }).select("_id");
  usersWithFriends.forEach((user) => {
    ensureBirthdayReminderScheduleForUser(user._id);
    emitBirthdayReminderForUser(user._id).catch(() => {});
  });
};
