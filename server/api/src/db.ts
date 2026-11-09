import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { env } from "./env.js";

export const sql = postgres(env.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {
    // CREATE ... IF NOT EXISTS emits a notice on every boot.
  },
});

function schemaPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "schema.sql"), join(here, "../src/schema.sql")];
  for (const path of candidates) {
    try {
      readFileSync(path);
      return path;
    } catch {
      // try the next location (src/ in dev, dist/ in the image)
    }
  }
  throw new Error("schema.sql not found next to the server");
}

function statements(schema: string): string[] {
  return schema
    .split(/;\s*(?:\n|$)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.split("\n").every((line) => line.trim().startsWith("--") || line.trim() === ""));
}

export async function initDb(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      await sql`select 1 as ok`;
      const schema = readFileSync(schemaPath(), "utf8");
      for (const statement of statements(schema)) {
        await sql.unsafe(statement);
      }
      console.log("database ready");
      return;
    } catch (error) {
      lastError = error;
      console.log(`database not ready (attempt ${attempt})`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("database unavailable");
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  trial_ends_at: Date;
  subscription_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_current_period_end: Date | null;
  token_version: number;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`select * from users where id = ${id}`;
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`select * from users where email = ${email}`;
  return rows[0] ?? null;
}
