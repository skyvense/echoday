import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api, formatBytes, formatDay, type DaySummary } from "../api";
import { useLang } from "../i18n";

function SheetThumb({ date }: { date: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    api
      .sheetObjectUrl(date)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
        } else {
          objectUrl = u;
          setUrl(u);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [date]);
  if (!url) return <div className="w-14 shrink-0 self-stretch rounded-xl bg-paper" aria-hidden="true" />;
  return <img src={url} alt="" className="w-14 shrink-0 self-stretch rounded-xl object-cover" />;
}

export function DaysPage() {
  const { t } = useLang();
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
        if (!cancelled) setError(err instanceof ApiError ? err.message : t("days.loadError"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-bold text-4xl tracking-tight">{t("days.title")}</h1>
          <p className="mt-1 text-ink-soft">{t("days.subtitle")}</p>
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
            placeholder={t("days.searchPlaceholder")}
            aria-label={t("days.searchAria")}
            className="w-full rounded-full border border-line bg-card px-4 py-2 sm:w-80"
          />
          <button type="submit" className="shrink-0 rounded-full bg-ink px-4 py-2 text-paper">
            {t("days.searchButton")}
          </button>
        </form>
      </div>

      {error && <p className="mt-6 text-red-deep">{error}</p>}
      {!error && days === null && <p className="mt-8 text-ink-soft">{t("days.loading")}</p>}
      {days && days.length === 0 && (
        <div className="mt-8 rounded-3xl border border-dashed border-line bg-card px-6 py-10">
          <h2 className="font-bold text-2xl tracking-tight">{q ? t("days.noMatchTitle") : t("days.emptyTitle")}</h2>
          <p className="mt-2 max-w-xl text-ink-soft">{q ? t("days.noMatchBody") : t("days.emptyBody")}</p>
        </div>
      )}
      {days && days.length > 0 && (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
          {days.map((day) => (
            <li key={day.date}>
              <Link to={`/days/${day.date}`} className="flex items-stretch gap-4 px-5 py-4 no-underline hover:bg-paper">
                {day.has_sheet && <SheetThumb date={day.date} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-bold text-xl tracking-tight">{formatDay(day.date)}</p>
                    <p className="text-sm text-ink-soft">
                      {t("days.counts", { audio: day.audio_count, markers: day.marker_count, bytes: formatBytes(day.bytes) })}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{day.summary_excerpt || t("days.noSummary")}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
