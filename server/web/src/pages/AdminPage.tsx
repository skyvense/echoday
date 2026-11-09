import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  formatBytes,
  formatWhen,
  type AdminActivityEntry,
  type AdminCoupon,
  type AdminRedemption,
  type AdminUser,
  type AdminUserDetail,
} from "../api";
import { useSession } from "../App";
import { useLang } from "../i18n";

const PAGE_SIZE = 25;

export function AdminPage() {
  const { me } = useSession();
  const { t } = useLang();
  const [tab, setTab] = useState<"users" | "coupons" | "activity">("users");

  if (!me) return null;
  if (!me.is_admin) {
    return (
      <div className="max-w-2xl">
        <h1 className="font-bold text-4xl tracking-tight">{t("admin.title")}</h1>
        <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm">{t("admin.notOperator")}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-bold text-4xl tracking-tight">{t("admin.title")}</h1>
      <p className="mt-2 text-ink-soft">{t("admin.subtitle")}</p>
      <div className="mt-6 flex gap-2">
        <TabButton active={tab === "users"} onClick={() => setTab("users")}>
          {t("admin.tabUsers")}
        </TabButton>
        <TabButton active={tab === "coupons"} onClick={() => setTab("coupons")}>
          {t("admin.tabCoupons")}
        </TabButton>
        <TabButton active={tab === "activity"} onClick={() => setTab("activity")}>
          {t("admin.tabActivity")}
        </TabButton>
      </div>
      <div className="mt-6">
        {tab === "users" ? <UsersPanel /> : tab === "coupons" ? <CouponsPanel /> : <ActivityPanel />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm ${active ? "bg-ink text-paper" : "border border-line text-ink-soft hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function errText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function ActivityPanel() {
  const { t } = useLang();
  const [entries, setEntries] = useState<AdminActivityEntry[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api
      .adminActivity()
      .then((result) => setEntries(result.entries))
      .catch((err: unknown) => setError(errText(err, t("admin.loadError"))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-red-deep">{error}</p>;
  if (entries === null) return <p className="text-ink-soft">{t("admin.loading")}</p>;
  if (entries.length === 0) return <p className="text-ink-soft">{t("admin.activityEmpty")}</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              entry.kind === "upload"
                ? "bg-[#1c63f2]/10 text-[#1c63f2]"
                : entry.kind === "system"
                  ? "bg-ink/10 text-ink-soft"
                  : "bg-[#f36b53]/10 text-red-deep"
            }`}
          >
            {entry.kind === "upload"
              ? t("admin.activityKindUpload")
              : entry.kind === "system"
                ? t("admin.activityKindSystem")
                : t("admin.activityKindAgent")}
          </span>
          <span className="min-w-0 flex-1 text-sm">{entry.detail}</span>
          <span className="text-xs text-ink-soft">{entry.actor}</span>
          {entry.ip && <span className="text-xs text-ink-soft">{entry.ip}</span>}
          <span className="text-xs text-ink-soft">{formatWhen(entry.ts)}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- users

function UsersPanel() {
  const { t } = useLang();
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retentionNote, setRetentionNote] = useState("");

  const load = useCallback(() => {
    api
      .adminUsers(q, PAGE_SIZE, offset)
      .then((result) => {
        setUsers(result.users);
        setTotal(result.total);
        setError("");
      })
      .catch((err: unknown) => setError(errText(err, t("admin.loadUsersError"))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, offset]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setOffset(0);
  }, [q]);

  async function runRetention() {
    setRetentionNote(t("admin.retentionRunning"));
    try {
      const stats = await api.adminRunRetention();
      setRetentionNote(
        t("admin.retentionDone", {
          deleted: stats.objects_deleted,
          freed: formatBytes(stats.bytes_freed),
          processed: stats.days_processed,
          unprocessed: stats.days_unprocessed,
          errors: stats.errors,
        }),
      );
    } catch (err) {
      setRetentionNote(errText(err, t("admin.retentionError")));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t("admin.searchPlaceholder")}
          className="w-72 rounded-full border border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <span className="text-sm text-ink-soft">{t(total === 1 ? "admin.userOne" : "admin.userMany", { n: total })}</span>
        <button
          type="button"
          onClick={runRetention}
          className="ml-auto rounded-full border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-ink hover:text-ink"
        >
          {t("admin.runRetention")}
        </button>
      </div>
      {retentionNote && <p className="mt-3 rounded-2xl bg-paper px-4 py-3 text-sm">{retentionNote}</p>}
      {error && <p className="mt-3 text-sm text-red-deep">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">{t("admin.colEmail")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colPlan")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colPaidUntil")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colStorage")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colTokens")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colLastUpload")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colJoined")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                onClick={() => setSelectedId(user.id === selectedId ? null : user.id)}
                className={`cursor-pointer border-b border-line/60 last:border-0 hover:bg-paper ${selectedId === user.id ? "bg-paper" : ""}`}
              >
                <td className="px-4 py-3">
                  {user.email}
                  {user.is_admin && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-xs text-paper">{t("nav.admin")}</span>}
                </td>
                <td className="px-4 py-3">{user.mode}</td>
                <td className="px-4 py-3">{user.paid_until ? formatWhen(user.paid_until) : "—"}</td>
                <td className="px-4 py-3">
                  {formatBytes(user.used_bytes)} / {formatBytes(user.quota_bytes)}
                </td>
                <td className="px-4 py-3">
                  {t("admin.activeOf", { active: user.active_token_count, total: user.token_count })}
                </td>
                <td className="px-4 py-3">{user.last_upload_at ? formatWhen(user.last_upload_at) : "—"}</td>
                <td className="px-4 py-3">{formatWhen(user.created_at)}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-ink-soft" colSpan={7}>
                  {t("admin.noUsersMatch")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          className="rounded-full border border-line px-3 py-1.5 disabled:opacity-40"
        >
          {t("admin.previous")}
        </button>
        <button
          type="button"
          disabled={offset + PAGE_SIZE >= total}
          onClick={() => setOffset(offset + PAGE_SIZE)}
          className="rounded-full border border-line px-3 py-1.5 disabled:opacity-40"
        >
          {t("admin.next")}
        </button>
        <span className="text-ink-soft">
          {total === 0 ? 0 : offset + 1}–{Math.min(total, offset + PAGE_SIZE)} {t("admin.rangeOf")} {total}
        </span>
      </div>

      {selectedId && (
        <UserDetail
          key={selectedId}
          userId={selectedId}
          onChanged={load}
          onDeleted={() => {
            setSelectedId(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function UserDetail({
  userId,
  onChanged,
  onDeleted,
}: {
  userId: string;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { me } = useSession();
  const { t } = useLang();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paidUntil, setPaidUntil] = useState("");
  const [newToken, setNewToken] = useState("");
  const [armDelete, setArmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .adminUser(userId)
      .then((result) => {
        setDetail(result);
        setError("");
      })
      .catch((err: unknown) => setError(errText(err, t("admin.loadUserError"))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="mt-4 text-sm text-red-deep">{error}</p>;
  if (!detail) return <p className="mt-4 text-ink-soft">{t("admin.loadingUser")}</p>;
  const user = detail.user;

  async function act(run: () => Promise<void>, done: string) {
    setBusy(true);
    setError("");
    try {
      await run();
      setNotice(done);
      load();
      onChanged();
    } catch (err) {
      setError(errText(err, t("admin.genericError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-line bg-card p-6">
      <h2 className="font-bold text-2xl tracking-tight">{user.email}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {t("admin.userMeta", {
          status: user.subscription_status,
          via: user.subscription_source ? t("admin.userMetaVia", { source: user.subscription_source }) : "",
          trialEnd: formatWhen(user.trial_ends_at),
          bytes: formatBytes(user.used_bytes),
          joined: formatWhen(user.created_at),
        })}
      </p>
      {notice && <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm">{notice}</p>}
      {error && <p className="mt-4 text-sm text-red-deep">{error}</p>}

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-soft">{t("admin.subscription")}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          type="datetime-local"
          value={paidUntil}
          onChange={(event) => setPaidUntil(event.target.value)}
          className="rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="button"
          disabled={busy || !paidUntil}
          onClick={() =>
            act(
              async () => {
                await api.adminSetSubscription(userId, {
                  action: "set",
                  paid_until: new Date(paidUntil).toISOString(),
                });
              },
              t("admin.paidUpdated"),
            )
          }
          className="rounded-full bg-red px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {t("admin.setPaidUntil")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(async () => {
              await api.adminSetSubscription(userId, { action: "clear" });
            }, t("admin.paidCleared"))
          }
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-60"
        >
          {t("admin.clearPaid")}
        </button>
        <span className="text-sm text-ink-soft">
          {user.paid_until ? t("admin.currentPaid", { when: formatWhen(user.paid_until) }) : t("admin.currentNotPaid")}
        </span>
      </div>

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-soft">{t("admin.tokensHeading")}</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {detail.tokens.map((token) => (
          <li key={token.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper px-4 py-2.5">
            <code className="text-xs">{token.prefix}…</code>
            <span>{token.name}</span>
            <span className="text-ink-soft">
              {token.status === "active" ? t("admin.tokenStatusActive") : t("admin.tokenStatusRevoked")}
              {token.last_used_at
                ? ` · ${t("admin.tokenLastUsed", { when: formatWhen(token.last_used_at) })}`
                : ` · ${t("admin.tokenNeverUsed")}`}
            </span>
            {token.status === "active" && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await api.adminRevokeToken(userId, token.id);
                  }, t("admin.tokenRevoked"))
                }
                className="ml-auto rounded-full border border-line px-3 py-1 text-xs disabled:opacity-60"
              >
                {t("connect.revoke")}
              </button>
            )}
          </li>
        ))}
        {detail.tokens.length === 0 && <li className="text-ink-soft">{t("admin.noTokens")}</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(async () => {
              const result = await api.adminResetTokens(userId);
              setNewToken(result.token);
            }, t("admin.resetDone"))
          }
          className="rounded-full bg-ink px-4 py-2 text-sm text-paper disabled:opacity-60"
        >
          {t("admin.resetTokens")}
        </button>
      </div>
      {newToken && (
        <div className="mt-3 rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3">
          <p className="text-sm">{t("admin.newTokenNote")}</p>
          <code className="mt-1 block break-all text-sm">{newToken}</code>
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-soft">{t("admin.recentDays")}</h3>
      <ul className="mt-2 space-y-1 text-sm text-ink-soft">
        {detail.days.slice(0, 14).map((day) => (
          <li key={day.date}>
            {t("admin.dayLine", {
              date: day.date,
              audio: day.audio_count,
              photos: day.snapshot_count,
              bytes: formatBytes(day.bytes),
            })}
            {day.has_summary ? t("admin.dayHasResult") : ""}
            {day.originals_deleted_at ? t("admin.dayOriginalsDeleted", { when: formatWhen(day.originals_deleted_at) }) : ""}
          </li>
        ))}
        {detail.days.length === 0 && <li>{t("admin.noDays")}</li>}
      </ul>

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-red-deep">{t("admin.dangerZone")}</h3>
      {me?.id === user.id ? (
        <p className="mt-2 text-sm text-ink-soft">{t("admin.cannotDeleteSelf")}</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!armDelete) {
                setArmDelete(true);
                return;
              }
              setBusy(true);
              api
                .adminDeleteUser(userId)
                .then(() => onDeleted())
                .catch((err: unknown) => {
                  setError(errText(err, t("admin.deleteError")));
                  setArmDelete(false);
                })
                .finally(() => setBusy(false));
            }}
            className={`rounded-full px-4 py-2 text-sm text-white disabled:opacity-60 ${armDelete ? "bg-red" : "bg-red/60"}`}
          >
            {armDelete ? t("admin.deleteConfirm", { email: user.email }) : t("admin.deleteAccount")}
          </button>
          {armDelete && (
            <button type="button" onClick={() => setArmDelete(false)} className="text-sm text-ink-soft underline">
              {t("admin.cancel")}
            </button>
          )}
          <span className="text-sm text-ink-soft">{t("admin.deleteExplainer")}</span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- coupons

function CouponsPanel() {
  const { t } = useLang();
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"days" | "lifetime">("days");
  const [days, setDays] = useState("365");
  const [maxUses, setMaxUses] = useState("1");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [redemptionFor, setRedemptionFor] = useState<string | null>(null);
  const [redemptions, setRedemptions] = useState<AdminRedemption[]>([]);

  const load = useCallback(() => {
    api
      .adminCoupons()
      .then((result) => {
        setCoupons(result.coupons);
        setError("");
      })
      .catch((err: unknown) => setError(errText(err, t("admin.loadCouponsError"))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.adminCreateCoupon({
        code: code.trim() ? code.trim() : undefined,
        kind,
        days: kind === "days" ? Number(days) : null,
        max_uses: Math.max(1, Number(maxUses) || 1),
        expires_at: expires ? new Date(expires).toISOString() : null,
        note: note.trim() ? note.trim() : null,
      });
      setNotice(t("admin.couponCreated", { code: created.code_display }));
      setCode("");
      load();
    } catch (err) {
      setError(errText(err, t("admin.couponCreateError")));
    } finally {
      setBusy(false);
    }
  }

  async function showRedemptions(coupon: AdminCoupon) {
    if (redemptionFor === coupon.id) {
      setRedemptionFor(null);
      return;
    }
    try {
      const result = await api.adminCouponRedemptions(coupon.id);
      setRedemptions(result.redemptions);
      setRedemptionFor(coupon.id);
      setError("");
    } catch (err) {
      setError(errText(err, t("admin.loadRedemptionsError")));
    }
  }

  const inputCls =
    "rounded-full border border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink";

  return (
    <div>
      <form onSubmit={create} className="rounded-3xl border border-line bg-card p-6">
        <h2 className="font-bold text-2xl tracking-tight">{t("admin.newCoupon")}</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-ink-soft">{t("admin.couponCode")}</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-2345" className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-soft">{t("admin.couponKind")}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as "days" | "lifetime")} className={inputCls}>
              <option value="days">{t("admin.kindDays")}</option>
              <option value="lifetime">{t("admin.kindLifetime")}</option>
            </select>
          </label>
          {kind === "days" && (
            <label className="text-sm">
              <span className="mb-1 block text-ink-soft">{t("admin.couponDays")}</span>
              <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} className={`${inputCls} w-24`} />
            </label>
          )}
          <label className="text-sm">
            <span className="mb-1 block text-ink-soft">{t("admin.couponMaxUses")}</span>
            <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={`${inputCls} w-24`} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-soft">{t("admin.couponExpires")}</span>
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-soft">{t("admin.couponNote")}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="For Zhang" className={inputCls} />
          </label>
          <button type="submit" disabled={busy} className="rounded-full bg-red px-4 py-2 text-sm text-white disabled:opacity-60">
            {t("admin.create")}
          </button>
        </div>
        {notice && <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm">{notice}</p>}
        {error && <p className="mt-4 text-sm text-red-deep">{error}</p>}
      </form>

      <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">{t("admin.colCode")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colGrants")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colUsed")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colExpires")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colStatus")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.colNote")}</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr key={coupon.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3">
                  <code>{coupon.code_display}</code>
                </td>
                <td className="px-4 py-3">
                  {coupon.kind === "lifetime" ? t("admin.kindLifetime") : t("admin.grantsDays", { days: coupon.days ?? 0 })}
                </td>
                <td className="px-4 py-3">
                  {coupon.used_count} / {coupon.max_uses}
                </td>
                <td className="px-4 py-3">{coupon.expires_at ? formatWhen(coupon.expires_at) : "—"}</td>
                <td className="px-4 py-3">{coupon.disabled ? t("admin.statusDisabled") : t("admin.statusActive")}</td>
                <td className="px-4 py-3">{coupon.note ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => showRedemptions(coupon)}
                      className="rounded-full border border-line px-3 py-1 text-xs"
                    >
                      {t("admin.redemptions")}
                    </button>
                    {!coupon.disabled && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.adminDisableCoupon(coupon.id);
                            load();
                          } catch (err) {
                            setError(errText(err, t("admin.disableError")));
                          }
                        }}
                        className="rounded-full border border-line px-3 py-1 text-xs"
                      >
                        {t("admin.disable")}
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-ink-soft" colSpan={7}>
                  {t("admin.noCoupons")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {redemptionFor && (
        <section className="mt-4 rounded-3xl border border-line bg-card p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{t("admin.redemptions")}</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {redemptions.map((row) => (
              <li key={row.id}>
                {row.email} · {formatWhen(row.redeemed_at)}
              </li>
            ))}
            {redemptions.length === 0 && <li className="text-ink-soft">{t("admin.nobodyRedeemed")}</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
