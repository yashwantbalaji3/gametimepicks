import type { MlbBoardLean, MlbScheduleGame } from "@/lib/types-mlb";
import { formatTipoffEt } from "@/lib/format-mlb";
import MlbLeanRow from "./mlb-lean-row";

/**
 * One game's worth of MLB props grouped under a sportsbook-style header.
 * The header always renders (schedule + probable pitchers); the body
 * renders prop rows or an honest "lines pending" state.
 */
interface Props {
  game: MlbScheduleGame;
  leans: MlbBoardLean[];
}

function tierOrder(c: MlbBoardLean["confidence"]): number {
  switch (c) {
    case "High":
      return 0;
    case "Medium":
      return 1;
    case "Low":
      return 2;
    case "insufficient_data":
      return 3;
    default:
      return 4;
  }
}

export default function MlbGameSection({ game, leans }: Props) {
  // Sort: confidence tier first, then absolute edge magnitude desc.
  const sorted = [...leans].sort((a, b) => {
    const ta = tierOrder(a.confidence);
    const tb = tierOrder(b.confidence);
    if (ta !== tb) return ta - tb;
    return Math.abs(b.edgePct ?? -1) - Math.abs(a.edgePct ?? -1);
  });
  const pitcherLeans = sorted.filter((l) => l.playerRole === "pitcher");
  const batterLeans = sorted.filter((l) => l.playerRole === "batter");

  const tipoff = formatTipoffEt(game.gameDate);

  return (
    <section
      className="gtp-aurora-halo"
      aria-label={`${game.awayTeamAbbr ?? "?"} at ${game.homeTeamAbbr ?? "?"}`}
    >
      <div
        className="gtp-status-board p-5 sm:p-6"
        style={{ borderRadius: 8 }}
      >
        {/* Header: matchup + tipoff + probable pitchers */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: "var(--vault-gold-bright)",
                  boxShadow: "0 0 10px rgba(240, 199, 94, 0.65)",
                }}
              />
              <span
                className="font-mono uppercase tracking-[0.16em]"
                style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
              >
                {game.venue ?? "MLB"}
              </span>
            </div>
            <h3
              className="font-display font-semibold tracking-tight"
              style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1.15 }}
            >
              {game.awayTeamAbbr ?? "?"} @ {game.homeTeamAbbr ?? "?"}
            </h3>
            <p
              className="text-[12px]"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {game.awayTeamName} at {game.homeTeamName}
            </p>
          </div>
          <div className="text-right">
            <div
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              tipoff
            </div>
            <div
              className="font-mono"
              style={{ color: "var(--vault-gold-bright)", fontSize: 13 }}
            >
              {tipoff}
            </div>
          </div>
        </div>

        {/* Probable pitchers row */}
        <div
          className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <div className="flex items-center justify-between gap-3 rounded-[3px]" style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 14, border: "1px solid var(--vault-border)", background: "rgba(7, 11, 26, 0.45)", minWidth: 0, overflow: "hidden" }}>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span style={{ color: "var(--vault-text-faint)", fontSize: 10, letterSpacing: "0.14em" }} className="uppercase">
                probable · away
              </span>
              <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>
                {game.awayProbablePitcherName ?? "TBD"}
              </span>
            </div>
            <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
              {game.awayTeamAbbr ?? ""}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[3px]" style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 14, border: "1px solid var(--vault-border)", background: "rgba(7, 11, 26, 0.45)", minWidth: 0, overflow: "hidden" }}>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span style={{ color: "var(--vault-text-faint)", fontSize: 10, letterSpacing: "0.14em" }} className="uppercase">
                probable · home
              </span>
              <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>
                {game.homeProbablePitcherName ?? "TBD"}
              </span>
            </div>
            <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
              {game.homeTeamAbbr ?? ""}
            </span>
          </div>
        </div>

        {/* Body: leans or honest pending state */}
        {sorted.length === 0 ? (
          <div
            className="mt-5 rounded-[6px] px-4 py-5 text-[13px]"
            style={{
              background: "rgba(7, 11, 26, 0.55)",
              border: "1px solid var(--vault-border)",
              color: "var(--vault-text-mute)",
            }}
          >
            <div
              className="font-mono uppercase tracking-[0.14em] mb-1"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              prop lines pending
            </div>
            Lines have not posted yet for this matchup. When books post lines,
            projections appear here for pitcher strikeouts, batter hits, and
            batter total bases.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {pitcherLeans.length > 0 && (
              <div>
                <div
                  className="font-mono uppercase tracking-[0.16em] mb-2"
                  style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
                >
                  Probable pitcher · strikeouts
                </div>
                <div className="flex flex-col gap-2">
                  {pitcherLeans.map((l) => (
                    <MlbLeanRow key={l.id} lean={l} />
                  ))}
                </div>
              </div>
            )}
            {batterLeans.length > 0 && (
              <div>
                <div
                  className="font-mono uppercase tracking-[0.16em] mb-2 mt-3"
                  style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
                >
                  Batter markets · hits + total bases
                </div>
                <div className="flex flex-col gap-2">
                  {batterLeans.map((l) => (
                    <MlbLeanRow key={l.id} lean={l} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
