import { useEffect, useState } from "react";
import { ApiError, api, formatWhen, type MuseToken } from "../api";
import { useSession } from "../App";

export function ConnectPage() {
  const { me } = useSession();
  const [tokens, setTokens] = useState<MuseToken[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("Morning Muse");
  const [fresh, setFresh] = useState("");
  const [docs, setDocs] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    return api
      .tokens()
      .then((result) => setTokens(result.tokens))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load tokens."));
  }

  useEffect(() => {
    load();
    api.docs().then(setDocs).catch(() => setDocs(""));
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.createToken(name.trim() || "Muse");
      setFresh(created.token);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create a token.");
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
      setError(err instanceof ApiError ? err.message : "Could not revoke the token.");
    }
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  const base = me?.public_url ?? "";
  const prompt = `You are my Muse. Each morning, pull yesterday from my EchoDay and write the daily summary.

Base URL: ${base}
Authorization: Bearer YOUR_MUSE_TOKEN

Workflow:
1. GET ${base}/api/v1/muse/days — see which days exist and which have no result yet.
2. GET ${base}/api/v1/muse/days/YYYY-MM-DD — the day manifest. Download every audio segment, self-note and snapshot photo using the download_url of each item (they point to /days/YYYY-MM-DD/segments/<filename> and /days/YYYY-MM-DD/snapshots/<filename>). Event markers come in the manifest, or as JSONL from GET .../days/YYYY-MM-DD/markers/raw.
3. Transcribe the audio and run photo recognition on your side — this server never calls a model. Never ask EchoDay to call OpenAI, Whisper, or any other model.
4. Read the markers (conversation, meeting, self-note) and use them to split the day. Write the daily note: one-line overview, timeline, todos, decisions, my self-notes first, the full transcript, per-window analyses, and photo-recognition notes.
5. Push the result back:
   PUT ${base}/api/v1/muse/days/YYYY-MM-DD/result
   JSON: {"markdown":"...","transcript_markdown":"...","analyses_json":[{"window_start":"YYYY-MM-DD HH:MM","window_end":"YYYY-MM-DD HH:MM","text":"..."}],"photo_analysis_markdown":"...","source":"muse","model":"<your model>"}
   markdown is required (max 200k chars); transcript_markdown max 2M chars; analyses_json max 100 entries; photo_analysis_markdown max 200k chars.
6. If you built a daily activity sheet, PUT the JPEG binary itself (Content-Type: image/jpeg) to ${base}/api/v1/muse/days/YYYY-MM-DD/sheet.

Retention — process new days promptly:
- Once a day has a result, its original audio/photos are kept only 2 more days (paid plan: 30), then the server deletes them automatically. Markers, summaries and sheets are kept forever.
- A day with no result loses its originals 7 days after its last upload (paid plan: 90 days). Download what you need before that.
- Originals storage quota: 2 GB free / 20 GB paid. When it is full, uploads fail with 413 until processed days are cleaned up.`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section>
        <h1 className="font-bold text-4xl tracking-tight">Connect Muse</h1>
        <p className="mt-2 text-ink-soft">
          The token is how your agent reads a day and writes the summary. It cannot upload audio or touch billing.
        </p>
        <form onSubmit={create} className="mt-6 rounded-3xl border border-line bg-card p-5">
          <label className="text-sm font-medium" htmlFor="token-name">
            Token name
          </label>
          <input
            id="token-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2"
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-full bg-red px-4 py-2 text-white disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create API token"}
          </button>
          {error && <p className="mt-3 text-sm text-red-deep">{error}</p>}
          {fresh && (
            <div className="mt-4 rounded-2xl bg-ink px-4 py-3 text-paper">
              <p className="text-sm text-paper/70">Shown once. Store it in your agent, not in the phone app.</p>
              <p className="mt-2 break-all font-mono text-sm">{fresh}</p>
              <button
                type="button"
                onClick={() => copy("token", fresh)}
                className="mt-3 rounded-full bg-paper px-3 py-1.5 text-sm text-ink"
              >
                {copied === "token" ? "Copied" : "Copy token"}
              </button>
            </div>
          )}
        </form>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
          {tokens === null && <li className="px-5 py-4 text-ink-soft">Loading tokens…</li>}
          {tokens && tokens.length === 0 && (
            <li className="px-5 py-4 text-ink-soft">No active tokens. Create one for the agent that writes your mornings.</li>
          )}
          {tokens?.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">{token.name}</p>
                <p className="text-sm text-ink-soft">
                  {token.prefix}… · created {formatWhen(token.created_at)}
                  {token.last_used_at ? ` · used ${formatWhen(token.last_used_at)}` : " · not used yet"}
                </p>
              </div>
              <button type="button" onClick={() => revoke(token.id)} className="text-sm text-red-deep underline">
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-2xl tracking-tight">Paste this to Grok or Muse</h2>
          <button
            type="button"
            onClick={() => copy("prompt", prompt)}
            className="rounded-full border border-line px-3 py-1.5 text-sm"
          >
            {copied === "prompt" ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="mt-4 overflow-auto rounded-2xl bg-paper p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {prompt}
        </pre>
        <p className="mt-4 text-sm text-ink-soft">
          Replace <code className="rounded bg-paper-deep px-1">YOUR_MUSE_TOKEN</code> with the token above. A stdlib
          helper that matches the old S3 inbox layout lives at <code className="rounded bg-paper-deep px-1">scripts/muse_cloud.py</code>.
        </p>
        {docs && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">Full API notes</summary>
            <pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-paper p-4 text-xs leading-relaxed whitespace-pre-wrap">
              {docs}
            </pre>
          </details>
        )}
      </section>
    </div>
  );
}
