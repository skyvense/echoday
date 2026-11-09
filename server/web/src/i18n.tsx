import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setDateLocale } from "./api";
import en from "./locales/en";
import zh from "./locales/zh";

export type Lang = "en" | "zh";
export type Dict = typeof en;

const STORAGE_KEY = "echoday-lang";
const dicts: Record<Lang, Dict> = { en, zh };

function guessLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    // storage may be unavailable; fall through to the browser guess
  }
  const nav = typeof navigator !== "undefined" ? navigator.language || "" : "";
  return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function lookup(dict: Dict, path: string): unknown {
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return node;
}

export type TVars = Record<string, string | number>;

interface LangValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** The full dictionary for the current language (typed like the English one). */
  d: Dict;
  /** Translate a dotted key, with optional {placeholder} substitution. Falls back to English. */
  t: (path: string, vars?: TVars) => string;
}

const LangContext = createContext<LangValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => guessLang());

  useEffect(() => {
    setDateLocale(lang === "zh" ? "zh-CN" : "en-US");
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // non-fatal: language just won't persist
    }
  }, []);

  const value = useMemo<LangValue>(() => {
    const d = dicts[lang];
    const t = (path: string, vars?: TVars): string => {
      let raw = lookup(d, path);
      if (typeof raw !== "string") raw = lookup(en, path);
      if (typeof raw !== "string") return path;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in vars ? String(vars[key]) : match,
      );
    };
    return { lang, setLang, d, t };
  }, [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangValue {
  const value = useContext(LangContext);
  if (!value) throw new Error("Language missing");
  return value;
}

/** EN / 中文 segmented switch, styled like the theme toggle. */
export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="flex rounded-full border border-line p-0.5 text-xs">
      <button
        type="button"
        className={`rounded-full px-2 py-1 ${lang === "en" ? "bg-ink text-paper" : ""}`}
        onClick={() => setLang("en")}
      >
        EN
      </button>
      <button
        type="button"
        className={`rounded-full px-2 py-1 ${lang === "zh" ? "bg-ink text-paper" : ""}`}
        onClick={() => setLang("zh")}
      >
        中文
      </button>
    </div>
  );
}
