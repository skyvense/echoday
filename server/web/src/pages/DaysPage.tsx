import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api, formatBytes, formatDay, type DaySummary } from "../api";

export function DaysPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [draft, setDraft] = useState(q);
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(q);
    let cancelled = false;
    setError("");
    api
      .days(q)
      .then((result) => {
        if (!cancelled) setDays(result.days);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load days.");
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">Days</h1>
          <p className="mt-1 text-ink-soft">One row per calendar day the phone uploaded.</p>
        </div>
        <form
          className="flex w-full gap-2 sm:w-auto"
          onSubmit={(event) => {
            event.preventDefault();
            const next = new URLSearchParams();
            if (draft.trim()) next.set("q", draft.trim());
            setParams(next);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search summaries, markers, filenames"
            aria-label="Search days"
            className="w-full rounded-full border border-line bg-card px-4 py-2 sm:w-80"
          />
          <button type="submit" className="rounded-full bg-ink px-4 py-2 text-paper">
            Search
          </button>
        </form>
      </div>

      {error && <p className="mt-6 text-red-deep">{error}</p>}
      {!error && days === null && <p className="mt-8 text-ink-soft">Loading days…</p>}
      {days && days.length === 0 && (
        <div className="mt-8 rounded-3xl border border-dashed border-line bg-card px-6 py-10">
          <h2 className="font-serif text-2xl">{q ? "Nothing matched that search." : "The shelf is empty."}</h2>
          <p className="mt-2 max-w-xl text-ink-soft">
            {q
              ? "Try a date, a marker type like meeting_start, or a word from a summary."
              : "Sign the Android app into this account and let one segment finish. It will show up here with its markers. Summaries appear after your Muse posts them."}
          </p>
        </div>
      )}
      {days && days.length > 0 && (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
          {days.map((day) => (
            <li key={day.date}>
              <Link to={`/days/${day.date}`} className="block px-5 py-4 no-underline hover:bg-paper">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-serif text-xl">{formatDay(day.date)}</p>
                  <p className="text-sm text-ink-soft">
                    {day.audio_count} audio · {day.marker_count} markers · {formatBytes(day.bytes)}
                  </p>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  {day.summary_excerpt || "No summary yet. Connect Muse, or write one from the day page."}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
