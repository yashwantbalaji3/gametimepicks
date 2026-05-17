import Link from "next/link";
import NhlSectionTabs from "@/components/nhl/nhl-section-tabs";

export const metadata = {
  title: "NHL Power Board · GameTime Picks",
  description:
    "High-variance NHL watch — goals, shot bursts, goalie pressure. Pending until paid odds + per-player logs are wired.",
};

export default function NhlPowerBoardPage() {
  const inputsPlanned = [
    "shot bursts (last-3 vs season sog)",
    "expected goals delta",
    "goalie save percentage trend",
    "matchup pace + line opponent",
    "powerplay time on ice",
    "rest days / back-to-back flag",
    "elimination context",
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <NhlSectionTabs />
      </div>

      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-warn)", fontSize: 11 }}
        >
          NHL · Power Board · goals + shot-volume watch
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          High-variance NHL, kept separate on purpose.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          A single goal can swing the result; goalie save percentage on
          a 25-shot night is wildly noisier than shots on goal itself.
          The Power Board will rate these signals on a power-profile
          scale rather than the High / Medium / Low confidence tiers
          used on the main{" "}
          <Link
            href="/nhl/board"
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
            NHL Power Board — not active yet
          </h2>
          <p
            className="mt-2 text-[13px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            No goals picks until the variance model ingests these
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
        <Link href="/nhl" style={{ color: "var(--vault-gold-bright)" }}>
          ← back to NHL overview
        </Link>
      </section>
    </div>
  );
}
