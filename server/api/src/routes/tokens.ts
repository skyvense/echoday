import { Hono } from "hono";
import { z } from "zod";
import { newMuseToken, requireUser, SCOPES, type AppEnv } from "../auth.js";
import { sql } from "../db.js";
import { HttpError, parseBody, readJson } from "../http.js";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80).default("Muse"),
  scopes: z.array(z.enum(SCOPES)).min(1).optional(),
});

export const tokenRoutes = new Hono<AppEnv>();

tokenRoutes.use("*", requireUser());

tokenRoutes.get("/", async (c) => {
  const rows = await sql<
    { id: string; name: string; token_prefix: string; scopes: string[]; created_at: Date; last_used_at: Date | null }[]
  >`
    select id, name, token_prefix, scopes, created_at, last_used_at
    from api_tokens
    where user_id = ${c.get("user").id} and revoked_at is null
    order by created_at desc
  `;
  return c.json({
    tokens: rows.map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.token_prefix,
      scopes: row.scopes,
      created_at: new Date(row.created_at).toISOString(),
      last_used_at: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    })),
  });
});

tokenRoutes.post("/", async (c) => {
  const body = parseBody(createSchema, await readJson(c));
  const name = body.name ?? "Muse";
  const scopes: string[] = [...(body.scopes ?? SCOPES)];
  const minted = newMuseToken();
  const rows = await sql<{ id: string; created_at: Date }[]>`
    insert into api_tokens (user_id, name, token_hash, token_prefix, scopes)
    values (${c.get("user").id}, ${name}, ${minted.hash}, ${minted.prefix}, ${scopes})
    returning id, created_at
  `;
  return c.json(
    {
      id: rows[0]!.id,
      name,
      token: minted.raw,
      prefix: minted.prefix,
      scopes,
      created_at: new Date(rows[0]!.created_at).toISOString(),
      message: "Copy this token now. It is stored hashed and will not be shown again.",
    },
    201,
  );
});

tokenRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(404, "not_found", "Token not found");
  }
  const rows = await sql<{ id: string }[]>`
    update api_tokens
    set revoked_at = now()
    where id = ${id}::uuid and user_id = ${c.get("user").id} and revoked_at is null
    returning id
  `;
  if (!rows[0]) throw new HttpError(404, "not_found", "Token not found");
  return c.json({ ok: true });
});
