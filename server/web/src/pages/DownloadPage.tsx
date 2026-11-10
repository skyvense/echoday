import { useSession } from "../App";
import { useLang } from "../i18n";
import { SiteFooter, SiteHeader } from "../site";

const APK_URL = "/download/apk";
const REPO_URL = "https://github.com/skyvense/echoday";
const RELEASES_URL = "https://github.com/skyvense/echoday/releases";

export function DownloadPage() {
  const { me } = useSession();
  const { d } = useLang();
  const D = d.download;

  return (
    <div className="min-h-screen">
      <SiteHeader signedIn={Boolean(me)} />
      <main>
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
          <p className="text-sm font-medium tracking-wide text-red-deep">{D.eyebrow}</p>
          <h1 className="mt-3 max-w-xl font-bold text-5xl leading-[1.05] tracking-tight sm:text-6xl">{D.title}</h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft">{D.intro}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={APK_URL}
              className="inline-block rounded-full bg-red px-5 py-3 font-medium text-white no-underline"
            >
              {D.downloadLatest}
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-full border border-line bg-card px-5 py-3 font-medium text-ink no-underline"
            >
              {D.githubRepo}
            </a>
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            {D.versionLatest}{" "}
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="underline">
              {D.allVersions}
            </a>
          </p>
        </section>

        <section className="border-t border-line bg-card">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="font-bold text-4xl tracking-tight">{D.stepsTitle}</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {D.steps.map((step, i) => (
                <article key={step.title}>
                  <p className="font-bold text-red">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 font-medium">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
