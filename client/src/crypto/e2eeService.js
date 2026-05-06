import { apiClient } from "@/lib/api-client";
import {
  E2EE_CONVERSATION_KEYS_ROUTE,
  E2EE_PUBLIC_KEY_ROUTE,
} from "@/utils/constants";
import { resetCryptoWorker, runCryptoWorkerTask } from "./cryptoWorkerClient";
import {
  clearStoredE2EEData,
  deleteStoredTrustRecord,
  getStoredDecryptedMessage,
  getStoredDecryptedMessages,
  getStoredGroupSessionRecord,
  getStoredKeyPair,
  getStoredTrustRecord,
  setStoredDecryptedMessage,
  setStoredGroupSessionRecord,
  setStoredKeyPair,
  setStoredTrustRecord,
} from "./indexedDbKeyStore";

const toRecipientMap = (keys = []) =>
  keys.reduce((accumulator, keyRecord) => {
    if (!keyRecord?.userId) return accumulator;
    accumulator[String(keyRecord.userId)] = keyRecord;
    return accumulator;
  }, {});

const MAX_GROUP_SESSION_HISTORY = 12;
const GROUP_SESSION_MAX_AGE_MS = 15 * 60 * 1000;
const groupSessionMemoryCache = new Map();
const getStoredGroupSession = async (groupId) => {
  const normalizedGroupId = String(groupId);
  if (groupSessionMemoryCache.has(normalizedGroupId)) {
    return groupSessionMemoryCache.get(normalizedGroupId);
  }

  const storedValue = await getStoredGroupSessionRecord(normalizedGroupId);
  if (storedValue) {
    groupSessionMemoryCache.set(normalizedGroupId, storedValue);
  }

  return storedValue;
};

const setStoredGroupSession = async (groupId, session) => {
  const existingSession = await getStoredGroupSession(groupId);
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
    createdAt:
      session?.createdAt ||
      existingSession?.createdAt ||
      new Date().toISOString(),
    sessionHistory: Object.fromEntries(trimmedEntries),
  };
  groupSessionMemoryCache.set(String(groupId), normalizedSession);
  await setStoredGroupSessionRecord(String(groupId), normalizedSession);
};

const getStoredGroupSessionCandidates = async (groupId, preferredSessionId = null) => {
  const storedSession = await getStoredGroupSession(groupId);
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
const messageDecryptPromiseCache = new Map();
const MAX_MESSAGE_DECRYPT_CACHE_SIZE = 600;
const conversationKeysCache = new Map();
const conversationKeysPromiseCache = new Map();
const CONVERSATION_KEYS_TTL_MS = 30 * 1000;
const DECRYPT_BATCH_SIZE = 20;
const FINGERPRINT_GROUP_SIZE = 6;

const yieldToBrowser = () =>
  new Promise((resolve) => {
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });

const decryptMessagesInBatches = async ({
  messages,
  currentUserId,
  mapMessage,
}) => {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  const decrypted = [];

  for (let index = 0; index < normalizedMessages.length; index += 1) {
    decrypted.push(
      await mapMessage({
        message: normalizedMessages[index],
        currentUserId,
      })
    );

    if ((index + 1) % DECRYPT_BATCH_SIZE === 0) {
      await yieldToBrowser();
    }
  }

  return decrypted;
};

export const formatFingerprintForDisplay = (fingerprint) =>
  String(fingerprint || "")
    .replace(/\s+/g, "")
    .match(new RegExp(`.{1,${FINGERPRINT_GROUP_SIZE}}`, "g"))
    ?.join(" ")
    ?.trim() || "Unavailable";

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

const buildDirectEnvelopeForRawKey = async ({
  rawKey,
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

  const recipientWrapped = await runCryptoWorkerTask("wrapRawKeyWithEcdh", {
    rawKey,
    recipientPublicKeyJwk: recipientKeyRecord.ecdhPublicKeyJwk,
  });
  const { encryptedKey: selfEncryptedKey } = await runCryptoWorkerTask(
    "encryptRawAesKeyForRsa",
    {
      rawKey,
      publicKeyJwk: localKeyPair.publicKeyJwk,
    }
  );

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

const buildGroupEnvelopeForRawKey = async ({
  rawKey,
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

  const now = Date.now();
  let groupSession = await getStoredGroupSession(groupId);
  let encryptedKeys = { ...(groupSession?.encryptedKeys || {}) };
  let sessionId = groupSession?.sessionId || `group:${groupId}:${now}`;
  const shouldStoreRawKey = String(groupSession?.rawKey || "") !== String(rawKey || "");

  const recipientsMissingFromEnvelope = availableRecipients.filter(
    (recipientId) => !encryptedKeys[String(recipientId)]
  );

  if (
    shouldStoreRawKey ||
    !groupSession?.sessionId ||
    !groupSession?.encryptedKeys ||
    recipientsMissingFromEnvelope.length
  ) {
    const recipientsToEncrypt = shouldStoreRawKey
      ? availableRecipients
      : recipientsMissingFromEnvelope;

    await Promise.all(
      recipientsToEncrypt.map(async (recipientId) => {
        const { encryptedKey } = await runCryptoWorkerTask("encryptRawAesKeyForRsa", {
          rawKey,
          publicKeyJwk: conversationKeys[recipientId].publicKeyJwk,
        });
        encryptedKeys[String(recipientId)] = encryptedKey;
      })
    );

    groupSession = {
      sessionId: shouldStoreRawKey ? `group:${groupId}:${now}` : sessionId,
      rawKey,
      encryptedKeys,
      messageCount: 0,
      keyVersion: Number(localKeyPair.keyVersion || 1),
      createdAt: shouldStoreRawKey
        ? new Date(now).toISOString()
        : groupSession?.createdAt || new Date(now).toISOString(),
    };
    sessionId = groupSession.sessionId;
  } else {
    encryptedKeys = groupSession.encryptedKeys || {};
    sessionId = groupSession.sessionId;
  }

  await setStoredGroupSession(groupId, {
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

const buildGroupRsaEnvelopeForRawKey = async ({
  rawKey,
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
      const { encryptedKey } = await runCryptoWorkerTask("encryptRawAesKeyForRsa", {
        rawKey,
        publicKeyJwk: conversationKeys[recipientId].publicKeyJwk,
      });
      encryptedKeys[String(recipientId)] = encryptedKey;
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

const getOrCreateConversationSessionKey = async ({
  rawKey: providedRawKey = null,
  localKeyPair,
  conversationKeys,
  currentUserId,
  userId,
  groupId,
  payloadType,
}) => {
  if (groupId) {
    const existingSession = await getStoredGroupSession(groupId);
    const createdAtMs = existingSession?.createdAt
      ? new Date(existingSession.createdAt).getTime()
      : 0;
    const shouldRotateSession =
      !existingSession ||
      !existingSession.rawKey ||
      Number(existingSession.messageCount || 0) >= 25 ||
      Date.now() - createdAtMs >= GROUP_SESSION_MAX_AGE_MS;

    if (!shouldRotateSession) {
      const rawKey = existingSession.rawKey;
      const envelope = await buildGroupEnvelopeForRawKey({
        rawKey,
        groupId,
        conversationKeys,
        localKeyPair,
        payloadType,
      });

      return { rawKey, envelope };
    }
  }

  const rawKey =
    providedRawKey || (await runCryptoWorkerTask("generateAesKey")).rawKey;

  const envelope = !groupId
    ? await buildDirectEnvelopeForRawKey({
        rawKey,
        currentUserId,
        recipientUserId: userId,
        recipientKeyRecord: conversationKeys[String(userId)],
        localKeyPair,
        payloadType,
      })
    : await buildGroupEnvelopeForRawKey({
        rawKey,
        groupId,
        conversationKeys,
        localKeyPair,
        payloadType,
      });

  return { rawKey, envelope };
};

const resolveEnvelopeRawKey = async ({
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
      return (
        await runCryptoWorkerTask("decryptRawAesKeyForRsa", {
          encryptedKey: envelope.selfEncryptedKey,
          privateKeyJwk: localKeyPair.privateKeyJwk,
        })
      ).rawKey;
    }

    if (encryptedForRecipient && envelope?.ephPublicKeyJwk && envelope?.keyWrapIv) {
      return (
        await runCryptoWorkerTask("unwrapRawKeyWithEcdh", {
        encryptedKey: encryptedForRecipient,
        keyWrapIv: envelope.keyWrapIv,
        ephPublicKeyJwk: envelope.ephPublicKeyJwk,
        recipientPrivateKeyJwk: localKeyPair.ecdhPrivateKeyJwk,
        })
      ).rawKey;
    }

    if (envelope?.selfEncryptedKey) {
      return (
        await runCryptoWorkerTask("decryptRawAesKeyForRsa", {
          encryptedKey: envelope.selfEncryptedKey,
          privateKeyJwk: localKeyPair.privateKeyJwk,
        })
      ).rawKey;
    }

    throw new Error("No decryptable key found for direct message.");
  }

  if (envelope.algorithm === "group-session-aes-gcm-v2") {
    let storedSession = groupId ? await getStoredGroupSession(groupId) : null;

    if (
      storedSession?.sessionId === envelope.sessionId &&
      storedSession?.rawKey
    ) {
      return storedSession.rawKey;
    }

    const encryptedKey =
      envelope?.encryptedKeys?.[String(currentUserId)] ||
      envelope?.encryptedKeys?.get?.(String(currentUserId));

    if (!encryptedKey && groupId) {
      const candidates = await getStoredGroupSessionCandidates(groupId, envelope.sessionId);
      if (candidates.length) {
        const fallbackCandidate = candidates[0];
        return fallbackCandidate.rawKey;
      }
    }

    if (!encryptedKey) {
      throw new Error("No decryptable key found for group message.");
    }

    const { rawKey } = await runCryptoWorkerTask("decryptRawAesKeyForRsa", {
      encryptedKey,
      privateKeyJwk: localKeyPair.privateKeyJwk,
    });

    if (groupId) {
      await setStoredGroupSession(groupId, {
        sessionId: envelope.sessionId,
        rawKey,
        encryptedKeys: envelope.encryptedKeys || {},
        messageCount: 1,
        keyVersion: Number(envelope.keyVersion || 1),
        createdAt: new Date().toISOString(),
      });
    }

    return rawKey;
  }

  const encryptedKey =
    envelope?.encryptedKeys?.[String(currentUserId)] ||
    envelope?.encryptedKeys?.get?.(String(currentUserId));
  if (!encryptedKey) {
    throw new Error("No decryptable key found.");
  }
  return (
    await runCryptoWorkerTask("decryptRawAesKeyForRsa", {
      encryptedKey,
      privateKeyJwk: localKeyPair.privateKeyJwk,
    })
  ).rawKey;
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

  const generated = await runCryptoWorkerTask("generateIdentityKeys");
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

export const getLocalIdentitySummary = async (userId) => {
  if (!userId) return null;
  const localKeyPair = await getStoredKeyPair(userId);
  if (!localKeyPair?.publicKeyJwk) {
    return null;
  }

  return {
    fingerprint: localKeyPair.fingerprint || null,
    fingerprintDisplay: formatFingerprintForDisplay(localKeyPair.fingerprint),
    ecdhFingerprint: localKeyPair.ecdhFingerprint || null,
    ecdhFingerprintDisplay: formatFingerprintForDisplay(localKeyPair.ecdhFingerprint),
    keyVersion: Number(localKeyPair.keyVersion || 1),
    ecdhKeyVersion: Number(localKeyPair.ecdhKeyVersion || 1),
  };
};

export const getDirectContactTrustState = async ({ currentUserId, contactId }) => {
  if (!currentUserId || !contactId) {
    return null;
  }

  const conversationKeys = await fetchConversationPublicKeys({ userId: contactId });
  const keyRecord = conversationKeys[String(contactId)] || null;
  if (!keyRecord?.publicKeyJwk) {
    return {
      fingerprint: null,
      fingerprintDisplay: formatFingerprintForDisplay(null),
      status: "missing",
      verifiedAt: null,
    };
  }

  const trustRecord = await getStoredTrustRecord(contactId);
  const currentFingerprint = keyRecord.fingerprint || null;
  const trustedFingerprint = trustRecord?.fingerprint || null;
  const status =
    trustedFingerprint && currentFingerprint && trustedFingerprint === currentFingerprint
      ? "verified"
      : trustedFingerprint && currentFingerprint && trustedFingerprint !== currentFingerprint
        ? "changed"
        : "unverified";

  return {
    fingerprint: currentFingerprint,
    fingerprintDisplay: formatFingerprintForDisplay(currentFingerprint),
    ecdhFingerprint: keyRecord.ecdhFingerprint || null,
    ecdhFingerprintDisplay: formatFingerprintForDisplay(keyRecord.ecdhFingerprint),
    status,
    verifiedAt: trustRecord?.verifiedAt || null,
    trustedFingerprint,
    keyVersion: Number(keyRecord.keyVersion || 1),
    ecdhKeyVersion: Number(keyRecord.ecdhKeyVersion || 1),
  };
};

export const verifyDirectContactFingerprint = async ({
  contactId,
  fingerprint,
  displayName = "",
}) => {
  if (!contactId || !fingerprint) {
    throw new Error("Contact fingerprint is required for verification.");
  }

  return setStoredTrustRecord(contactId, {
    fingerprint,
    displayName,
    verifiedAt: new Date().toISOString(),
  });
};

export const clearDirectContactVerification = async (contactId) => {
  if (!contactId) return;
  await deleteStoredTrustRecord(contactId);
};

export const getLocalKeyPair = async (userId) => {
  const stored = await getStoredKeyPair(userId);
  if (!stored?.privateKeyJwk || !stored?.publicKeyJwk) {
    throw new Error("Encryption keys are not ready on this device.");
  }

  return stored;
};

export const fetchConversationPublicKeys = async ({ userId, groupId }) => {
  const cacheKey = groupId ? `group:${groupId}` : `direct:${userId}`;
  const now = Date.now();
  const cachedEntry = conversationKeysCache.get(cacheKey);

  if (cachedEntry && cachedEntry.expiresAt > now) {
    return cachedEntry.value;
  }

  if (conversationKeysPromiseCache.has(cacheKey)) {
    return conversationKeysPromiseCache.get(cacheKey);
  }

  const request = apiClient
    .get(E2EE_CONVERSATION_KEYS_ROUTE, {
      params: groupId ? { groupId } : { userId },
      withCredentials: true,
    })
    .then((response) => {
      const normalizedKeys = toRecipientMap(
        Array.isArray(response.data?.keys) ? response.data.keys : []
      );
      conversationKeysCache.set(cacheKey, {
        value: normalizedKeys,
        expiresAt: Date.now() + CONVERSATION_KEYS_TTL_MS,
      });
      return normalizedKeys;
    })
    .finally(() => {
      conversationKeysPromiseCache.delete(cacheKey);
    });

  conversationKeysPromiseCache.set(cacheKey, request);
  return request;
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
  let rawKey;
  let iv;
  let ciphertext;
  let envelope;

  if (!groupId) {
    ({ rawKey } = await runCryptoWorkerTask("generateAesKey"));
    ({ iv, ciphertext } = await runCryptoWorkerTask("encryptTextWithRawKey", {
      plaintext: normalizedPlaintext,
      rawKey,
    }));
    ({ envelope } = await getOrCreateConversationSessionKey({
      rawKey,
      localKeyPair,
      conversationKeys,
      currentUserId,
      userId,
      groupId,
      payloadType,
    }));
  } else {
    ({ rawKey, envelope } = await getOrCreateConversationSessionKey({
      localKeyPair,
      conversationKeys,
      currentUserId,
      userId,
      groupId,
      payloadType,
    }));
    ({ iv, ciphertext } = await runCryptoWorkerTask("encryptTextWithRawKey", {
      plaintext: normalizedPlaintext,
      rawKey,
    }));
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
  const { rawKey } = await runCryptoWorkerTask("generateAesKey");
  const envelope = groupId
    ? await buildGroupRsaEnvelopeForRawKey({
        rawKey,
        conversationKeys,
        payloadType: "media-file",
      })
    : (
        await getOrCreateConversationSessionKey({
          rawKey,
          localKeyPair,
          conversationKeys,
          currentUserId,
          userId,
          groupId,
          payloadType: "media-file",
        })
      ).envelope;

  const plaintextBytes = await file.arrayBuffer();
  const { buffer: ciphertextBuffer, iv } = await runCryptoWorkerTask(
    "encryptBinaryWithRawKey",
    {
      rawKey,
      buffer: plaintextBytes,
    },
    [plaintextBytes]
  );

  const encryptedFile = new File(
    [new Blob([ciphertextBuffer], { type: "application/octet-stream" })],
    `${file.name}.enc`,
    { type: "application/octet-stream" }
  );

  return {
    encryptedFile,
    mediaEncryption: {
      ...envelope,
      iv,
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
      runCryptoWorkerTask("decryptBinaryWithRawKey", {
        rawKey: aesKey,
        iv: mediaEnvelope.iv,
        buffer: encryptedBytes,
      });

    let decryptedBytesBuffer;

    try {
      const rawKey = await resolveEnvelopeRawKey({
        envelope: mediaEnvelope,
        currentUserId,
        localKeyPair,
        groupId,
      });
      decryptedBytesBuffer = (await decryptBytesWithKey(rawKey)).buffer;
    } catch (primaryError) {
      if (
        mediaEnvelope?.algorithm === "group-session-aes-gcm-v2" &&
        groupId
      ) {
        const candidates = await getStoredGroupSessionCandidates(
          groupId,
          mediaEnvelope?.sessionId
        );

        let recovered = null;
        for (const candidate of candidates) {
          try {
            recovered = await decryptBytesWithKey(candidate.rawKey);
            break;
          } catch {
            // Try next cached group session candidate.
          }
        }

        if (!recovered) {
          throw primaryError;
        }

        decryptedBytesBuffer = recovered?.buffer;
      } else {
        throw primaryError;
      }
    }

    const resolvedMimeType = inferMimeTypeFromEncryptedMedia(message, mediaEnvelope);
    const blob = new Blob([decryptedBytesBuffer], {
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

const buildDecryptedMessageShape = ({ message, plaintext }) => {
  if (message.messageType === "poll") {
    const pollPayload = JSON.parse(plaintext);
    const existingOptions = Array.isArray(message.meta?.poll?.options)
      ? message.meta.poll.options
      : [];

    return toCachedMessageShape({
      ...message,
      meta: {
        ...message.meta,
        poll: {
          ...(message.meta?.poll || {}),
          question: pollPayload.question || "",
          options: existingOptions.map((option, index) => ({
            ...option,
            text:
              pollPayload.options?.[index]?.text ||
              option.text ||
              `Option ${index + 1}`,
          })),
        },
      },
      decryptedContent: plaintext,
      isEncrypted: true,
      decryptionError: false,
    });
  }

  if (message.encryption?.payloadType === "attachment-caption") {
    return toCachedMessageShape({
      ...message,
      decryptedContent: plaintext,
      isEncrypted: true,
      decryptionError: false,
    });
  }

  return toCachedMessageShape({
    ...message,
    content: plaintext,
    decryptedContent: plaintext,
    isEncrypted: true,
    decryptionError: false,
  });
};

export const decryptIncomingMessage = async ({ message, currentUserId }) => {
  if (!message?.encryption?.enabled) {
    return message;
  }

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

  if (cacheKey && messageDecryptPromiseCache.has(cacheKey)) {
    const inFlightMessage = await messageDecryptPromiseCache.get(cacheKey);
    return {
      ...message,
      ...inFlightMessage,
    };
  }

  const decryptPromise = (async () => {
    const localKeyPair = await getLocalKeyPair(currentUserId);

    try {
      let plaintext = "";
      const groupId =
        typeof message.group === "string"
          ? message.group
          : message.group?._id || message.group?.id || null;
      const rawKey = await resolveEnvelopeRawKey({
        envelope: message.encryption,
        currentUserId,
        localKeyPair,
        groupId,
      });

      plaintext = (
        await runCryptoWorkerTask("decryptTextWithRawKey", {
        ciphertext: message.encryption.ciphertext,
        iv: message.encryption.iv,
        rawKey,
        })
      ).plaintext;

      return buildDecryptedMessageShape({ message, plaintext });
    } catch (error) {
      if (
        message?.encryption?.algorithm === "group-session-aes-gcm-v2" &&
        (typeof message.group === "string" || message.group?._id || message.group?.id)
      ) {
        const groupId =
          typeof message.group === "string"
            ? message.group
            : message.group?._id || message.group?.id;
        const candidates = await getStoredGroupSessionCandidates(
          groupId,
          message?.encryption?.sessionId
        );

        for (const candidate of candidates) {
          try {
            const plaintext = (
              await runCryptoWorkerTask("decryptTextWithRawKey", {
              ciphertext: message.encryption.ciphertext,
              iv: message.encryption.iv,
              rawKey: candidate.rawKey,
              })
            ).plaintext;

            return buildDecryptedMessageShape({ message, plaintext });
          } catch {
            // Try next cached group session candidate.
          }
        }
      }

      console.error("E2EE decrypt failed:", error);
      return toCachedMessageShape({
        content:
          message.messageType === "text"
            ? "[Unable to decrypt message on this device]"
            : message.content,
        decryptionError: true,
        isEncrypted: true,
      });
    }
  })();

  if (cacheKey) {
    messageDecryptPromiseCache.set(cacheKey, decryptPromise);
  }

  try {
    const resolvedMessage = await decryptPromise;

    if (cacheKey) {
      messageDecryptCache.set(cacheKey, resolvedMessage);
      trimMessageDecryptCache();
      void setStoredDecryptedMessage(cacheKey, resolvedMessage);
    }

    return {
      ...message,
      ...resolvedMessage,
    };
  } finally {
    if (cacheKey) {
      messageDecryptPromiseCache.delete(cacheKey);
    }
  }
};

export const decryptIncomingMessages = async ({ messages, currentUserId }) => {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  if (!currentUserId || !normalizedMessages.length) {
    return normalizedMessages;
  }

  const cacheKeys = normalizedMessages
    .map((message) => getMessageDecryptCacheKey(message))
    .filter(Boolean);
  let persistedEntries = {};
  try {
    persistedEntries = await getStoredDecryptedMessages(cacheKeys);
  } catch {
    persistedEntries = {};
  }

  let localKeyPair = null;
  try {
    localKeyPair = await getLocalKeyPair(currentUserId);
  } catch {
    localKeyPair = null;
  }

  const decrypted = [];

  for (let start = 0; start < normalizedMessages.length; start += DECRYPT_BATCH_SIZE) {
    const slice = normalizedMessages.slice(start, start + DECRYPT_BATCH_SIZE);
    const preparedBatch = await Promise.all(
      slice.map(async (message) => {
        if (!message?.encryption?.enabled) {
          return { type: "resolved", message };
        }

        const cacheKey = getMessageDecryptCacheKey(message);
        const cachedValue =
          (cacheKey && messageDecryptCache.get(cacheKey)) ||
          (cacheKey ? persistedEntries[cacheKey] : null);

        if (cachedValue) {
          if (cacheKey && !messageDecryptCache.has(cacheKey)) {
            messageDecryptCache.set(cacheKey, cachedValue);
            trimMessageDecryptCache();
          }

          return {
            type: "resolved",
            message: {
              ...message,
              ...cachedValue,
            },
          };
        }

        if (!localKeyPair) {
          return {
            type: "resolved",
            message: {
              ...message,
              content:
                message.messageType === "text"
                  ? "[Unable to decrypt message on this device]"
                  : message.content,
              decryptionError: true,
              isEncrypted: true,
            },
          };
        }

        const groupId =
          typeof message.group === "string"
            ? message.group
            : message.group?._id || message.group?.id || null;

        try {
          const rawKey = await resolveEnvelopeRawKey({
            envelope: message.encryption,
            currentUserId,
            localKeyPair,
            groupId,
          });

          return {
            type: "decrypt",
            cacheKey,
            groupId,
            message,
            rawKey,
          };
        } catch (error) {
          return {
            type: "fallback",
            error,
            message,
          };
        }
      })
    );

    const decryptItems = preparedBatch.filter((item) => item.type === "decrypt");
    let plaintexts = [];

    if (decryptItems.length) {
      try {
        plaintexts = (
          await runCryptoWorkerTask("decryptMessageBatch", {
            items: decryptItems.map((item) => ({
              ciphertext: item.message.encryption.ciphertext,
              iv: item.message.encryption.iv,
              rawKey: item.rawKey,
            })),
          })
        ).results;
      } catch {
        plaintexts = await Promise.all(
          decryptItems.map(async (item) => {
            const result = await runCryptoWorkerTask("decryptTextWithRawKey", {
              ciphertext: item.message.encryption.ciphertext,
              iv: item.message.encryption.iv,
              rawKey: item.rawKey,
            });
            return result.plaintext;
          })
        );
      }
    }

    let decryptIndex = 0;
    for (const item of preparedBatch) {
      if (item.type === "resolved") {
        decrypted.push(item.message);
        continue;
      }

      if (item.type === "decrypt") {
        try {
          const plaintext = plaintexts[decryptIndex];
          decryptIndex += 1;
          const resolvedMessage = buildDecryptedMessageShape({
            message: item.message,
            plaintext,
          });
          if (item.cacheKey) {
            messageDecryptCache.set(item.cacheKey, resolvedMessage);
            trimMessageDecryptCache();
            void setStoredDecryptedMessage(item.cacheKey, resolvedMessage);
          }
          decrypted.push({
            ...item.message,
            ...resolvedMessage,
          });
        } catch {
          decrypted.push(await decryptIncomingMessage({ message: item.message, currentUserId }));
        }
        continue;
      }

      decrypted.push(await decryptIncomingMessage({ message: item.message, currentUserId }));
    }

    await yieldToBrowser();
  }

  return decrypted;
};

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

  return decryptMessagesInBatches({
    messages: Array.isArray(chats) ? chats : [],
    currentUserId,
    mapMessage: async ({ message: chat, currentUserId: activeUserId }) => {
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
          currentUserId: activeUserId,
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
    },
  });
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

export const clearE2EEClientState = async () => {
  mediaObjectUrlCache.forEach((value) => {
    if (value?.objectUrl) {
      URL.revokeObjectURL(value.objectUrl);
    }
  });
  mediaObjectUrlCache.clear();
  mediaDecryptPromiseCache.clear();
  messageDecryptCache.clear();
  messageDecryptPromiseCache.clear();
  conversationKeysCache.clear();
  conversationKeysPromiseCache.clear();
  groupSessionMemoryCache.clear();

  await clearStoredE2EEData();
  await resetCryptoWorker();
};
