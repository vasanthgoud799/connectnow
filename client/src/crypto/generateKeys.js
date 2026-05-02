import { createFingerprint } from "./helpers";

export const generateKeys = async () => {
  const rsaKeyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const ecdhKeyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveBits"]
  );

  const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", rsaKeyPair.publicKey);
  const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", rsaKeyPair.privateKey);
  const ecdhPublicKeyJwk = await window.crypto.subtle.exportKey("jwk", ecdhKeyPair.publicKey);
  const ecdhPrivateKeyJwk = await window.crypto.subtle.exportKey("jwk", ecdhKeyPair.privateKey);
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
