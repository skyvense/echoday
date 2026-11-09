import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET ||= "unit-test-jwt-secret-16";
process.env.DATABASE_URL ||= "postgres://muse:muse@127.0.0.1:5432/muse";
process.env.PUBLIC_URL ||= "http://127.0.0.1:8080";
process.env.STORAGE_DRIVER ||= "fs";

test("registration validation reports bad email and a weak password", async () => {
  const { parseCredentials } = await import("./routes/auth.js");
  await assert.rejects(
    async () => parseCredentials({ email: "not-an-email", password: "recorder1" }, "register"),
    (error: { fields?: { email?: string } }) => Boolean(error.fields?.email),
  );
  await assert.rejects(
    async () => parseCredentials({ email: "ada@example.com", password: "short1" }, "register"),
    (error: { fields?: { password?: string } }) => Boolean(error.fields?.password),
  );
  await assert.rejects(
    async () => parseCredentials({ email: "ada@example.com", password: "longpassword" }, "register"),
    (error: { fields?: { password?: string } }) => error.fields?.password === "Include at least one number.",
  );
  const ok = parseCredentials({ email: "Ada@Example.com", password: "recorder1" }, "register");
  assert.equal(ok.email, "ada@example.com");
});
