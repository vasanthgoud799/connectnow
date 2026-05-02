import "dotenv/config";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";

import authRoutes from "./routes/AuthRoutes.js";
import contactsRoutes from "./routes/ContactsRoutes.js";
import setupSocket from "./socket.js";
import messagesRoutes from "./routes/MessagesRoutes.js";
import detailRoutes from "./routes/ContactDetailRoutes.js";
import callsRoutes from "./routes/CallsRoutes.js";
import groupsRoutes from "./routes/GroupsRoutes.js";
import chatPreferencesRoutes from "./routes/ChatPreferencesRoutes.js";
import searchRoutes from "./routes/SearchRoutes.js";
import notificationsRoutes from "./routes/NotificationsRoutes.js";
import friendsRoutes from "./routes/FriendsRoutes.js";
import scheduledMessagesRoutes from "./routes/ScheduledMessagesRoutes.js";
import aiRoutes from "./routes/AIRoutes.js";
import subscriptionRoutes from "./routes/SubscriptionRoutes.js";
import mediaRoutes from "./routes/MediaRoutes.js";
import e2eeRoutes from "./routes/E2EERoutes.js";
import securityRoutes from "./routes/SecurityRoutes.js";

import { initializeScheduledMessaging } from "./services/ScheduledMessageService.js";

import {
  attachRequestContext,
  errorHandler,
  globalRateLimiter,
  notFoundHandler,
  rejectNoSqlInjection,
  securityHeaders,
  validateHttpMethod,
} from "./middlewares/SecurityMiddleware.js";

import { validateEnv } from "./config/env.js";

dotenv.config();
const runtimeConfig = validateEnv();

const app = express();
const port = process.env.PORT || 3001;

const databaseUrl = (process.env.DATABASE_URL || "").replace(
  "mongodb://localhost:",
  "mongodb://127.0.0.1:",
);

const allowedOrigins = runtimeConfig.allowedOrigins;

app.set("trust proxy", 1);
app.set("json escape", true);

/* -------------------- CORS -------------------- */
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "X-Request-Id",
      "X-Request-Timestamp",
      "X-Client-Render-Time",
      "X-Client-Timezone",
      "X-Device-Label",
      "X-Captcha-Token",
    ],
  }),
);

/* -------------------- Security -------------------- */
app.use(securityHeaders);
app.use(validateHttpMethod);
app.use(attachRequestContext);

/* ==================================================
   FIX: AUTH ROUTES BEFORE RATE LIMITER
================================================== */
app.use("/api/auth", authRoutes);

/* Apply limiter AFTER auth */
app.use(globalRateLimiter);

/* -------------------- Static / Raw -------------------- */
app.use("/uploads/files", express.static("uploads/files"));

app.use(
  "/api/subscription/webhook",
  express.raw({
    type: "application/json",
    limit: "2mb",
  }),
);

/* -------------------- Parsers -------------------- */
app.use(cookieParser());

app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || "2mb",
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: process.env.FORM_BODY_LIMIT || "1mb",
  }),
);

app.use(rejectNoSqlInjection);

/* -------------------- Health -------------------- */
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "connectnow-api",
    environment: runtimeConfig.runtimeEnvironment,
    timestamp: new Date().toISOString(),
  });
});

/* -------------------- Other Routes -------------------- */
app.use("/api/contacts", contactsRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/chat-preferences", chatPreferencesRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/scheduled-messages", scheduledMessagesRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/e2ee", e2eeRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/details", detailRoutes);
app.use("/api/calls", callsRoutes);

/* -------------------- Errors -------------------- */
app.use(notFoundHandler);
app.use(errorHandler);

/* -------------------- Mongo Fix -------------------- */
const cleanupLegacyUserIndexes = async () => {
  try {
    const usersCollection = mongoose.connection.collection("users");
    const indexes = await usersCollection.indexes();

    const passwordIndex = indexes.find((index) => index.name === "password_1");

    if (passwordIndex?.unique) {
      await usersCollection.dropIndex("password_1");
      console.log("Dropped legacy unique users.password_1 index.");
    }
  } catch (error) {
    console.error("Error cleaning legacy user indexes:", error.message);
  }
};

/* -------------------- Start Server -------------------- */
const startServer = async () => {
  try {
    await mongoose.connect(databaseUrl);

    console.log("Database connection successful");

    await cleanupLegacyUserIndexes();

    const server = app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });

    setupSocket(server);

    await initializeScheduledMessaging();
  } catch (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }
};

startServer();
