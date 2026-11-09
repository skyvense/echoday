import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Context, MiddlewareHandler } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { env, isAdminEmail } from "./env.js";
import { findUserById, type UserRow } from "./db.js";
import { bearer, HttpError } from "./http.js";
import { sql } from "./db.js";

export const SCOPES = [
  "days:read",
  "audio:read",
  "markers:read",
  "summary:read",
  "summary:write",
] as const;

export type Scope = (typeof SCOPES)[number];

export type AppEnv = {
  Variables: {
    user: UserRow;
    actor: "user" | "muse";
    scopes: string[];
  };
};

const jwtKey = new TextEncoder().encode(env.jwtSecret);
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function verifyPasswordOrDummy(password: string, hash: string | null): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH).then((ok) => (hash ? ok : false));
}

export async function signUserToken(user: UserRow): Promise<string> {
  return new SignJWT({ email: user.email, typ: "user", ver: Number(user.token_version) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${env.jwtTtlDays}d`)
    .sign(jwtKey);
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `muse_session=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (env.cookieSecure) parts.push("Secure");
  return parts.join("; ");
}

function cookieToken(c: Context): string | null {
  const header = c.req.header("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "muse_session") return rest.join("=") || null;
  }
  return null;
}

export function presentedUserToken(c: Context): string | null {
  const token = bearer(c) ?? cookieToken(c);
  if (!token || token.startsWith("muse_")) return null;
  return token;
}

export async function userFromToken(token: string): Promise<UserRow | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey);
    if (payload.typ !== "user" || typeof payload.sub !== "string") return null;
    const user = await findUserById(payload.sub);
    if (!user) return null;
    const version = typeof payload.ver === "number" ? payload.ver : Number(payload.ver);
    if (!Number.isFinite(version) || version !== Number(user.token_version)) return null;
    return user;
  } catch {
    return null;
  }
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await sql`update users set token_version = token_version + 1 where id = ${userId}`;
}

export function requireUser(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = presentedUserToken(c);
    if (!token) {
      throw new HttpError(401, "unauthorized", "Sign in required");
    }
    const user = await userFromToken(token);
    if (!user) throw new HttpError(401, "unauthorized", "Sign in required");
    c.set("user", user);
    c.set("actor", "user");
    c.set("scopes", ["*"]);
    await next();
  };
}

/** User JWT + the account email must be listed in ADMIN_EMAILS. */
export function requireAdmin(): MiddlewareHandler<AppEnv> {
  const userAuth = requireUser();
  return async (c, next) => {
    await userAuth(c, async () => {
      if (!isAdminEmail(c.get("user").email)) {
        throw new HttpError(403, "forbidden", "Admin access required");
      }
      await next();
    });
  };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newMuseToken(): { raw: string; hash: string; prefix: string } {
  const raw = `muse_${randomBytes(32).toString("base64url")}`;
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
}

export function requireMuse(scope: Scope): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = bearer(c);
    if (!token || !token.startsWith("muse_")) {
      throw new HttpError(401, "unauthorized", "Muse API token required");
    }
    const rows = await sql<
      { id: string; user_id: string; scopes: string[]; revoked_at: Date | null }[]
    >`
      select id, user_id, scopes, revoked_at
      from api_tokens
      where token_hash = ${hashToken(token)}
    `;
    const row = rows[0];
    if (!row || row.revoked_at) {
      throw new HttpError(401, "unauthorized", "Muse API token required");
    }
    if (!row.scopes.includes(scope)) {
      throw new HttpError(403, "forbidden", `This token cannot ${scope.replace(":", " ")}`);
    }
    const user = await findUserById(row.user_id);
    if (!user) throw new HttpError(401, "unauthorized", "Muse API token required");
    c.set("user", user);
    c.set("actor", "muse");
    c.set("scopes", row.scopes);
    await sql`update api_tokens set last_used_at = now() where id = ${row.id}`;
    await next();
  };
}
