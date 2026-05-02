import { base64ToArrayBuffer, bufferToText } from "./helpers";

export const decryptMessage = async ({ ciphertext, iv, aesKey }) => {
  const plaintextBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(base64ToArrayBuffer(iv)),
    },
    aesKey,
    base64ToArrayBuffer(ciphertext)
  );

  return bufferToText(plaintextBuffer);
};
