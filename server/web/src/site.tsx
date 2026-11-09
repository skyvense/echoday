import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export function Mark() {
  return (
    <svg viewBox="0 0 1024 1024" className="h-7 w-7" aria-hidden="true">
      <path d="M182 165 H842 A330 330 0 0 1 182 165 Z" fill="#F36B53" />
      <path d="M182 859 H842 A330 330 0 0 0 182 859 Z" fill="#33327E" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  useEffect(() => {
    const saved = localStorage.getItem("muse-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  function choose(next: "light" | "dark") {
    const current = document.documentElement.dataset.theme === "dark" ||
      (document.documentElement.dataset.theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light";
    const value = next === current && theme !== "system" ? "system" : next;
    if (value === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
    if (value === "system") localStorage.removeItem("muse-theme");
    else localStorage.setItem("muse-theme", value);
    setTheme(value);
  }

  return (
    <div className="flex rounded-full border border-line p-0.5 text-xs">
      <button type="button" className={`rounded-full px-2 py-1 ${theme === "light" ? "bg-ink text-paper" : ""}`} onClick={() => choose("light")}>
        Light
      </button>
      <button type="button" className={`rounded-full px-2 py-1 ${theme === "dark" ? "bg-ink text-paper" : ""}`} onClick={() => choose("dark")}>
        Dark
      </button>
    </div>
  );
}

export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="border-b border-line bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <Mark />
          <span className="font-bold text-xl tracking-tight">EchoDay</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <a href="/#how" className="text-ink-soft no-underline hover:text-ink">How it works</a>
          <a href="/#pricing" className="text-ink-soft no-underline hover:text-ink">Pricing</a>
          <a href="/#muse" className="text-ink-soft no-underline hover:text-ink">Connect Muse</a>
          <Link to="/download" className="text-ink-soft no-underline hover:text-ink">Download</Link>
          <a
            href="https://github.com/skyvense/echoday"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-ink-soft no-underline hover:text-ink"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-4 w-4">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            GitHub
          </a>
          <ThemeToggle />
          {signedIn ? (
            <Link to="/days" className="rounded-full bg-ink px-3 py-1.5 text-paper no-underline">Days</Link>
          ) : (
            <>
              <Link to="/login" className="text-ink no-underline">Sign in</Link>
              <Link to="/register" className="rounded-full bg-red px-3 py-1.5 text-white no-underline">Start 7-day trial</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
