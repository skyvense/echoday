const TOKEN_KEY = "muse_token";

export function saveToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export interface Billing {
  upload: boolean;
  mode: "trial" | "paid" | "read_only";
  reason: string;
  trialEndsAt: string;
  paidUntil: string | null;
  source: string | null;
  status: string;
  priceCents: number;
  currency: string;
  provider: "stripe" | "stub";
}

export interface Me {
  id: string;
  email: string;
  created_at: string;
  is_admin: boolean;
  public_url: string;
  billing: Billing;
}

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  is_admin: boolean;
  subscription_status: string;
  subscription_source: string | null;
  trial_ends_at: string;
  paid_until: string | null;
  mode: "trial" | "paid" | "read_only";
  used_bytes: number;
  quota_bytes: number;
  token_count: number;
  active_token_count: number;
  last_upload_at: string | null;
}

export interface AdminDay {
  date: string;
  audio_count: number;
  snapshot_count: number;
  bytes: number;
  has_summary: boolean;
  originals_deleted_at: string | null;
  updated_at: string;
}

export interface AdminToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  status: "active" | "revoked";
}

export interface AdminUserDetail {
  user: AdminUser;
  days: AdminDay[];
  tokens: AdminToken[];
}

export interface AdminCoupon {
  id: string;
  code: string;
  code_display: string;
  kind: "days" | "lifetime";
  days: number | null;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  disabled: boolean;
  note: string | null;
  created_at: string;
}

export interface AdminRedemption {
  id: string;
  user_id: string;
  email: string;
  redeemed_at: string;
}

export interface DaySummary {
  date: string;
  audio_count: number;
  marker_count: number;
  snapshot_count: number;
  bytes: number;
  summary_excerpt: string | null;
  summary_updated_at: string | null;
}

export interface AudioFile {
  filename: string;
  kind: "segment" | "note";
  bytes: number;
  sha256: string;
  content_type: string;
  uploaded_at: string;
  url?: string;
}

export interface SnapshotFile {
  filename: string;
  bytes: number;
  uploaded_at: string;
  url?: string;
}

export interface Marker {
  line_no: number;
  ts: string | null;
  epoch_ms: number | null;
  type: string | null;
  raw?: unknown;
}

export interface Summary {
  date: string;
  markdown: string;
  transcript_markdown: string | null;
  source: string;
  model: string | null;
  updated_at: string;
}

export interface DayDetail {
  date: string;
  audio: AudioFile[];
  snapshots: SnapshotFile[];
  markers: Marker[];
  summary: Summary | null;
}

export interface MuseToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text
    ? (JSON.parse(text) as { error?: string; message?: string; fields?: Record<string, string> })
    : null;
  if (!response.ok) {
    throw new ApiError(response.status, data?.error || "error", data?.message || response.statusText, data?.fields);
  }
  return data as T;
}

export const api = {
  me: () => request<Me>("/api/v1/me"),
  register: async (email: string, password: string) => {
    const session = await request<{ token: string; user: Me }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, client: "web" }),
    });
    saveToken(session.token);
    return session;
  },
  login: async (email: string, password: string) => {
    const session = await request<{ token: string; user: Me }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, client: "web" }),
    });
    saveToken(session.token);
    return session;
  },
  refresh: () => request<{ token: string; user: Me }>("/api/v1/auth/refresh", { method: "POST" }),
  logout: () => request<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" }),
  forgot: (email: string) =>
    request<{ ok: boolean; message: string }>("/api/v1/auth/forgot", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  days: (q = "") => request<{ days: DaySummary[] }>(`/api/v1/days?q=${encodeURIComponent(q)}`),
  day: (date: string) => request<DayDetail>(`/api/v1/days/${date}`),
  saveSummary: (date: string, markdown: string, transcript: string) =>
    request<Summary>(`/api/v1/days/${date}/summary`, {
      method: "PUT",
      body: JSON.stringify({
        markdown,
        transcript_markdown: transcript,
        source: "manual",
      }),
    }),
  tokens: () => request<{ tokens: MuseToken[] }>("/api/v1/tokens"),
  createToken: (name: string) =>
    request<MuseToken & { token: string; message: string }>("/api/v1/tokens", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  revokeToken: (id: string) => request<{ ok: boolean }>(`/api/v1/tokens/${id}`, { method: "DELETE" }),
  docs: async () => {
    const response = await fetch("/api/v1/docs", { credentials: "include" });
    if (!response.ok) throw new ApiError(response.status, "docs", "Could not load the API notes");
    return response.text();
  },
  billing: () =>
    request<
      Billing & {
        email: string;
        portal_available: boolean;
        stub_active: boolean;
      }
    >("/api/v1/billing"),
  checkout: () =>
    request<{ provider: string; url?: string; message?: string }>("/api/v1/billing/checkout", { method: "POST" }),
  portal: () => request<{ url: string }>("/api/v1/billing/portal", { method: "POST" }),
  stubActivate: () => request<Me>("/api/v1/billing/stub/activate", { method: "POST" }),
  stubTrial: () => request<Me & { message?: string }>("/api/v1/billing/stub/trial", { method: "POST" }),
  stubCancel: () => request<Me>("/api/v1/billing/stub/cancel", { method: "POST" }),
  adminUsers: (q = "", limit = 25, offset = 0) =>
    request<{ users: AdminUser[]; total: number; limit: number; offset: number }>(
      `/api/v1/admin/users?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`,
    ),
  adminUser: (id: string) => request<AdminUserDetail>(`/api/v1/admin/users/${id}`),
  adminRevokeToken: (userId: string, tokenId: string) =>
    request<{ ok: boolean }>(`/api/v1/admin/users/${userId}/tokens/${tokenId}/revoke`, { method: "POST" }),
  adminResetTokens: (userId: string) =>
    request<{ id: string; token: string; prefix: string; message: string }>(
      `/api/v1/admin/users/${userId}/tokens/reset`,
      { method: "POST" },
    ),
  adminDeleteUser: (userId: string) =>
    request<{ ok: boolean; email: string; blobs_deleted: number; blobs_failed: number }>(
      `/api/v1/admin/users/${userId}`,
      { method: "DELETE" },
    ),
  adminSetSubscription: (userId: string, body: { action: "set" | "clear"; paid_until?: string | null }) =>
    request<{ ok: boolean; paid_until: string | null; mode: string }>(
      `/api/v1/admin/users/${userId}/subscription`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  adminCoupons: () => request<{ coupons: AdminCoupon[] }>("/api/v1/admin/coupons"),
  adminCreateCoupon: (body: {
    code?: string;
    kind: "days" | "lifetime";
    days?: number | null;
    max_uses: number;
    expires_at?: string | null;
    note?: string | null;
  }) => request<AdminCoupon>("/api/v1/admin/coupons", { method: "POST", body: JSON.stringify(body) }),
  adminDisableCoupon: (id: string) =>
    request<AdminCoupon>(`/api/v1/admin/coupons/${id}/disable`, { method: "POST" }),
  adminCouponRedemptions: (id: string) =>
    request<{ coupon: AdminCoupon; redemptions: AdminRedemption[] }>(
      `/api/v1/admin/coupons/${id}/redemptions`,
    ),
  adminRunRetention: () =>
    request<{
      ok: boolean;
      days_processed: number;
      days_unprocessed: number;
      objects_deleted: number;
      bytes_freed: number;
      errors: number;
    }>("/api/v1/admin/maintenance/retention", { method: "POST" }),
};

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export const MARKER_LABELS: Record<string, string> = {
  conversation_start: "Conversation started",
  conversation_end: "Conversation ended",
  meeting_start: "Meeting started",
  meeting_end: "Meeting ended",
  self_note: "Self-note",
  self_note_start: "Voice note started",
  self_note_end: "Voice note ended",
  snapshot: "Snapshot",
};
