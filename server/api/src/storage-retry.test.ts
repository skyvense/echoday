import assert from "node:assert/strict";
import test from "node:test";
import { PutObjectCommand } from "@aws-sdk/client-s3";

process.env.JWT_SECRET ||= "unit-test-jwt-secret-16";
process.env.DATABASE_URL ||= "postgres://muse:muse@127.0.0.1:5432/muse";
process.env.PUBLIC_URL ||= "http://127.0.0.1:8080";
process.env.STORAGE_DRIVER ||= "fs";

test("retries retryable storage failures and then succeeds once", async () => {
  const { sendWithRetry } = await import("./storage.js");
  let calls = 0;
  await sendWithRetry(async () => {
    calls += 1;
    if (calls < 3) {
      const error = new Error("unavailable") as Error & { $metadata?: { httpStatusCode?: number } };
      error.$metadata = { httpStatusCode: 503 };
      throw error;
    }
  });
  assert.equal(calls, 3);
});

test("does not retry a client error", async () => {
  const { sendWithRetry, isRetryableStorageError } = await import("./storage.js");
  let calls = 0;
  await assert.rejects(async () => {
    await sendWithRetry(async () => {
      calls += 1;
      const error = new Error("denied") as Error & { $metadata?: { httpStatusCode?: number } };
      error.$metadata = { httpStatusCode: 403 };
      throw error;
    });
  });
  assert.equal(calls, 1);
  assert.equal(isRetryableStorageError(Object.assign(new Error("no"), { $metadata: { httpStatusCode: 400 } })), false);
});

test("R2 target stays empty until every server credential is set", async () => {
  const { r2TargetFromEnv } = await import("./storage.js");
  assert.equal(r2TargetFromEnv(), null);
});

test("put object command is idempotent for the same key", () => {
  const first = new PutObjectCommand({ Bucket: "muse-audio", Key: "user/2026-10-23/rec_2026-10-23_09-00-00.m4a", Body: Buffer.from("a") });
  const second = new PutObjectCommand({ Bucket: "muse-audio", Key: "user/2026-10-23/rec_2026-10-23_09-00-00.m4a", Body: Buffer.from("ab") });
  assert.equal(first.input.Key, second.input.Key);
  assert.equal(first.input.Bucket, "muse-audio");
  assert.notEqual(first.input.Body, second.input.Body);
});
