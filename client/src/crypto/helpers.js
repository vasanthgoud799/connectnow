const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const textToBuffer = (value) => encoder.encode(String(value || ""));
export const bufferToText = (buffer) => decoder.decode(buffer);

export const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
};

export const base64ToArrayBuffer = (base64) => {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

export const createFingerprint = async (publicKeyJwk) => {
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    textToBuffer(JSON.stringify(publicKeyJwk))
  );

  return arrayBufferToBase64(digest).replace(/=+$/g, "");
};
