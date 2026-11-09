import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { api, clearToken, money, saveToken, type Me } from "./api";
import { LangToggle, useLang } from "./i18n";
import { Mark, SiteFooter } from "./site";
import { AdminPage } from "./pages/AdminPage";
import { AuthPage } from "./pages/AuthPage";
import { BillingPage } from "./pages/BillingPage";
import { ConnectPage } from "./pages/ConnectPage";
import { DayPage } from "./pages/DayPage";
import { DaysPage } from "./pages/DaysPage";
import { DownloadPage } from "./pages/DownloadPage";
import { ForgotPage } from "./pages/ForgotPage";
import { LandingPage } from "./pages/LandingPage";

interface SessionValue {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session missing");
  return value;
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const session = await api.refresh();
      saveToken(session.token);
      setMe(session.user);
    } catch {
      clearToken();
      setMe(null);
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const session = useMemo<SessionValue>(() => ({ me, loading, refresh }), [me, loading]);

  return (
    <SessionContext.Provider value={session}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Shell />}>
            <Route path="/days" element={<DaysPage />} />
            <Route path="/days/:date" element={<DayPage />} />
            <Route path="/connect" element={<ConnectPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/days" replace />} />
      </Routes>
    </SessionContext.Provider>
  );
}

function RequireAuth() {
  const { me, loading } = useSession();
  const { t } = useLang();
  if (loading) {
    return <p className="px-6 py-16 text-ink-soft">{t("common.checkingSession")}</p>;
  }
  if (!me) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function Shell() {
  const { me, refresh } = useSession();
  const { t } = useLang();
  const navigate = useNavigate();
  if (!me) return null;
  const billing = me.billing;

  async function logout() {
    try {
      await api.logout();
    } catch {
      // The cookie may already be gone. Still drop the local token.
    }
    clearToken();
    await refresh();
    navigate("/");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <Mark />
            <span className="font-bold text-xl tracking-tight">EchoDay</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Tab to="/days">{t("nav.days")}</Tab>
            <Tab to="/connect">{t("nav.connect")}</Tab>
            <Tab to="/billing">{t("nav.billing")}</Tab>
            {me.is_admin && <Tab to="/admin">{t("nav.admin")}</Tab>}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft sm:inline">{me.email}</span>
            <LangToggle />
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-line px-3 py-1.5 text-ink-soft hover:border-ink hover:text-ink"
            >
              {t("nav.signOut")}
            </button>
          </div>
        </div>
      </header>
      {billing.mode === "trial" && (
        <Banner>
          {t("shell.trialBanner", {
            date: new Date(billing.trialEndsAt).toLocaleDateString(),
            price: money(billing.priceCents, billing.currency),
          })}
        </Banner>
      )}
      {billing.mode === "read_only" && (
        <Banner tone="warn">
          {t("shell.readOnlyBanner", { reason: billing.reason.replaceAll("_", " ") })}{" "}
          <Link to="/billing" className="underline">
            {t("shell.reviewBilling")}
          </Link>
          .
        </Banner>
      )}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

function Tab({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-full px-3 py-1.5 no-underline ${isActive ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`
      }
    >
      {children}
    </NavLink>
  );
}

function Banner({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className={tone === "warn" ? "bg-amber/10 text-amber" : "bg-red/8 text-red-deep"}>
      <p className="mx-auto max-w-5xl px-4 py-2.5 text-sm sm:px-6">{children}</p>
    </div>
  );
}
