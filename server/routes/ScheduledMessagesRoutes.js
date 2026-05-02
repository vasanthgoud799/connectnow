import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  getScheduledMessages,
  getUpcomingBirthdaysList,
  removeScheduledMessage,
  scheduleMessage,
} from "../controllers/ScheduledMessagesController.js";

const scheduledMessagesRoutes = Router();

scheduledMessagesRoutes.get("/birthdays/upcoming", verifyToken, getUpcomingBirthdaysList);
scheduledMessagesRoutes.get("/", verifyToken, getScheduledMessages);
scheduledMessagesRoutes.post("/", verifyToken, scheduleMessage);
scheduledMessagesRoutes.delete("/:scheduledMessageId", verifyToken, removeScheduledMessage);

export default scheduledMessagesRoutes;
