CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz NOT NULL,
  subscription_status text NOT NULL DEFAULT 'trialing',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_current_period_end timestamptz,
  token_version integer NOT NULL DEFAULT 1
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 1;

-- How the current paid period was granted: 'stripe' | 'stub' | 'coupon' | 'admin'.
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_source text;

CREATE TABLE IF NOT EXISTS api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  scopes text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS api_tokens_user_idx ON api_tokens (user_id);

CREATE TABLE IF NOT EXISTS days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day)
);

CREATE INDEX IF NOT EXISTS days_user_day_idx ON days (user_id, day DESC);

-- Set by the retention job once a day's original blobs (audio + snapshots)
-- have been deleted. The days row, markers, and summary stay forever.
ALTER TABLE days ADD COLUMN IF NOT EXISTS originals_deleted_at timestamptz;

CREATE TABLE IF NOT EXISTS objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_id uuid NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  day date NOT NULL,
  logical_key text NOT NULL,
  filename text NOT NULL,
  kind text NOT NULL,
  bytes bigint NOT NULL,
  sha256 text NOT NULL,
  content_type text NOT NULL,
  storage_key text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, logical_key)
);

CREATE INDEX IF NOT EXISTS objects_user_day_idx ON objects (user_id, day);

CREATE TABLE IF NOT EXISTS markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_id uuid NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  day date NOT NULL,
  line_no int NOT NULL,
  ts text,
  epoch_ms bigint,
  type text,
  raw jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS markers_user_day_idx ON markers (user_id, day, line_no);

CREATE TABLE IF NOT EXISTS summaries (
  day_id uuid PRIMARY KEY REFERENCES days(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  markdown text NOT NULL,
  transcript_markdown text,
  analyses_json jsonb NOT NULL DEFAULT '[]',
  photo_analysis_markdown text,
  sheet_key text,
  source text NOT NULL,
  model text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Daily recognition result extensions (audio + photo), added for the
-- one-token result push; idempotent so existing databases pick them up.
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS analyses_json jsonb NOT NULL DEFAULT '[]';
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS photo_analysis_markdown text;
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS sheet_key text;

CREATE INDEX IF NOT EXISTS summaries_user_day_idx ON summaries (user_id, day DESC);

-- Coupon codes. Redeeming a 'days' code extends the paid period by `days`
-- (stacked on the current period end); a 'lifetime' code sets a far-future
-- period end. Codes are stored normalized: uppercase, no separators.
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind in ('days', 'lifetime')),
  days integer,
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  disabled boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, user_id)
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_user_idx ON coupon_redemptions (user_id);

CREATE TABLE IF NOT EXISTS supabase_identity_links (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  supabase_user_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supabase_user_id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS activity_log_ts_idx ON activity_log (ts DESC);
