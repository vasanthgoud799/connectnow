import { apiClient } from "@/lib/api-client";
import {
  E2EE_CONVERSATION_KEYS_ROUTE,
  E2EE_PUBLIC_KEY_ROUTE,
} from "@/utils/constants";
import { decryptAESKey } from "./decryptAESKey";
import { decryptMessage } from "./decryptMessage";
import { encryptAESKey } from "./encryptAESKey";
import { encryptMessage } from "./encryptMessage";
import { generateKeys } from "./generateKeys";
import { base64ToArrayBuffer, arrayBufferToBase64 } from "./helpers";
import {
  getStoredDecryptedMessage,
  getStoredDecryptedMessages,
  getStoredKeyPair,
  setStoredDecryptedMessage,
  setStoredKeyPair,
} from "./indexedDbKeyStore";

const importRsaPublicKey = async (publicKeyJwk) =>
  window.crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );

const importRsaPrivateKey = async (privateKeyJwk) =>
  window.crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );

const importEcdhPublicKey = async (publicKeyJwk) =>
  window.crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

const importEcdhPrivateKey = async (privateKeyJwk) =>
  window.crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

const importAesKeyFromRaw = async (rawKey) =>
  window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

const deriveWrappingKey = async ({ privateKey, publicKey }) => {
  const sharedBits = await window.crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    256
  );

  return importAesKeyFromRaw(sharedBits);
};

const wrapKeyWithEcdh = async ({ aesKey, recipientPublicKeyJwk }) => {
  const ephemeralKeyPair = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const recipientPublicKey = await importEcdhPublicKey(recipientPublicKeyJwk);
  const wrappingKey = await deriveWrappingKey({
    privateKey: ephemeralKeyPair.privateKey,
    publicKey: recipientPublicKey,
  });
  const keyWrapIv = window.crypto.getRandomValues(new Uint8Array(12));
  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedKey = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: keyWrapIv },
    wrappingKey,
    rawAesKey
  );

  return {
    encryptedKey: arrayBufferToBase64(encryptedKey),
    keyWrapIv: arrayBufferToBase64(keyWrapIv.buffer),
    ephPublicKeyJwk: await window.crypto.subtle.exportKey("jwk", ephemeralKeyPair.publicKey),
  };
};

const unwrapKeyWithEcdh = async ({
  encryptedKey,
  keyWrapIv,
  ephPublicKeyJwk,
  recipientPrivateKeyJwk,
}) => {
  const recipientPrivateKey = await importEcdhPrivateKey(recipientPrivateKeyJwk);
  const ephemeralPublicKey = await importEcdhPublicKey(ephPublicKeyJwk);
  const wrappingKey = await deriveWrappingKey({
    privateKey: recipientPrivateKey,
    publicKey: ephemeralPublicKey,
  });
  const rawAesKey = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(base64ToArrayBuffer(keyWrapIv)),
    },
    wrappingKey,
    base64ToArrayBuffer(encryptedKey)
  );

  return importAesKeyFromRaw(rawAesKey);
};

const toRecipientMap = (keys = []) =>
  keys.reduce((accumulator, keyRecord) => {
    if (!keyRecord?.userId) return accumulator;
    accumulator[String(keyRecord.userId)] = keyRecord;
    return accumulator;
  }, {});

const sessionStoragePrefix = "connectnow-e2ee-group-session";
const getGroupSessionStorageKey = (groupId) =>
  `${sessionStoragePrefix}:${String(groupId)}`;
const MAX_GROUP_SESSION_HISTORY = 12;

const getStoredGroupSession = (groupId) => {
  if (typeof window === "undefined") return null;
  const rawValue = window.localStorage.getItem(getGroupSessionStorageKey(groupId));
  if (!rawValue) return null;

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
};

const setStoredGroupSession = (groupId, session) => {
  if (typeof window === "undefined") return;
  const existingSession = getStoredGroupSession(groupId);
  const existingHistory = existingSession?.sessionHistory || {};
  const nextHistory = {
    ...existingHistory,
    ...(session?.sessionId && session?.rawKey
      ? { [String(session.sessionId)]: session.rawKey }
      : {}),
    ...(session?.sessionHistory || {}),
  };
  const trimmedEntries = Object.entries(nextHistory).slice(-MAX_GROUP_SESSION_HISTORY);
  const normalizedSession = {
    ...session,
    sessionHistory: Object.fromEntries(trimmedEntries),
  };
  window.localStorage.setItem(
    getGroupSessionStorageKey(groupId),
    JSON.stringify(normalizedSession)
  );
};

const getStoredGroupSessionCandidates = (groupId, preferredSessionId = null) => {
  const storedSession = getStoredGroupSession(groupId);
  if (!storedSession) return [];

  const candidates = [];
  const pushCandidate = (sessionId, rawKey) => {
    if (!sessionId || !rawKey) return;
    const alreadyExists = candidates.some(
      (candidate) =>
        String(candidate.sessionId) === String(sessionId) &&
        String(candidate.rawKey) === String(rawKey)
    );
    if (!alreadyExists) {
      candidates.push({ sessionId: String(sessionId), rawKey });
    }
  };

  if (preferredSessionId && storedSession.sessionHistory?.[preferredSessionId]) {
    pushCandidate(preferredSessionId, storedSession.sessionHistory[preferredSessionId]);
  }

  pushCandidate(storedSession.sessionId, storedSession.rawKey);

  Object.entries(storedSession.sessionHistory || {}).forEach(([sessionId, rawKey]) => {
    pushCandidate(sessionId, rawKey);
  });

  return candidates;
};

const mediaObjectUrlCache = new Map();
const mediaDecryptPromiseCache = new Map();
const MAX_MEDIA_OBJECT_URL_CACHE_SIZE = 80;
const messageDecryptCache = new Map();
const MAX_MESSAGE_DECRYPT_CACHE_SIZE = 600;

const inferMimeTypeFromEncryptedMedia = (message, mediaEnvelope = {}) => {
  const originalMimeType = String(mediaEnvelope.originalMimeType || "").toLowerCase();
  const fileName = String(mediaEnvelope.originalFileName || "").toLowerCase();
  const messageType = String(message?.messageType || "").toLowerCase();

  const hasExpectedPrefix =
    (messageType === "image" && originalMimeType.startsWith("image/")) ||
    (messageType === "video" && originalMimeType.startsWith("video/")) ||
    (messageType === "audio" && originalMimeType.startsWith("audio/")) ||
    (messageType === "document" &&
      !["image/", "video/", "audio/"].some((prefix) =>
        originalMimeType.startsWith(prefix)
      ));

  if (originalMimeType && hasExpectedPrefix) {
    return originalMimeType;
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  const extensionMimeMap = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: messageType === "audio" ? "audio/webm" : "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
  };

  if (extension && extensionMimeMap[extension]) {
    return extensionMimeMap[extension];
  }

  if (messageType === "image") return "image/jpeg";
  if (messageType === "video") return "video/mp4";
  if (messageType === "audio") return "audio/webm";
  return "application/octet-stream";
};

const trimMediaObjectUrlCache = () => {
  while (mediaObjectUrlCache.size > MAX_MEDIA_OBJECT_URL_CACHE_SIZE) {
    const oldestKey = mediaObjectUrlCache.keys().next().value;
    const oldestValue = mediaObjectUrlCache.get(oldestKey);
    if (oldestValue?.objectUrl) {
      URL.revokeObjectURL(oldestValue.objectUrl);
    }
    mediaObjectUrlCache.delete(oldestKey);
  }
};

const trimMessageDecryptCache = () => {
  while (messageDecryptCache.size > MAX_MESSAGE_DECRYPT_CACHE_SIZE) {
    const oldestKey = messageDecryptCache.keys().next().value;
    messageDecryptCache.delete(oldestKey);
  }
};

const getMessageDecryptCacheKey = (message) => {
  if (!message) return "";
  const messageId = String(message._id || message.id || "message");
  const envelope = message.encryption || {};
  return [
    messageId,
    message.messageType || "",
    envelope.algorithm || "",
    envelope.sessionId || "",
    envelope.iv || "",
    envelope.ciphertext || "",
  ].join(":");
};

const toCachedMessageShape = (message) => ({
  content: message?.content ?? "",
  decryptedContent: message?.decryptedContent ?? "",
  isEncrypted: Boolean(message?.isEncrypted),
  decryptionError: Boolean(message?.decryptionError),
  meta: message?.meta || null,
});

const buildDirectEnvelopeForAesKey = async ({
  aesKey,
  currentUserId,
  recipientUserId,
  recipientKeyRecord,
  localKeyPair,
  payloadType,
}) => {
  if (!recipientKeyRecord?.ecdhPublicKeyJwk) {
    const error = new Error("Recipient has not enabled encrypted messaging yet.");
    error.code = "DIRECT_E2EE_MISSING_RECIPIENT";
    error.missingRecipientIds = [String(recipientUserId)];
    throw error;
  }

  const recipientWrapped = await wrapKeyWithEcdh({
    aesKey,
    recipientPublicKeyJwk: recipientKeyRecord.ecdhPublicKeyJwk,
  });
  const selfPublicKey = await importRsaPublicKey(localKeyPair.publicKeyJwk);
  const selfEncryptedKey = await encryptAESKey(aesKey, selfPublicKey);

  return {
    enabled: true,
    algorithm: "ecdh-rsa-aes-gcm-v2",
    encryptedKeys: {
      [String(recipientUserId)]: recipientWrapped.encryptedKey,
      [String(currentUserId)]: selfEncryptedKey,
    },
    keyWrapIv: recipientWrapped.keyWrapIv,
    ephPublicKeyJwk: recipientWrapped.ephPublicKeyJwk,
    selfEncryptedKey,
    payloadType,
    keyVersion: Number(localKeyPair.keyVersion || 1),
  };
};

const buildGroupEnvelopeForAesKey = async ({
  aesKey,
  groupId,
  conversationKeys,
  localKeyPair,
  payloadType,
}) => {
  const sessionRecipients = Object.keys(conversationKeys);
  const availableRecipients = sessionRecipients.filter(
    (recipientId) => conversationKeys[recipientId]?.publicKeyJwk
  );
  const missingRecipients = sessionRecipients.filter(
    (recipientId) => !conversationKeys[recipientId]?.publicKeyJwk
  );
  if (!availableRecipients.length) {
    const error = new Error("No group members have enabled encrypted messaging yet.");
    error.code = "GROUP_E2EE_NO_READY_RECIPIENTS";
    error.missingRecipientIds = missingRecipients;
    throw error;
  }

  let groupSession = getStoredGroupSession(groupId);
  let encryptedKeys = { ...(groupSession?.encryptedKeys || {}) };
  let sessionId = groupSession?.sessionId || `group:${groupId}:${Date.now()}`;
  let shouldStoreRawKey = false;

  const existingRawKey = groupSession?.rawKey
    ? base64ToArrayBuffer(groupSession.rawKey)
    : null;
  if (existingRawKey) {
    const currentRawKey = await window.crypto.subtle.exportKey("raw", aesKey);
    shouldStoreRawKey =
      arrayBufferToBase64(currentRawKey) !== arrayBufferToBase64(existingRawKey);
  } else {
    shouldStoreRawKey = true;
  }

  const recipientsMissingFromEnvelope = availableRecipients.filter(
    (recipientId) => !encryptedKeys[String(recipientId)]
  );

  if (
    shouldStoreRawKey ||
    !groupSession?.sessionId ||
    !groupSession?.encryptedKeys ||
    recipientsMissingFromEnvelope.length
  ) {
    const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);
    const recipientsToEncrypt = shouldStoreRawKey
      ? availableRecipients
      : recipientsMissingFromEnvelope;

    await Promise.all(
      recipientsToEncrypt.map(async (recipientId) => {
        const recipientRsaKey = await importRsaPublicKey(
          conversationKeys[recipientId].publicKeyJwk
        );
        encryptedKeys[String(recipientId)] = await encryptAESKey(aesKey, recipientRsaKey);
      })
    );

    groupSession = {
      sessionId: shouldStoreRawKey ? `group:${groupId}:${Date.now()}` : sessionId,
      rawKey: arrayBufferToBase64(rawKey),
      encryptedKeys,
      messageCount: 0,
      keyVersion: Number(localKeyPair.keyVersion || 1),
    };
    sessionId = groupSession.sessionId;
  } else {
    encryptedKeys = groupSession.encryptedKeys || {};
    sessionId = groupSession.sessionId;
  }

  setStoredGroupSession(groupId, {
    ...groupSession,
    sessionId,
    encryptedKeys,
    messageCount: Number(groupSession.messageCount || 0) + 1,
  });

  return {
    enabled: true,
    algorithm: "group-session-aes-gcm-v2",
    encryptedKeys,
    payloadType,
    sessionId,
    keyVersion: Number(groupSession.keyVersion || localKeyPair.keyVersion || 1),
    missingRecipientIds: missingRecipients,
  };
};

const buildGroupRsaEnvelopeForAesKey = async ({
  aesKey,
  conversationKeys,
  payloadType,
}) => {
  const recipientIds = Object.keys(conversationKeys);
  const availableRecipients = recipientIds.filter(
    (recipientId) => conversationKeys[recipientId]?.publicKeyJwk
  );
  const missingRecipients = recipientIds.filter(
    (recipientId) => !conversationKeys[recipientId]?.publicKeyJwk
  );

  if (!availableRecipients.length) {
    const error = new Error("No group members have enabled encrypted messaging yet.");
    error.code = "GROUP_E2EE_NO_READY_RECIPIENTS";
    error.missingRecipientIds = missingRecipients;
    throw error;
  }

  const encryptedKeys = {};
  await Promise.all(
    availableRecipients.map(async (recipientId) => {
      const recipientRsaKey = await importRsaPublicKey(
        conversationKeys[recipientId].publicKeyJwk
      );
      encryptedKeys[String(recipientId)] = await encryptAESKey(aesKey, recipientRsaKey);
    })
  );

  return {
    enabled: true,
    algorithm: "rsa-oaep-aes-gcm-v1",
    encryptedKeys,
    payloadType,
    keyVersion: 1,
    missingRecipientIds: missingRecipients,
  };
};

const getOrCreateConversationAesKey = async ({
  aesKey: providedAesKey = null,
  localKeyPair,
  conversationKeys,
  currentUserId,
  userId,
  groupId,
  payloadType,
}) => {
  if (groupId) {
    const existingSession = getStoredGroupSession(groupId);
    const shouldRotateSession =
      !existingSession ||
      !existingSession.rawKey ||
      Number(existingSession.messageCount || 0) >= 25;

    if (!shouldRotateSession) {
      const aesKey = await importAesKeyFromRaw(
        base64ToArrayBuffer(existingSession.rawKey)
      );
      const envelope = await buildGroupEnvelopeForAesKey({
        aesKey,
        groupId,
        conversationKeys,
        localKeyPair,
        payloadType,
      });

      return { aesKey, envelope };
    }
  }

  const aesKey =
    providedAesKey ||
    (await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    ));

  const envelope = !groupId
    ? await buildDirectEnvelopeForAesKey({
        aesKey,
        currentUserId,
        recipientUserId: userId,
        recipientKeyRecord: conversationKeys[String(userId)],
        localKeyPair,
        payloadType,
      })
    : await buildGroupEnvelopeForAesKey({
        aesKey,
        groupId,
        conversationKeys,
        localKeyPair,
        payloadType,
      });

  return { aesKey, envelope };
};

const resolveEnvelopeAesKey = async ({
  envelope,
  currentUserId,
  localKeyPair,
  groupId = null,
}) => {
  if (envelope.algorithm === "ecdh-rsa-aes-gcm-v2") {
    const encryptedForRecipient =
      envelope?.encryptedKeys?.[String(currentUserId)] ||
      envelope?.encryptedKeys?.get?.(String(currentUserId));

    if (
      envelope?.selfEncryptedKey &&
      encryptedForRecipient === envelope.selfEncryptedKey
    ) {
      const privateRsaKey = await importRsaPrivateKey(localKeyPair.privateKeyJwk);
      return decryptAESKey(envelope.selfEncryptedKey, privateRsaKey);
    }

    if (encryptedForRecipient && envelope?.ephPublicKeyJwk && envelope?.keyWrapIv) {
      return unwrapKeyWithEcdh({
        encryptedKey: encryptedForRecipient,
        keyWrapIv: envelope.keyWrapIv,
        ephPublicKeyJwk: envelope.ephPublicKeyJwk,
        recipientPrivateKeyJwk: localKeyPair.ecdhPrivateKeyJwk,
      });
    }

    if (envelope?.selfEncryptedKey) {
      const privateRsaKey = await importRsaPrivateKey(localKeyPair.privateKeyJwk);
      return decryptAESKey(envelope.selfEncryptedKey, privateRsaKey);
    }

    throw new Error("No decryptable key found for direct message.");
  }

  if (envelope.algorithm === "group-session-aes-gcm-v2") {
    let storedSession = groupId ? getStoredGroupSession(groupId) : null;

    if (
      storedSession?.sessionId === envelope.sessionId &&
      storedSession?.rawKey
    ) {
      return importAesKeyFromRaw(base64ToArrayBuffer(storedSession.rawKey));
    }

    const encryptedKey =
      envelope?.encryptedKeys?.[String(currentUserId)] ||
      envelope?.encryptedKeys?.get?.(String(currentUserId));

    if (!encryptedKey && groupId) {
      const candidates = getStoredGroupSessionCandidates(groupId, envelope.sessionId);
      if (candidates.length) {
        const fallbackCandidate = candidates[0];
        return importAesKeyFromRaw(base64ToArrayBuffer(fallbackCandidate.rawKey));
      }
    }

    if (!encryptedKey) {
      throw new Error("No decryptable key found for group message.");
    }

    const privateRsaKey = await importRsaPrivateKey(localKeyPair.privateKeyJwk);
    const aesKey = await decryptAESKey(encryptedKey, privateRsaKey);
    const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);

    if (groupId) {
      setStoredGroupSession(groupId, {
        sessionId: envelope.sessionId,
        rawKey: arrayBufferToBase64(rawKey),
        encryptedKeys: envelope.encryptedKeys || {},
        messageCount: 1,
        keyVersion: Number(envelope.keyVersion || 1),
      });
    }

    return aesKey;
  }

  const encryptedKey =
    envelope?.encryptedKeys?.[String(currentUserId)] ||
    envelope?.encryptedKeys?.get?.(String(currentUserId));
  if (!encryptedKey) {
    throw new Error("No decryptable key found.");
  }
  const privateRsaKey = await importRsaPrivateKey(localKeyPair.privateKeyJwk);
  return decryptAESKey(encryptedKey, privateRsaKey);
};

export const ensureUserE2EEIdentity = async (userInfo) => {
  if (!userInfo?.id || typeof window === "undefined" || !window.crypto?.subtle) {
    return null;
  }

  const existing = await getStoredKeyPair(userInfo.id);
  if (existing?.publicKeyJwk && existing?.privateKeyJwk) {
    if (!userInfo?.e2ee?.enabled || !userInfo?.e2ee?.ecdhEnabled) {
      await apiClient.post(
        E2EE_PUBLIC_KEY_ROUTE,
        {
          publicKeyJwk: existing.publicKeyJwk,
          algorithm: existing.algorithm || "RSA-OAEP",
          keyVersion: Number(existing.keyVersion || 1),
          fingerprint: existing.fingerprint || null,
          ecdhPublicKeyJwk: existing.ecdhPublicKeyJwk || null,
          ecdhKeyVersion: Number(existing.ecdhKeyVersion || 1),
          ecdhFingerprint: existing.ecdhFingerprint || null,
        },
        { withCredentials: true }
      );
    }

    return existing;
  }

  const generated = await generateKeys();
  await apiClient.post(
    E2EE_PUBLIC_KEY_ROUTE,
    {
      publicKeyJwk: generated.publicKeyJwk,
      algorithm: generated.algorithm,
      keyVersion: generated.keyVersion,
      fingerprint: generated.fingerprint,
      ecdhPublicKeyJwk: generated.ecdhPublicKeyJwk,
      ecdhKeyVersion: generated.ecdhKeyVersion,
      ecdhFingerprint: generated.ecdhFingerprint,
    },
    { withCredentials: true }
  );

  await setStoredKeyPair(userInfo.id, generated);
  return generated;
};

export const getLocalKeyPair = async (userId) => {
  const stored = await getStoredKeyPair(userId);
  if (!stored?.privateKeyJwk || !stored?.publicKeyJwk) {
    throw new Error("Encryption keys are not ready on this device.");
  }

  return stored;
};

export const fetchConversationPublicKeys = async ({ userId, groupId }) => {
  const response = await apiClient.get(E2EE_CONVERSATION_KEYS_ROUTE, {
    params: groupId ? { groupId } : { userId },
    withCredentials: true,
  });

  return toRecipientMap(Array.isArray(response.data?.keys) ? response.data.keys : []);
};

export const encryptTextForConversation = async ({
  plaintext,
  currentUserId,
  userId,
  groupId,
  payloadType = "text",
}) => {
  const normalizedPlaintext = String(plaintext || "");
  const localKeyPair = await getLocalKeyPair(currentUserId);
  const conversationKeys = await fetchConversationPublicKeys({ userId, groupId });
  let aesKey;
  let iv;
  let ciphertext;
  let envelope;

  if (!groupId) {
    const encryptedText = await encryptMessage(normalizedPlaintext);
    aesKey = encryptedText.aesKey;
    iv = encryptedText.iv;
    ciphertext = encryptedText.ciphertext;
    ({ envelope } = await getOrCreateConversationAesKey({
      aesKey,
      localKeyPair,
      conversationKeys,
      currentUserId,
      userId,
      groupId,
      payloadType,
    }));
  } else {
    ({ aesKey, envelope } = await getOrCreateConversationAesKey({
      localKeyPair,
      conversationKeys,
      currentUserId,
      userId,
      groupId,
      payloadType,
    }));
    const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
    const cipherBytes = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivBytes },
      aesKey,
      new TextEncoder().encode(normalizedPlaintext)
    );
    iv = arrayBufferToBase64(ivBytes.buffer);
    ciphertext = arrayBufferToBase64(cipherBytes);
  }

  return {
    content: "",
    encryption: {
      ...envelope,
      iv,
      ciphertext,
    },
  };
};

export const encryptMediaFileForConversation = async ({
  file,
  currentUserId,
  userId,
  groupId,
}) => {
  if (!file) {
    throw new Error("File is required for encrypted upload.");
  }

  const localKeyPair = await getLocalKeyPair(currentUserId);
  const conversationKeys = await fetchConversationPublicKeys({ userId, groupId });
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const envelope = groupId
    ? await buildGroupRsaEnvelopeForAesKey({
        aesKey,
        conversationKeys,
        payloadType: "media-file",
      })
    : (
        await getOrCreateConversationAesKey({
          aesKey,
          localKeyPair,
          conversationKeys,
          currentUserId,
          userId,
          groupId,
          payloadType: "media-file",
        })
      ).envelope;

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = await file.arrayBuffer();
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintextBytes
  );

  const encryptedFile = new File(
    [new Blob([ciphertext], { type: "application/octet-stream" })],
    `${file.name}.enc`,
    { type: "application/octet-stream" }
  );

  return {
    encryptedFile,
    mediaEncryption: {
      ...envelope,
      iv: arrayBufferToBase64(iv.buffer),
      payloadType: "media-file",
      originalMimeType: file.type || "application/octet-stream",
      originalFileName: file.name || "attachment",
      fileSize: Number(file.size || 0) || null,
    },
  };
};

export const decryptMediaAttachmentToObjectUrl = async ({
  message,
  currentUserId,
}) => {
  const mediaEnvelope = message?.mediaEncryption;
  if (!mediaEnvelope?.enabled || !message?.fileUrl) {
    return {
      objectUrl: message?.fileUrl || "",
      mimeType: mediaEnvelope?.originalMimeType || null,
      fileName: mediaEnvelope?.originalFileName || null,
      fileSize: mediaEnvelope?.fileSize || null,
    };
  }

  const cacheKey = `${String(message._id || message.id || "message")}:${String(
    message.fileUrl
  )}`;
  const cached = mediaObjectUrlCache.get(cacheKey);
  if (cached) return cached;

  const inFlight = mediaDecryptPromiseCache.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const decryptPromise = (async () => {
    const localKeyPair = await getLocalKeyPair(currentUserId);
    const groupId =
      typeof message.group === "string"
        ? message.group
        : message.group?._id || message.group?.id || null;
    const response = await fetch(message.fileUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch encrypted media.");
    }

    const encryptedBytes = await response.arrayBuffer();
    const decryptBytesWithKey = async (aesKey) =>
      window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(base64ToArrayBuffer(mediaEnvelope.iv)),
        },
        aesKey,
        encryptedBytes
      );

    let decryptedBytes;

    try {
      const aesKey = await resolveEnvelopeAesKey({
        envelope: mediaEnvelope,
        currentUserId,
        localKeyPair,
        groupId,
      });
      decryptedBytes = await decryptBytesWithKey(aesKey);
    } catch (primaryError) {
      if (
        mediaEnvelope?.algorithm === "group-session-aes-gcm-v2" &&
        groupId
      ) {
        const candidates = getStoredGroupSessionCandidates(
          groupId,
          mediaEnvelope?.sessionId
        );

        let recovered = null;
        for (const candidate of candidates) {
          try {
            const candidateKey = await importAesKeyFromRaw(
              base64ToArrayBuffer(candidate.rawKey)
            );
            recovered = await decryptBytesWithKey(candidateKey);
            break;
          } catch {
            // Try next cached group session candidate.
          }
        }

        if (!recovered) {
          throw primaryError;
        }

        decryptedBytes = recovered;
      } else {
        throw primaryError;
      }
    }

    const resolvedMimeType = inferMimeTypeFromEncryptedMedia(message, mediaEnvelope);
    const blob = new Blob([decryptedBytes], {
      type: resolvedMimeType,
    });
    const objectUrl = URL.createObjectURL(blob);
    const resolved = {
      objectUrl,
      mimeType: resolvedMimeType || blob.type,
      fileName: mediaEnvelope.originalFileName || "attachment",
      fileSize: mediaEnvelope.fileSize || blob.size,
    };
    mediaObjectUrlCache.set(cacheKey, resolved);
    trimMediaObjectUrlCache();
    return resolved;
  })();

  mediaDecryptPromiseCache.set(cacheKey, decryptPromise);

  try {
    return await decryptPromise;
  } finally {
    mediaDecryptPromiseCache.delete(cacheKey);
  }
};

export const preloadRecentEncryptedMedia = async ({
  messages,
  currentUserId,
  limit = 8,
}) => {
  if (!currentUserId) return Array.isArray(messages) ? messages : [];

  const nextMessages = Array.isArray(messages) ? [...messages] : [];
  const encryptedMediaIndexes = nextMessages
    .map((message, index) => ({ message, index }))
    .filter(
      ({ message }) =>
        message?.mediaEncryption?.enabled &&
        message?.fileUrl &&
        ["image", "video", "audio", "document"].includes(message?.messageType)
    )
    .slice(-limit);

  if (!encryptedMediaIndexes.length) {
    return nextMessages;
  }

  const resolvedEntries = await Promise.all(
    encryptedMediaIndexes.map(async ({ message, index }) => {
      try {
        const resolvedMedia = await decryptMediaAttachmentToObjectUrl({
          message,
          currentUserId,
        });
        return { index, resolvedMedia };
      } catch {
        return { index, resolvedMedia: null };
      }
    })
  );

  resolvedEntries.forEach(({ index, resolvedMedia }) => {
    if (resolvedMedia) {
      nextMessages[index] = {
        ...nextMessages[index],
        resolvedMedia,
      };
    }
  });

  return nextMessages;
};

export const decryptIncomingMessage = async ({ message, currentUserId }) => {
  if (!message?.encryption?.enabled) {
    return message;
  }

  const localKeyPair = await getLocalKeyPair(currentUserId);
  const cacheKey = getMessageDecryptCacheKey(message);
  const cachedMessage = cacheKey ? messageDecryptCache.get(cacheKey) : null;

  if (cachedMessage) {
    return {
      ...message,
      ...cachedMessage,
    };
  }

  if (cacheKey) {
    try {
      const persistedMessage = await getStoredDecryptedMessage(cacheKey);
      if (persistedMessage) {
        messageDecryptCache.set(cacheKey, persistedMessage);
        trimMessageDecryptCache();
        return {
          ...message,
          ...persistedMessage,
        };
      }
    } catch {
      // Ignore cache read failures and fall back to live decryption.
    }
  }

  try {
    let plaintext = "";
    const groupId =
      typeof message.group === "string"
        ? message.group
        : message.group?._id || message.group?.id || null;
    const aesKey = await resolveEnvelopeAesKey({
      envelope: message.encryption,
      currentUserId,
      localKeyPair,
      groupId,
    });

    plaintext = await decryptMessage({
      ciphertext: message.encryption.ciphertext,
      iv: message.encryption.iv,
      aesKey,
    });

    if (message.messageType === "poll") {
      const pollPayload = JSON.parse(plaintext);
      const existingOptions = Array.isArray(message.meta?.poll?.options)
        ? message.meta.poll.options
        : [];

      const resolvedMessage = {
        ...message,
        meta: {
          ...message.meta,
          poll: {
            ...(message.meta?.poll || {}),
            question: pollPayload.question || "",
            options: existingOptions.map((option, index) => ({
              ...option,
              text: pollPayload.options?.[index]?.text || option.text || `Option ${index + 1}`,
            })),
          },
        },
        decryptedContent: plaintext,
        isEncrypted: true,
        decryptionError: false,
      };
      if (cacheKey) {
        const cachedValue = toCachedMessageShape(resolvedMessage);
        messageDecryptCache.set(cacheKey, cachedValue);
        trimMessageDecryptCache();
        void setStoredDecryptedMessage(cacheKey, cachedValue);
      }
      return resolvedMessage;
    }

    if (message.encryption?.payloadType === "attachment-caption") {
      const resolvedMessage = {
        ...message,
        decryptedContent: plaintext,
        isEncrypted: true,
        decryptionError: false,
      };
      if (cacheKey) {
        const cachedValue = toCachedMessageShape(resolvedMessage);
        messageDecryptCache.set(cacheKey, cachedValue);
        trimMessageDecryptCache();
        void setStoredDecryptedMessage(cacheKey, cachedValue);
      }
      return resolvedMessage;
    }

    const resolvedMessage = {
      ...message,
      content: plaintext,
      decryptedContent: plaintext,
      isEncrypted: true,
      decryptionError: false,
    };
    if (cacheKey) {
      const cachedValue = toCachedMessageShape(resolvedMessage);
      messageDecryptCache.set(cacheKey, cachedValue);
      trimMessageDecryptCache();
      void setStoredDecryptedMessage(cacheKey, cachedValue);
    }
    return resolvedMessage;
  } catch (error) {
    if (
      message?.encryption?.algorithm === "group-session-aes-gcm-v2" &&
      (typeof message.group === "string" || message.group?._id || message.group?.id)
    ) {
      const groupId =
        typeof message.group === "string"
          ? message.group
          : message.group?._id || message.group?.id;
      const candidates = getStoredGroupSessionCandidates(
        groupId,
        message?.encryption?.sessionId
      );

      for (const candidate of candidates) {
        try {
          const candidateKey = await importAesKeyFromRaw(
            base64ToArrayBuffer(candidate.rawKey)
          );
          const plaintext = await decryptMessage({
            ciphertext: message.encryption.ciphertext,
            iv: message.encryption.iv,
            aesKey: candidateKey,
          });

          if (message.messageType === "poll") {
            const pollPayload = JSON.parse(plaintext);
            const existingOptions = Array.isArray(message.meta?.poll?.options)
              ? message.meta.poll.options
              : [];

            const resolvedMessage = {
              ...message,
              meta: {
                ...message.meta,
                poll: {
                  ...(message.meta?.poll || {}),
                  question: pollPayload.question || "",
                  options: existingOptions.map((option, index) => ({
                    ...option,
                    text: pollPayload.options?.[index]?.text || option.text || `Option ${index + 1}`,
                  })),
                },
              },
              decryptedContent: plaintext,
              isEncrypted: true,
              decryptionError: false,
            };
            if (cacheKey) {
              const cachedValue = toCachedMessageShape(resolvedMessage);
              messageDecryptCache.set(cacheKey, cachedValue);
              trimMessageDecryptCache();
              void setStoredDecryptedMessage(cacheKey, cachedValue);
            }
            return resolvedMessage;
          }

          if (message.encryption?.payloadType === "attachment-caption") {
            const resolvedMessage = {
              ...message,
              decryptedContent: plaintext,
              isEncrypted: true,
              decryptionError: false,
            };
            if (cacheKey) {
              const cachedValue = toCachedMessageShape(resolvedMessage);
              messageDecryptCache.set(cacheKey, cachedValue);
              trimMessageDecryptCache();
              void setStoredDecryptedMessage(cacheKey, cachedValue);
            }
            return resolvedMessage;
          }

          const resolvedMessage = {
            ...message,
            content: plaintext,
            decryptedContent: plaintext,
            isEncrypted: true,
            decryptionError: false,
          };
          if (cacheKey) {
            const cachedValue = toCachedMessageShape(resolvedMessage);
            messageDecryptCache.set(cacheKey, cachedValue);
            trimMessageDecryptCache();
            void setStoredDecryptedMessage(cacheKey, cachedValue);
          }
          return resolvedMessage;
        } catch {
          // Try next cached group session candidate.
        }
      }
    }

    console.error("E2EE decrypt failed:", error);
    return {
      ...message,
      content:
        message.messageType === "text"
          ? "[Unable to decrypt message on this device]"
          : message.content,
      decryptionError: true,
      isEncrypted: true,
    };
  }
};

export const decryptIncomingMessages = async ({ messages, currentUserId }) =>
  Promise.all(
    (Array.isArray(messages) ? messages : []).map((message) =>
      decryptIncomingMessage({ message, currentUserId })
    )
  );

export const hydrateMessagesFromCache = async ({ messages }) => {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  const cacheKeys = normalizedMessages
    .map((message) => getMessageDecryptCacheKey(message))
    .filter(Boolean);

  if (!cacheKeys.length) {
    return normalizedMessages;
  }

  let persistedEntries = {};
  try {
    persistedEntries = await getStoredDecryptedMessages(cacheKeys);
  } catch {
    persistedEntries = {};
  }

  return normalizedMessages.map((message) => {
    const cacheKey = getMessageDecryptCacheKey(message);
    const cachedValue =
      (cacheKey && messageDecryptCache.get(cacheKey)) ||
      (cacheKey ? persistedEntries[cacheKey] : null);

    if (!cachedValue) return message;

    if (cacheKey && !messageDecryptCache.has(cacheKey)) {
      messageDecryptCache.set(cacheKey, cachedValue);
      trimMessageDecryptCache();
    }

    return {
      ...message,
      ...cachedValue,
    };
  });
};

const resolveChatPreviewContent = (message) => {
  if (!message) return "";

  if (message.messageType === "poll") {
    return message.meta?.poll?.question || "Poll";
  }

  if (message.encryption?.payloadType === "attachment-caption") {
    return (
      message.decryptedContent ||
      message.content ||
      (message.messageType === "audio" ? "Audio" : "Attachment")
    );
  }

  if (message.messageType === "text") {
    return message.decryptedContent || message.content || "";
  }

  return (
    message.content ||
    (message.messageType === "image"
      ? "Image"
      : message.messageType === "video"
        ? "Video"
        : message.messageType === "audio"
          ? "Audio"
          : message.messageType === "document"
            ? "Document"
            : "")
  );
};

export const decryptChatSummaries = async ({ chats, currentUserId }) => {
  if (!currentUserId) {
    return Array.isArray(chats) ? chats : [];
  }

  return Promise.all(
    (Array.isArray(chats) ? chats : []).map(async (chat) => {
      const lastMessage = chat?.lastMessage;
      if (!lastMessage?.encryption?.enabled) {
        return chat;
      }

      try {
        const decryptedMessage = await decryptIncomingMessage({
          message: {
            ...lastMessage,
            _id: lastMessage.messageId,
            group: chat?.group?._id || null,
          },
          currentUserId,
        });

        return {
          ...chat,
          lastMessage: {
            ...chat.lastMessage,
            content: resolveChatPreviewContent(decryptedMessage),
            meta: decryptedMessage.meta || chat.lastMessage.meta,
            decryptionError: Boolean(decryptedMessage.decryptionError),
          },
        };
      } catch {
        return chat;
      }
    })
  );
};

export const hydrateChatSummariesFromCache = async ({ chats }) => {
  const normalizedChats = Array.isArray(chats) ? chats : [];
  const cacheKeys = normalizedChats
    .map((chat) => getMessageDecryptCacheKey({
      ...chat?.lastMessage,
      _id: chat?.lastMessage?.messageId,
      group: chat?.group?._id || null,
    }))
    .filter(Boolean);

  if (!cacheKeys.length) {
    return normalizedChats;
  }

  let persistedEntries = {};
  try {
    persistedEntries = await getStoredDecryptedMessages(cacheKeys);
  } catch {
    persistedEntries = {};
  }

  return normalizedChats.map((chat) => {
    const lastMessage = chat?.lastMessage;
    if (!lastMessage?.encryption?.enabled) return chat;

    const cacheKey = getMessageDecryptCacheKey({
      ...lastMessage,
      _id: lastMessage.messageId,
      group: chat?.group?._id || null,
    });
    const cachedValue =
      (cacheKey && messageDecryptCache.get(cacheKey)) ||
      (cacheKey ? persistedEntries[cacheKey] : null);

    if (!cachedValue) return chat;

    if (cacheKey && !messageDecryptCache.has(cacheKey)) {
      messageDecryptCache.set(cacheKey, cachedValue);
      trimMessageDecryptCache();
    }

    return {
      ...chat,
      lastMessage: {
        ...lastMessage,
        content: resolveChatPreviewContent({
          ...lastMessage,
          ...cachedValue,
        }),
        meta: cachedValue.meta || lastMessage.meta,
        decryptionError: Boolean(cachedValue.decryptionError),
      },
    };
  });
};
