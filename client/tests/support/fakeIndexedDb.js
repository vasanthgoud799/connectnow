class FakeRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
    this.onupgradeneeded = null;
  }
}

class FakeObjectStore {
  constructor(storeMap) {
    this.storeMap = storeMap;
  }

  get(key) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      request.result = this.storeMap.has(key) ? structuredClone(this.storeMap.get(key)) : undefined;
      request.onsuccess?.();
    });
    return request;
  }

  put(value, key) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.storeMap.set(key, structuredClone(value));
      request.result = value;
      request.onsuccess?.();
    });
    return request;
  }

  delete(key) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.storeMap.delete(key);
      request.result = true;
      request.onsuccess?.();
    });
    return request;
  }

  clear() {
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.storeMap.clear();
      request.result = true;
      request.onsuccess?.();
    });
    return request;
  }
}

class FakeTransaction {
  constructor(database, storeName) {
    this.database = database;
    this.storeName = storeName;
    this.error = null;
    this.oncomplete = null;
    this.onerror = null;

    queueMicrotask(() => {
      this.oncomplete?.();
    });
  }

  objectStore(name) {
    return new FakeObjectStore(this.database.stores.get(name));
  }
}

class FakeDatabase {
  constructor(stores) {
    this.stores = stores;
    this.objectStoreNames = {
      contains: (name) => this.stores.has(name),
    };
  }

  createObjectStore(name) {
    if (!this.stores.has(name)) {
      this.stores.set(name, new Map());
    }
    return new FakeObjectStore(this.stores.get(name));
  }

  transaction(storeName) {
    return new FakeTransaction(this, storeName);
  }

  close() {}
}

export const createFakeIndexedDb = () => {
  const databases = new Map();

  return {
    open(name) {
      const request = new FakeRequest();

      queueMicrotask(() => {
        if (!databases.has(name)) {
          databases.set(name, new Map());
        }

        const db = new FakeDatabase(databases.get(name));
        request.result = db;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });

      return request;
    },
  };
};
