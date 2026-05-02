import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  getIceConfiguration,
  listCalls,
  logCall,
  updateCallStatus,
} from "../controllers/CallsController.js";

const callsRoutes = Router();

callsRoutes.get("/history", verifyToken, listCalls);
callsRoutes.get("/ice-config", verifyToken, getIceConfiguration);
callsRoutes.post("/log", verifyToken, logCall);
callsRoutes.patch("/status", verifyToken, updateCallStatus);

export default callsRoutes;
