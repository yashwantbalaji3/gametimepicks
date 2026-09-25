"use client";
/**
 * NFL PLAYER BOARD (P245 · Release E; P250 · A15 consolidation) — the filterable per-game player
 * projection board, now including the COMBINED player-centric view as its first tab.
 *
 * Renders the PUBLIC player-board artifact: only promotion-eligible families carry numbers;
 * every withheld family is listed with the exact bar it failed, so absence reads as a decision,
 * not a gap. Filters are client-side presentation over the precomputed artifact — nothing here
 * computes, fetches or invents a number.
 *
 * P250 · A15: the P249 combined receiving table used to be a SEPARATE server-rendered block below
 * this board — the team/player filters above it did not govern it, it silently capped at 14 rows,
 * carried no availability column, and rounded yards while this board printed hundredths. It is now
 * the board's own "Combined" tab: one filter scope, every eligible player reachable, availability
 * on every row, one display-precision policy (yards to the whole yard, receptions to one decimal —
 * matching the weekly boards), and a missing value renders "—", never a fabricated zero.
 */
import { useMemo, useState } from "react";
import { SEARCH_PLAYERS, SEARCH_PLAYERS_LABEL } from "@/lib/ui/search-labels";
import Link from "next/link";
import FollowToggle from "@/components/follow/follow-toggle";
import { nflPlayerRef } from "@/lib/follow/follow-schema.mjs";
import PredictionBoard, { participationLabel } from "@/components/prediction/prediction-board";
import { presentPlayerBoardFamily, type PlayerBoardContext, type PlayerBoardPlayer } from "@/lib/prediction-presentation/nfl";

/**
 * v1.1.2: the player's name cell, with a follow star keyed on the board's own `nfl-athlete-<id>` —
 * the lineage Live already uses. A row whose id is not in that lineage gets no star; a player is never
 * followed by display name.
 */
/** v1.3: the name links to Player Research when that exact athlete id has a page; the Follow star stays a sibling. */
function PlayerNameCell({ playerId, name, href }: { playerId: string; name: string; href?: string }) {
  const ref = nflPlayerRef(playerId, name);
  return (
    <td style={{ padding: "8px 9px", fontSize: 13, color: "var(--vault-text)", fontWeight: 600 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        {href ? <Link href={href} style={{ color: "var(--vault-text)", textDecoration: "underline", textDecorationColor: "var(--vault-border-strong)", textUnderlineOffset: 3 }}>{name}</Link> : name}
        {ref ? <FollowToggle entity={ref} variant="compact" size={12} /> : null}
      </span>
    </td>
  );
}

export interface PlayerBoardRow {
  playerId: string;
  name: string;
  team: string;
  participation: string;
  volumeNote?: string;
  markets: Record<string, {
    mean?: number; p10?: number; median?: number; p90?: number; probability?: number; participation?: string;
    /* The producer's market slot: a real captured price OR a typed absence, never both. Declared
       here so the pass-through to the shared contract is type-visible, not accidental — the hand-
       maintained field list on the /nfl hub is exactly how this P0 started. */
    market?: { line?: number; overOdds?: number; underOdds?: number; yesOdds?: number; sportsbook: string; capturedAt: string };
    pricingState?: string;
  }>;
}

/** P250-GD3: a roster-present mover the evaluated stint rule cannot yet place — factual prior-club
 *  per-game usage, explicitly NOT part of this game's simulated team numbers. */
export interface NewArrival {
  playerId: string;
  name: string;
  position: string;
  team: string;
  participation: string;
  lastSeason: { club: string; games: number; targetsPg: number; receptionsPg: number; recYdsPg: number; rushAttPg: number; rushYdsPg: number; passAttPg: number; passYdsPg: number };
  note: string;
}

export interface PlayerBoardArtifact {
  matchup: string;
  participationBasis: string;
  newArrivals?: Record<string, NewArrival[]>;
  families: Record<string, { label: string; state: string; basis?: string; reason?: string; caveat?: string }>;
  players: PlayerBoardRow[];
  disclaimer: string;
  /* The three fields the SHARED presentation contract needs and this artifact already carries. The
     component spreads them through rather than re-deriving a kickoff or an event id from the page. */
  providerEventId?: string;
  kickoffUtc?: string;
  generatedAt?: string;
}

/*
 * ⚠ THE BANNED PHRASE WAS NEVER IN THE SOURCE — IT WAS ASSEMBLED AT RUNTIME.
 *
 * This map used to read `AVAILABLE_ROLE_UNCERTAIN: "role uncertain"`, and the game report's own
 * fallback turned the same enum value into "available role uncertain" with
 * `.toLowerCase().replaceAll("_", " ")`. A grep for either phrase across the repo returned the
 * component and nothing else, or nothing at all — while the words were on the page, on most rows.
 *
 * TWO DIFFERENT THINGS WORE ONE BADGE (the reasoning is the prediction board's, and this is now the
 * SAME function rather than a second copy of the conclusion): AVAILABLE_ROLE_UNCERTAIN is the MODEL
 * saying its own role evidence has not cleared its bar. QUESTIONABLE / INACTIVE are facts an
 * official source published about whether a player can play. Rendering both as grey text beside the
 * name made a beginner read an injury report on nearly every player, and buried the real ones.
 *
 * NOTHING IS DELETED: the state still travels on the row, still reaches the research and
 * methodology surfaces, and still conditions the model. Only the primary public row stops
 * repeating it.
 */
const participationText = participationLabel;

/** One display-precision policy (matches the weekly boards): yards to the whole yard, counts to one
 *  decimal. Absence stays absent — "—", never a zero invented by a fallback. */
const yd = (v: number | undefined) => (v != null && Number.isFinite(v) ? String(Math.round(v)) : "—");
const ct = (v: number | undefined) => (v != null && Number.isFinite(v) ? (Math.round(v * 10) / 10).toString() : "—");

const COMBINED = "combined";
const EMPTY_NOTE = "No modelled player matches this filter — a player without a supported projection is absent by decision, never padded in.";

export default function NflPlayerBoard({ board, teams, researchHrefs = {} }: { board: PlayerBoardArtifact; teams: [string, string]; researchHrefs?: Record<string, string> }) {
  /* P250-GD2: two display tiers. PUBLISHED families cleared their bars; ESTIMATE families carry
     real computed numbers WITH the failed bar and a caveat on the tab — the owner's display
     decision, rendered without ever dressing an estimate as a validated forecast. */
  const publishedFamilies = Object.entries(board.families).filter(([, f]) => f.state === "PUBLISHED" || f.state === "ESTIMATE");
  const withheld = Object.entries(board.families).filter(([, f]) => f.state !== "PUBLISHED" && f.state !== "ESTIMATE");
  const hasCombined =
    board.families.player_receptions?.state === "PUBLISHED" &&
    board.families.player_reception_yds?.state === "PUBLISHED";
  const hasTd = board.families.anytime_td?.state === "PUBLISHED";
  const [team, setTeam] = useState<string | null>(null);
  /*
   * ⚠ THE DEFAULT TAB DECIDES WHAT THE STATIC EXPORT CONTAINS, AND THEREFORE WHAT A READER SEES.
   *
   * Combined was the default (P250 · A15), which made the first thing on a game report a
   * MODEL-ONLY table — no sportsbook, no book name, no line. That was fine when no NFL player
   * market existed; with real prices it means the page a reader lands on is the one page in the
   * product that shows a forecast with no market beside it, and the prices are one click away
   * behind a tab. It also means the rendered-guard below would have had no prediction row to
   * inspect on a game page, and would have quietly gone back to proving nothing.
   *
   * So the default is the first PUBLISHED family that actually carries a captured price, falling
   * back to Combined and then to whatever publishes. Combined keeps its tab and its first position
   * — nothing is removed — but the landing view is the one that names a book.
   */
  const firstPricedFamily = useMemo(() => {
    /* The family with the MOST priced rows, not merely the first that has one — the first published
       family here is passing yards, which is four quarterbacks, while the same game carries
       thirty-nine prices across the receiving and rushing families. Ties keep the published order. */
    let best = null;
    let bestN = 0;
    for (const [k] of publishedFamilies) {
      const n = board.players.filter((p) => p.markets[k]?.market).length;
      if (n > bestN) { best = k; bestN = n; }
    }
    return best;
  }, [publishedFamilies, board.players]);
  const [family, setFamily] = useState<string>(firstPricedFamily ?? (hasCombined ? COMBINED : publishedFamilies[0]?.[0] ?? ""));
  const [q, setQ] = useState("");
  /* P246 (founder §4.1): a player confirmed OUT is excluded from the DEFAULT board — a
     conditional-on-playing number beside active players reads as a projection that he plays.
     The rows stay in the artifact; this toggle is the explicit optional detail that shows them. */
  const [includeOut, setIncludeOut] = useState(false);
  const outCount = useMemo(() => board.players.filter((p) => p.participation === "INACTIVE").length, [board.players]);

  const isCombined = family === COMBINED;
  const rows = useMemo(
    () =>
      board.players
        .filter((p) => (includeOut ? true : p.participation !== "INACTIVE"))
        .filter((p) => (team ? p.team === team : true))
        .filter((p) =>
          isCombined
            ? p.markets.player_receptions != null || p.markets.player_reception_yds != null
            : family
              ? p.markets[family] != null
              : true,
        )
        .filter((p) => (q ? p.name.toLowerCase().includes(q.toLowerCase()) : true))
        /* The combined view ranks by expected receptions — ALL eligible players, never a silent cap. */
        .sort((a, b) =>
          isCombined
            ? (b.markets.player_receptions?.median ?? -1) - (a.markets.player_receptions?.median ?? -1)
            : 0,
        ),
    [board.players, team, family, q, includeOut, isCombined],
  );

  /*
   * The filtered rows, expressed in the SHARED presentation contract. Built from the artifact the
   * producer already stamped — no join, no lookup, no second opinion about which book is on screen.
   */
  const presented = useMemo(() => {
    if (isCombined || !family) return [];
    const ctx: PlayerBoardContext = {
      providerEventId: board.providerEventId ?? "",
      kickoffUtc: board.kickoffUtc ?? "",
      teams,
      families: board.families,
      generatedAt: board.generatedAt ?? "",
    };
    return presentPlayerBoardFamily(ctx, rows as PlayerBoardPlayer[], family);
  }, [board.providerEventId, board.kickoffUtc, board.families, board.generatedAt, teams, rows, family, isCombined]);

  if (publishedFamilies.length === 0) return null;

  const tabs: Array<[string, string]> = [
    ...(hasCombined ? [[COMBINED, "Combined · one row per player"] as [string, string]] : []),
    ...publishedFamilies.map(([key, f]) => [key, f.label] as [string, string]),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Player board filters">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFamily(key)}
            aria-pressed={family === key}
            className="vault-press font-mono uppercase tracking-[0.1em]"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: 999, fontSize: 10.5, border: `1px solid ${family === key ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`, color: family === key ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", background: family === key ? "var(--vault-gold-dim)" : "transparent" }}
          >
            {label}
          </button>
        ))}
        <span aria-hidden style={{ width: 1, height: 22, background: "var(--vault-rule)" }} />
        {[null, ...teams].map((t) => (
          <button
            key={t ?? "both"}
            type="button"
            onClick={() => setTeam(t)}
            aria-pressed={team === t}
            className="vault-press font-mono"
            style={{ minHeight: 40, padding: "0 12px", borderRadius: 999, fontSize: 11, border: `1px solid ${team === t ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`, color: team === t ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", background: "transparent" }}
          >
            {t ?? "Both teams"}
          </button>
        ))}
        {outCount > 0 ? (
          <label className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40, fontSize: 11, color: "var(--vault-text-mute)", cursor: "pointer" }}>
            <input type="checkbox" checked={includeOut} onChange={(e) => setIncludeOut(e.target.checked)} aria-label={`Show listed-out players (${outCount}) — conditional on playing`} />
            Show listed-out players ({outCount}) — conditional on playing
          </label>
        ) : null}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={SEARCH_PLAYERS}
          aria-label={SEARCH_PLAYERS_LABEL}
          className="font-mono"
          style={{ minHeight: 40, padding: "0 12px", borderRadius: 10, fontSize: 12, border: "1px solid var(--vault-rule)", background: "transparent", color: "var(--vault-text)" }}
        />
      </div>

      {isCombined ? (
        <p className="mt-2" style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 720 }}>
          Every receiving family for one player on one row, ranked by expected receptions.
        </p>
      ) : null}

      {/*
        * ⚠ THE GAME REPORT USED TO RENDER ITS OWN ROWS, AND THAT IS WHY IT HAD NO MARKET.
        *
        * A per-family view here is the SAME claim as a weekly-board row — same player, same family,
        * same game — so it goes through the same renderer. The alternative, a second table that
        * happens to be kept in step by hand, is the defect this P0 opened with one layer up, where
        * `/nfl/` enumerated the fields it copied and quietly stopped carrying `market`.
        *
        * THE SHELL IS STILL THIS SURFACE'S OWN: the family tabs, the team filter, the listed-out
        * toggle, the search box, the research link on the name and the follow star are all things
        * a game report needs and the hub does not. What is shared is the PREDICTION — the market
        * cell, the absence wording, the labels, the identity line and their order.
        */}
      {isCombined ? (
        <div className="mt-3" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                {["Player", "Team", "Availability", "Receptions (10th–90th)", "Rec yards (10th–90th)", ...(hasTd ? ["TD chance"] : [])].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 9px", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const rec = p.markets.player_receptions;
                const ry = p.markets.player_reception_yds;
                const at = p.markets.anytime_td;
                return (
                  <tr key={`${p.playerId}-combined`} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                    <PlayerNameCell playerId={p.playerId} name={p.name} href={researchHrefs[p.playerId]} />
                    <td className="font-mono" style={{ padding: "8px 9px", fontSize: 11, color: "var(--vault-text-mute)" }}>{p.team}</td>
                    <td className="font-mono" style={{ padding: "8px 9px", fontSize: 10.5, color: p.participation === "INACTIVE" ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)" }}>
                      {participationText(p.participation)}
                    </td>
                    <td className="font-mono" style={{ padding: "8px 9px", fontSize: 12.5 }}>
                      {rec?.median != null ? <>{ct(rec.median)} <span style={{ color: "var(--vault-text-faint)" }}>({ct(rec.p10)}–{ct(rec.p90)})</span></> : "—"}
                    </td>
                    <td className="font-mono" style={{ padding: "8px 9px", fontSize: 12.5 }}>
                      {ry?.median != null ? <>{yd(ry.median)} <span style={{ color: "var(--vault-text-faint)" }}>({yd(ry.p10)}–{yd(ry.p90)})</span></> : "—"}
                    </td>
                    {hasTd ? (
                      <td className="font-mono" style={{ padding: "8px 9px", fontSize: 12.5, fontWeight: 700, color: "var(--gtp-bank-heat)" }}>
                        {at?.probability != null ? `${(at.probability * 100).toFixed(1)}%` : "—"}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "12px 9px", fontSize: 12.5, color: "var(--vault-text-mute)" }}>{EMPTY_NOTE}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : presented.length ? (
        <div className="mt-3">
          <PredictionBoard
            predictions={presented}
            showRank={false}
            gameHref={() => null}
            nameHref={(p) => researchHrefs[p.player.playerId] ?? null}
            nameAdornment={(p) => {
              const ref = nflPlayerRef(p.player.playerId, p.player.name);
              return ref ? <FollowToggle entity={ref} variant="compact" size={12} /> : null;
            }}
          />
        </div>
      ) : (
        <p className="mt-3" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>{EMPTY_NOTE}</p>
      )}

      {/* P250-GD3 — NEW ARRIVALS. A player who changed clubs after his last corpus game is absent
          from BOTH share pools: gone from the old club's list, and started at zero evidence on the
          new one by the evaluated stint rule. The rule is right about what is unknown (his role
          here) — but silently omitting a star the reader came for is a product defect. His own
          prior-club per-game usage is stated as fact, with the frame that it is NOT in the
          simulated numbers above. */}
      {(() => {
        const arrivals = Object.entries(board.newArrivals ?? {})
          .filter(([t]) => (team ? t === team : true))
          .flatMap(([, list]) => list)
          .filter((a) => (q ? a.name.toLowerCase().includes(q.toLowerCase()) : true));
        if (!arrivals.length) return null;
        return (
          /*
           * ⚠ OPTIONAL, LIKE THE WITHHELD-FAMILIES BLOCK BELOW IT — and for the same reason. These
           * are per-game averages from ANOTHER CLUB IN ANOTHER SEASON. Kept, because a reader who
           * came for a player the stint rule cannot place yet should not find silence; demoted,
           * because a gold heading and a table at the same altitude as this game's forecast invite
           * a comparison between two numbers that are not comparable.
           */
          <details className="mt-4 rounded-[10px]" style={{ border: "1px solid var(--vault-rule)", padding: "10px 12px" }}>
            <summary className="font-mono uppercase tracking-[0.08em]" style={{ cursor: "pointer", minHeight: 32, fontSize: 9.5, color: "var(--vault-text-mute)" }}>
              Recent signings ({arrivals.length}) — last season&rsquo;s usage
            </summary>
            <p style={{ margin: "4px 0 8px", fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 720 }}>
              What they did per game at their last team. It is history, and none of it is in the projections above.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr>
                    {["Player", "Team", "Availability", "Last club", "Per game (prior club)"].map((h) => (
                      <th key={h} scope="col" style={{ textAlign: "left", padding: "5px 9px", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {arrivals.map((a) => (
                    <tr key={a.playerId} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                      <td style={{ padding: "7px 9px", fontSize: 13, color: "var(--vault-text)", fontWeight: 600 }}>{a.name} <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{a.position}</span></td>
                      <td className="font-mono" style={{ padding: "7px 9px", fontSize: 11, color: "var(--vault-text-mute)" }}>{a.team}</td>
                      <td className="font-mono" style={{ padding: "7px 9px", fontSize: 10.5, color: "var(--vault-text-faint)" }}>
                        {participationText(a.participation)}
                      </td>
                      <td className="font-mono" style={{ padding: "7px 9px", fontSize: 11, color: "var(--vault-text-mute)" }}>{a.lastSeason.club} · {a.lastSeason.games}g</td>
                      <td className="font-mono" style={{ padding: "7px 9px", fontSize: 12 }}>
                        {a.lastSeason.targetsPg > 0 ? `${a.lastSeason.receptionsPg} rec · ${a.lastSeason.recYdsPg} yds` : null}
                        {a.lastSeason.rushAttPg >= 1 ? `${a.lastSeason.targetsPg > 0 ? " · " : ""}${a.lastSeason.rushYdsPg} rush yds` : null}
                        {a.lastSeason.passAttPg >= 1 ? `${a.lastSeason.targetsPg > 0 || a.lastSeason.rushAttPg >= 1 ? " · " : ""}${a.lastSeason.passYdsPg} pass yds` : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })()}

      {withheld.length ? (
        <details className="mt-3" style={{ border: "1px solid var(--vault-rule)", borderRadius: 10, padding: "8px 12px" }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--vault-text-mute)", minHeight: 32 }}>
            Families not shown, and the exact bar each failed ({withheld.length})
          </summary>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
            {withheld.map(([key, f]) => (
              <li key={key} style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)" }}>
                {/* A raw family key is not a reader-facing label (player_pass_int shipped without one). */}
                <strong style={{ color: "var(--vault-text-mute)" }}>{f.label && f.label !== key ? f.label : key.replace(/^player_/, "").replace(/_/g, " ").replace(/\bint\b/, "interceptions")}:</strong> {f.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}


    </div>
  );
}
