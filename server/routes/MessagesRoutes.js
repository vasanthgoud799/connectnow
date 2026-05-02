// routes/MessagesRoutes.js
import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js"; // Removed trailing space
import {
  antiReplay,
  uploadIntentRateLimiter,
  userWriteRateLimiter,
} from "../middlewares/SecurityMiddleware.js";
import {
  validateConversationKeyPayload,
  validateMessageAction,
  validateMessageConversationRequest,
  validateMessageIdParam,
  validateMessageSearch,
  validatePinnedMessagesQuery,
} from "../middlewares/ValidationMiddleware.js";
import {
  addReaction,
  getMessageById,
  getChats,
  getMessages,
  getPinnedMessages,
  getStarredMessagesList,
  markMessagesSeen,
  removeMessage,
  removeReaction,
  searchMessages,
  togglePinnedMessage,
  toggleStarred,
  updateMessage,
  uploadFile,
} from "../controllers/MessagesController.js";
import multer from "multer";

const messagesRoutes = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isEncryptedUpload = String(req.body?.encryptedMedia || "false") === "true";
    const hasEncryptedHints =
      isEncryptedUpload ||
      String(req.body?.originalMimeType || "").trim().length > 0 ||
      String(file?.originalname || "").toLowerCase().endsWith(".enc");
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-matroska",
      "audio/mpeg",
      "audio/mp3",
      "audio/webm",
      "audio/wav",
      "audio/x-wav",
      "audio/ogg",
      "audio/mp4",
      "audio/x-m4a",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
    ];
    if (
      allowedTypes.includes(file.mimetype) ||
      (hasEncryptedHints && file.mimetype === "application/octet-stream")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"), false);
    }
  },
});

messagesRoutes.post("/get-messages", verifyToken, validateMessageConversationRequest, getMessages);
messagesRoutes.post("/search", verifyToken, validateMessageSearch, searchMessages);
messagesRoutes.get("/chats", verifyToken, getChats);
messagesRoutes.get("/starred", verifyToken, getStarredMessagesList);
messagesRoutes.get("/pinned", verifyToken, validatePinnedMessagesQuery, getPinnedMessages);
messagesRoutes.post("/reactions", verifyToken, validateMessageAction, antiReplay, userWriteRateLimiter, addReaction);
messagesRoutes.post(
  "/reactions/remove",
  verifyToken,
  validateMessageAction,
  antiReplay,
  userWriteRateLimiter,
  removeReaction
);
messagesRoutes.post("/edit", verifyToken, validateMessageAction, antiReplay, userWriteRateLimiter, updateMessage);
messagesRoutes.post("/delete", verifyToken, validateMessageAction, antiReplay, userWriteRateLimiter, removeMessage);
messagesRoutes.post("/pin", verifyToken, validateMessageAction, antiReplay, userWriteRateLimiter, togglePinnedMessage);
messagesRoutes.post("/star", verifyToken, validateMessageAction, antiReplay, userWriteRateLimiter, toggleStarred);
messagesRoutes.post("/mark-seen", verifyToken, validateConversationKeyPayload, markMessagesSeen);
messagesRoutes.get("/:messageId", verifyToken, validateMessageIdParam, getMessageById);
messagesRoutes.post(
  "/upload-file",
  verifyToken,
  antiReplay,
  uploadIntentRateLimiter,
  userWriteRateLimiter,
  upload.single("file"),
  uploadFile
);

messagesRoutes.use((error, req, res, next) => {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File is too large. Maximum size is 50MB." });
    }

    return res.status(400).json({ message: "Invalid upload." });
  }

  if (error.message === "Unsupported file type") {
    return res.status(400).json({ message: "Unsupported file type." });
  }

  return next(error);
});

export default messagesRoutes;
