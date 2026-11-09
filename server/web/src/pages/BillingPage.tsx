import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, api, money, type Billing } from "../api";
import { useSession } from "../App";

export function BillingPage() {
  const { me, refresh } = useSession();
  const [params] = useSearchParams();
  const [billing, setBilling] = useState<(Billing & { portal_available: boolean; stub_active: boolean }) | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    return api
      .billing()
      .then(setBilling)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load billing."));
  }

  useEffect(() => {
    load();
    const checkout = params.get("checkout");
    if (checkout === "success") {
      setNotice("Checkout returned. Access updates when Stripe sends the webhook. Refresh in a moment if it still says trial.");
    } else if (checkout === "cancel") {
      setNotice("Checkout was canceled. The trial or current plan is unchanged.");
    }
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
      setNotice(result.message || "Stripe is not configured on this server.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
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
      setNotice("Local test subscription is active. No card was charged.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not activate the test subscription.");
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
      setNotice("Test subscription canceled. Uploads are read-only unless the trial is still open.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel.");
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
      setError(err instanceof ApiError ? err.message : "Could not open the portal.");
      setBusy(false);
    }
  }

  const statusLine =
    me.billing.mode === "paid"
      ? "Subscription active. Uploads are open."
      : me.billing.mode === "trial"
        ? `Trial ends ${new Date(me.billing.trialEndsAt).toLocaleString()}.`
        : "Read-only. New phone uploads are blocked until you subscribe.";

  return (
    <div className="max-w-2xl">
      <h1 className="font-bold text-4xl tracking-tight">Billing</h1>
      <p className="mt-2 text-ink-soft">
        {price} per month keeps the shelf open for one person. Transcription is not included, because this server does
        not run it.
      </p>

      <section className="mt-6 rounded-3xl border border-line bg-card p-6">
        <p className="text-sm uppercase tracking-wide text-ink-soft">Plan</p>
        <p className="mt-1 font-bold text-5xl tracking-tight">
          {price}
          <span className="text-2xl text-ink-soft"> / month</span>
        </p>
        <p className="mt-3">{statusLine}</p>
        <p className="mt-1 text-sm text-ink-soft">
          Account {me.email} · status {billing?.status ?? me.billing.status} · provider {me.billing.provider}
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
              {busy ? "Working…" : me.billing.provider === "stripe" ? `Subscribe · ${price}/mo` : `Subscribe ${price}/mo (stub)`}
            </button>
          )}
          {me.billing.provider === "stub" && me.billing.mode !== "paid" && (
            <button
              type="button"
              disabled={busy}
              onClick={activateStub}
              className="rounded-full border border-ink px-4 py-2.5 disabled:opacity-60"
            >
              Subscribe {price}/mo (stub)
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
                  setNotice(result.message || "Trial uploads were extended. No card was charged.");
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "Could not extend the trial.");
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-full border border-line px-4 py-2.5 disabled:opacity-60"
            >
              Start or extend 7-day trial
            </button>
          )}
          {me.billing.provider === "stub" && billing?.stub_active && (
            <button type="button" disabled={busy} onClick={cancelStub} className="rounded-full border border-line px-4 py-2.5">
              Cancel test subscription
            </button>
          )}
          {billing?.portal_available && (
            <button type="button" disabled={busy} onClick={portal} className="rounded-full border border-ink px-4 py-2.5">
              Open customer portal
            </button>
          )}
        </div>
      </section>

      {me.billing.provider === "stub" && (
        <p className="mt-4 text-sm text-ink-soft">
          Stripe is not configured, so nothing is charged. Set STRIPE_SECRET_KEY, STRIPE_PRICE_ID, and
          STRIPE_WEBHOOK_SECRET to use Checkout and the customer portal. Create a recurring price of 500 USD cents.
          Test cards such as 4242 4242 4242 4242 work with <code>sk_test_</code> keys.
        </p>
      )}

      <ul className="mt-6 space-y-2 text-sm text-ink-soft">
        <li>The trial is {Math.max(1, Math.round((Date.parse(me.billing.trialEndsAt) - Date.parse(me.created_at)) / 86400000))} days from registration, full uploads included.</li>
        <li>After it ends, days, markers, summaries, and Muse reads stay available. New audio uploads return HTTP 402.</li>
        <li>Your Muse can still post a summary of audio that is already here.</li>
      </ul>
    </div>
  );
}
