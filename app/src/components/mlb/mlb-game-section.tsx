import type { MlbBoardLean, MlbScheduleGame } from "@/lib/types-mlb";
import { formatTipoffEt } from "@/lib/format-mlb";
import MlbLeanRow from "./mlb-lean-row";
import MlbPlayerAvatar from "./mlb-player-avatar";

/**
 * One game's worth of MLB props grouped under a sportsbook-style header.
 * The header always renders (schedule + probable pitchers); the body
 * renders pre-sorted prop rows passed in by the parent (the parent applies
 * filters / sort / density so this stays a pure presentation component).
 *
 * When the parent passes zero leans (e.g. filters hid everything), the
 * body shows a calm "No visible leans under current filters" state
 * instead of disappearing entirely. The probable pitchers stay visible so
 * the game context remains.
 */
interface Props {
  game: MlbScheduleGame;
  leans: MlbBoardLean[];
  /** Total leans in this game before filtering — used in the count chip. */
  totalLeansForGame?: number;
  density?: "detailed" | "scan";
}

export default function MlbGameSection({
  game,
  leans,
  totalLeansForGame,
  density = "detailed",
}: Props) {
  // Leans already sorted by parent; we just split by role for sectioning.
  const pitcherLeans = leans.filter((l) => l.playerRole === "pitcher");
  const batterLeans = leans.filter((l) => l.playerRole === "batter");

  const tipoff = formatTipoffEt(game.gameDate);
  const visible = leans.length;
  const total = totalLeansForGame ?? visible;
  const filtersHidAll = total > 0 && visible === 0;
  const noPropsLoaded = total === 0;

  return (
    <section
      className="gtp-aurora-halo"
      aria-label={`${game.awayTeamAbbr ?? "?"} at ${game.homeTeamAbbr ?? "?"}`}
    >
      <div
        className="gtp-status-board p-5 sm:p-6"
        style={{ borderRadius: 8 }}
      >
        {/* Header: matchup + tipoff + lean count chip */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
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
              <span
                className="font-mono uppercase tracking-[0.12em]"
                style={{
                  color: "var(--vault-text-faint)",
                  fontSize: 9,
                  border: "1px solid var(--vault-border)",
                  borderRadius: 2,
                  padding: "1px 5px",
                }}
              >
                {visible === total
                  ? `${total} lean${total === 1 ? "" : "s"}`
                  : `${visible} of ${total} leans`}
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

        {/* Probable pitchers — avatar cards. */}
        <div
          className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {[
            {
              side: "away" as const,
              teamAbbr: game.awayTeamAbbr,
              name: game.awayProbablePitcherName,
              id: game.awayProbablePitcherId,
            },
            {
              side: "home" as const,
              teamAbbr: game.homeTeamAbbr,
              name: game.homeProbablePitcherName,
              id: game.homeProbablePitcherId,
            },
          ].map((p) => (
            <div
              key={p.side}
              className="flex items-center gap-3 rounded-[3px]"
              style={{
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: 12,
                paddingRight: 12,
                border: "1px solid var(--vault-border)",
                background: "rgba(7, 11, 26, 0.5)",
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <MlbPlayerAvatar
                playerId={p.id ?? null}
                playerName={p.name ?? "TBD"}
                team={p.teamAbbr}
                role="pitcher"
                size="sm"
              />
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span
                  className="uppercase"
                  style={{
                    color: "var(--vault-text-faint)",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                  }}
                >
                  probable · {p.side}
                </span>
                <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>
                  {p.name ?? "TBD"}
                </span>
              </div>
              <span
                style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
                className="font-mono"
              >
                {p.teamAbbr ?? ""}
              </span>
            </div>
          ))}
        </div>

        {/* Body — pending / filters-hid-all / real rows */}
        {noPropsLoaded ? (
          <PropsPendingNote />
        ) : filtersHidAll ? (
          <FiltersHidAllNote />
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
                    <MlbLeanRow key={l.id} lean={l} density={density} />
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
                    <MlbLeanRow key={l.id} lean={l} density={density} />
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

function PropsPendingNote() {
  return (
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
  );
}

function FiltersHidAllNote() {
  return (
    <div
      className="mt-5 rounded-[6px] px-4 py-4 text-[12px]"
      style={{
        background: "rgba(7, 11, 26, 0.45)",
        border: "1px dashed var(--vault-border)",
        color: "var(--vault-text-faint)",
      }}
    >
      No visible leans under the current filters. Adjust the filter console
      above to see this game&apos;s rows again.
    </div>
  );
}
