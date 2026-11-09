import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export function Mark() {
  return <span className="inline-block h-3.5 w-3.5 rounded-full bg-red shadow-[0_0_0_4px_rgba(194,59,46,0.18)]" />;
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
          <span className="font-serif text-xl tracking-tight">Muse AI Cloud</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <a href="/#how" className="text-ink-soft no-underline hover:text-ink">How it works</a>
          <a href="/#pricing" className="text-ink-soft no-underline hover:text-ink">Pricing</a>
          <a href="/#muse" className="text-ink-soft no-underline hover:text-ink">Connect Muse</a>
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
