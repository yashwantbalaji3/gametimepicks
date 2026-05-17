import Link from "next/link";
import { activeMlbDate, getMlbPowerForDate } from "@/lib/data-mlb";
import { formatTipoffEt } from "@/lib/format-mlb";
import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";

export const metadata = {
  title: "MLB Power Board · GameTime Picks",
  description:
    "Home-run analytics for MLB. Separate from the main projection board because HR markets have a different variance profile.",
};

const DEFAULT_DATE = "2026-05-16";

export default function MlbPowerBoardPage() {
  const date = activeMlbDate() ?? DEFAULT_DATE;
  const power = getMlbPowerForDate(date);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>

      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-warn)", fontSize: 11 }}
        >
          MLB · Power Board · HR Watch
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          Home-run analytics, kept separate on purpose.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Home-run markets are high-variance — far more so than pitcher
          strikeouts or batter hits. We rate them on a power-profile scale
          (barrel + park + matchup) rather than the standard High / Medium /
          Low confidence tiers, so a HR pick can never read as a confident
          model lean. The main MLB{" "}
          <Link href="/mlb/board" style={{ color: "var(--vault-gold-bright)" }}>
            projection board
          </Link>{" "}
          stays clean of HR markets for the same reason.
        </p>
      </section>

      {/* Pending state — explained honestly */}
      <section className="mt-8 gtp-aurora-halo">
        <div
          className="gtp-status-board p-5 sm:p-6"
          style={{ borderRadius: 8 }}
        >
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
              warming up · {power.state}
            </span>
          </div>
          <h2
            className="mt-3 font-display font-semibold tracking-tight"
            style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1.15 }}
          >
            Power Board · {date}
          </h2>
          <p
            className="mt-2 text-[13px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {power.reason}
          </p>

          <div className="mt-5">
            <div
              className="font-mono uppercase tracking-[0.14em] mb-2"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              Power Board inputs · planned
            </div>
            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
              {power.inputsPlanned.map((it) => (
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

          <div className="mt-6">
            <div
              className="font-mono uppercase tracking-[0.14em] mb-2"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              Today's slate · {power.games.length} games
            </div>
            {power.games.length === 0 ? (
              <div
                className="rounded-[6px] px-4 py-4 text-[12px]"
                style={{
                  background: "rgba(7, 11, 26, 0.5)",
                  border: "1px solid var(--vault-border)",
                  color: "var(--vault-text-mute)",
                }}
              >
                Schedule warming up. When the slate posts, every game will be
                analyzed for HR watch context.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {power.games.map((g) => {
                  const anchor = `game-${g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`}`;
                  return (
                    <Link
                      key={g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`}
                      href={`/mlb/board#${anchor}`}
                      className="vault-glow-hover flex items-center justify-between gap-3 rounded-[3px] focus:outline-none focus-visible:outline focus-visible:outline-2"
                      style={{
                        paddingTop: 10,
                        paddingBottom: 10,
                        paddingLeft: 14,
                        paddingRight: 14,
                        border: "1px solid var(--vault-border)",
                        background: "rgba(7, 11, 26, 0.45)",
                        minWidth: 0,
                        overflow: "hidden",
                        color: "inherit",
                        textDecoration: "none",
                      }}
                      aria-label={`View props for ${g.awayTeamAbbr ?? "?"} at ${g.homeTeamAbbr ?? "?"}`}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span
                          style={{
                            color: "var(--vault-text)",
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {g.awayTeamAbbr ?? "?"} @ {g.homeTeamAbbr ?? "?"}
                        </span>
                        <span
                          style={{
                            color: "var(--vault-text-faint)",
                            fontSize: 11,
                          }}
                        >
                          {g.venue ?? "MLB"}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span
                          className="font-mono"
                          style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
                        >
                          {formatTipoffEt(g.gameDate)}
                        </span>
                        <span
                          className="font-mono uppercase tracking-[0.14em]"
                          style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
                        >
                          View props →
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Educational framing */}
      <section className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
          style={{
            background: "rgba(7, 11, 26, 0.45)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.14em] mb-2"
            style={{ color: "var(--vault-warn)", fontSize: 10 }}
          >
            Why HR markets are separate
          </div>
          A single home run swings the result; that variance dwarfs the signal
          of a typical projection model. We refuse to use confident-sounding
          language on HR picks. When the Power Board goes live, ratings will
          read as power profile and watch tier — never as model lean.
        </div>
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
          style={{
            background: "rgba(7, 11, 26, 0.45)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.14em] mb-2"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            Where to look in the meantime
          </div>
          The main{" "}
          <Link href="/mlb/board" style={{ color: "var(--vault-gold-bright)" }}>
            MLB board
          </Link>{" "}
          covers pitcher strikeouts and batter hits / total bases with full
          projection transparency. Same{" "}
          <Link href="/responsible-use" style={{ color: "var(--vault-gold-bright)" }}>
            Responsible Use
          </Link>{" "}
          framing as NBA.
        </div>
      </section>
    </div>
  );
}
