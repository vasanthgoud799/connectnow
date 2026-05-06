import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};

const {
  runCryptoWorkerTask,
  __setCryptoWorkerFactoryForTests,
  __resetCryptoWorkerClientForTests,
} = await import("../src/crypto/cryptoWorkerClient.js");

class FakeWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
    this.messages = [];
    this.terminated = false;
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

test("crypto worker client resolves out-of-order responses to the correct request", async () => {
  __resetCryptoWorkerClientForTests();
  const worker = new FakeWorker();
  __setCryptoWorkerFactoryForTests(() => worker);

  const firstPromise = runCryptoWorkerTask("decryptBatch", {
    messages: ["first"],
  });
  const secondPromise = runCryptoWorkerTask("encryptMessage", {
    content: "second",
  });

  const [firstRequest, secondRequest] = worker.messages;

  worker.onmessage({
    data: {
      id: secondRequest.id,
      ok: true,
      result: { content: "second-result" },
    },
  });
  worker.onmessage({
    data: {
      id: firstRequest.id,
      ok: true,
      result: { content: "first-result" },
    },
  });

  assert.deepEqual(await secondPromise, { content: "second-result" });
  assert.deepEqual(await firstPromise, { content: "first-result" });
});

test("crypto worker client rejects all pending requests when the worker crashes", async () => {
  __resetCryptoWorkerClientForTests();
  const worker = new FakeWorker();
  __setCryptoWorkerFactoryForTests(() => worker);

  const pending = runCryptoWorkerTask("decryptMessage", {
    encryptedPayload: "payload",
  });

  worker.onerror({ message: "worker exploded" });

  await assert.rejects(pending, /worker exploded/i);
  assert.equal(worker.terminated, true);
});
