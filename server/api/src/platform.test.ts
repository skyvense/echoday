import assert from "node:assert/strict";
import test from "node:test";
import {
  findRule,
  integrationStatus,
  parseAllowlist,
  readRequestHeaders,
  restReadUrl,
  supabaseAuthUserId,
} from "./supabase-adapter.js";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";

test("allowlist rejects star selects and unknown shapes", () => {
  assert.equal(parseAllowlist("").length, 0);
  assert.throws(() => parseAllowlist("notes:owner_id:*"));
  assert.throws(() => parseAllowlist("Bad-Name:owner_id:day"));
});

test("reads are filtered to the linked supabase user only", () => {
  const rules = parseAllowlist("daily_notes:owner_id:day|body");
  const rule = findRule(rules, "daily_notes");
  assert.ok(rule);
  const url = restReadUrl("https://example.supabase.co", rule!, ownerA, 500);
  assert.match(url, new RegExp(`owner_id=eq\\.${ownerA}`));
  assert.equal(url.includes(ownerB), false);
  assert.match(url, /select=owner_id%2Cday%2Cbody|select=owner_id,day,body/);
  assert.match(url, /limit=100/);
  assert.equal(findRule(rules, "other_table"), null);
  assert.equal(findRule(rules, "pg_catalog"), null);
});

test("disabled integration reports no read path", () => {
  const status = integrationStatus({
    enabled: false,
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    secretKey: "sb_secret_test",
    readMode: "service",
    allowlistRaw: "daily_notes:owner_id:day",
  });
  assert.deepEqual(status, { enabled: false, read_configured: false, read_mode: "off" });
});

test("user jwt mode does not send the secret key", () => {
  const headers = readRequestHeaders(
    {
      enabled: true,
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
      secretKey: "sb_secret_test",
      readMode: "user_jwt",
      allowlistRaw: "",
    },
    "user-access-token",
  );
  assert.equal(headers.apikey, "sb_publishable_test");
  assert.equal(headers.authorization, "Bearer user-access-token");
  assert.equal(headers.apikey.includes("secret"), false);
});

test("service mode without a secret is an unavailable config", () => {
  assert.throws(() =>
    readRequestHeaders(
      {
        enabled: true,
        url: "https://example.supabase.co",
        publishableKey: "",
        secretKey: "",
        readMode: "service",
        allowlistRaw: "",
      },
      null,
    ),
  );
});

test("identity linking trusts only the Supabase auth user endpoint", async () => {
  const seen: string[] = [];
  const id = await supabaseAuthUserId(
    { url: "https://example.supabase.co", publishableKey: "sb_publishable_test" },
    "access-token",
    (async (url, init) => {
      seen.push(String(url));
      assert.equal((init?.headers as Record<string, string>).apikey, "sb_publishable_test");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer access-token");
      return new Response(JSON.stringify({ id: ownerA }), { status: 200 });
    }) as typeof fetch,
  );
  assert.equal(id, ownerA);
  assert.equal(seen[0], "https://example.supabase.co/auth/v1/user");
  await assert.rejects(() =>
    supabaseAuthUserId(
      { url: "https://example.supabase.co", publishableKey: "sb_publishable_test" },
      "nope",
      (async () => new Response("{}", { status: 401 })) as typeof fetch,
    ),
  );
});
