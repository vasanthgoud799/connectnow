import { Router } from "express";
import {
  getUserInfo,
  login,
  logout,
  signUp,
  updateProfile,
} from "../controllers/AuthController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import { requestOTP, validateOTP } from "../controllers/otpController.js";

const authRoutes = Router();

authRoutes.post("/signup", signUp);
authRoutes.post("/login", login);
authRoutes.get("/user-info", verifyToken, getUserInfo);
authRoutes.post("/update-profile", verifyToken, updateProfile);
authRoutes.post("/logout", verifyToken, logout);

authRoutes.post("/request-otp", requestOTP);

authRoutes.post("/validate-otp", validateOTP);
export default authRoutes;
