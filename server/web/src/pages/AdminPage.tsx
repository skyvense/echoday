import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  formatBytes,
  formatWhen,
  type AdminCoupon,
  type AdminRedemption,
  type AdminUser,
  type AdminUserDetail,
} from "../api";
import { useSession } from "../App";

const PAGE_SIZE = 25;

export function AdminPage() {
  const { me } = useSession();
  const [tab, setTab] = useState<"users" | "coupons">("users");

  if (!me) return null;
  if (!me.is_admin) {
    return (
      <div className="max-w-2xl">
        <h1 className="font-bold text-4xl tracking-tight">Admin</h1>
        <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm">
          This account is not an operator. Admin access follows the ADMIN_EMAILS list on the server.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-bold text-4xl tracking-tight">Admin</h1>
      <p className="mt-2 text-ink-soft">Accounts, Muse tokens, subscriptions, and coupon codes.</p>
      <div className="mt-6 flex gap-2">
        <TabButton active={tab === "users"} onClick={() => setTab("users")}>
          Users
        </TabButton>
        <TabButton active={tab === "coupons"} onClick={() => setTab("coupons")}>
          Coupons
        </TabButton>
      </div>
      <div className="mt-6">{tab === "users" ? <UsersPanel /> : <CouponsPanel />}</div>
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

// ---------------------------------------------------------------- users

function UsersPanel() {
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
      .catch((err: unknown) => setError(errText(err, "Could not load users.")));
  }, [q, offset]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setOffset(0);
  }, [q]);

  async function runRetention() {
    setRetentionNote("Running retention…");
    try {
      const stats = await api.adminRunRetention();
      setRetentionNote(
        `Retention done: ${stats.objects_deleted} originals deleted (${formatBytes(stats.bytes_freed)} freed), ` +
          `${stats.days_processed} processed days, ${stats.days_unprocessed} unprocessed days, ${stats.errors} errors.`,
      );
    } catch (err) {
      setRetentionNote(errText(err, "Retention run failed."));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search by email…"
          className="w-72 rounded-full border border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <span className="text-sm text-ink-soft">
          {total} user{total === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={runRetention}
          className="ml-auto rounded-full border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-ink hover:text-ink"
        >
          Run retention now
        </button>
      </div>
      {retentionNote && <p className="mt-3 rounded-2xl bg-paper px-4 py-3 text-sm">{retentionNote}</p>}
      {error && <p className="mt-3 text-sm text-red-deep">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Paid until</th>
              <th className="px-4 py-3 font-medium">Storage</th>
              <th className="px-4 py-3 font-medium">Tokens</th>
              <th className="px-4 py-3 font-medium">Last upload</th>
              <th className="px-4 py-3 font-medium">Joined</th>
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
                  {user.is_admin && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-xs text-paper">admin</span>}
                </td>
                <td className="px-4 py-3">{user.mode}</td>
                <td className="px-4 py-3">{user.paid_until ? formatWhen(user.paid_until) : "—"}</td>
                <td className="px-4 py-3">
                  {formatBytes(user.used_bytes)} / {formatBytes(user.quota_bytes)}
                </td>
                <td className="px-4 py-3">
                  {user.active_token_count} active / {user.token_count}
                </td>
                <td className="px-4 py-3">{user.last_upload_at ? formatWhen(user.last_upload_at) : "—"}</td>
                <td className="px-4 py-3">{formatWhen(user.created_at)}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-ink-soft" colSpan={7}>
                  No users match.
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
          Previous
        </button>
        <button
          type="button"
          disabled={offset + PAGE_SIZE >= total}
          onClick={() => setOffset(offset + PAGE_SIZE)}
          className="rounded-full border border-line px-3 py-1.5 disabled:opacity-40"
        >
          Next
        </button>
        <span className="text-ink-soft">
          {total === 0 ? 0 : offset + 1}–{Math.min(total, offset + PAGE_SIZE)} of {total}
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
      .catch((err: unknown) => setError(errText(err, "Could not load this user.")));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="mt-4 text-sm text-red-deep">{error}</p>;
  if (!detail) return <p className="mt-4 text-ink-soft">Loading user…</p>;
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
      setError(errText(err, "That did not work."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-line bg-card p-6">
      <h2 className="font-bold text-2xl tracking-tight">{user.email}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Status {user.subscription_status}
        {user.subscription_source ? ` · via ${user.subscription_source}` : ""} · trial ends {formatWhen(user.trial_ends_at)} ·{" "}
        {formatBytes(user.used_bytes)} stored · joined {formatWhen(user.created_at)}
      </p>
      {notice && <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm">{notice}</p>}
      {error && <p className="mt-4 text-sm text-red-deep">{error}</p>}

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-soft">Subscription</h3>
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
              "Paid period updated.",
            )
          }
          className="rounded-full bg-red px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          Set paid until
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(async () => {
              await api.adminSetSubscription(userId, { action: "clear" });
            }, "Paid period cleared; the account is back on trial/free rules.")
          }
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-60"
        >
          Clear paid period
        </button>
        <span className="text-sm text-ink-soft">
          Current: {user.paid_until ? `paid until ${formatWhen(user.paid_until)}` : "not on a paid period"}
        </span>
      </div>

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-soft">Muse tokens</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {detail.tokens.map((token) => (
          <li key={token.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper px-4 py-2.5">
            <code className="text-xs">{token.prefix}…</code>
            <span>{token.name}</span>
            <span className="text-ink-soft">
              {token.status}
              {token.last_used_at ? ` · last used ${formatWhen(token.last_used_at)}` : " · never used"}
            </span>
            {token.status === "active" && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await api.adminRevokeToken(userId, token.id);
                  }, "Token revoked.")
                }
                className="ml-auto rounded-full border border-line px-3 py-1 text-xs disabled:opacity-60"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
        {detail.tokens.length === 0 && <li className="text-ink-soft">No tokens yet.</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(async () => {
              const result = await api.adminResetTokens(userId);
              setNewToken(result.token);
            }, "All old tokens were revoked and a new one was issued below.")
          }
          className="rounded-full bg-ink px-4 py-2 text-sm text-paper disabled:opacity-60"
        >
          Reset tokens (revoke all, issue new)
        </button>
      </div>
      {newToken && (
        <div className="mt-3 rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3">
          <p className="text-sm">New token — shown once, copy it now:</p>
          <code className="mt-1 block break-all text-sm">{newToken}</code>
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-soft">Recent days</h3>
      <ul className="mt-2 space-y-1 text-sm text-ink-soft">
        {detail.days.slice(0, 14).map((day) => (
          <li key={day.date}>
            {day.date} · {day.audio_count} audio · {day.snapshot_count} photos · {formatBytes(day.bytes)}
            {day.has_summary ? " · has result" : ""}
            {day.originals_deleted_at ? ` · originals deleted ${formatWhen(day.originals_deleted_at)}` : ""}
          </li>
        ))}
        {detail.days.length === 0 && <li>No days yet.</li>}
      </ul>

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-red-deep">Danger zone</h3>
      {me?.id === user.id ? (
        <p className="mt-2 text-sm text-ink-soft">You cannot delete your own admin account.</p>
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
                  setError(errText(err, "Could not delete the account."));
                  setArmDelete(false);
                })
                .finally(() => setBusy(false));
            }}
            className={`rounded-full px-4 py-2 text-sm text-white disabled:opacity-60 ${armDelete ? "bg-red" : "bg-red/60"}`}
          >
            {armDelete ? `Click again to permanently delete ${user.email}` : "Delete account"}
          </button>
          {armDelete && (
            <button type="button" onClick={() => setArmDelete(false)} className="text-sm text-ink-soft underline">
              Cancel
            </button>
          )}
          <span className="text-sm text-ink-soft">Deletes the account, all days, files, and tokens. No undo.</span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- coupons

function CouponsPanel() {
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
      .catch((err: unknown) => setError(errText(err, "Could not load coupons.")));
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
      setNotice(`Created coupon ${created.code_display}.`);
      setCode("");
      load();
    } catch (err) {
      setError(errText(err, "Could not create the coupon."));
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
      setError(errText(err, "Could not load redemptions."));
    }
  }

  const inputCls =
    "rounded-full border border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink";

  return (
    <div>
      <form onSubmit={create} className="rounded-3xl border border-line bg-card p-6">
        <h2 className="font-bold text-2xl tracking-tight">New coupon</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-ink-soft">Code (blank = generate)</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-2345" className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-soft">Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as "days" | "lifetime")} className={inputCls}>
              <option value="days">Days</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </label>
          {kind === "days" && (
            <label className="text-sm">
              <span className="mb-1 block text-ink-soft">Days</span>
              <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} className={`${inputCls} w-24`} />
            </label>
          )}
          <label className="text-sm">
            <span className="mb-1 block text-ink-soft">Max uses</span>
            <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={`${inputCls} w-24`} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-soft">Code expires</span>
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-soft">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="For Zhang" className={inputCls} />
          </label>
          <button type="submit" disabled={busy} className="rounded-full bg-red px-4 py-2 text-sm text-white disabled:opacity-60">
            Create
          </button>
        </div>
        {notice && <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm">{notice}</p>}
        {error && <p className="mt-4 text-sm text-red-deep">{error}</p>}
      </form>

      <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Grants</th>
              <th className="px-4 py-3 font-medium">Used</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Note</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr key={coupon.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3">
                  <code>{coupon.code_display}</code>
                </td>
                <td className="px-4 py-3">{coupon.kind === "lifetime" ? "Lifetime" : `${coupon.days} days`}</td>
                <td className="px-4 py-3">
                  {coupon.used_count} / {coupon.max_uses}
                </td>
                <td className="px-4 py-3">{coupon.expires_at ? formatWhen(coupon.expires_at) : "—"}</td>
                <td className="px-4 py-3">{coupon.disabled ? "disabled" : "active"}</td>
                <td className="px-4 py-3">{coupon.note ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => showRedemptions(coupon)}
                      className="rounded-full border border-line px-3 py-1 text-xs"
                    >
                      Redemptions
                    </button>
                    {!coupon.disabled && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.adminDisableCoupon(coupon.id);
                            load();
                          } catch (err) {
                            setError(errText(err, "Could not disable the coupon."));
                          }
                        }}
                        className="rounded-full border border-line px-3 py-1 text-xs"
                      >
                        Disable
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-ink-soft" colSpan={7}>
                  No coupons yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {redemptionFor && (
        <section className="mt-4 rounded-3xl border border-line bg-card p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Redemptions</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {redemptions.map((row) => (
              <li key={row.id}>
                {row.email} · {formatWhen(row.redeemed_at)}
              </li>
            ))}
            {redemptions.length === 0 && <li className="text-ink-soft">Nobody has redeemed this code yet.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
