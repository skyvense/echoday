import { Link } from "react-router-dom";
import { useSession } from "../App";
import { SiteHeader } from "../site";

const steps = [
  { n: "01", title: "Create an account", body: "Email and a password. Seven days of uploads are included with the account." },
  { n: "02", title: "Record on the phone", body: "The app signs in and uploads each finished hour, plus the day’s markers." },
  { n: "03", title: "Hand the day to your Muse", body: "A token lets your own agent pull audio and markers. It uses your keys, not ours." },
  { n: "04", title: "Read it back here", body: "Days, markers, and the summary your Muse posts. Search stays on this server." },
];

export function LandingPage() {
  const { me, loading } = useSession();

  return (
    <div className="min-h-screen">
      <SiteHeader signedIn={Boolean(me)} />
      <main>
        <section className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.3fr_0.7fr] lg:py-20">
          <div>
            <p className="text-sm font-medium tracking-wide text-red-deep">All-day recorder shelf</p>
            <h1 className="mt-3 max-w-xl font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl">
              The shelf for an all-day recorder.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft">
              Audio and markers land here. Thinking stays with your Muse. This server never spends a transcription token.
            </p>
            <div className="mt-8">
              {loading ? (
                <p className="text-ink-soft">Checking the session…</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {me ? (
                    <Link to="/days" className="inline-block rounded-full bg-red px-5 py-3 font-medium text-white no-underline">
                      Open your days
                    </Link>
                  ) : (
                    <Link to="/register" className="inline-block rounded-full bg-red px-5 py-3 font-medium text-white no-underline">
                      Start 7-day trial
                    </Link>
                  )}
                  <a
                    href="https://github.com/skyvense/echoday/releases/latest/download/EchoDay.apk"
                    className="inline-block rounded-full border border-line bg-card px-5 py-3 font-medium text-ink no-underline"
                  >
                    Download Android APK
                  </a>
                </div>
              )}
              {!loading && !me && (
                <p className="mt-3 text-sm text-ink-soft">$5/mo after. Cancel anytime. Transcription stays on your keys.</p>
              )}
            </div>
          </div>
          <aside className="rounded-3xl border border-line bg-card p-6">
            <p className="font-serif text-2xl">What stays here</p>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-soft">
              <li>Hour-long .m4a segments and voice notes</li>
              <li>Event markers: conversations, meetings, self-notes</li>
              <li>The daily summary your agent writes back</li>
            </ul>
            <p className="mt-5 text-sm text-ink-soft">What never runs here: Whisper, chat models, or any key you did not bring yourself.</p>
          </aside>
        </section>

        <section id="how" className="border-t border-line bg-card">
          <div className="mx-auto grid max-w-5xl gap-6 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {steps.map((step) => (
              <article key={step.n}>
                <p className="font-serif text-red">{step.n}</p>
                <h2 className="mt-2 font-medium">{step.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="font-serif text-4xl tracking-tight">Pricing</h2>
          <div className="mt-6 max-w-md rounded-3xl border border-line bg-card p-6">
            <p className="font-serif text-5xl tracking-tight">$5<span className="text-2xl text-ink-soft"> / month</span></p>
            <p className="mt-3 text-ink-soft">One person. Uploads, the day archive, and a Muse pull token.</p>
            <ul className="mt-4 space-y-2 text-sm text-ink-soft">
              <li>7 days of uploads from registration</li>
              <li>After that, existing days stay readable</li>
              <li>Transcription is not included. Your Muse uses your keys</li>
            </ul>
            {!me && (
              <div className="mt-6">
                <Link to="/register" className="inline-block rounded-full bg-red px-5 py-3 font-medium text-white no-underline">
                  Start 7-day trial
                </Link>
                <p className="mt-3 text-sm text-ink-soft">$5/mo after. Cancel anytime. Transcription stays on your keys.</p>
              </div>
            )}
          </div>
        </section>

        <section id="muse" className="border-t border-line">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="font-serif text-4xl tracking-tight">Connect Muse</h2>
            <p className="mt-3 max-w-2xl text-ink-soft">
              Bring your own key. Create a <span className="font-mono text-sm">muse_</span> token on the Connect page.
              Your agent downloads a day, transcribes it wherever you already pay for models, and posts the summary back.
              The token cannot upload audio or open billing.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
