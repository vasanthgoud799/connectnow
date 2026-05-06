import test from "node:test";
import assert from "node:assert/strict";

const {
  __setIndexedDbFactoryForTests,
  clearStoredE2EEData,
  deleteStoredTrustRecord,
  getStoredKeyPair,
  getStoredTrustRecord,
  setStoredKeyPair,
  setStoredTrustRecord,
} = await import("../src/crypto/indexedDbKeyStore.js");

const createRequest = (executor) => {
  const request = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
  };

  queueMicrotask(() => {
    try {
      request.result = executor();
      request.onsuccess?.();
    } catch (error) {
      request.error = error;
      request.onerror?.();
    }
  });

  return request;
};

const createFakeIndexedDb = () => {
  const stores = new Map();

  const ensureStore = (storeName) => {
    if (!stores.has(storeName)) {
      stores.set(storeName, new Map());
    }
    return stores.get(storeName);
  };

  const db = {
    objectStoreNames: {
      contains: (storeName) => stores.has(storeName),
    },
    createObjectStore: (storeName) => {
      ensureStore(storeName);
      return {};
    },
    transaction: (storeName) => {
      const transaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        objectStore: () => {
          const store = ensureStore(storeName);
          return {
            get: (key) => createRequest(() => store.get(String(key))),
            put: (value, key) =>
              createRequest(() => {
                store.set(String(key), value);
                return key;
              }),
            delete: (key) =>
              createRequest(() => {
                store.delete(String(key));
                return true;
              }),
            clear: () =>
              createRequest(() => {
                store.clear();
                return true;
              }),
          };
        },
      };

      queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    },
    close: () => {},
  };

  return {
    open: () => {
      const request = {
        result: db,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };

      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });

      return request;
    },
  };
};

test("indexedDb key store persists and clears key and trust records", async () => {
  const fakeIndexedDb = createFakeIndexedDb();
  __setIndexedDbFactoryForTests(() => fakeIndexedDb);

  await setStoredKeyPair("user-1", {
    publicKey: "public-key",
    privateKey: "private-key",
  });
  await setStoredTrustRecord("contact-1", {
    fingerprint: "ABCD 1234",
    verified: true,
  });

  assert.deepEqual(await getStoredKeyPair("user-1"), {
    publicKey: "public-key",
    privateKey: "private-key",
  });

  assert.equal((await getStoredTrustRecord("contact-1"))?.verified, true);

  await deleteStoredTrustRecord("contact-1");
  assert.equal(await getStoredTrustRecord("contact-1"), null);

  await clearStoredE2EEData();
  assert.equal(await getStoredKeyPair("user-1"), null);
});
