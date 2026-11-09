import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError, api, saveToken } from "../api";
import { useSession } from "../App";
import { SiteHeader } from "../site";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { me, loading, refresh } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!loading && me) return <Navigate to="/days" replace />;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setFields({});
    if (mode === "register" && password !== confirm) {
      setFields({ password: "The two passwords do not match." });
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const session = mode === "register" ? await api.register(email, password) : await api.login(email, password);
      saveToken(session.token);
      await refresh();
      navigate("/days");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{mode === "login" ? "Sign in" : "Create an account"}</h1>
          <p className="mt-3 text-ink-soft">
            {mode === "login"
              ? "Use the same email on the phone and on this website."
              : "Registration opens 7 days of uploads. After that, the shelf stays readable at $5 a month."}
          </p>
          {mode === "register" && (
            <p className="mt-4 text-sm text-ink-soft">$5/mo after. Cancel anytime. Transcription stays on your keys.</p>
          )}
        </div>
        <form onSubmit={onSubmit} className="rounded-3xl border border-line bg-card p-6">
          <label className="text-sm font-medium" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2.5"
          />
          {fields.email && <p className="mt-1 text-sm text-red-deep">{fields.email}</p>}
          <label className="mt-4 block text-sm font-medium" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2.5"
          />
          {fields.password && <p className="mt-1 text-sm text-red-deep">{fields.password}</p>}
          {mode === "register" && (
            <>
              <label className="mt-4 block text-sm font-medium" htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2.5"
              />
              <p className="mt-2 text-sm text-ink-soft">At least 8 characters, with a letter and a number.</p>
            </>
          )}
          {error && !fields.email && !fields.password && <p className="mt-3 text-sm text-red-deep">{error}</p>}
          {error && (fields.email || fields.password) && error !== fields.email && error !== fields.password && (
            <p className="mt-3 text-sm text-red-deep">{error}</p>
          )}
          <button type="submit" disabled={busy} className="mt-6 w-full rounded-full bg-red px-4 py-2.5 font-medium text-white disabled:opacity-60">
            {busy ? "Working…" : mode === "login" ? "Sign in" : "Start 7-day trial"}
          </button>
          <p className="mt-4 text-sm text-ink-soft">
            {mode === "login" ? (
              <>
                New here? <Link to="/register" className="text-red-deep">Start 7-day trial</Link>
                {" · "}
                <Link to="/forgot" className="text-red-deep">Password help</Link>
              </>
            ) : (
              <>
                Already have an account? <Link to="/login" className="text-red-deep">Sign in</Link>
              </>
            )}
          </p>
        </form>
      </main>
    </div>
  );
}
