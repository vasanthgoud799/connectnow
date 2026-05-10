import Group from "../models/GroupModel.js";
import Message from "../models/MessagesModel.js";
import User from "../models/UserModel.js";
import {
  createSignedMediaUrl,
  createSignedUploadIntent,
} from "../services/MediaStorageService.js";
import { verifySignedMediaAccessToken } from "../utils/AuthSecurity.js";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { logRuntimeEvent } from "../utils/RuntimeLogger.js";

const buildEntityMediaEtag = ({ storageProvider, storageBucket, storagePath, image }) =>
  `"${[storageProvider || "local", storageBucket || "", storagePath || image || ""].join(":")}"`;

const buildAbsoluteLocalUrl = (req, pathOrUrl) => {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl) || String(pathOrUrl).startsWith("data:")) {
    return pathOrUrl;
  }

  const normalizedPath = String(pathOrUrl).replace(/^\/+/, "");
  return `${req.protocol}://${req.get("host")}/${normalizedPath}`;
};

const getImageContentType = (filePath = "") => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  return "image/jpeg";
};

const streamLocalEntityImage = ({ req, res, storagePath, image }) => {
  const candidatePath = storagePath || image;
  if (!candidatePath || /^https?:\/\//i.test(String(candidatePath))) {
    return false;
  }

  const normalizedPath = decodeURIComponent(String(candidatePath).replace(/^\/+/, ""));
  const uploadsRoot = path.resolve(process.cwd(), "uploads", "files");
  const absolutePath = path.resolve(process.cwd(), normalizedPath);
  const isInsideUploads =
    absolutePath === uploadsRoot || absolutePath.startsWith(`${uploadsRoot}${path.sep}`);

  if (!isInsideUploads || !existsSync(absolutePath)) {
    return false;
  }

  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  res.setHeader("Content-Type", getImageContentType(absolutePath));
  createReadStream(absolutePath).pipe(res);
  return true;
};

const redirectToEntityImage = async ({
  req,
  res,
  image,
  storageProvider,
  storagePath,
  storageBucket,
}) => {
  if (!image && !storagePath) {
    return res.status(404).json({ message: "Media not found." });
  }

  if (storageProvider === "supabase" && storagePath) {
    try {
      const etag = buildEntityMediaEtag({
        storageProvider,
        storageBucket,
        storagePath,
        image,
      });
      res.setHeader("Cache-Control", "private, max-age=86400, stale-while-revalidate=604800");
      res.setHeader("ETag", etag);

      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }

      const signedUrl = await createSignedMediaUrl({
        storageProvider,
        storagePath,
        storageBucket,
        expiresIn: 60 * 60 * 24 * 7,
      });

      if (signedUrl) {
        return res.redirect(signedUrl);
      }
    } catch (error) {
      console.error("Error signing stable media URL:", error.message);
      return res.status(500).json({ message: "Failed to load media." });
    }
  }

  if (streamLocalEntityImage({ req, res, storagePath, image })) {
    return undefined;
  }

  const fallbackUrl = buildAbsoluteLocalUrl(req, image);
  if (!fallbackUrl) {
    return res.status(404).json({ message: "Media not found." });
  }

  const currentUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  if (fallbackUrl === currentUrl) {
    return res.status(404).json({ message: "Media not found." });
  }

  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  return res.redirect(fallbackUrl);
};

export const getUserImage = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(
      "image imageStorageProvider imageStoragePath imageStorageBucket"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return redirectToEntityImage({
      req,
      res,
      image: user.image,
      storageProvider: user.imageStorageProvider,
      storagePath: user.imageStoragePath,
      storageBucket: user.imageStorageBucket,
    });
  } catch (error) {
    console.error("Error loading user image:", error);
    return res.status(500).json({ message: "Failed to load user image." });
  }
};

export const getGroupImage = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId).select(
      "image imageStorageProvider imageStoragePath imageStorageBucket"
    );

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    return redirectToEntityImage({
      req,
      res,
      image: group.image,
      storageProvider: group.imageStorageProvider,
      storagePath: group.imageStoragePath,
      storageBucket: group.imageStorageBucket,
    });
  } catch (error) {
    console.error("Error loading group image:", error);
    return res.status(500).json({ message: "Failed to load group image." });
  }
};

export const createUploadIntent = async (req, res) => {
  try {
    const uploadIntent = req.validated?.uploadIntent || {};
    const originalName = uploadIntent.originalName || "upload.bin";
    const mimeType = uploadIntent.mimeType || "application/octet-stream";
    const size = Number(uploadIntent.size || 0);
    const maxSize = Number(process.env.SIGNED_UPLOAD_MAX_BYTES || 50 * 1024 * 1024);

    if (!originalName || !mimeType || !size || size > maxSize) {
      return res.status(400).json({ message: "Invalid upload request." });
    }

    const intent = await createSignedUploadIntent({
      userId: req.userId,
      originalName,
      mimeType,
    });

    return res.status(201).json({ intent });
  } catch (error) {
    console.error("Error creating upload intent:", error.message);
    return res.status(500).json({ message: "Unable to create upload intent." });
  }
};

export const getMessageMedia = async (req, res) => {
  try {
    const token = String(req.query?.token || "");
    if (!token) {
      logRuntimeEvent("warn", "media.access.denied", {
        reason: "missing_media_token",
        messageId: String(req.params?.messageId || ""),
      });
      return res.status(401).json({ message: "Missing media token." });
    }

    const payload = verifySignedMediaAccessToken(token);
    const messageId = String(req.params?.messageId || "");

    if (
      !payload?.messageId ||
      String(payload.messageId) !== messageId ||
      payload.scope !== "media_access"
    ) {
      logRuntimeEvent("warn", "media.access.denied", {
        reason: "invalid_media_token",
        messageId,
      });
      return res.status(403).json({ message: "Invalid media token." });
    }

    const message = await Message.findById(messageId).select(
      "storageProvider storagePath storageBucket fileUrl mediaEncryption"
    );

    if (!message?.storagePath || String(message.storagePath) !== String(payload.storagePath || "")) {
      logRuntimeEvent("warn", "media.access.denied", {
        reason: "media_not_found_or_mismatch",
        messageId,
      });
      return res.status(404).json({ message: "Media not found." });
    }

    if (message.storageProvider === "supabase") {
      const signedUrl = await createSignedMediaUrl({
        storageProvider: message.storageProvider,
        storagePath: message.storagePath,
        storageBucket: message.storageBucket,
        expiresIn: Number(process.env.MEDIA_URL_TTL_SECONDS || 300),
      });

      if (!signedUrl) {
        logRuntimeEvent("warn", "media.access.denied", {
          reason: "signed_url_missing",
          messageId,
        });
        return res.status(404).json({ message: "Media not found." });
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.redirect(signedUrl);
    }

    const uploadsRoot = path.resolve(process.cwd(), "uploads", "files");
    const absolutePath = path.resolve(process.cwd(), decodeURIComponent(String(message.storagePath || "")));

    if (!absolutePath.startsWith(uploadsRoot) || !existsSync(absolutePath)) {
      logRuntimeEvent("warn", "media.access.denied", {
        reason: "local_media_missing",
        messageId,
      });
      return res.status(404).json({ message: "Media not found." });
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader(
      "Content-Type",
      message.mediaEncryption?.originalMimeType || "application/octet-stream"
    );
    return createReadStream(absolutePath).pipe(res);
  } catch (error) {
    logRuntimeEvent("warn", "media.access.failed", {
      reason: "unexpected_media_error",
      messageId: String(req.params?.messageId || ""),
      message: error.message,
    });
    console.error("Error loading message media:", error.message);
    return res.status(401).json({ message: "Unable to load media." });
  }
};
