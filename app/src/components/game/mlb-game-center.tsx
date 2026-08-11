/**
 * MlbGameCenter — the market-implied Game Center for an MLB simulation dashboard.
 *
 * Renders win probability, the game total + over/under lean, and the run-line lean —
 * all a DIRECT read of de-vigged DraftKings prices (from lib/mlb-team-markets). It is
 * labelled "market-implied" and kept visually DISTINCT from the GameTime player-prop
 * MODEL modules, so the two methods are never blurred. Run-scored distributions are
 * NOT shown (they need alternate-line ladders) — an honest note says so.
 *
 * Presentational; receives a resolved `MlbGameCenter` (never fabricates).
 */
import type { MlbGameCenter } from "@/lib/mlb-team-markets";

const CARD: React.CSSProperties = {
  background: "var(--gtp-card)",
  border: "1px solid var(--vault-rule)",
};

function pct(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

/** A two-sided probability bar (home vs away / over vs under). */
function ProbBar({
  leftLabel,
  leftProb,
  rightLabel,
  rightProb,
}: {
  leftLabel: string;
  leftProb: number;
  rightLabel: string;
  rightProb: number;
}) {
  const leftPctNum = Math.round(leftProb * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-[12px]">
        <span style={{ color: "var(--vault-text)" }}>
          {leftLabel} <span style={{ color: "var(--vault-gold-bright)" }}>{pct(leftProb)}</span>
        </span>
        <span style={{ color: "var(--vault-text-mute)" }}>
          {pct(rightProb)} {rightLabel}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden flex" style={{ background: "var(--gtp-card-sunken)" }}>
        <span style={{ width: `${leftPctNum}%`, background: "var(--vault-gold-bright)" }} />
        <span style={{ width: `${100 - leftPctNum}%`, background: "var(--vault-rule)" }} />
      </div>
    </div>
  );
}

export default function MlbGameCenter({ gameCenter }: { gameCenter: MlbGameCenter }) {
  const { moneyline, total, runLine, homeTeam, awayTeam } = gameCenter;
  const favTeam = runLine ? (runLine.favorite === "home" ? homeTeam : awayTeam) : null;

  return (
    <section aria-label="Game Center" className="mb-5 rounded-[12px] px-4 sm:px-5 py-4 flex flex-col gap-4" style={CARD}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3
          className="font-mono uppercase tracking-[0.16em] m-0 font-normal"
          style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
        >
          Game Center
        </h3>
        <span
          className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
          style={{ color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", fontSize: 9 }}
        >
          Market-implied · {gameCenter.source}
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
        Read straight from the sportsbook&rsquo;s de-vigged prices for this game — the
        market&rsquo;s own view (<strong style={{ color: "var(--vault-text-mute)" }}>market-implied, not a simulation</strong>). This is separate
        from the GameTime player-prop model below, and it is not betting advice.
      </p>
      <p className="text-[10.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
        A full-game score simulation — projected final score plus run and margin distributions — is{" "}
        <strong style={{ color: "var(--vault-text-mute)" }}>not shown for this game</strong>: it needs a dedicated full-game artifact, and nothing renders here until that artifact is real.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Win probability */}
        <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-2" style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}>
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            Win probability
          </span>
          {moneyline ? (
            <ProbBar
              leftLabel={homeTeam}
              leftProb={moneyline.homeWinProb}
              rightLabel={awayTeam}
              rightProb={moneyline.awayWinProb}
            />
          ) : (
            <span className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
              Moneyline not offered.
            </span>
          )}
        </div>

        {/* Game total */}
        <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-2" style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}>
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            Game total
          </span>
          {total ? (
            <>
              <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1 }}>
                {total.line}
              </span>
              <span className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
                {total.lean === "balanced"
                  ? `Balanced (O ${pct(total.overProb)})`
                  : `${total.lean === "over" ? "Over" : "Under"} lean · ${pct(total.lean === "over" ? total.overProb : total.underProb)}`}
              </span>
            </>
          ) : (
            <span className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
              Total not offered.
            </span>
          )}
        </div>

        {/* Run line */}
        <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-2" style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}>
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            Run line
          </span>
          {runLine && favTeam ? (
            <>
              <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 15, lineHeight: 1.1 }}>
                {favTeam} {runLine.line > 0 ? `+${runLine.line}` : runLine.line}
              </span>
              <span className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
                covers {pct(runLine.favoriteCoverProb)}
              </span>
            </>
          ) : (
            <span className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
              Run line not offered.
            </span>
          )}
        </div>
      </div>

      {/* Honest unavailable note — no fabricated distributions */}
      {gameCenter.unavailable.length > 0 && (
        <p className="text-[10.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
          {gameCenter.unavailable.map((u) => u.displayCopy).join(" ")}
        </p>
      )}
    </section>
  );
}
