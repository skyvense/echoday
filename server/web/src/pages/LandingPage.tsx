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


const WAVE_HEIGHTS = [10, 18, 26, 14, 30, 22, 34, 16, 28, 20, 36, 24, 12, 30, 18, 26, 14, 32, 20, 24, 12, 28, 16, 22];

function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`w-[272px] shrink-0 overflow-hidden rounded-[2.8rem] border border-white/20 bg-[#f4f6fb] text-ink shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)] ${className}`}>
      <div className="flex items-center justify-between px-6 pt-4 text-[10px] font-medium text-ink-soft">
        <span>20:54</span>
        <span className="h-4 w-16 rounded-full bg-ink/85" />
        <span>5G · 86%</span>
      </div>
      {children}
    </div>
  );
}

function TabBar({ tabs, active }: { tabs: string[]; active: number }) {
  return (
    <div className="mt-4 flex items-center justify-around border-t border-line bg-card px-2 py-2.5">
      {tabs.map((tab, i) => (
        <span key={tab} className={`rounded-full px-3 py-1 text-[11px] ${i === active ? "bg-[#1c63f2]/10 font-semibold text-[#1c63f2]" : "text-ink-soft"}`}>
          {tab}
        </span>
      ))}
    </div>
  );
}

function PhoneShowcase({ L }: { L: any }) {
  const P = L.appPhones;
  const tiles = [
    "from-[#f7b267] to-[#f36b53]", "from-[#7fb2e5] to-[#33327e]", "from-[#9bc53d] to-[#3e8914]",
    "from-[#f4845f] to-[#a83232]", "from-[#8ea2ff] to-[#5a4fcf]", "from-[#ffd166] to-[#f4845f]",
    "from-[#6ec3df] to-[#2a6f97]", "from-[#c3aed6] to-[#7d5ba6]", "from-[#95d5b2] to-[#2d6a4f]",
  ];
  return (
    <div className="relative mt-14 flex flex-col items-center justify-center gap-10 lg:flex-row lg:items-end">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-[36rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f36b53]/15 blur-3xl" />
      <PhoneFrame className="relative lg:-rotate-6 lg:translate-y-3">
        <div className="px-5 pt-3">
          <p className="text-[11px] text-ink-soft">EchoDay</p>
          <p className="text-xl font-bold tracking-tight">{P.tabs[0]}</p>
          <p className="mt-0.5 text-[11px] text-ink-soft">{P.recording} · {P.todayCount}</p>
          <div className="mt-4 rounded-3xl bg-card p-5 shadow-[0_1px_3px_rgba(19,26,48,0.08)]">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#e23b2e]">
              <span className="h-8 w-8 rounded-[8px] bg-white" />
            </div>
            <p className="mt-4 text-center text-[26px] font-semibold tracking-tight">04:37:12</p>
            <div className="mt-3 flex h-9 items-end justify-center gap-[3px]">
              {WAVE_HEIGHTS.map((hgt, i) => (
                <span key={i} className="w-[3px] rounded-full bg-[#1c63f2]" style={{ height: hgt }} />
              ))}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-card p-3 shadow-[0_1px_3px_rgba(19,26,48,0.08)]">
              <p className="text-[13px] font-semibold"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#1c63f2]" />{P.conversation}</p>
              <p className="mt-1 text-[10px] text-ink-soft">{P.everyday}</p>
            </div>
            <div className="rounded-2xl bg-card p-3 shadow-[0_1px_3px_rgba(19,26,48,0.08)]">
              <p className="text-[13px] font-semibold"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#7d4fc9]" />{P.meeting}</p>
              <p className="mt-1 text-[10px] text-ink-soft">{P.multiPerson}</p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl bg-[#1c63f2] py-3 text-center text-[13px] font-semibold text-white">{P.selfNote}</div>
        </div>
        <TabBar tabs={P.tabs} active={0} />
      </PhoneFrame>

      <PhoneFrame className="relative lg:-translate-y-4">
        <div className="px-5 pt-3">
          <p className="text-[11px] text-ink-soft">EchoDay</p>
          <p className="text-xl font-bold tracking-tight">{P.reports}</p>
          <p className="mt-0.5 text-[11px] text-ink-soft">{P.reportsSub}</p>
          <div className="mt-4 rounded-3xl bg-card p-4 shadow-[0_1px_3px_rgba(19,26,48,0.08)]">
            <div className="flex items-baseline justify-between">
              <p className="text-[14px] font-bold">2026-11-08</p>
              <p className="text-[10px] text-ink-soft">289 · 106</p>
            </div>
            <div className="mt-2.5 rounded-xl bg-[#f36b53] py-2 text-center text-[11px] font-semibold text-white">{P.viewSheet}</div>
            <ul className="mt-3 space-y-2.5">
              {P.summaryLines.map((line: string) => (
                <li key={line} className="flex gap-2 text-[11px] leading-relaxed text-ink-soft">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#f36b53]" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          {["2026-11-07", "2026-11-06"].map((day) => (
            <div key={day} className="mt-3 flex items-baseline justify-between rounded-3xl bg-card px-4 py-3.5 shadow-[0_1px_3px_rgba(19,26,48,0.08)]">
              <p className="text-[14px] font-bold">{day}</p>
              <p className="text-[10px] text-ink-soft">287 · 98</p>
            </div>
          ))}
        </div>
        <TabBar tabs={P.tabs} active={2} />
      </PhoneFrame>

      <PhoneFrame className="relative lg:rotate-6 lg:translate-y-3">
        <div className="px-5 pt-3">
          <p className="text-[11px] text-ink-soft">EchoDay</p>
          <p className="text-xl font-bold tracking-tight">{P.cloud}</p>
          <div className="mt-3 rounded-3xl bg-card p-4 shadow-[0_1px_3px_rgba(19,26,48,0.08)]">
            <div className="flex items-baseline justify-between text-[11px] text-ink-soft">
              <span>3.2 GB {P.used}</span>
              <span>20 GB</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full w-[16%] rounded-full bg-[#1c63f2]" />
            </div>
          </div>
          <p className="mb-2 mt-4 text-[12px] font-semibold">{P.photos}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {tiles.map((g, i) => (
              <div key={i} className={`flex h-16 items-end rounded-xl bg-gradient-to-br p-1.5 ${g}`}>
                <span className="text-[8px] font-medium text-white/85">{["08:12", "09:47", "11:20", "12:35", "14:02", "15:48", "17:15", "18:40", "20:05"][i]}</span>
              </div>
            ))}
          </div>
          <p className="mb-2 mt-4 text-[12px] font-semibold">{P.audio}</p>
          {["rec_2026-11-08_17-52-03.m4a", "note_2026-11-08_19-18-50.m4a"].map((name) => (
            <div key={name} className="mb-2 flex items-center gap-2.5 rounded-2xl bg-card px-3 py-2.5 shadow-[0_1px_3px_rgba(19,26,48,0.08)]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1c63f2] text-[9px] text-white">▶</span>
              <span className="truncate text-[10px] text-ink-soft">{name}</span>
            </div>
          ))}
        </div>
        <TabBar tabs={P.tabs} active={1} />
      </PhoneFrame>
    </div>
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

        <section id="why" className="border-t border-line">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="font-bold text-4xl tracking-tight">{L.whyTitle}</h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">{L.whyIntro}</p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {L.whyCards.map((card) => (
                <article key={card.title} className="rounded-3xl border border-line bg-card p-6 shadow-[0_1px_3px_rgba(19,26,48,0.07)]">
                  <h3 className="font-bold text-xl tracking-tight">{card.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="app" className="bg-[#0c1230]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <h2 className="text-center font-bold text-4xl tracking-tight text-white">{L.appTitle}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-center leading-relaxed text-white/60">{L.appIntro}</p>
            <PhoneShowcase L={L} />
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
