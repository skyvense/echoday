import { useEffect, useState } from "react";
import { ApiError, api, formatWhen, type MuseToken } from "../api";
import { buildAgentPrompt } from "../agentPrompt";
import { useSession } from "../App";
import { useLang } from "../i18n";

export function ConnectPage() {
  const { me } = useSession();
  const { t } = useLang();
  const [tokens, setTokens] = useState<MuseToken[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [fresh, setFresh] = useState("");
  const [docs, setDocs] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);

  const nameValue = name ?? t("connect.defaultTokenName");

  function load() {
    return api
      .tokens()
      .then((result) => setTokens(result.tokens))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : t("connect.loadError")));
  }

  useEffect(() => {
    load();
    api.docs().then(setDocs).catch(() => setDocs(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.createToken(nameValue.trim() || "Muse");
      setFresh(created.token);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("connect.createError"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError("");
    try {
      await api.revokeToken(id);
      if (fresh) setFresh("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("connect.revokeError"));
    }
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  const base = me?.public_url ?? "";
  const prompt = buildAgentPrompt(base);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section>
        <h1 className="font-bold text-4xl tracking-tight">{t("connect.title")}</h1>
        <p className="mt-2 text-ink-soft">{t("connect.intro")}</p>
        <form onSubmit={create} className="mt-6 rounded-3xl border border-line bg-card p-5">
          <label className="text-sm font-medium" htmlFor="token-name">
            {t("connect.tokenName")}
          </label>
          <input
            id="token-name"
            value={nameValue}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2"
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-full bg-red px-4 py-2 text-white disabled:opacity-60"
          >
            {busy ? t("connect.creating") : t("connect.createToken")}
          </button>
          {error && <p className="mt-3 text-sm text-red-deep">{error}</p>}
          {fresh && (
            <div className="mt-4 rounded-2xl bg-ink px-4 py-3 text-paper">
              <p className="text-sm text-paper/70">{t("connect.shownOnce")}</p>
              <p className="mt-2 break-all font-mono text-sm">{fresh}</p>
              <button
                type="button"
                onClick={() => copy("token", fresh)}
                className="mt-3 rounded-full bg-paper px-3 py-1.5 text-sm text-ink"
              >
                {copied === "token" ? t("common.copied") : t("connect.copyToken")}
              </button>
            </div>
          )}
        </form>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
          {tokens === null && <li className="px-5 py-4 text-ink-soft">{t("connect.loadingTokens")}</li>}
          {tokens && tokens.length === 0 && (
            <li className="px-5 py-4 text-ink-soft">{t("connect.noTokens")}</li>
          )}
          {tokens?.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">{token.name}</p>
                <p className="text-sm text-ink-soft">
                  {token.prefix}… · {t("connect.createdWord", { when: formatWhen(token.created_at) })}
                  {token.last_used_at
                    ? ` · ${t("connect.usedWord", { when: formatWhen(token.last_used_at) })}`
                    : ` · ${t("connect.notUsedYet")}`}
                </p>
              </div>
              <button type="button" onClick={() => revoke(token.id)} className="text-sm text-red-deep underline">
                {t("connect.revoke")}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-2xl tracking-tight">{t("connect.pasteTitle")}</h2>
          <button
            type="button"
            onClick={() => copy("prompt", prompt)}
            className="rounded-full border border-line px-3 py-1.5 text-sm"
          >
            {copied === "prompt" ? t("common.copied") : t("common.copy")}
          </button>
        </div>
        <pre className="mt-4 overflow-auto rounded-2xl bg-paper p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {prompt}
        </pre>
        <p className="mt-4 text-sm text-ink-soft">
          {t("connect.replacePre")} <code className="rounded bg-paper-deep px-1">YOUR_MUSE_TOKEN</code>{" "}
          {t("connect.replacePost")} <code className="rounded bg-paper-deep px-1">scripts/muse_cloud.py</code>.
        </p>
        {docs && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">{t("connect.fullApiNotes")}</summary>
            <pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-paper p-4 text-xs leading-relaxed whitespace-pre-wrap">
              {docs}
            </pre>
          </details>
        )}
      </section>
    </div>
  );
}
