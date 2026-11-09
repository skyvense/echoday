import type { Context } from "hono";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function bearer(c: Context): string | null {
  const header = c.req.header("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "local";
}

const hits = new Map<string, { n: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  if (hits.size > 5000) {
    for (const [entry, row] of hits) {
      if (row.reset < now) hits.delete(entry);
    }
  }
  const row = hits.get(key);
  if (!row || row.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  row.n += 1;
  if (row.n > limit) {
    throw new HttpError(429, "rate_limited", "Too many attempts. Wait a few minutes and try again.");
  }
}

export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON");
  }
}

export function parseBody<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new HttpError(400, "invalid_body", message);
  }
  return result.data;
}

export async function readBodyLimited(c: Context, max: number): Promise<Buffer> {
  const declared = c.req.header("content-length");
  if (declared && Number(declared) > max) {
    throw new HttpError(413, "too_large", `Upload exceeds ${max} bytes`);
  }
  const reader = c.req.raw.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new HttpError(413, "too_large", `Upload exceeds ${max} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function likeContains(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}
