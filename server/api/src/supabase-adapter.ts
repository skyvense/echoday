const IDENT = /^[a-z_][a-z0-9_]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AllowRule {
  table: string;
  ownerColumn: string;
  columns: string[];
}

export interface SupabaseSettings {
  enabled: boolean;
  url: string;
  publishableKey: string;
  secretKey: string;
  readMode: "user_jwt" | "service";
  allowlistRaw: string;
}

export function parseAllowlist(raw: string): AllowRule[] {
  if (!raw.trim()) return [];
  return raw.split(",").map((part) => {
    const [table, ownerColumn, columnList] = part.split(":").map((item) => item.trim());
    if (!table || !ownerColumn || !IDENT.test(table) || !IDENT.test(ownerColumn)) {
      throw new Error(`Invalid SUPABASE_READ_ALLOWLIST entry: ${part}`);
    }
    const columns = (columnList || "")
      .split("|")
      .map((column) => column.trim())
      .filter(Boolean);
    if (columns.length === 0 || columns.some((column) => column === "*" || !IDENT.test(column))) {
      throw new Error(`SUPABASE_READ_ALLOWLIST columns for ${table} must be explicit names, not *`);
    }
    if (!columns.includes(ownerColumn)) columns.unshift(ownerColumn);
    return { table, ownerColumn, columns };
  });
}

export function findRule(rules: AllowRule[], table: string): AllowRule | null {
  if (!IDENT.test(table)) return null;
  return rules.find((rule) => rule.table === table) ?? null;
}

/** PostgREST URL that can only return rows owned by this Supabase user id. */
export function restReadUrl(baseUrl: string, rule: AllowRule, ownerId: string, limit: number): string {
  if (!UUID.test(ownerId)) throw new Error("owner id must be a uuid");
  const capped = Math.min(Math.max(limit, 1), 100);
  const params = new URLSearchParams();
  params.set("select", rule.columns.join(","));
  params.set(rule.ownerColumn, `eq.${ownerId}`);
  params.set("limit", String(capped));
  return `${baseUrl.replace(/\/+$/, "")}/rest/v1/${rule.table}?${params.toString()}`;
}

export function readRequestHeaders(
  settings: SupabaseSettings,
  userJwt: string | null,
): { apikey: string; authorization: string } {
  if (userJwt) {
    if (!settings.publishableKey) throw new Error("publishable key missing");
    return { apikey: settings.publishableKey, authorization: `Bearer ${userJwt}` };
  }
  if (settings.readMode !== "service" || !settings.secretKey) {
    throw new Error("supabase read credentials missing");
  }
  return { apikey: settings.secretKey, authorization: `Bearer ${settings.secretKey}` };
}

export function integrationStatus(settings: SupabaseSettings): {
  enabled: boolean;
  read_configured: boolean;
  read_mode: "user_jwt" | "service" | "off";
} {
  if (!settings.enabled) return { enabled: false, read_configured: false, read_mode: "off" };
  let rules: AllowRule[] = [];
  try {
    rules = parseAllowlist(settings.allowlistRaw);
  } catch {
    rules = [];
  }
  const readConfigured = Boolean(settings.url) && rules.length > 0 && (settings.readMode === "user_jwt" ? Boolean(settings.publishableKey) : Boolean(settings.secretKey));
  return { enabled: true, read_configured: readConfigured, read_mode: settings.readMode };
}

export async function supabaseAuthUserId(
  settings: Pick<SupabaseSettings, "url" | "publishableKey">,
  userJwt: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  if (!settings.url || !settings.publishableKey) {
    throw new Error("supabase auth is not configured");
  }
  const response = await fetchImpl(`${settings.url}/auth/v1/user`, {
    headers: {
      apikey: settings.publishableKey,
      authorization: `Bearer ${userJwt}`,
    },
  });
  if (!response.ok) throw new Error(`supabase auth user lookup failed: ${response.status}`);
  const body = (await response.json()) as { id?: unknown };
  if (typeof body.id !== "string" || !UUID.test(body.id)) {
    throw new Error("supabase auth user lookup returned no id");
  }
  return body.id;
}
