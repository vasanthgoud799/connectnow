const DB_NAME = "connectnow-e2ee";
const DB_VERSION = 4;
const KEY_STORE_NAME = "keys";
const MESSAGE_CACHE_STORE_NAME = "messageCache";
const GROUP_SESSION_STORE_NAME = "groupSessions";
const TRUST_STORE_NAME = "trustRecords";
let getIndexedDb = () => window.indexedDB;

const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = getIndexedDb().open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(MESSAGE_CACHE_STORE_NAME)) {
        db.createObjectStore(MESSAGE_CACHE_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(GROUP_SESSION_STORE_NAME)) {
        db.createObjectStore(GROUP_SESSION_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(TRUST_STORE_NAME)) {
        db.createObjectStore(TRUST_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async (storeName, mode, operation) => {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    operation(store, resolve, reject);
  });
};

export const getStoredKeyPair = async (userId) =>
  withStore(KEY_STORE_NAME, "readonly", (store, resolve, reject) => {
    const request = store.get(String(userId));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

export const setStoredKeyPair = async (userId, value) =>
  withStore(KEY_STORE_NAME, "readwrite", (store, resolve, reject) => {
    const request = store.put(value, String(userId));
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });

export const getStoredDecryptedMessage = async (cacheKey) =>
  withStore(MESSAGE_CACHE_STORE_NAME, "readonly", (store, resolve, reject) => {
    const request = store.get(String(cacheKey));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

export const getStoredDecryptedMessages = async (cacheKeys = []) =>
  withStore(MESSAGE_CACHE_STORE_NAME, "readonly", (store, resolve, reject) => {
    const normalizedKeys = [...new Set((Array.isArray(cacheKeys) ? cacheKeys : []).map(String))];
    if (!normalizedKeys.length) {
      resolve({});
      return;
    }

    const results = {};
    let remaining = normalizedKeys.length;

    normalizedKeys.forEach((cacheKey) => {
      const request = store.get(cacheKey);
      request.onsuccess = () => {
        if (request.result) {
          results[cacheKey] = request.result;
        }
        remaining -= 1;
        if (remaining === 0) {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  });

export const setStoredDecryptedMessage = async (cacheKey, value) =>
  withStore(MESSAGE_CACHE_STORE_NAME, "readwrite", (store, resolve, reject) => {
    const request = store.put(
      {
        ...value,
        updatedAt: new Date().toISOString(),
      },
      String(cacheKey)
    );
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });

export const getStoredGroupSessionRecord = async (groupId) =>
  withStore(GROUP_SESSION_STORE_NAME, "readonly", (store, resolve, reject) => {
    const request = store.get(String(groupId));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

export const setStoredGroupSessionRecord = async (groupId, value) =>
  withStore(GROUP_SESSION_STORE_NAME, "readwrite", (store, resolve, reject) => {
    const request = store.put(
      {
        ...value,
        updatedAt: new Date().toISOString(),
      },
      String(groupId)
    );
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });

export const getStoredTrustRecord = async (contactId) =>
  withStore(TRUST_STORE_NAME, "readonly", (store, resolve, reject) => {
    const request = store.get(String(contactId));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

export const setStoredTrustRecord = async (contactId, value) =>
  withStore(TRUST_STORE_NAME, "readwrite", (store, resolve, reject) => {
    const request = store.put(
      {
        ...value,
        updatedAt: new Date().toISOString(),
      },
      String(contactId)
    );
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });

export const deleteStoredTrustRecord = async (contactId) =>
  withStore(TRUST_STORE_NAME, "readwrite", (store, resolve, reject) => {
    const request = store.delete(String(contactId));
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });

export const clearStoredE2EEData = async () => {
  const storeNames = [
    KEY_STORE_NAME,
    MESSAGE_CACHE_STORE_NAME,
    GROUP_SESSION_STORE_NAME,
    TRUST_STORE_NAME,
  ];

  await Promise.all(
    storeNames.map((storeName) =>
      withStore(storeName, "readwrite", (store, resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      })
    )
  );
};

export const __setIndexedDbFactoryForTests = (factory) => {
  getIndexedDb = factory;
};
