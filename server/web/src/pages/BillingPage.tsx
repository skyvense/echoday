import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, api, formatWhen, money, type Billing } from "../api";
import { useSession } from "../App";
import { useLang } from "../i18n";

export function BillingPage() {
  const { me, refresh } = useSession();
  const { t } = useLang();
  const [params] = useSearchParams();
  const [billing, setBilling] = useState<(Billing & { portal_available: boolean; stub_active: boolean }) | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    return api
      .billing()
      .then(setBilling)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : t("billing.loadError")));
  }

  useEffect(() => {
    load();
    const checkout = params.get("checkout");
    if (checkout === "success") {
      setNotice(t("billing.checkoutSuccess"));
    } else if (checkout === "cancel") {
      setNotice(t("billing.checkoutCancel"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (!me) return null;
  const price = money(me.billing.priceCents, me.billing.currency);

  async function subscribe() {
    setBusy(true);
    setError("");
    try {
      const result = await api.checkout();
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setNotice(result.message || t("billing.stubNotConfigured"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("billing.checkoutError"));
    } finally {
      setBusy(false);
    }
  }

  async function activateStub() {
    setBusy(true);
    setError("");
    try {
      await api.stubActivate();
      await refresh();
      await load();
      setNotice(t("billing.stubActivated"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("billing.stubActivateError"));
    } finally {
      setBusy(false);
    }
  }

  async function cancelStub() {
    setBusy(true);
    setError("");
    try {
      await api.stubCancel();
      await refresh();
      await load();
      setNotice(t("billing.stubCanceled"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("billing.stubCancelError"));
    } finally {
      setBusy(false);
    }
  }

  async function portal() {
    setBusy(true);
    setError("");
    try {
      const result = await api.portal();
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("billing.portalError"));
      setBusy(false);
    }
  }

  const statusLine =
    me.billing.mode === "paid"
      ? t("billing.statusPaid")
      : me.billing.mode === "trial"
        ? t("billing.statusTrial", { when: formatWhen(me.billing.trialEndsAt) })
        : t("billing.statusReadOnly");

  const trialDays = Math.max(
    1,
    Math.round((Date.parse(me.billing.trialEndsAt) - Date.parse(me.created_at)) / 86400000),
  );

  return (
    <div className="max-w-2xl">
      <h1 className="font-bold text-4xl tracking-tight">{t("billing.title")}</h1>
      <p className="mt-2 text-ink-soft">{t("billing.intro", { price })}</p>

      <section className="mt-6 rounded-3xl border border-line bg-card p-6">
        <p className="text-sm uppercase tracking-wide text-ink-soft">{t("billing.plan")}</p>
        <p className="mt-1 font-bold text-5xl tracking-tight">
          {price}
          <span className="text-2xl text-ink-soft"> {t("billing.perMonth")}</span>
        </p>
        <p className="mt-3">{statusLine}</p>
        <p className="mt-1 text-sm text-ink-soft">
          {t("billing.accountLine", {
            email: me.email,
            status: billing?.status ?? me.billing.status,
            provider: me.billing.provider,
          })}
        </p>
        {notice && <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm">{notice}</p>}
        {error && <p className="mt-4 text-sm text-red-deep">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          {me.billing.mode !== "paid" && (
            <button
              type="button"
              disabled={busy}
              onClick={subscribe}
              className="rounded-full bg-red px-4 py-2.5 text-white disabled:opacity-60"
            >
              {busy
                ? t("common.working")
                : me.billing.provider === "stripe"
                  ? t("billing.subscribeStripe", { price })
                  : t("billing.subscribeStub", { price })}
            </button>
          )}
          {me.billing.provider === "stub" && me.billing.mode !== "paid" && (
            <button
              type="button"
              disabled={busy}
              onClick={activateStub}
              className="rounded-full border border-ink px-4 py-2.5 disabled:opacity-60"
            >
              {t("billing.subscribeStub", { price })}
            </button>
          )}
          {me.billing.provider === "stub" && me.billing.status !== "active" && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await api.stubTrial();
                  await refresh();
                  await load();
                  setNotice(result.message || t("billing.stubTrialDone"));
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : t("billing.stubTrialError"));
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-full border border-line px-4 py-2.5 disabled:opacity-60"
            >
              {t("billing.extendTrial")}
            </button>
          )}
          {me.billing.provider === "stub" && billing?.stub_active && (
            <button type="button" disabled={busy} onClick={cancelStub} className="rounded-full border border-line px-4 py-2.5">
              {t("billing.cancelTest")}
            </button>
          )}
          {billing?.portal_available && (
            <button type="button" disabled={busy} onClick={portal} className="rounded-full border border-ink px-4 py-2.5">
              {t("billing.openPortal")}
            </button>
          )}
        </div>
      </section>

      {me.billing.provider === "stub" && <p className="mt-4 text-sm text-ink-soft">{t("billing.stubNote")}</p>}

      <ul className="mt-6 space-y-2 text-sm text-ink-soft">
        <li>{t("billing.facts.0", { days: trialDays })}</li>
        <li>{t("billing.facts.1")}</li>
        <li>{t("billing.facts.2")}</li>
      </ul>
    </div>
  );
}
