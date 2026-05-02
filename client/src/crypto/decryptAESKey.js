import { base64ToArrayBuffer } from "./helpers";

export const decryptAESKey = async (encryptedKey, privateKey) => {
  const rawAesKey = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    base64ToArrayBuffer(encryptedKey)
  );

  return window.crypto.subtle.importKey(
    "raw",
    rawAesKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
};
