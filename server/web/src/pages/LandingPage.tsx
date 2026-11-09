import { useState } from "react";
import { Link } from "react-router-dom";
import { buildAgentPrompt } from "../agentPrompt";
import { useSession } from "../App";
import { useLang } from "../i18n";
import { SiteFooter, SiteHeader } from "../site";

const APK_URL = "https://github.com/skyvense/echoday/releases/latest/download/EchoDay.apk";

function EndpointRows({ rows }: { rows: { method: string; path: string; desc: string }[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.method + row.path} className="px-5 py-3.5">
          <p className="font-mono text-[13px] leading-relaxed">
            <span className={`mr-2 inline-block w-10 font-semibold ${row.method === "GET" ? "text-moss" : "text-red-deep"}`}>
              {row.method}
            </span>
            <span className="break-all">{row.path}</span>
          </p>
          <p className="mt-1 pl-12 text-sm leading-relaxed text-ink-soft">{row.desc}</p>
        </li>
      ))}
    </ul>
  );
}

export function LandingPage() {
  const { me, loading } = useSession();
  const { d, t } = useLang();
  const [copied, setCopied] = useState(false);

  const base = me?.public_url ?? (typeof window !== "undefined" ? window.location.origin : "");
  const prompt = buildAgentPrompt(base);

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const L = d.landing;

  return (
    <div className="min-h-screen">
      <SiteHeader signedIn={Boolean(me)} />
      <main>
        <section className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.3fr_0.7fr] lg:py-20">
          <div>
            <p className="text-sm font-medium tracking-wide text-red-deep">{L.eyebrow}</p>
            <h1 className="mt-3 max-w-xl font-bold text-5xl leading-[1.05] tracking-tight sm:text-6xl">{L.title}</h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft">{L.sub}</p>
            <div className="mt-8">
              {loading ? (
                <p className="text-ink-soft">{t("common.checkingSession")}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {me ? (
                    <Link to="/days" className="inline-block rounded-full bg-red px-5 py-3 font-medium text-white no-underline">
                      {L.openDays}
                    </Link>
                  ) : (
                    <Link to="/register" className="inline-block rounded-full bg-red px-5 py-3 font-medium text-white no-underline">
                      {t("nav.startTrial")}
                    </Link>
                  )}
                  <a
                    href={APK_URL}
                    className="inline-block rounded-full border border-line bg-card px-5 py-3 font-medium text-ink no-underline"
                  >
                    {L.downloadApk}
                  </a>
                </div>
              )}
              {!loading && !me && <p className="mt-3 text-sm text-ink-soft">{L.trialNote}</p>}
            </div>
          </div>
          <div className="space-y-5">
            <aside className="rounded-3xl border border-line bg-card p-6 shadow-[0_1px_3px_rgba(19,26,48,0.07)]">
              <p className="font-bold text-2xl tracking-tight">{L.staysTitle}</p>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-soft">
                {L.staysItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-5 text-sm text-ink-soft">{L.staysNever}</p>
            </aside>
            <div className="overflow-hidden rounded-3xl bg-[#131a30] shadow-[0_16px_40px_-16px_rgba(19,26,48,0.45)]">
              <div className="flex items-center gap-1.5 border-b border-white/10 px-5 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="ml-2 font-mono text-xs text-white/50">your Muse · morning run</span>
              </div>
              <div className="space-y-2.5 px-5 py-4 font-mono text-[13px] leading-relaxed text-[#dbe2f4]">
                <p>
                  <span className="text-[#8ea2ff]">GET</span> /api/v1/muse/days/2026-11-08
                </p>
                <p className="text-white/45">→ manifest · segments · markers · snapshots</p>
                <p className="text-white/45"># transcribe and write the day, on your keys</p>
                <p>
                  <span className="text-[#f36b53]">PUT</span> /api/v1/muse/days/2026-11-08/result
                </p>
                <p className="text-white/45">→ the summary is on your shelf</p>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-line bg-card">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="font-bold text-4xl tracking-tight">{L.howTitle}</h2>
            <p className="mt-3 max-w-2xl text-ink-soft">{L.howIntro}</p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {L.workflow.map((step, i) => (
                <article key={step.title}>
                  <p className="font-bold text-red">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 font-medium">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="muse" className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="font-bold text-4xl tracking-tight">{L.museTitle}</h2>
          <p className="mt-3 max-w-2xl text-ink-soft">{L.museIntro}</p>
          <p className="mt-3 max-w-2xl text-ink-soft">{L.museIntro2}</p>
          <div className="mt-6 overflow-hidden rounded-3xl bg-[#131a30] shadow-[0_16px_40px_-16px_rgba(19,26,48,0.45)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="ml-2 font-mono text-xs text-white/50">{L.promptCardTitle}</span>
              </span>
              <button
                type="button"
                onClick={copyPrompt}
                className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
              >
                {copied ? t("common.copied") : t("common.copy")}
              </button>
            </div>
            <pre className="max-h-[32rem] overflow-auto px-5 py-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-[#dbe2f4]">
              {prompt}
            </pre>
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            {L.promptReplacePre} <code className="rounded bg-paper-deep px-1">YOUR_MUSE_TOKEN</code> {L.promptReplacePost}{" "}
            <Link to="/connect" className="text-red-deep">
              {L.connectPageName}
            </Link>
            . {L.helperNotePre} <code className="rounded bg-paper-deep px-1">scripts/muse_cloud.py</code>.
          </p>
        </section>

        <section id="api" className="border-t border-line bg-card">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="font-bold text-4xl tracking-tight">{L.apiTitle}</h2>
            <p className="mt-3 max-w-2xl text-ink-soft">{L.apiIntro}</p>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="overflow-hidden rounded-3xl border border-line bg-paper">
                <h3 className="border-b border-line px-5 py-4 font-bold">{L.apiMuseHeading}</h3>
                <EndpointRows rows={L.apiRowsMuse} />
              </div>
              <div className="overflow-hidden rounded-3xl border border-line bg-paper">
                <h3 className="border-b border-line px-5 py-4 font-bold">{L.apiAccountHeading}</h3>
                <EndpointRows rows={L.apiRowsAccount} />
              </div>
            </div>
          </div>
        </section>

        <section id="storage" className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="font-bold text-4xl tracking-tight">{L.storageTitle}</h2>
          <p className="mt-3 max-w-2xl text-ink-soft">{L.storageIntro}</p>
          <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-card">
            <h3 className="border-b border-line px-5 py-4 font-bold">{L.retentionHeading}</h3>
            <ul className="divide-y divide-line">
              {L.retentionRows.map((row) => (
                <li key={row.label} className="grid gap-1 px-5 py-4 sm:grid-cols-[12rem_1fr] sm:gap-4">
                  <p className="font-medium">{row.label}</p>
                  <p className="text-sm leading-relaxed text-ink-soft">{row.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="pricing" className="border-t border-line bg-card">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
            <h2 className="font-bold text-4xl tracking-tight">{L.pricingTitle}</h2>
            <div className="mt-6 max-w-md rounded-3xl border border-line bg-paper p-6 shadow-[0_1px_3px_rgba(19,26,48,0.07)]">
              <p className="font-bold text-5xl tracking-tight">
                $5<span className="text-2xl text-ink-soft"> {L.pricingPer}</span>
              </p>
              <p className="mt-3 text-ink-soft">{L.pricingBody}</p>
              <ul className="mt-4 space-y-2 text-sm text-ink-soft">
                {L.pricingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {!me && (
                <div className="mt-6">
                  <Link to="/register" className="inline-block rounded-full bg-red px-5 py-3 font-medium text-white no-underline">
                    {t("nav.startTrial")}
                  </Link>
                  <p className="mt-3 text-sm text-ink-soft">{L.trialNote}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="font-bold text-4xl tracking-tight">{L.faqTitle}</h2>
          <div className="mt-6 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
            {L.faq.map((item) => (
              <details key={item.q} className="group px-5 py-4">
                <summary className="cursor-pointer font-medium">{item.q}</summary>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
