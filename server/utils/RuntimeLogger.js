const serializeMeta = (meta = {}) => {
  try {
    return JSON.stringify(meta);
  } catch {
    return JSON.stringify({ note: "unserializable_metadata" });
  }
};

const sanitizeMeta = (meta = {}) => {
  const blockedKeys = ["token", "secret", "authorization", "cookie", "jwt", "password", "csrf"];

  if (!meta || typeof meta !== "object") {
    return meta;
  }

  if (Array.isArray(meta)) {
    return meta.map((item) => sanitizeMeta(item));
  }

  return Object.entries(meta).reduce((accumulator, [key, value]) => {
    const normalizedKey = String(key).toLowerCase();
    if (blockedKeys.some((blockedKey) => normalizedKey.includes(blockedKey))) {
      accumulator[key] = "[redacted]";
      return accumulator;
    }

    accumulator[key] = sanitizeMeta(value);
    return accumulator;
  }, {});
};

export const logRuntimeEvent = (level = "info", event, meta = {}) => {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeMeta(meta),
  };

  const line = serializeMeta(record);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
};
