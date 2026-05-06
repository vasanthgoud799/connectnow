import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { createSignedMediaAccessToken } from "../utils/AuthSecurity.js";

const sanitizeFileName = (fileName = "file") =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

const getSupabaseConfig = () => ({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: process.env.SUPABASE_STORAGE_BUCKET || "chat-media",
});

const getFolderForMimeType = (mimeType = "") => {
  if (mimeType.startsWith("image/")) return "images";
  if (mimeType.startsWith("video/")) return "videos";
  if (mimeType.startsWith("audio/")) return "audio";
  return "documents";
};

const getBackendOrigin = (req = null) => {
  if (req) {
    return `${req.protocol}://${req.get("host")}`;
  }

  return (
    process.env.PUBLIC_API_URL ||
    process.env.SERVER_PUBLIC_URL ||
    process.env.APP_BASE_URL ||
    ""
  ).replace(/\/+$/, "");
};

const buildLocalMediaAccessUrl = ({ req, messageId, storageProvider, storagePath }) => {
  const origin = getBackendOrigin(req);
  if (!origin) {
    return storagePath;
  }
  const token = createSignedMediaAccessToken({
    messageId,
    storageProvider,
    storagePath,
  });
  return `${origin}/api/media/messages/${messageId}/file?token=${encodeURIComponent(token)}`;
};

export const buildStableUserAvatarUrl = ({ req, userId }) =>
  `${req.protocol}://${req.get("host")}/api/media/user/${userId}/image`;

export const buildStableGroupImageUrl = ({ req, groupId }) =>
  `${req.protocol}://${req.get("host")}/api/media/group/${groupId}/image`;

const buildStoragePath = ({ userId, originalName, mimeType }) => {
  const folder = getFolderForMimeType(mimeType);
  const timestamp = Date.now();
  const safeName = sanitizeFileName(originalName);
  return `${folder}/${userId}/${timestamp}-${safeName}`;
};

export const createSignedUploadIntent = async ({
  userId,
  originalName = "upload.bin",
  mimeType = "application/octet-stream",
}) => {
  const { url, serviceRoleKey, bucket } = getSupabaseConfig();
  if (!url || !serviceRoleKey || !bucket) {
    throw new Error("Signed uploads are not configured.");
  }

  const storagePath = buildStoragePath({ userId, originalName, mimeType });
  const signUrl = `${url}/storage/v1/object/upload/sign/${bucket}/${storagePath}`;
  const response = await fetch(signUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.url) {
    throw new Error(payload?.message || "Failed to create signed upload URL.");
  }

  return {
    uploadUrl: `${url}/storage/v1${payload.url}`,
    token: payload.token,
    storageProvider: "supabase",
    storagePath,
    storageBucket: bucket,
    expiresIn: 60 * 60 * 2,
  };
};

const buildSupabasePublicUrl = ({ url, bucket, storagePath }) =>
  `${url}/storage/v1/object/public/${bucket}/${storagePath}`;

const hasSupabaseConfig = () => {
  const { url, serviceRoleKey, bucket } = getSupabaseConfig();
  return Boolean(url && serviceRoleKey && bucket);
};

const uploadToSupabase = async ({ file, userId, originalMimeType = "" }) => {
  const { url, serviceRoleKey, bucket } = getSupabaseConfig();
  const storagePath = buildStoragePath({
    userId,
    originalName: file.originalname,
    mimeType: originalMimeType || file.mimetype,
  });

  const uploadUrl = `${url}/storage/v1/object/${bucket}/${storagePath}`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": file.mimetype,
      "x-upsert": "false",
    },
    body: file.buffer,
  });

  const rawText = await response.text();
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = rawText;
  }

  if (!response.ok) {
    const description =
      payload?.error ||
      payload?.message ||
      payload?.msg ||
      rawText ||
      "Supabase upload failed.";
    throw new Error(description);
  }

  const signedUrl = await createSignedMediaUrl({
    storageProvider: "supabase",
    storagePath,
    storageBucket: bucket,
  });

  return {
    fileUrl: signedUrl || buildSupabasePublicUrl({ url, bucket, storagePath }),
    storageProvider: "supabase",
    storagePath,
    storageBucket: bucket,
  };
};

const uploadToLocalDisk = ({ file, req }) => {
  const date = Date.now();
  const fileDir = `uploads/files/${date}`;
  const sanitizedOriginalName = sanitizeFileName(file.originalname);
  const fileName = `${fileDir}/${sanitizedOriginalName}`;
  mkdirSync(fileDir, { recursive: true });

  if (file.buffer) {
    writeFileSync(fileName, file.buffer);
  } else {
    renameSync(file.path, fileName);
  }

  if (file.path) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore temp cleanup failures
    }
  }

  const publicPath = encodeURI(fileName.replace(/\\/g, "/"));
  return {
    fileUrl: publicPath,
    storageProvider: "local",
    storagePath: publicPath,
    storageBucket: null,
  };
};

export const uploadMediaFile = async ({
  file,
  userId,
  req,
  isPrivateMedia = false,
  isStableMedia = false,
  originalMimeType = "",
}) => {
  if (!file) {
    throw new Error("File is required.");
  }

  if ((isPrivateMedia || isStableMedia) && hasSupabaseConfig()) {
    console.log("Using Supabase storage for media uploads.");
    return uploadToSupabase({ file, userId, originalMimeType });
  }

  if (isPrivateMedia || isStableMedia) {
    console.warn("Supabase storage is not configured. Falling back to local uploads/files.");
  }
  return uploadToLocalDisk({ file, req });
};

export const createSignedMediaUrl = async ({
  storageProvider,
  storagePath,
  storageBucket,
  expiresIn = 60 * 60,
}) => {
  if (!storagePath) return null;

  if (storageProvider === "local") {
    return null;
  }

  if (storageProvider !== "supabase") {
    return null;
  }

  const { url, serviceRoleKey, bucket: defaultBucket } = getSupabaseConfig();
  const bucket = storageBucket || defaultBucket;

  if (!url || !serviceRoleKey || !bucket) {
    return null;
  }

  const signUrl = `${url}/storage/v1/object/sign/${bucket}/${storagePath}`;
  const response = await fetch(signUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn }),
  });

  const rawText = await response.text();
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = rawText;
  }

  if (!response.ok) {
    const description =
      payload?.error ||
      payload?.message ||
      payload?.msg ||
      rawText ||
      "Failed to sign media URL.";
    throw new Error(description);
  }

  const signedUrlPath = payload?.signedURL;
  if (!signedUrlPath) {
    return null;
  }

  return `${url}/storage/v1${signedUrlPath}`;
};

export const resolveMediaUrl = async ({ message, req = null, expiresIn } = {}) => {
  if (!message?.fileUrl) return message;

  if (message.storageProvider === "local") {
    if (message.storagePath && message._id) {
      message.fileUrl = buildLocalMediaAccessUrl({
        req,
        messageId: message._id,
        storageProvider: message.storageProvider,
        storagePath: message.storagePath,
      });
    }
    return message;
  }

  if (message.storageProvider === "supabase" && message.storagePath) {
    try {
      const signedUrl = await createSignedMediaUrl({
        storageProvider: message.storageProvider,
        storagePath: message.storagePath,
        storageBucket: message.storageBucket,
        expiresIn,
      });

      if (signedUrl) {
        message.fileUrl = signedUrl;
      }
    } catch (error) {
      console.error("Error creating signed media URL:", error.message);
    }
  }

  return message;
};

export const resolveMediaUrlsForMessages = async ({ messages, req = null, expiresIn } = {}) => {
  if (!Array.isArray(messages) || !messages.length) return messages;

  await Promise.all(
    messages.map((message) => resolveMediaUrl({ message, req, expiresIn }))
  );

  return messages;
};

export const deleteStoredMedia = async ({
  storageProvider,
  storagePath,
  storageBucket,
} = {}) => {
  if (!storageProvider || !storagePath) return;

  if (storageProvider !== "supabase") {
    return;
  }

  const { url, serviceRoleKey, bucket: defaultBucket } = getSupabaseConfig();
  const bucket = storageBucket || defaultBucket;
  if (!url || !serviceRoleKey || !bucket) return;

  const removeUrl = `${url}/storage/v1/object/remove`;
  const response = await fetch(removeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucketId: bucket,
      prefixes: [storagePath],
    }),
  });

  if (!response.ok) {
    const rawText = await response.text();
    throw new Error(rawText || "Failed to delete media from Supabase.");
  }
};
