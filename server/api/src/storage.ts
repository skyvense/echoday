import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "./env.js";

export interface OpenedBlob {
  stream: Readable;
  start: number;
  end: number;
  total: number;
}

export interface BlobStore {
  ensure(): Promise<void>;
  ping(): Promise<void>;
  put(key: string, body: Buffer): Promise<void>;
  size(key: string): Promise<number | null>;
  open(key: string, start: number, endInclusive: number): Promise<OpenedBlob | null>;
}

export class StorageUnconfigured extends Error {
  readonly code = "storage_unconfigured";
}

export interface S3Target {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
  createBucketIfMissing: boolean;
}

export interface S3Sender {
  send(command: unknown): Promise<{
    ContentLength?: number;
    ContentRange?: string;
    Body?: unknown;
  }>;
}

export function isRetryableStorageError(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  if (typeof status === "number") return status >= 500 || status === 429;
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Timeout|Networking|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket/i.test(text);
}

export async function sendWithRetry(run: () => Promise<void>, attempts = 3): Promise<void> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await run();
      return;
    } catch (error) {
      last = error;
      if (!isRetryableStorageError(error) || attempt === attempts) throw error;
    }
  }
  throw last;
}

function assertSafeKey(key: string): void {
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\") || key.includes("\0")) {
    throw new Error("unsafe storage key");
  }
}

class FsStore implements BlobStore {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    const root = path.resolve(this.root);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error("unsafe storage key");
    }
    return full;
  }

  async ensure(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const probe = path.join(this.root, ".write-probe");
    await writeFile(probe, "ok");
  }

  async ping(): Promise<void> {
    await stat(this.root);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async size(key: string): Promise<number | null> {
    try {
      const info = await stat(this.resolve(key));
      return info.size;
    } catch {
      return null;
    }
  }

  async open(key: string, start: number, endInclusive: number): Promise<OpenedBlob | null> {
    const total = await this.size(key);
    if (total === null) return null;
    const stream = createReadStream(this.resolve(key), { start, end: endInclusive });
    return { stream, start, end: endInclusive, total };
  }
}

class S3Store implements BlobStore {
  private readonly client: S3Sender;
  private readonly bucket: string;
  private readonly createBucketIfMissing: boolean;

  constructor(target: S3Target, client?: S3Sender) {
    this.bucket = target.bucket;
    this.createBucketIfMissing = target.createBucketIfMissing;
    this.client =
      client ??
      new S3Client({
        region: target.region,
        endpoint: target.endpoint,
        forcePathStyle: target.forcePathStyle,
        credentials: {
          accessKeyId: target.accessKey,
          secretAccessKey: target.secretKey,
        },
      });
  }

  async ensure(): Promise<void> {
    try {
      await this.ping();
    } catch (error) {
      if (!this.createBucketIfMissing) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      await this.ping();
    }
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async put(key: string, body: Buffer): Promise<void> {
    assertSafeKey(key);
    await sendWithRetry(async () => {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
        }),
      );
    });
  }

  async size(key: string): Promise<number | null> {
    assertSafeKey(key);
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  async open(key: string, start: number, endInclusive: number): Promise<OpenedBlob | null> {
    assertSafeKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: `bytes=${start}-${endInclusive}`,
        }),
      );
      const total = contentRangeTotal(result.ContentRange) ?? (await this.size(key));
      const stream = toReadable(result.Body);
      if (total === null || !stream) return null;
      return { stream, start, end: endInclusive, total };
    } catch {
      return null;
    }
  }
}

function toReadable(body: unknown): Readable | null {
  if (!body) return null;
  if (body instanceof Readable) return body;
  const web = body as { transformToWebStream?: () => ReadableStream<Uint8Array> };
  if (typeof web.transformToWebStream === "function") {
    return Readable.fromWeb(web.transformToWebStream() as import("node:stream/web").ReadableStream);
  }
  return null;
}

function contentRangeTotal(header: string | undefined): number | null {
  if (!header) return null;
  const match = /\/(\d+)$/.exec(header);
  if (!match) return null;
  return Number(match[1]);
}

class UnconfiguredStore implements BlobStore {
  constructor(private readonly reason: string) {}

  async ensure(): Promise<void> {
    return;
  }

  async ping(): Promise<void> {
    throw new StorageUnconfigured(this.reason);
  }

  async put(): Promise<void> {
    throw new StorageUnconfigured(this.reason);
  }

  async size(): Promise<number | null> {
    throw new StorageUnconfigured(this.reason);
  }

  async open(): Promise<OpenedBlob | null> {
    throw new StorageUnconfigured(this.reason);
  }
}

export function r2TargetFromEnv(): S3Target | null {
  if (!env.r2Endpoint || !env.r2Bucket || !env.r2AccessKey || !env.r2SecretKey) return null;
  return {
    endpoint: env.r2Endpoint,
    region: env.r2Region,
    bucket: env.r2Bucket,
    accessKey: env.r2AccessKey,
    secretKey: env.r2SecretKey,
    forcePathStyle: env.r2ForcePathStyle,
    createBucketIfMissing: false,
  };
}

export function describeStorage(): { driver: string; ready: boolean; code?: string } {
  if (env.storageDriver === "r2" && !r2TargetFromEnv()) {
    return {
      driver: "r2",
      ready: false,
      code: "storage_unconfigured",
    };
  }
  return { driver: env.storageDriver, ready: true };
}

function buildStore(): BlobStore {
  if (env.storageDriver === "fs") return new FsStore(env.storageDir);
  if (env.storageDriver === "r2") {
    const target = r2TargetFromEnv();
    if (!target) {
      return new UnconfiguredStore(
        "R2 is selected but R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY is missing",
      );
    }
    return new S3Store(target);
  }
  return new S3Store({
    endpoint: env.s3Endpoint,
    region: env.s3Region,
    bucket: env.s3Bucket,
    accessKey: env.s3AccessKey,
    secretKey: env.s3SecretKey,
    forcePathStyle: env.s3ForcePathStyle,
    createBucketIfMissing: true,
  });
}

export const store: BlobStore = buildStore();

export async function initStorage(): Promise<void> {
  const described = describeStorage();
  if (!described.ready) {
    console.warn(`storage not configured (${described.driver}): uploads will return 503`);
    return;
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      await store.ensure();
      console.log(`storage ready (${env.storageDriver})`);
      return;
    } catch (error) {
      lastError = error;
      console.log(`storage not ready (attempt ${attempt})`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("storage unavailable");
}

export function parseByteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return "invalid";
  const startRaw = match[1] ?? "";
  const endRaw = match[2] ?? "";
  if (startRaw === "" && endRaw === "") return "invalid";

  let start: number;
  let end: number;
  if (startRaw === "") {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === "" ? size - 1 : Number(endRaw);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
  if (end >= size) end = size - 1;
  if (start < 0 || start >= size || end < start) return "invalid";
  return { start, end };
}

export function webStream(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}
