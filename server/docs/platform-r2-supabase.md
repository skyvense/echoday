# Platform storage and Supabase reads

The Android app authenticates only to EchoDay. Cloudflare R2 credentials and the Supabase secret key stay in server environment variables. They are not returned by any API and are not placed in the APK.

Audio and marker uploads keep the existing contract: `PUT /api/v1/upload/{muse-recorder key}` with `Authorization: Bearer <platform jwt>`. The API writes the object to the configured store. A repeated PUT of the same key overwrites that object (idempotent). Transient 429/5xx responses are retried up to three times. A 4xx from storage is not retried.

## Storage drivers

| `STORAGE_DRIVER` | Credentials | Behavior |
| --- | --- | --- |
| `fs` | none | Files under `STORAGE_DIR`. |
| `s3` | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_FORCE_PATH_STYLE` | Local S3-compatible store (Silo / MinIO). Missing values prevent process start. The API creates the bucket if it is absent. |
| `r2` | `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, optional `R2_REGION` (`auto`), `R2_FORCE_PATH_STYLE` (default true) | Cloudflare R2 or another R2-compatible endpoint. The bucket is not auto-created. If any required value is missing, the process still starts and uploads return **503** `storage_unconfigured`. |

`R2_ENDPOINT` is the full S3 API URL, for example `https://<accountid>.r2.cloudflarestorage.com`. Do not put these values in the Android app or the website bundle.

`GET /api/v1/platform/config` (platform JWT) returns `storage.driver` and `storage.ready` only.

## Supabase reads

Project ref observed read-only: `xpmorezsouevzihgjpxe` (PG 17, healthy). The public tables `segment_transcripts`, `analyses`, and `daily_summaries` have **no user column** and **RLS is off**. The API does not query them unless an operator sets an allowlist that names a real owner column. No migration has been applied to that project. A commented proposal is `supabase/proposed/001_owner_and_rls.sql`.

Identity is not inferred. `POST /api/v1/platform/supabase/identity` sends the caller's Supabase **user access token** to `GET {SUPABASE_URL}/auth/v1/user` with the publishable key as `apikey`. The `id` in that response is stored in Muse Cloud table `supabase_identity_links`. A client-supplied UUID is ignored. One Supabase user can be linked to only one platform user.

| Variable | Required to enable | Notes |
| --- | --- | --- |
| `SUPABASE_INTEGRATION` | yes | `enabled` or omitted/`disabled`. Default disabled. |
| `SUPABASE_URL` | yes when enabled | `https://xpmorezsouevzihgjpxe.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | user-jwt reads and linking | `sb_publishable_...`. Legacy `SUPABASE_ANON_KEY` is accepted as a fallback. Not a user secret, but still server-configured here so the APK does not need it. |
| `SUPABASE_SECRET_KEY` | only when `SUPABASE_READ_MODE=service` | `sb_secret_...` or legacy service role. Bypasses RLS. Never send it to Android or the browser. |
| `SUPABASE_READ_MODE` | no | `user_jwt` (default) or `service`. |
| `SUPABASE_READ_ALLOWLIST` | yes for reads | `table:owner_column:col|col`. Empty means reads return 503 `supabase_read_unconfigured`. `*` is rejected. |

`user_jwt` mode calls PostgREST with the caller's Supabase access token and the publishable key, so RLS applies. The token's user id must match the link or the API returns 403. `service` mode is optional and still adds `owner_column=eq.<linked uuid>` because a secret key bypasses RLS.

Disabled integration: `503` `supabase_disabled` and no outbound call.

## Android endpoints

All require `Authorization: Bearer <platform jwt>` except the health check.

| Call | Purpose |
| --- | --- |
| `GET /api/v1/platform/config` | Storage readiness and whether Supabase is enabled and linked. No secrets. |
| `PUT /api/v1/upload/...` | Existing upload contract. |
| `GET /api/v1/platform/supabase/identity` | `{ linked, supabase_user_id }`. |
| `POST /api/v1/platform/supabase/identity` | Header `X-Supabase-Authorization: Bearer <supabase access token>`. |
| `DELETE /api/v1/platform/supabase/identity` | Unlink. |
| `GET /api/v1/platform/supabase/tables/:table?limit=` | Allowlisted rows for the linked user only. Same Supabase header when mode is `user_jwt`. |

Logout still revokes the platform JWT via `token_version`.

## Deployment checklist

1. Do not point this change at the live VPS until you choose to. `http://akjp.ddn.pw:8471` was not modified.
2. Apply Muse Cloud's own schema by restarting the API (`supabase_identity_links`, `token_version`). That is local Postgres, not Supabase.
3. Create the R2 bucket and token in Cloudflare. Set `STORAGE_DRIVER=r2` and the `R2_*` variables. Confirm `GET /api/health` shows `storage_ready: true`.
4. Leave `SUPABASE_INTEGRATION` unset until a publishable key is in the server env and you accept the linking flow.
5. On Supabase, add an owner column and RLS policy (see the proposed file). Do not enable RLS with zero policies if existing readers must keep working. Until that column exists, leave `SUPABASE_READ_ALLOWLIST` empty.
6. Never put `R2_SECRET_ACCESS_KEY` or `SUPABASE_SECRET_KEY` in the APK, the web bundle, or git.

## Tests vs live cloud

`npm test` in `api/` mocks retry, R2 config absence, allowlist isolation, and the Auth user lookup. It does not call Cloudflare or Supabase. A live check still needs the secrets and a real owner column.
