import { Router } from "express";

import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  acceptRequest,
  cancelRequest,
  createFriendRequest,
  getFriendsList,
  getPendingRequests,
  rejectRequest,
} from "../controllers/FriendsController.js";

const friendsRoutes = Router();

friendsRoutes.post("/request", verifyToken, createFriendRequest);
friendsRoutes.post("/accept/:requestId", verifyToken, acceptRequest);
friendsRoutes.post("/reject/:requestId", verifyToken, rejectRequest);
friendsRoutes.post("/cancel/:requestId", verifyToken, cancelRequest);
friendsRoutes.get("/requests", verifyToken, getPendingRequests);
friendsRoutes.get("/list", verifyToken, getFriendsList);

export default friendsRoutes;
