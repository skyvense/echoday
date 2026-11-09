function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be a number`);
  return n;
}

const publicUrl = required("PUBLIC_URL", "http://127.0.0.1:8080").replace(/\/+$/, "");

function cookieSecure(): boolean {
  const flag = process.env.COOKIE_SECURE;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return publicUrl.startsWith("https://");
}

export type BillingMode = "stripe" | "stub";

function billingMode(): BillingMode {
  const explicit = process.env.BILLING_MODE;
  const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
  if (explicit === "stripe") return "stripe";
  if (explicit === "stub") return "stub";
  return hasStripe ? "stripe" : "stub";
}

const storageDriver = process.env.STORAGE_DRIVER === "r2" || process.env.STORAGE_DRIVER === "s3" ? process.env.STORAGE_DRIVER : "fs";

export const env = {
  publicUrl,
  apiHost: process.env.API_HOST || "0.0.0.0",
  apiPort: intEnv("API_PORT", 8787),
  databaseUrl: required("DATABASE_URL", "postgres://muse:muse@127.0.0.1:5432/muse"),
  jwtSecret: required("JWT_SECRET"),
  jwtTtlDays: intEnv("JWT_TTL_DAYS", 30),
  cookieSecure: cookieSecure(),
  trialDays: intEnv("TRIAL_DAYS", 7),
  priceCents: intEnv("PRICE_CENTS", 500),
  currency: (process.env.CURRENCY || "usd").toLowerCase(),
  maxUploadBytes: intEnv("MAX_UPLOAD_BYTES", 80 * 1024 * 1024),
  freeQuotaBytes: intEnv("FREE_QUOTA_BYTES", 2 * 1024 * 1024 * 1024),
  paidQuotaBytes: intEnv("PAID_QUOTA_BYTES", 20 * 1024 * 1024 * 1024),
  storageDriver,
  storageDir: process.env.STORAGE_DIR || "/data",
  s3Endpoint: process.env.S3_ENDPOINT || "",
  s3Region: process.env.S3_REGION || "us-east-1",
  s3Bucket: process.env.S3_BUCKET || "muse-audio",
  s3AccessKey: process.env.S3_ACCESS_KEY || "",
  s3SecretKey: process.env.S3_SECRET_KEY || "",
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  r2Endpoint: process.env.R2_ENDPOINT || "",
  r2Region: process.env.R2_REGION || "auto",
  r2Bucket: process.env.R2_BUCKET || "",
  r2AccessKey: process.env.R2_ACCESS_KEY_ID || "",
  r2SecretKey: process.env.R2_SECRET_ACCESS_KEY || "",
  r2ForcePathStyle: process.env.R2_FORCE_PATH_STYLE !== "false",
  supabaseIntegration: process.env.SUPABASE_INTEGRATION === "enabled" ? "enabled" : "disabled",
  supabaseUrl: (process.env.SUPABASE_URL || "").replace(/\/+$/, ""),
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || "",
  supabaseReadMode: process.env.SUPABASE_READ_MODE === "service" ? "service" : "user_jwt",
  supabaseReadAllowlist: process.env.SUPABASE_READ_ALLOWLIST || "",
  billingMode: billingMode(),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePriceId: process.env.STRIPE_PRICE_ID || "",
  supportEmail: (process.env.SUPPORT_EMAIL || "").trim(),
};

if (env.jwtSecret.length < 16) {
  throw new Error("JWT_SECRET must be at least 16 characters");
}

if (env.storageDriver === "s3" && (!env.s3Endpoint || !env.s3AccessKey || !env.s3SecretKey)) {
  throw new Error("STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY");
}

if (env.billingMode === "stripe" && (!env.stripeSecretKey || !env.stripePriceId)) {
  throw new Error("BILLING_MODE=stripe requires STRIPE_SECRET_KEY and STRIPE_PRICE_ID");
}
