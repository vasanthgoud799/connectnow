import mongoose from "mongoose";

const cleanString = (value, maxLength = 255) =>
  String(value || "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, maxLength);

const asOptionalObjectId = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim();
  return mongoose.isValidObjectId(normalized) ? normalized : null;
};

const asRequiredObjectId = (value) => {
  const normalized = asOptionalObjectId(value);
  if (!normalized) {
    throw new Error("Invalid identifier.");
  }

  return normalized;
};

const asArrayOfObjectIds = (value, { max = 100 } = {}) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asOptionalObjectId(item))
    .filter(Boolean)
    .slice(0, max);
};

const asSafeText = (value, { min = 0, max = 5000, allowEmpty = false } = {}) => {
  const normalized = cleanString(value, max);
  if (!allowEmpty && normalized.length < min) {
    throw new Error("Invalid text.");
  }

  return normalized;
};

const asNamedSafeText = (
  fieldName,
  value,
  { min = 0, max = 5000, allowEmpty = false } = {}
) => {
  const normalized = cleanString(value, max);
  if (!allowEmpty && normalized.length < min) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
};

const asEnum = (value, allowedValues, fallback = null) => {
  const normalized = cleanString(value, 80).toLowerCase();
  if (!normalized) return fallback;
  if (!allowedValues.includes(normalized)) {
    throw new Error("Invalid value.");
  }

  return normalized;
};

const validator =
  (builder) =>
  (req, res, next) => {
    try {
      req.validated = {
        ...(req.validated || {}),
        ...builder(req),
      };
      return next();
    } catch (error) {
      return res.status(400).json({ message: error.message || "Invalid request." });
    }
  };

export const validateClerkSync = validator((req) => ({
  botSignals: {
    website: cleanString(req.body?.website, 120),
    company: cleanString(req.body?.company, 120),
    clientRenderTimeMs: Number(req.header("X-Client-Render-Time") || 0),
  },
}));

export const validateProfileUpdate = validator((req) => ({
  profile: {
    firstName: asNamedSafeText("First name", req.body?.firstName, {
      min: 1,
      max: 80,
      allowEmpty: true,
    }),
    lastName: asNamedSafeText("Last name", req.body?.lastName, {
      min: 1,
      max: 80,
      allowEmpty: true,
    }),
    about: asSafeText(req.body?.about, { max: 500, allowEmpty: true }),
    birthday: req.body?.birthday ? new Date(req.body.birthday) : null,
    image: cleanString(req.body?.image, 1000),
    imageUpload: req.body?.imageUpload || null,
    aiPreferences:
      req.body?.aiPreferences && typeof req.body.aiPreferences === "object"
        ? req.body.aiPreferences
        : undefined,
  },
}));

export const validateContactSearch = validator((req) => ({
  contactSearch: {
    searchTerm: asSafeText(req.body?.searchTerm, { min: 1, max: 120 }),
  },
}));

export const validateContactId = validator((req) => ({
  contactId: asRequiredObjectId(req.body?.contactId || req.body?.id),
}));

export const validateUserIdList = validator((req) => ({
  userIds: asArrayOfObjectIds(req.body?.userIds, { max: 200 }),
}));

export const validateMessageConversationRequest = validator((req) => ({
  conversation: {
    userId: asOptionalObjectId(req.body?.id || req.body?.userId),
    groupId: asOptionalObjectId(req.body?.groupId),
    before: req.body?.before ? new Date(req.body.before) : null,
    limit: Math.min(Math.max(Number(req.body?.limit) || 50, 1), 100),
  },
}));

export const validateMessageSearch = validator((req) => ({
  messageSearch: {
    userId: asOptionalObjectId(req.body?.userId),
    groupId: asOptionalObjectId(req.body?.groupId),
    query: asSafeText(req.body?.query, { min: 1, max: 160 }),
    limit: Math.min(Math.max(Number(req.body?.limit) || 40, 1), 100),
  },
}));

export const validateConversationKeyPayload = validator((req) => ({
  messageSeen: {
    userId: asOptionalObjectId(req.body?.userId),
    conversationKey: cleanString(req.body?.conversationKey, 180),
  },
}));

export const validateMessageAction = validator((req) => ({
  messageAction: {
    messageId: asRequiredObjectId(req.body?.messageId || req.params?.messageId),
    emoji: cleanString(req.body?.emoji, 24),
    content: cleanString(req.body?.content, 4000),
    scope: asEnum(req.body?.scope, ["me", "everyone"], "me"),
  },
}));

export const validatePinnedMessagesQuery = validator((req) => ({
  pinnedQuery: {
    conversationKey: asSafeText(req.query?.conversationKey, { min: 3, max: 180 }),
  },
}));

export const validateMessageIdParam = validator((req) => ({
  messageId: asRequiredObjectId(req.params?.messageId),
}));

export const validateUploadIntent = validator((req) => ({
  uploadIntent: {
    originalName: asSafeText(req.body?.originalName, { min: 1, max: 180 }),
    mimeType: asSafeText(req.body?.mimeType, { min: 3, max: 120 }),
    size: Number(req.body?.size || 0),
  },
}));

export const validateSecuritySessionParam = validator((req) => ({
  sessionId: asSafeText(req.params?.sessionId, { min: 8, max: 120 }),
}));

export const validateTrustedDevicePayload = validator((req) => ({
  trustedDevice: {
    deviceId:
      req.params?.deviceId === undefined
        ? null
        : asRequiredObjectId(req.params?.deviceId),
    label: cleanString(req.body?.label || "Trusted device", 80) || "Trusted device",
  },
}));

export const validateSecurityEventsQuery = validator((req) => ({
  securityQuery: {
    limit: Math.min(Math.max(Number(req.query?.limit) || 100, 1), 1000),
    severity: req.query?.severity ? cleanString(req.query.severity, 20).toLowerCase() : null,
    hours: Math.min(Math.max(Number(req.query?.hours) || 24, 1), 24 * 30),
  },
}));
