import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api";
import { useLang } from "../i18n";
import { SiteFooter, SiteHeader } from "../site";

export function ForgotPage() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.forgot(email);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.couldNotReach"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="font-bold text-4xl tracking-tight">{t("forgot.title")}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t("forgot.intro")}</p>
        <form onSubmit={onSubmit} className="mt-8 rounded-3xl border border-line bg-card p-6">
          <label className="text-sm font-medium" htmlFor="email">{t("common.email")}</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2.5"
          />
          {error && <p className="mt-3 text-sm text-red-deep">{error}</p>}
          {message && <p className="mt-3 text-sm">{message}</p>}
          <button type="submit" disabled={busy} className="mt-5 w-full rounded-full bg-ink px-4 py-2.5 text-paper disabled:opacity-60">
            {busy ? t("forgot.sending") : t("forgot.showInstructions")}
          </button>
        </form>
        <p className="mt-4 text-sm">
          <Link to="/login" className="text-red-deep">{t("forgot.backToSignIn")}</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
