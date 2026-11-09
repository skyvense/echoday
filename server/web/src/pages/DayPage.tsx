import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api, formatBytes, formatDay, formatWhen, MARKER_LABELS, type DayDetail } from "../api";
import { renderMarkdown } from "../markdown";

export function DayPage() {
  const { date = "" } = useParams();
  const [day, setDay] = useState<DayDetail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [transcript, setTranscript] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function load() {
    setError("");
    return api
      .day(date)
      .then((detail) => {
        setDay(detail);
        setMarkdown(detail.summary?.markdown ?? "");
        setTranscript(detail.summary?.transcript_markdown ?? "");
      })
      .catch((err: unknown) => {
        setDay(null);
        setError(err instanceof ApiError ? err.message : "Could not load this day.");
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await api.saveSummary(date, markdown, transcript);
      setEditing(false);
      await load();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save the summary.");
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div>
        <Link to="/days" className="text-sm text-ink-soft">
          ← Days
        </Link>
        <p className="mt-6 text-red-deep">{error}</p>
      </div>
    );
  }
  if (!day) return <p className="text-ink-soft">Loading {date}…</p>;

  return (
    <div>
      <Link to="/days" className="text-sm text-ink-soft no-underline hover:text-ink">
        ← Days
      </Link>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">{formatDay(day.date)}</h1>
      <p className="mt-1 text-ink-soft">
        {day.audio.length} audio file{day.audio.length === 1 ? "" : "s"} · {day.markers.length} markers
        {day.snapshots.length ? ` · ${day.snapshots.length} snapshots` : ""}
      </p>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
        <article className="rounded-3xl border border-line bg-card p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-2xl">Summary</h2>
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="rounded-full border border-line px-3 py-1.5 text-sm"
            >
              {editing ? "Close editor" : day.summary ? "Edit" : "Write one"}
            </button>
          </div>
          {day.summary && !editing && (
            <p className="mt-1 text-xs uppercase tracking-wide text-ink-soft">
              {day.summary.source}
              {day.summary.model ? ` · ${day.summary.model}` : ""} · {formatWhen(day.summary.updated_at)}
            </p>
          )}
          {editing ? (
            <form onSubmit={save} className="mt-4">
              <label className="text-sm font-medium" htmlFor="summary">
                Summary markdown
              </label>
              <textarea
                id="summary"
                required
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
                rows={12}
                className="mt-1.5 w-full rounded-2xl border border-line bg-paper px-3 py-2"
              />
              <label className="mt-4 block text-sm font-medium" htmlFor="transcript">
                Transcript markdown (optional)
              </label>
              <textarea
                id="transcript"
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                rows={6}
                className="mt-1.5 w-full rounded-2xl border border-line bg-paper px-3 py-2"
              />
              {saveError && <p className="mt-2 text-sm text-red-deep">{saveError}</p>}
              <button
                type="submit"
                disabled={saving}
                className="mt-4 rounded-full bg-red px-4 py-2 text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save summary"}
              </button>
            </form>
          ) : day.summary ? (
            <div
              className="prose-day mt-4"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(day.summary.markdown) }}
            />
          ) : (
            <p className="mt-4 text-ink-soft">
              No summary yet. Your Muse can PUT one, or you can write it here. This page does not call a model.
            </p>
          )}
          {day.summary?.transcript_markdown && !editing && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-medium">Transcript</summary>
              <div
                className="prose-day mt-3 text-sm"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(day.summary.transcript_markdown) }}
              />
            </details>
          )}
        </article>

        <aside className="rounded-3xl border border-line bg-card p-5">
          <h2 className="font-serif text-2xl">Markers</h2>
          {day.markers.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">No event markers for this day.</p>
          ) : (
            <ol className="mt-4 space-y-4 border-l border-red/40 pl-4">
              {day.markers.map((marker) => (
                <li key={marker.line_no} className="relative">
                  <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-red" />
                  <p className="text-sm font-medium">
                    {MARKER_LABELS[marker.type || ""] || marker.type || "Marker"}
                  </p>
                  <p className="text-xs text-ink-soft">{marker.ts || `line ${marker.line_no}`}</p>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-card p-5 sm:p-7">
        <h2 className="font-serif text-2xl">Audio</h2>
        {day.audio.length === 0 ? (
          <p className="mt-3 text-ink-soft">No segments uploaded for this day.</p>
        ) : (
          <ul className="mt-4 space-y-5">
            {day.audio.map((file) => (
              <li key={file.filename}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {file.kind === "note" ? "Voice note" : "Segment"}{" "}
                    <span className="font-normal text-ink-soft">{file.filename}</span>
                  </p>
                  <p className="text-sm text-ink-soft">
                    {formatBytes(file.bytes)} · {formatWhen(file.uploaded_at)}
                  </p>
                </div>
                <audio className="mt-2 w-full" controls preload="none" src={file.url} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {day.snapshots.length > 0 && (
        <section className="mt-6 rounded-3xl border border-line bg-card p-5 sm:p-7">
          <h2 className="font-serif text-2xl">Snapshots</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {day.snapshots.map((shot) => (
              <li key={shot.filename}>
                <img src={shot.url} alt={shot.filename} className="w-full rounded-2xl bg-paper" />
                <p className="mt-2 text-sm text-ink-soft">
                  {shot.filename} · {formatBytes(shot.bytes)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
