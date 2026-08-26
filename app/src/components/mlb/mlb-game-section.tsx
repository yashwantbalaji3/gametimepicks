import Link from "next/link";
import type { MlbBoardLean, MlbScheduleGame } from "@/lib/types-mlb";
import { formatTipoffEt } from "@/lib/format-mlb";
import MlbLeanRow from "./mlb-lean-row";
import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "../team-logo";

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
  /** Final | live | pregame | null — drives the Final-game chip + body
   *  state. When `final` AND `settled` is true, the body links into MLB
   *  Results instead of showing pending/lean rows. */
  gameState?: "final" | "live" | "pregame" | null;
  /** Whether this game's props have been graded on MLB Results. Only
   *  consulted when `gameState === "final"`. */
  settled?: boolean;
  /** When true, the accordion opens by default. The board client opens
   *  the first game only — matches sportsbook UX conventions. */
  defaultOpen?: boolean;
}

export default function MlbGameSection({
  game,
  leans,
  totalLeansForGame,
  density = "detailed",
  gameState,
  settled,
  defaultOpen = false,
}: Props) {
  // Leans already sorted by parent; we just split by role for sectioning.
  const pitcherLeans = leans.filter((l) => l.playerRole === "pitcher");
  const batterLeans = leans.filter((l) => l.playerRole === "batter");

  const tipoff = formatTipoffEt(game.gameDate);
  const visible = leans.length;
  const total = totalLeansForGame ?? visible;
  const filtersHidAll = total > 0 && visible === 0;
  const noPropsLoaded = total === 0;

  // Stable anchor target: `game-{gamePk}` matches the deep links emitted
  // by /mlb and /mlb/board's Top Clean Leans strip. Fall back to
  // away-home team abbreviations when gamePk is missing.
  const anchorId = `game-${game.gamePk ?? `${game.awayTeamAbbr}-${game.homeTeamAbbr}`}`;

  return (
    <section
      className="gtp-aurora-halo gtp-mlb-game-card"
      aria-label={`${game.awayTeamAbbr ?? "?"} at ${game.homeTeamAbbr ?? "?"}`}
      id={anchorId}
      style={{ scrollMarginTop: 80 }}
    >
      <details
        className="gtp-status-board p-5 sm:p-6 gtp-mlb-accordion"
        style={{ borderRadius: 8 }}
        open={defaultOpen}
      >
        <summary
          className="list-none cursor-pointer select-none -m-1 p-1 rounded-[6px]"
          aria-label={`Toggle details for ${game.awayTeamAbbr ?? "?"} at ${game.homeTeamAbbr ?? "?"}`}
        >
        {/* Header: matchup + tipoff + lean count chip + expand chevron */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: "var(--vault-gold-bright)",
                  boxShadow: "0 0 10px color-mix(in srgb, var(--vault-accent) 65%, transparent)",
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
                  fontSize: 10,
                  border: "1px solid var(--vault-border)",
                  borderRadius: 2,
                  padding: "1px 5px",
                }}
              >
                {visible === total
                  ? `${total} lean${total === 1 ? "" : "s"}`
                  : `${visible} of ${total} leans`}
              </span>
              {gameState === "final" && (
                <span
                  className="font-mono uppercase tracking-[0.12em]"
                  style={{
                    color: settled ? "var(--vault-success)" : "var(--vault-warn)",
                    fontSize: 10,
                    border: `1px solid ${
                      settled ? "color-mix(in srgb, var(--vault-success) 30%, transparent)" : "color-mix(in srgb, var(--vault-accent) 30%, transparent)"
                    }`,
                    background: settled
                      ? "color-mix(in srgb, var(--vault-success) 10%, transparent)"
                      : "color-mix(in srgb, var(--vault-accent) 10%, transparent)",
                    borderRadius: 2,
                    padding: "1px 5px",
                  }}
                >
                  {settled ? "Final · graded" : "Final · awaiting grade"}
                </span>
              )}
              {gameState === "live" && (
                <span
                  className="font-mono uppercase tracking-[0.12em]"
                  style={{
                    color: "var(--vault-gold-bright)",
                    fontSize: 10,
                    border: "1px solid color-mix(in srgb, var(--vault-accent) 30%, transparent)",
                    background: "color-mix(in srgb, var(--vault-accent) 10%, transparent)",
                    borderRadius: 2,
                    padding: "1px 5px",
                  }}
                >
                  In progress
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              {/* Official ESPN team logos with TeamBadge fallback —
                  brings MLB cards into visual parity with the NBA
                  matchup hero. */}
              <TeamLogo team={game.awayTeamAbbr ?? null} sport="mlb" size="md" />
              <h3
                className="font-display font-semibold tracking-tight"
                style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1.15 }}
              >
                {game.awayTeamAbbr ?? "?"}
                <span style={{ color: "var(--vault-text-mute)", margin: "0 8px" }}>@</span>
                {game.homeTeamAbbr ?? "?"}
              </h3>
              <TeamLogo team={game.homeTeamAbbr ?? null} sport="mlb" size="md" />
            </div>
            <p
              className="text-[12px] mt-1"
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
            <span
              aria-hidden
              className="gtp-mlb-accordion-chevron font-mono text-[14px] leading-none mt-2 inline-block"
              style={{ color: "var(--vault-text-faint)" }}
            >
              ▾
            </span>
          </div>
        </div>
        </summary>

        {/* ---- accordion body (collapsed by default) ---- */}

        {/* Probable pitchers — collapsed into "Game details" so they
            don't dominate the matchup card. May 21 user feedback:
            the projections (hits / total bases / strikeouts) are the
            main story; pitcher cards belong in the secondary detail
            section. Strikeouts projections downstream still reference
            the pitcher's name implicitly via the prop row's player. */}
        <details
          className="mt-4 rounded-[5px] vault-glass overflow-hidden group/pitchers"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <summary
            className="cursor-pointer list-none flex items-center justify-between gap-3 px-3.5 py-2.5"
            style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 45%, transparent)" }}
          >
            <span
              className="font-mono uppercase tracking-[0.14em]"
              style={{ color: "var(--vault-gold)", fontSize: 10 }}
            >
              Game details · probable pitchers
            </span>
            <span
              aria-hidden
              className="font-mono text-[12px] leading-none transition-transform group-open/pitchers:rotate-180"
              style={{ color: "var(--vault-text-faint)" }}
            >
              ▾
            </span>
          </summary>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] p-3"
          style={{
            color: "var(--vault-text-mute)",
            borderTop: "1px solid var(--vault-rule)",
          }}
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
                background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)",
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <PlayerAvatar sport="mlb"
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
        </details>

        {/* Body — final-game / pending / filters-hid-all / real rows */}
        {noPropsLoaded && gameState === "final" ? (
          <FinalNoLeansNote settled={settled} />
        ) : noPropsLoaded ? (
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
                  Strikeouts
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
      </details>
    </section>
  );
}

function PropsPendingNote() {
  return (
    <div
      className="mt-5 rounded-[6px] px-4 py-5 text-[13px]"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
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

function FinalNoLeansNote({ settled }: { settled?: boolean }) {
  return (
    <div
      className="mt-5 rounded-[6px] px-4 py-4 text-[13px]"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
        border: `1px solid ${
          settled ? "color-mix(in srgb, var(--vault-success) 25%, transparent)" : "color-mix(in srgb, var(--vault-accent) 25%, transparent)"
        }`,
        color: "var(--vault-text-mute)",
      }}
    >
      <div
        className="font-mono uppercase tracking-[0.14em] mb-1"
        style={{
          color: settled ? "var(--vault-success)" : "var(--vault-warn)",
          fontSize: 10,
        }}
      >
        {settled ? "Game final · graded" : "Game final · awaiting grade"}
      </div>
      {settled ? (
        <>
          This matchup is graded in the MLB model audit.{" "}
          <Link href="/mlb/results" style={{ color: "var(--vault-success)" }}>
            Open MLB Results →
          </Link>
        </>
      ) : (
        <>
          The box score is final but settlement hasn&apos;t run yet for this
          slate. Once the audit pipeline runs, every eligible lean is graded
          on{" "}
          <Link href="/mlb/results" style={{ color: "var(--vault-warn)" }}>
            MLB Results
          </Link>
          .
        </>
      )}
    </div>
  );
}

function FiltersHidAllNote() {
  return (
    <div
      className="mt-5 rounded-[6px] px-4 py-4 text-[12px]"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 45%, transparent)",
        border: "1px dashed var(--vault-border)",
        color: "var(--vault-text-faint)",
      }}
    >
      No visible leans under the current filters. Adjust the filter console
      above to see this game&apos;s rows again.
    </div>
  );
}
