import {
  cancelScheduledMessage,
  createScheduledMessage,
  getUpcomingBirthdays,
  listScheduledMessages,
} from "../services/ScheduledMessageService.js";

export const scheduleMessage = async (req, res) => {
  try {
    const scheduledMessage = await createScheduledMessage({
      senderId: req.userId,
      recipientId: req.body.recipientId || null,
      groupId: req.body.groupId || null,
      content: req.body.content,
      scheduledFor: req.body.scheduledFor,
      timezone: req.body.timezone,
      occasionType: req.body.occasionType || "general",
      meta: req.body.meta || {},
    });

    return res.status(201).json({
      message: "Message scheduled successfully.",
      scheduledMessage,
    });
  } catch (error) {
    console.error("Error scheduling message:", error);
    return res.status(400).json({ message: error.message || "Failed to schedule message." });
  }
};

export const getScheduledMessages = async (req, res) => {
  try {
    const scheduledMessages = await listScheduledMessages({
      userId: req.userId,
      conversationKey: req.query.conversationKey,
    });

    return res.status(200).json({ scheduledMessages });
  } catch (error) {
    console.error("Error listing scheduled messages:", error);
    return res.status(500).json({ message: "Failed to fetch scheduled messages." });
  }
};

export const removeScheduledMessage = async (req, res) => {
  try {
    const scheduledMessage = await cancelScheduledMessage({
      scheduledMessageId: req.params.scheduledMessageId,
      userId: req.userId,
    });

    return res.status(200).json({
      message: "Scheduled message cancelled.",
      scheduledMessage,
    });
  } catch (error) {
    console.error("Error cancelling scheduled message:", error);
    return res.status(400).json({ message: error.message || "Failed to cancel scheduled message." });
  }
};

export const getUpcomingBirthdaysList = async (req, res) => {
  try {
    const birthdays = await getUpcomingBirthdays({ userId: req.userId });
    return res.status(200).json({ birthdays });
  } catch (error) {
    console.error("Error getting upcoming birthdays:", error);
    return res.status(500).json({ message: "Failed to fetch birthdays." });
  }
};
