/**
 * THE PREDICTION BOARD — one renderer for every published player prediction.
 *
 * ONE DOM, TWO LAYOUTS. Mobile-first stacked cards that become a grid row at 768px, rather than a
 * desktop table that is merely scrolled sideways on a phone. There is only ONE set of markup: the
 * field labels live in the row and are hidden visually (not removed) once the header row supplies
 * them, so a screen reader reads a labelled value at every width and the page never pays for the
 * same row twice. `/results` measured 1,160KB when per-cell style objects shipped once per cell —
 * everything positional here is a class, and the only inline value is the rank counter.
 *
 * THE COMPARISON IS THE POINT. MARKET and MODEL sit next to each other in that order, at the same
 * visual weight, so a reader can see what a book says and what we say without deciding which column
 * is which. When no approved market capture exists the MARKET cell says so in words. It is never
 * blank — a blank reads as zero — and it never borrows a current line to stand in for the line at
 * publication.
 *
 * V1.1 · WHAT IS A COLUMN AND WHAT IS AN IDENTITY. Matchup and start time were columns, which made
 * the desktop row eight tracks wide and made a reader scan sideways to assemble one fact: which game
 * this number is about. They are now one line under the player's name, and the six remaining tracks
 * are the ones a reader compares ACROSS rows. A column earns its place by being worth comparing
 * down the page; "which game is this" is not that, it is part of the row's identity.
 */
import Link from "next/link";
import PlayerAvatar from "@/components/player-avatar";
import type { MarketSnapshot, ModelForecast, PredictionPresentation } from "@/lib/prediction-presentation/contract";

/** ET, once, for every surface that renders a prediction. */
export const etStart = (iso: string) =>
  iso
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(iso)) + " ET"
    : "—";

/**
 * AVAILABILITY, in plain English — and ONLY availability.
 *
 * ⚠ TWO DIFFERENT THINGS WORE THE SAME BADGE. `AVAILABLE_ROLE_UNCERTAIN` is not a report about the
 * player; it is the MODEL saying its own evidence for how much this player will be used has not
 * cleared its bar. `QUESTIONABLE` and `INACTIVE` are the opposite: facts an official source
 * published about whether he can play at all. Rendering both as a grey phrase beside the name made
 * 41 of 45 rows on the live Week-4 boards read "role uncertain", which a beginner reads as an injury
 * report on nearly every player. It is not one, and burying the four REAL availability states in
 * that noise is the actual harm.
 *
 * So this map now carries availability only. `PARTICIPATION_INTERNAL` names what is deliberately not
 * rendered, rather than leaving it to fall through a default — an omission is invisible and a named
 * exclusion is reviewable.
 *
 * ⚠ NOTHING IS DELETED. The state still travels on the row, still reaches the methodology and
 * research surfaces, and still conditions the model. Only the primary public row stops repeating it.
 *
 * An unrecognised state still renders verbatim rather than being dropped — a participation we cannot
 * translate is still a participation the owner published, and silence would read as "no concern".
 */
const PARTICIPATION_LABEL: Record<string, string> = {
  ACTIVE_EXPECTED: "expected to play",
  ACTIVE_PROJECTED: "projected active",
  QUESTIONABLE: "questionable",
  INACTIVE: "listed out",
};
/** Internal model/role states. Owned, carried, conditioned on — but not shown on the primary row. */
const PARTICIPATION_INTERNAL = new Set(["AVAILABLE_ROLE_UNCERTAIN"]);
const participationLabel = (s: string) =>
  !s || PARTICIPATION_INTERNAL.has(s) ? "" : PARTICIPATION_LABEL[s] ?? s.toLowerCase().replace(/_/g, " ");

/** The model's headline number, in its own unit. A probability is a percentage; a count is a count. */
function modelValue(m: ModelForecast): string {
  if (m.kind === "PROBABILITY") return m.probability != null ? `${(m.probability * 100).toFixed(1)}%` : "—";
  if (m.predictedValue == null) return "—";
  return `${m.predictedValue}${m.unit ? ` ${m.unit}` : ""}`;
}

/**
 * The SHORT form of an absence, for the cell. The full sentence renders ONCE under the board.
 *
 * Both halves are needed. Repeating the full sentence on all forty-five rows is a wall of identical
 * prose that a reader stops seeing, which is its own kind of dishonesty; printing nothing at all
 * reads as zero. So the cell states the fact and the board states the reason, once.
 *
 * ⚠ V1.1 — "No price" was true and read as false. Repeated down forty-five rows it tells a beginner
 * that no sportsbook prices this player, which is not what we mean and not something we have any
 * evidence for. What is true is that GameTimePicks does not currently own an approved frozen market
 * for this prediction, and the cell now says exactly that much and no more.
 *
 * The states stay DISTINCT: "we never asked" and "we asked and the book does not offer it" are
 * different facts and must never collapse into one friendly phrase. The fallback is the
 * least-claiming of them, because an unrecognised state is precisely the case where we know least.
 */
const MARKET_SHORT: Record<string, string> = {
  NOT_AUTHORIZED: "Market unavailable",
  NOT_OFFERED: "Not offered",
  NOT_PROBED: "Not checked",
  UNSUPPORTED: "n/a",
};

/** The market cell. Numbers only from a real frozen capture; otherwise the owner's state, in words. */
function MarketCell({ market }: { market: MarketSnapshot }) {
  if (market.state === "FROZEN_CAPTURE" && market.frozen) {
    const f = market.frozen;
    return (
      <>
        <span className="gtp-pred-v">
          {f.line != null ? `O/U ${f.line}` : "Yes"}
          {f.yesOdds != null ? ` ${f.yesOdds > 0 ? "+" : ""}${f.yesOdds}` : ""}
        </span>
        {f.overOdds != null && f.underOdds != null ? (
          <span className="gtp-pred-sub">
            O {f.overOdds > 0 ? "+" : ""}{f.overOdds} · U {f.underOdds > 0 ? "+" : ""}{f.underOdds}
          </span>
        ) : null}
        <span className="gtp-pred-sub">{f.sportsbook} · captured {f.capturedAt}</span>
      </>
    );
  }
  return <span className="gtp-pred-absent">{MARKET_SHORT[market.state] ?? "Market unavailable"}</span>;
}

export function PredictionBoard({
  predictions,
  gameHref,
  showRank = true,
  rankOf,
}: {
  predictions: PredictionPresentation[];
  /** Where a row's action goes. Returns null when this surface has no game route for the row. */
  gameHref: (p: PredictionPresentation) => string | null;
  showRank?: boolean;
  /**
   * The rank to print. Defaults to position in this list. A FILTERED view passes the row's place in
   * the published board instead — filtering must never renumber a ranking it did not produce.
   */
  rankOf?: (p: PredictionPresentation, i: number) => number;
}) {
  if (predictions.length === 0) return null;
  /*
   * The footnote speaks for the whole board, so it renders only when every row genuinely shares one
   * market state. A mixed board keeps its per-row labels and says nothing collective — a summary that
   * described only some of its rows would be the kind of quiet overclaim this grammar exists to stop.
   */
  const states = new Set(predictions.map((p) => p.market.state));
  const sharedNote = states.size === 1 ? predictions[0].market.note : undefined;
  /*
   * A RANGE column that is "—" on every row is not information, it is furniture. A probability family
   * publishes no band, so the column does not exist for it — rather than existing and being empty,
   * which invites a reader to wonder what went missing.
   */
  const hasRange = predictions.some((p) => p.model.p10 != null && p.model.p90 != null);
  const mods = `${showRank ? "" : " gtp-pred-norank"}${hasRange ? "" : " gtp-pred-norange"}`;
  return (
    <div className={`gtp-pred-wrap${mods}`}>
      <div className="gtp-pred-head" aria-hidden="true">
        {showRank ? <span /> : null}
        <span>Player</span>
        <span>Market</span>
        <span>Model</span>
        {hasRange ? <span>Range</span> : null}
        <span />
      </div>
      <ol className="gtp-pred-list">
        {predictions.map((p, i) => {
          const href = gameHref(p);
          return (
            <li key={p.predictionId} className="gtp-pred-row">
              {showRank ? <span className="gtp-pred-rank font-mono">{rankOf ? rankOf(p, i) : i + 1}</span> : null}

              {/*
                * ONE IDENTITY UNIT. Matchup and start time used to be columns of their own, so a
                * reader scanned sideways to assemble facts that describe a single thing: which game
                * this player's number is about. They now sit under the name, where the eye already
                * is, and the row's remaining columns are the ones a reader actually compares across
                * rows — MARKET beside MODEL.
                *
                * The team abbreviation is NOT repeated. "SEA · SEA vs WSH" said it twice; the
                * matchup already names the club, so the line reads "SEA vs WSH · Sun 1:00 PM ET" and
                * degrades to the club alone when no opponent is published.
                *
                * The sr-only keys stay. A sighted reader gets the header row; a screen-reader user
                * still hears "Matchup" and "Start" before the values, at every width, which is the
                * whole reason the labels live in the row rather than only in the header.
                */}
              <span className="gtp-pred-player">
                <PlayerAvatar playerId={p.player.portraitId} playerName={p.player.name} team={p.player.teamAbbr} sport="nfl" size="md" />
                <span className="gtp-pred-ident">
                  <span className="gtp-pred-name">{p.player.name}</span>
                  <span className="gtp-pred-context font-mono">
                    <span className="gtp-pred-k">Matchup</span>
                    <span>{p.game.opponentAbbr ? `${p.player.teamAbbr} vs ${p.game.opponentAbbr}` : p.player.teamAbbr}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="gtp-pred-k">Start</span>
                    <span>{etStart(p.game.startTimeUtc)}</span>
                    {participationLabel(p.game.participation ?? "") ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="gtp-pred-avail">{participationLabel(p.game.participation ?? "")}</span>
                      </>
                    ) : null}
                  </span>
                </span>
              </span>

              <span className="gtp-pred-cell gtp-pred-market">
                <span className="gtp-pred-k">Market</span>
                <MarketCell market={p.market} />
              </span>

              <span className="gtp-pred-cell gtp-pred-model">
                <span className="gtp-pred-k">Model</span>
                <span className="gtp-pred-v font-mono">{modelValue(p.model)}</span>
                {p.model.status === "ESTIMATE" ? <span className="gtp-pred-sub">estimate</span> : null}
              </span>

              {hasRange ? (
                <span className="gtp-pred-cell">
                  <span className="gtp-pred-k">Range</span>
                  <span className="gtp-pred-v font-mono">
                    {p.model.p10 != null && p.model.p90 != null ? `${p.model.p10}–${p.model.p90}` : "—"}
                  </span>
                </span>
              ) : null}

              <span className="gtp-pred-cell gtp-pred-go">
                {href ? (
                  <Link href={href} className="gtp-pred-link font-mono uppercase tracking-[0.1em]">Game →</Link>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      {sharedNote ? <p className="gtp-pred-note">{sharedNote}</p> : null}
    </div>
  );
}

export default PredictionBoard;
