import { Hono } from "hono";
import { publicUser } from "../access.js";
import {
  hashPassword,
  presentedUserToken,
  requireUser,
  revokeUserSessions,
  sessionCookie,
  signUserToken,
  userFromToken,
  verifyPasswordOrDummy,
  type AppEnv,
} from "../auth.js";
import { findUserByEmail, sql, type UserRow } from "../db.js";
import { env } from "../env.js";
import { clientIp, HttpError, rateLimit, readJson } from "../http.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCredentials(data: unknown, mode: "login" | "register") {
  if (!data || typeof data !== "object") {
    throw new HttpError(400, "invalid_body", "Send email and password as JSON.");
  }
  const record = data as Record<string, unknown>;
  const email = String(record.email ?? "").trim().toLowerCase();
  const password = String(record.password ?? "");
  const client = typeof record.client === "string" ? record.client.slice(0, 40) : undefined;
  const fields: Record<string, string> = {};
  if (!email || !EMAIL_RE.test(email) || email.length > 200) {
    fields.email = "Enter a valid email address.";
  }
  if (password.length < 8) {
    fields.password = "Use at least 8 characters.";
  } else if (password.length > 200) {
    fields.password = "That password is too long.";
  } else if (mode === "register" && !/[A-Za-z]/.test(password)) {
    fields.password = "Include at least one letter.";
  } else if (mode === "register" && !/[0-9]/.test(password)) {
    fields.password = "Include at least one number.";
  }
  if (Object.keys(fields).length > 0) {
    throw new HttpError(400, "invalid_body", Object.values(fields)[0]!, fields);
  }
  return { email, password, client };
}

function issueSession(c: { header: (name: string, value: string) => void }, token: string) {
  c.header("Set-Cookie", sessionCookie(token, env.jwtTtlDays * 86400));
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/register", async (c) => {
  rateLimit(`register:${clientIp(c)}`, 10, 15 * 60 * 1000);
  const body = parseCredentials(await readJson(c), "register");
  const email = body.email;
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new HttpError(409, "email_taken", "An account with that email already exists");
  }
  const passwordHash = await hashPassword(body.password);
  const trialEnds = new Date(Date.now() + env.trialDays * 24 * 60 * 60 * 1000);
  const rows = await sql<UserRow[]>`
    insert into users (email, password_hash, trial_ends_at, subscription_status)
    values (${email}, ${passwordHash}, ${trialEnds}, 'trialing')
    returning *
  `;
  const user = rows[0]!;
  const token = await signUserToken(user);
  issueSession(c, token);
  return c.json({ token, user: publicUser(user) }, 201);
});

authRoutes.post("/login", async (c) => {
  rateLimit(`login:${clientIp(c)}`, 20, 15 * 60 * 1000);
  const body = parseCredentials(await readJson(c), "login");
  const email = body.email;
  const user = await findUserByEmail(email);
  const ok = await verifyPasswordOrDummy(body.password, user?.password_hash ?? null);
  if (!user || !ok) {
    throw new HttpError(401, "invalid_credentials", "Email or password is wrong");
  }
  const token = await signUserToken(user);
  issueSession(c, token);
  return c.json({ token, user: publicUser(user) });
});

authRoutes.post("/refresh", requireUser(), async (c) => {
  const user = c.get("user");
  const token = await signUserToken(user);
  issueSession(c, token);
  return c.json({ token, user: publicUser(user) });
});

authRoutes.post("/logout", async (c) => {
  const token = presentedUserToken(c);
  const user = token ? await userFromToken(token) : null;
  if (user) await revokeUserSessions(user.id);
  c.header("Set-Cookie", sessionCookie("", 0));
  return c.json({
    ok: true,
    revoked: Boolean(user),
    message: user
      ? "Signed out. This session token no longer works."
      : "Signed out.",
  });
});

authRoutes.post("/forgot", async (c) => {
  rateLimit(`forgot:${clientIp(c)}`, 10, 15 * 60 * 1000);
  const body = await readJson(c).catch(() => ({}));
  const email = body && typeof body === "object" ? String((body as { email?: unknown }).email ?? "").trim() : "";
  if (email && !EMAIL_RE.test(email)) {
    throw new HttpError(400, "invalid_body", "Enter a valid email address.", {
      email: "Enter a valid email address.",
    });
  }
  const contact = env.supportEmail
    ? `Contact ${env.supportEmail} and ask them to reset the password.`
    : "Contact the person who runs this EchoDay and ask them to reset the password.";
  return c.json({
    ok: true,
    message: `This server does not email password resets. ${contact}`,
  });
});

authRoutes.get("/me", requireUser(), (c) => {
  return c.json(publicUser(c.get("user")));
});
