let cryptoWorker = null;
let requestCounter = 0;
const pendingRequests = new Map();
const normalizeWorkerError = (error) => {
  if (error && typeof error === "object") {
    const normalizedMessage = String(error.message || "").trim();
    const nextError = new Error(
      normalizedMessage || String(error.name || "Crypto worker request failed.")
    );
    nextError.name = String(error.name || "Error");
    if (error.code !== undefined && error.code !== null) {
      nextError.code = String(error.code);
    }
    nextError.workerError = error;
    return nextError;
  }

  return new Error(String(error || "Crypto worker request failed."));
};
let createWorker = () =>
  new Worker(new URL("./cryptoWorker.js", import.meta.url), {
    type: "module",
  });

const getCryptoWorker = () => {
  if (typeof window === "undefined") {
    throw new Error("Crypto worker is only available in the browser.");
  }

  if (cryptoWorker) {
    return cryptoWorker;
  }

  cryptoWorker = createWorker();

  cryptoWorker.onmessage = (event) => {
    const { id, ok, result, error } = event.data || {};
    const pending = pendingRequests.get(id);
    if (!pending) return;

    pendingRequests.delete(id);
    if (ok) {
      pending.resolve(result);
      return;
    }

    const nextError = normalizeWorkerError(error);
    console.error(
      "Crypto worker task failed:",
      nextError.name,
      nextError.message,
      nextError.code ? `(code: ${nextError.code})` : ""
    );
    pending.reject(nextError);
  };

  cryptoWorker.onerror = (event) => {
    const nextError = new Error(event.message || "Crypto worker crashed.");
    console.error("Crypto worker failure:", nextError.message);
    pendingRequests.forEach(({ reject }) => reject(nextError));
    pendingRequests.clear();
    cryptoWorker?.terminate();
    cryptoWorker = null;
  };

  return cryptoWorker;
};

export const runCryptoWorkerTask = (type, payload = {}, transferables = []) =>
  new Promise((resolve, reject) => {
    const worker = getCryptoWorker();
    const id = `crypto-${Date.now()}-${requestCounter += 1}`;
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload }, transferables);
  });

export const resetCryptoWorker = async () => {
  if (!cryptoWorker) return;
  try {
    await runCryptoWorkerTask("clearCaches");
  } catch {
    // Ignore worker reset failures during logout/teardown.
  }
};

export const __setCryptoWorkerFactoryForTests = (factory) => {
  createWorker = factory;
};

export const __resetCryptoWorkerClientForTests = () => {
  pendingRequests.clear();
  try {
    cryptoWorker?.terminate?.();
  } catch {
    // ignore worker teardown failures in tests
  }
  cryptoWorker = null;
  requestCounter = 0;
  createWorker = () =>
    new Worker(new URL("./cryptoWorker.js", import.meta.url), {
      type: "module",
    });
};
