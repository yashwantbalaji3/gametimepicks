import Link from "next/link";
import IplSectionTabs from "@/components/ipl/ipl-section-tabs";

export const metadata = {
  title: "IPL Power Board · GameTime Picks",
  description:
    "High-variance IPL watch — sixes, fours, boundary strike rates. Pending stats provider wiring.",
};

export default function IplPowerBoardPage() {
  const inputsPlanned = [
    "boundary strike rate (last-N innings)",
    "match-up vs spinner / pacer split",
    "venue / pitch conditions",
    "powerplay opportunity (top-3 vs middle order)",
    "weather + dew factor",
    "death-overs role (finisher / opener)",
    "recent form against the opposition",
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <IplSectionTabs />
      </div>

      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-warn)", fontSize: 11 }}
        >
          IPL · Power Board · sixes + boundary watch
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          High-variance IPL, kept separate on purpose.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          A single over of sixes can swing a result; a finisher walking
          in for a 12-ball cameo is wildly noisier than batter runs
          over a full innings. The Power Board will rate these signals
          on a power-profile scale rather than the High / Medium / Low
          confidence tiers used on the main{" "}
          <Link
            href="/ipl/board"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            projection board
          </Link>
          .
        </p>
      </section>

      <section className="mt-8 gtp-aurora-halo">
        <div className="gtp-status-board p-5 sm:p-6" style={{ borderRadius: 8 }}>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background: "var(--vault-warn)",
                boxShadow: "0 0 10px rgba(212, 175, 55, 0.5)",
              }}
            />
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-warn)", fontSize: 10 }}
            >
              warming up · pending
            </span>
          </div>
          <h2
            className="mt-3 font-display font-semibold tracking-tight"
            style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1.15 }}
          >
            IPL Power Board — not active yet
          </h2>
          <p
            className="mt-2 text-[13px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            No sixes picks until the variance model ingests these
            signals. Ratings will read as power profile and watch tier,
            never as model lean.
          </p>

          <div className="mt-5">
            <div
              className="font-mono uppercase tracking-[0.14em] mb-2"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              Power Board inputs · planned
            </div>
            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
              {inputsPlanned.map((it) => (
                <li
                  key={it}
                  className="gtp-source-chip"
                  style={{ color: "var(--vault-text-mute)" }}
                >
                  {it}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        className="mt-8 text-[12px]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        <Link href="/ipl" style={{ color: "var(--vault-gold-bright)" }}>
          ← back to IPL overview
        </Link>
      </section>
    </div>
  );
}
