import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  getNotifications,
  readAllNotifications,
  readNotification,
} from "../controllers/NotificationsController.js";

const notificationsRoutes = Router();

notificationsRoutes.get("/", verifyToken, getNotifications);
notificationsRoutes.post("/read-all", verifyToken, readAllNotifications);
notificationsRoutes.post("/:notificationId/read", verifyToken, readNotification);

export default notificationsRoutes;
