import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  blockUser,
  deleteChat,
  unblockUser,
  unfriend,
} from "../controllers/ContactDetailController.js";

const detailRoutes = Router();

detailRoutes.post("/delete-chat", verifyToken, deleteChat);
detailRoutes.post("/unfriend", verifyToken, unfriend);
detailRoutes.post("/block", verifyToken, blockUser); // Block user route
detailRoutes.post("/unblock", verifyToken, unblockUser); // Unblock user route

export default detailRoutes;
