import { arrayBufferToBase64 } from "./helpers";

export const encryptAESKey = async (aesKey, publicKey) => {
  const exportedAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedKey = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    exportedAesKey
  );

  return arrayBufferToBase64(encryptedKey);
};
