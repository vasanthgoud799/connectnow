const encoder = new TextEncoder();
const decoder = new TextDecoder();

const textToBuffer = (value) => encoder.encode(String(value || ""));
const bufferToText = (buffer) => decoder.decode(buffer);

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
};

const base64ToArrayBuffer = (base64) => {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const createFingerprint = async (publicKeyJwk) => {
  const digest = await self.crypto.subtle.digest(
    "SHA-256",
    textToBuffer(JSON.stringify(publicKeyJwk))
  );

  return arrayBufferToBase64(digest).replace(/=+$/g, "");
};

const rsaPublicKeyCache = new Map();
const rsaPrivateKeyCache = new Map();
const ecdhPublicKeyCache = new Map();
const ecdhPrivateKeyCache = new Map();
const aesKeyCache = new Map();

const getCacheKey = (value) => JSON.stringify(value);

const importRsaPublicKey = async (publicKeyJwk) => {
  const cacheKey = getCacheKey(publicKeyJwk);
  if (rsaPublicKeyCache.has(cacheKey)) {
    return rsaPublicKeyCache.get(cacheKey);
  }

  const key = await self.crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
  rsaPublicKeyCache.set(cacheKey, key);
  return key;
};

const importRsaPrivateKey = async (privateKeyJwk) => {
  const cacheKey = getCacheKey(privateKeyJwk);
  if (rsaPrivateKeyCache.has(cacheKey)) {
    return rsaPrivateKeyCache.get(cacheKey);
  }

  const key = await self.crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
  rsaPrivateKeyCache.set(cacheKey, key);
  return key;
};

const importEcdhPublicKey = async (publicKeyJwk) => {
  const cacheKey = getCacheKey(publicKeyJwk);
  if (ecdhPublicKeyCache.has(cacheKey)) {
    return ecdhPublicKeyCache.get(cacheKey);
  }

  const key = await self.crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
  ecdhPublicKeyCache.set(cacheKey, key);
  return key;
};

const importEcdhPrivateKey = async (privateKeyJwk) => {
  const cacheKey = getCacheKey(privateKeyJwk);
  if (ecdhPrivateKeyCache.has(cacheKey)) {
    return ecdhPrivateKeyCache.get(cacheKey);
  }

  const key = await self.crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  ecdhPrivateKeyCache.set(cacheKey, key);
  return key;
};

const importAesKeyFromBase64 = async (rawKey) => {
  const cacheKey = String(rawKey || "");
  if (aesKeyCache.has(cacheKey)) {
    return aesKeyCache.get(cacheKey);
  }

  const key = await self.crypto.subtle.importKey(
    "raw",
    base64ToArrayBuffer(rawKey),
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  aesKeyCache.set(cacheKey, key);
  return key;
};

const deriveWrappingKey = async ({ privateKeyJwk, publicKeyJwk }) => {
  const privateKey = await importEcdhPrivateKey(privateKeyJwk);
  const publicKey = await importEcdhPublicKey(publicKeyJwk);
  const sharedBits = await self.crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    256
  );

  return self.crypto.subtle.importKey(
    "raw",
    sharedBits,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

const generateAesKey = async () => {
  const aesKey = await self.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const rawKey = await self.crypto.subtle.exportKey("raw", aesKey);

  return {
    rawKey: arrayBufferToBase64(rawKey),
  };
};

const encryptTextWithRawKey = async ({ plaintext, rawKey }) => {
  const aesKey = await importAesKeyFromBase64(rawKey);
  const iv = self.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await self.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    textToBuffer(plaintext)
  );

  return {
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertext),
  };
};

const decryptTextWithRawKey = async ({ ciphertext, iv, rawKey }) => {
  const aesKey = await importAesKeyFromBase64(rawKey);
  const plaintextBuffer = await self.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(base64ToArrayBuffer(iv)),
    },
    aesKey,
    base64ToArrayBuffer(ciphertext)
  );

  return {
    plaintext: bufferToText(plaintextBuffer),
  };
};

const decryptMessageBatch = async ({ items = [] }) => {
  const results = [];

  for (const item of items) {
    const { plaintext } = await decryptTextWithRawKey(item);
    results.push(plaintext);
  }

  return { results };
};

const encryptBinaryWithRawKey = async ({ rawKey, buffer }) => {
  const aesKey = await importAesKeyFromBase64(rawKey);
  const iv = self.crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await self.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    buffer
  );

  return {
    iv: arrayBufferToBase64(iv.buffer),
    buffer: ciphertextBuffer,
    transferables: [ciphertextBuffer],
  };
};

const decryptBinaryWithRawKey = async ({ rawKey, iv, buffer }) => {
  const aesKey = await importAesKeyFromBase64(rawKey);
  const plaintextBuffer = await self.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(base64ToArrayBuffer(iv)),
    },
    aesKey,
    buffer
  );

  return {
    buffer: plaintextBuffer,
    transferables: [plaintextBuffer],
  };
};

const encryptRawAesKeyForRsa = async ({ rawKey, publicKeyJwk }) => {
  const publicKey = await importRsaPublicKey(publicKeyJwk);
  const encryptedKey = await self.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    base64ToArrayBuffer(rawKey)
  );

  return {
    encryptedKey: arrayBufferToBase64(encryptedKey),
  };
};

const decryptRawAesKeyForRsa = async ({ encryptedKey, privateKeyJwk }) => {
  const privateKey = await importRsaPrivateKey(privateKeyJwk);
  const rawAesKey = await self.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    base64ToArrayBuffer(encryptedKey)
  );

  return {
    rawKey: arrayBufferToBase64(rawAesKey),
  };
};

const wrapRawKeyWithEcdh = async ({ rawKey, recipientPublicKeyJwk }) => {
  const ephemeralKeyPair = await self.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const ephPublicKeyJwk = await self.crypto.subtle.exportKey("jwk", ephemeralKeyPair.publicKey);
  const wrappingKey = await deriveWrappingKey({
    privateKeyJwk: await self.crypto.subtle.exportKey("jwk", ephemeralKeyPair.privateKey),
    publicKeyJwk: recipientPublicKeyJwk,
  });
  const keyWrapIv = self.crypto.getRandomValues(new Uint8Array(12));
  const encryptedKey = await self.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: keyWrapIv },
    wrappingKey,
    base64ToArrayBuffer(rawKey)
  );

  return {
    encryptedKey: arrayBufferToBase64(encryptedKey),
    keyWrapIv: arrayBufferToBase64(keyWrapIv.buffer),
    ephPublicKeyJwk,
  };
};

const unwrapRawKeyWithEcdh = async ({
  encryptedKey,
  keyWrapIv,
  ephPublicKeyJwk,
  recipientPrivateKeyJwk,
}) => {
  const wrappingKey = await deriveWrappingKey({
    privateKeyJwk: recipientPrivateKeyJwk,
    publicKeyJwk: ephPublicKeyJwk,
  });
  const rawAesKey = await self.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(base64ToArrayBuffer(keyWrapIv)),
    },
    wrappingKey,
    base64ToArrayBuffer(encryptedKey)
  );

  return {
    rawKey: arrayBufferToBase64(rawAesKey),
  };
};

const generateIdentityKeys = async () => {
  const rsaKeyPair = await self.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const ecdhKeyPair = await self.crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveBits"]
  );

  const publicKeyJwk = await self.crypto.subtle.exportKey("jwk", rsaKeyPair.publicKey);
  const privateKeyJwk = await self.crypto.subtle.exportKey("jwk", rsaKeyPair.privateKey);
  const ecdhPublicKeyJwk = await self.crypto.subtle.exportKey("jwk", ecdhKeyPair.publicKey);
  const ecdhPrivateKeyJwk = await self.crypto.subtle.exportKey("jwk", ecdhKeyPair.privateKey);
  const fingerprint = await createFingerprint(publicKeyJwk);
  const ecdhFingerprint = await createFingerprint(ecdhPublicKeyJwk);

  return {
    algorithm: "RSA-OAEP",
    keyVersion: 1,
    publicKeyJwk,
    privateKeyJwk,
    fingerprint,
    ecdhPublicKeyJwk,
    ecdhPrivateKeyJwk,
    ecdhKeyVersion: 1,
    ecdhFingerprint,
  };
};

const clearCaches = async () => {
  rsaPublicKeyCache.clear();
  rsaPrivateKeyCache.clear();
  ecdhPublicKeyCache.clear();
  ecdhPrivateKeyCache.clear();
  aesKeyCache.clear();

  return { ok: true };
};

const handlers = {
  clearCaches,
  decryptBinaryWithRawKey,
  decryptMessageBatch,
  decryptRawAesKeyForRsa,
  decryptTextWithRawKey,
  encryptBinaryWithRawKey,
  encryptRawAesKeyForRsa,
  encryptTextWithRawKey,
  generateAesKey,
  generateIdentityKeys,
  unwrapRawKeyWithEcdh,
  wrapRawKeyWithEcdh,
};

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};

  if (!id || !type || !handlers[type]) {
    return;
  }

  try {
    const result = await handlers[type](payload || {});
    const transferables = Array.isArray(result?.transferables) ? result.transferables : [];
    const response = {
      id,
      ok: true,
      result: result && typeof result === "object" ? { ...result, transferables: undefined } : result,
    };
    self.postMessage(response, transferables);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Crypto worker failed.",
    });
  }
};
