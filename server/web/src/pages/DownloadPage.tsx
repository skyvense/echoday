import { useSession } from "../App";
import { SiteHeader } from "../site";

const APK_URL = "https://github.com/skyvense/echoday/releases/latest/download/EchoDay.apk";
const REPO_URL = "https://github.com/skyvense/echoday";
const RELEASES_URL = "https://github.com/skyvense/echoday/releases";

const installSteps = [
  { n: "01", title: "Download the APK", body: "Tap the download button on your Android phone and save EchoDay.apk." },
  { n: "02", title: "Allow unknown sources", body: "When Android asks, allow your browser to install apps from unknown sources for this install." },
  { n: "03", title: "Open the app and sign in", body: "Launch EchoDay, register or sign in, and recording uploads to your shelf from there." },
];

export function DownloadPage() {
  const { me } = useSession();

  return (
    <div className="min-h-screen">
      <SiteHeader signedIn={Boolean(me)} />
      <main>
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
          <p className="text-sm font-medium tracking-wide text-red-deep">Android app</p>
          <h1 className="mt-3 max-w-xl font-bold text-5xl leading-[1.05] tracking-tight sm:text-6xl">
            Download EchoDay
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft">
            The EchoDay Android app records your day and uploads it to your shelf, where your own Muse can pull it
            and write the summary.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={APK_URL}
              className="inline-block rounded-full bg-red px-5 py-3 font-medium text-white no-underline"
            >
              Download APK (latest)
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-full border border-line bg-card px-5 py-3 font-medium text-ink no-underline"
            >
              GitHub repository
            </a>
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            Version: latest. Looking for an older build?{" "}
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="underline">
              All versions / Releases
            </a>
          </p>
        </section>

        <section className="border-t border-line bg-card">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="font-bold text-4xl tracking-tight">Install in three steps</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {installSteps.map((step) => (
                <article key={step.n}>
                  <p className="font-bold text-red">{step.n}</p>
                  <h3 className="mt-2 font-medium">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
