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
import type React from "react";

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
const PARTICIPATION_INTERNAL = new Set(["AVAILABLE_ROLE_UNCERTAIN", "ROLE_UNCERTAIN"]);
/*
 * ⚠ EXPORTED, BECAUSE A SECOND COPY OF THIS RULE IS A SECOND ANSWER.
 *
 * The NFL game report had its own map (`AVAILABLE_ROLE_UNCERTAIN: "role uncertain"`) and its own
 * inline fallback (`participation.toLowerCase().replaceAll("_", " ")`), which RENDERED THE BANNED
 * PHRASE WITHOUT EVER CONTAINING IT — a grep for "available role uncertain" across the source
 * returned nothing while the string was on the page, assembled at runtime from an enum value.
 * One exported function, used by every surface, is the only version of this that stays fixed.
 */
export const participationLabel = (s: string) =>
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
  /* ⚠ "OURS, NOT THEIRS." A market exists and we could not match it to this player, so the cell
     must not say the books declined to post it. The full sentence under the board says whose
     limitation it is; the cell says enough that a reader does not read it as the books'. */
  IDENTITY_UNRESOLVED: "Not matched to this player",
  UNSUPPORTED: "n/a",
};

/**
 * A sportsbook's own name, as a reader would recognise it. The provider's key is a slug
 * (`williamhill_us`), and printing the slug makes an attributed price look like an internal id.
 *
 * ⚠ A BOOK THIS TABLE DOES NOT KNOW IS STILL NAMED, from its key, rather than dropped or relabelled.
 * The whole point of the fallback ladder is that whichever book is chosen is the book on screen —
 * a lookup miss must degrade to a slightly awkward name, never to a missing or borrowed one.
 */
const BOOK_NAME: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  betrivers: "BetRivers",
  fanatics: "Fanatics",
  espnbet: "ESPN BET",
  caesars: "Caesars",
  williamhill_us: "Caesars",
  bovada: "Bovada",
  betonlineag: "BetOnline",
  lowvig: "LowVig",
  mybookieag: "MyBookie",
  ballybet: "Bally Bet",
  betanysports: "BetAnySports",
  windcreek: "Wind Creek",
};
const bookName = (key: string) => BOOK_NAME[key] ?? key.replace(/_/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** American odds with the sign a book prints. `+106`, `-135` — never a bare `106`. */
const odds = (v: number) => `${v > 0 ? "+" : ""}${v}`;

/**
 * When the price was taken, for a reader rather than for a log. "Captured Thu 5:36 PM ET" is the
 * same fact as the ISO instant and is the version a person can act on.
 *
 * ⚠ IT IS NOT DECORATION. A price without its capture instant cannot be told apart from a live
 * line, which is the single error the frozen-market shape exists to make impossible — so this never
 * degrades to nothing. An unparseable instant falls back to printing it verbatim.
 */
const capturedAtLabel = (iso: string) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " ET";
};

/**
 * The market cell. Numbers only from a real frozen capture; otherwise the owner's state, in words.
 *
 * ⚠ THE BOOK'S NAME LEADS (P0 · 2026-09-24). It used to sit in the third sub-line, after the line
 * and the two prices, in the provider's lowercase slug and beside a raw ISO instant. With one book
 * that was merely untidy. With a FALLBACK LADDER it is a correctness problem: the whole guarantee
 * is that the number belongs to the book named beside it, and a reader who reads the number and not
 * the third grey line has taken a FanDuel price as DraftKings'. So the name comes FIRST and in the
 * book's own spelling, which is also how the row in the brief reads.
 */
function MarketCell({ market }: { market: MarketSnapshot }) {
  if (market.state === "FROZEN_CAPTURE" && market.frozen) {
    const f = market.frozen;
    return (
      <>
        <span className="gtp-pred-book font-mono uppercase tracking-[0.08em]">{bookName(f.sportsbook)}</span>
        <span className="gtp-pred-v">
          {f.line != null ? f.line : "Yes"}
          {f.yesOdds != null ? ` ${odds(f.yesOdds)}` : ""}
        </span>
        {f.overOdds != null && f.underOdds != null ? (
          <span className="gtp-pred-sub">O {odds(f.overOdds)} · U {odds(f.underOdds)}</span>
        ) : null}
        <span className="gtp-pred-sub">Captured {capturedAtLabel(f.capturedAt)}</span>
      </>
    );
  }
  return <span className="gtp-pred-absent">{MARKET_SHORT[market.state] ?? MARKET_SHORT.NOT_PROBED}</span>;
}

export function PredictionBoard({
  predictions,
  gameHref,
  showRank = true,
  rankOf,
  actionLabel = "Game →",
  nameHref,
  nameAdornment,
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
  /*
   * ROUTE SHELLS MAY DIFFER; THE ROW GRAMMAR MAY NOT (P0 · 2026-09-24).
   *
   * The game report reached this component carrying two affordances the hub has no use for: a link
   * to the player's research page on his name, and a follow control beside it. The alternative was
   * a second row renderer for that surface — which is exactly how the hub and the week route came
   * to disagree about a price in the first place, one level up.
   *
   * So the differences that are genuinely about the SURFACE are parameters, and everything that is
   * about the PREDICTION — the market cell, the labels, the ordering of the identity block, the
   * absence wording — stays here, identical on every page that renders a forecast.
   */
  actionLabel?: string;
  /** Where the player's NAME links, per surface. Null (the default) renders plain text. */
  nameHref?: (p: PredictionPresentation) => string | null;
  /** A surface-specific control beside the name (the game report's follow toggle). */
  nameAdornment?: (p: PredictionPresentation) => React.ReactNode;
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
            /*
             * `data-family` and `data-event` are for the RENDERED GUARDS, and they are load-bearing
             * rather than decorative. A row's identity is (event, player, family), and neither half
             * is otherwise derivable from the markup:
             *
             *   without the family, a surface showing one family at a time makes a guard compare a
             *   rushing price against a passing row and fail for the wrong reason;
             *   without the event, a player who appears in BOTH this week's board and a frozen
             *   past week's makes the guard demand this week's price on last week's page — which
             *   is exactly how `/nfl/week/2-02/` first failed.
             *
             * Two short attributes, together smaller than the composite id and readable on their
             * own; this row markup is why `/results` once shipped 1,160KB, so it stays lean.
             */
            <li key={p.predictionId} className="gtp-pred-row" data-family={p.marketFamily} data-event={p.game.providerEventId}>
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
                  <span className="gtp-pred-name">
                    {nameHref?.(p)
                      ? <Link href={nameHref(p) as string} style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>{p.player.name}</Link>
                      : p.player.name}
                    {nameAdornment?.(p)}
                  </span>
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
                {/* Our name above our number, the book's above its own — so the comparison names
                    both sides rather than leaving a reader to infer which column is whose. */}
                <span className="gtp-pred-book font-mono uppercase tracking-[0.08em]">GameTimePicks</span>
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
                  <Link href={href} className="gtp-pred-link font-mono uppercase tracking-[0.1em]">{actionLabel}</Link>
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
