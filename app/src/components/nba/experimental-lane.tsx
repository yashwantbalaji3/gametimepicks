/**
 * THE NBA OFFICIAL FORECASTS — the /nba section (founder decision 2026-10-20 · preregistration §12 look 5 · §13; one
 * table row per game since the founder mandate of 2026-10-24, the matchup cards now being today's games above it).
 *
 * Renders ONLY the canonical snapshot (public/data/nba/experimental-public/latest.json, built from receipt-verified
 * pre-tip forecasts by scripts/nba/build-nba-experimental-public.mjs). Every block names its source; the Elo side and
 * the v0.1 player medians are shown as the two separate components they are. No probability, no percentage, no team
 * score, no range, no odds, no ranking and no pick vocabulary reaches the page (lane tests pin each) — with ONE
 * exception behind its switch (founder decision 2026-10-23): the Elo rating's game-winner probability, separately
 * identified, from the shared accessor (components/nba/elo-win-probability.tsx), with its accuracy disclosure.
 *
 * Time words are absolute: a frozen pregame forecast reads the same before tip, during the game and after it — the
 * page never calls it live.
 */
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { LANE, STATS, LANE_SNAPSHOT_SCHEMA, AMENDMENT_A, laneIsCurrent } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { THEATER_LINK_TEXT, publicTheaterHref } from "@/lib/simulation-theater/nba/possession/public-route.mjs";
import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import { NBA_FORECAST_DISCLOSURE, PUBLIC_TERMS } from "@/lib/public-registry";
import GameStatusOnClock from "@/components/nba/projection-game-status";
import { EloAccuracyDisclosure, EloWinProbability, type EloCtx } from "@/components/nba/elo-win-probability";
import { ELO_WIN_PROBABILITY_LABEL, eloWinProbabilityOf } from "@/lib/sports/nba/elo-win-probability.mjs";
import { loadEloWinProbabilityContext } from "@/lib/sports/nba/elo-win-probability-context.mjs";

/** Lane `players.unavailable` row (PR 1230): name and reason only, never a number. Release H integration: one shape for
 *  the hub and the Theater's Official Forecast panel (official-predictions.tsx LaneUnavailable). */
export type LaneUnavailablePlayer = { providerAthleteId: string; name: string | null; position?: string | null; state: string; reason: string; status?: string | null };

type Row = { providerAthleteId: string; name: string | null; expectedMinutes: number | null; injuryStatus: string | null; medians: Record<string, number | null>; comboMedians?: Record<string, number | null> };
type Game = {
  providerEventId: string; tipUtc: string; frozenAt: string;
  away: { abbr: string | null; name: string | null }; home: { abbr: string | null; name: string | null };
  receipt: { modelVersion: string; payloadSha256: string };
  engine: { simulation: string | null; simulations: number | null };
  elo: { favoured: string | null; state: string; source: string; rule?: string | null; winProbability?: { home: number; away: number; provenance: Record<string, string | null> } };
  teamScores: { state: string; reason: string };
  /** `unavailable` (PR 1230): rostered players with no projection — a reason, never a number. Absent on older slates. */
  players: { source: string; comboSource?: string; away: Row[]; home: Row[]; unavailable?: { away: LaneUnavailablePlayer[]; home: LaneUnavailablePlayer[] } };
};
export type Snapshot = { schema: string; label: string; validation: string; date: string | null; withheld: Record<string, string>; games: Game[]; excluded: { providerEventId: string; reason: string }[] };

/** The lane to show at `etDate`: null when disabled, missing, or its slate is in the past (never shown as current). */
export function loadCurrentLane(etDate: string): Snapshot | null {
  const s = loadExperimentalSnapshot();
  return s && laneIsCurrent(s, etDate) ? s : null;
}

export function loadExperimentalSnapshot(): Snapshot | null {
  if (!LANE.enabled) return null;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "nba", "experimental-public", "latest.json"), "utf8"));
    return s?.schema === LANE_SNAPSHOT_SCHEMA && Array.isArray(s.games) ? s : null;
  } catch {
    return null;
  }
}

/* ── Dated snapshots (follow-up to PR 1163: /nba/projections/[date]) ──────────────────────────────────────────────────
   The producer (scripts/nba/build-nba-experimental-public.mjs) writes <date>.json beside latest.json, write-once per
   slate. A dated file counts only when it parses, carries the lane schema, and names the SAME date as its file name —
   so a date in the list is always a slate whose snapshot is committed, never a guess. */
const LANE_DIR = () => path.join(process.cwd(), "public", "data", "nba", "experimental-public");
const DATED = /^(\d{4}-\d{2}-\d{2})\.json$/;

function readDated(date: string): Snapshot | null {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(LANE_DIR(), `${date}.json`), "utf8"));
    return s?.schema === LANE_SNAPSHOT_SCHEMA && s.date === date && Array.isArray(s.games) ? s : null;
  } catch {
    return null;
  }
}

/** Every slate date with a committed, schema-valid dated snapshot, ascending. Empty when the lane switch is off. */
export function committedLaneDates(): string[] {
  if (!LANE.enabled) return [];
  let names: string[] = [];
  try { names = fs.readdirSync(LANE_DIR()); } catch { return []; }
  return names.map((n) => DATED.exec(n)?.[1]).filter((d): d is string => !!d && readDated(d) != null).sort();
}

/** The committed snapshot for one slate date, exactly as frozen — null when the switch is off or no valid file exists. */
export function loadLaneForDate(date: string): Snapshot | null {
  if (!LANE.enabled || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return readDated(date);
}

const et = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";
const slateLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
const fmt = (v: number | null) => (v == null ? "—" : String(v));

/* One class string per table (descendant variants) instead of per-cell attributes: the rows are inlined twice (HTML +
   RSC payload), so per-cell classes cost ~2× their length per cell on a page that sits at its weight budget. */
const TABLE = "w-full text-[12.5px] [&_th]:font-medium [&_th]:text-right [&_th:first-child]:text-left [&_td]:text-right [&_td]:tabular-nums [&_td:first-child]:text-left [&_td]:px-1 [&_th]:px-1";

function TeamTable({ team, rows }: { team: string; rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className={TABLE}>
        <caption className="text-left font-semibold pb-1">{team}</caption>
        <thead><tr><th>Player</th><th>Min</th>{STATS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.providerAthleteId}>
              <td>{r.name}{r.injuryStatus ? ` · ${r.injuryStatus}` : ""}</td>
              <td>{fmt(r.expectedMinutes)}</td>
              {STATS.map(([k]) => <td key={k}>{fmt(r.medians[k])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const favouredName = (g: Game) => (g.elo.favoured === g.home.abbr ? g.home.name : g.elo.favoured === g.away.abbr ? g.away.name : null) ?? g.elo.favoured;
export const laneCardId = (id: string) => `nba-exp-${id}`;
/** The snapshot's own team code (ESPN's: "WSH", "NY", "GS") — the code every NBA surface prints, the hub's cards included. */
const code = (abbr: string | null) => abbr ?? "—";

/** Rostered players the forecast lists as "projection unavailable" (PR 1230) — counted, never given a number. */
const unavailableCount = (g: Game) => (g.players.unavailable?.away.length ?? 0) + (g.players.unavailable?.home.length ?? 0);

/** The game's row in the hub's Official Forecasts table — today's game card links here when no Game Simulation page is built. */
export const forecastRowId = (id: string) => `nba-fc-${id}`;

/**
 * The game's Theater link — only when /nba/simulation/<id>/ is built (`theaterIds` = public-route publicTheaterRouteIds).
 * next/link, as /nfl links its game pages (release owner 2026-10-22): a plain <a> made a full page load, which aborted
 * the hub's in-flight route prefetches, and Next logged "Failed to fetch RSC payload" ~5× per click. prefetch={false}:
 * a ~190 KB Theater page is fetched on click only, never for every card in view.
 */
function TheaterLink({ id, theaterIds }: { id: string; theaterIds: readonly string[] }) {
  if (!theaterIds.includes(id)) return null;
  return <p className="m-0"><Link href={publicTheaterHref(id)} prefetch={false} className="gtp-ev-cta inline-flex items-center rounded-full px-4 text-[13px] font-semibold no-underline" data-nba-theater-link={id}>{THEATER_LINK_TEXT}</Link></p>;
}

/* ── THE MATCHUP CARD (NBA UI parity 2026-10-22) ──────────────────────────────────────────────────────────────────────
   The shared hub card language (components/sport-hub/game-summary.tsx EventCard: .gtp-ev panel, crest per side, status
   chip, read box, ONE action link — "the action is a link, not a row click") in the NBA's compact weight: the card is
   one article with at most one interactive target, the Theater link, present only when that page is built. Status is
   never a build-time "Upcoming" that goes stale: a recorded final / postponement is printed as such, anything else is
   the reader's clock (GameStatusOnClock — Upcoming until the tip instant, then Started; never Final or Live). */
export type MatchupCardGame = {
  id: string; tipUtc: string;
  /** `logo` is the ESPN abbreviation TeamLogo resolves (the lane's / registry's own code) or null — never guessed. */
  away: { abbr: string; name: string | null; logo: string | null }; home: { abbr: string; name: string | null; logo: string | null };
  /** "final" / "postponed" from the committed record; anything else reads on the reader's clock. */
  status: "upcoming" | "final" | "postponed";
};

const Crest = ({ team, on }: { team: MatchupCardGame["home"]; on: boolean }) =>
  /* Decorative (ariaLabel ""): the abbreviation beside it names the team. The identity component owns the CDN host and
     the monogram fallback when a crest fails to load. */
  team.logo ? <TeamLogo team={team.logo} sport="nba" size="sm" highlight={on} ariaLabel="" /> : <span />;

/* WEIGHT: this card repeats per game on a page with a 250 KB ceiling (experimental-public-lane.test pins < 900 B of HTML
   a card): one class per element, styling in globals.css (.nbx-*), no per-card label the heading already says. */
export function MatchupCard({ game: g, favoured = null, children }: { game: MatchupCardGame; favoured?: string | null; children: React.ReactNode }) {
  return (
    <article id={laneCardId(g.id)} className="nbx-card">
      <p className="nbx-top"><span>{et(g.tipUtc).replace(/^[A-Z][a-z]{2} \d+, /, "")}</span><span className="nbx-chip">{g.status === "final" ? "Final" : g.status === "postponed" ? "Postponed" : <GameStatusOnClock t={g.tipUtc} />}</span></p>
      <h3 className="nbx-match"><Crest team={g.away} on={favoured === g.away.abbr} /><b data-on={favoured === g.away.abbr ? "" : undefined}>{g.away.abbr}</b><i>@</i><b data-on={favoured === g.home.abbr ? "" : undefined}>{g.home.abbr}</b><Crest team={g.home} on={favoured === g.home.abbr} /></h3>
      {children}
    </article>
  );
}

export default function NbaExperimentalLane({ snapshot, statuses = {}, theaterIds = [], eloCtx }: { snapshot: Snapshot | null; statuses?: Record<string, string>; theaterIds?: readonly string[]; eloCtx?: EloCtx }) {
  if (!snapshot || snapshot.games.length === 0) return null;
  const elo = eloCtx ?? loadEloWinProbabilityContext();
  // the Elo-derived estimate gets a column only when at least one game's receipt carries it (the accessor's own refusal)
  const eloCol = snapshot.games.some((g) => eloWinProbabilityOf(g, { enabled: elo.enabled }) != null);
  const versions = [...new Set(snapshot.games.map((g) => g.receipt.modelVersion))];
  return (
    <section className="flex flex-col gap-3" aria-labelledby="nba-forecast-h">
      <h2 id="nba-forecast-h" className="m-0 font-display text-[18px] font-bold" style={{ color: "var(--vault-text)" }}>{PUBLIC_TERMS.OFFICIAL_FORECAST}s{snapshot.date ? ` · ${slateLabel(snapshot.date)}` : ""}</h2>
      {/* founder directive 2026-10-23 public readiness: the Official Forecast, with its ONE disclosure (frozen, not a
          recommendation, Model Performance status from lib/public-registry.ts) — no per-card doubt */}
      <div className="rounded-lg p-3" style={{ border: "2px solid var(--vault-gold-bright)", background: "var(--vault-panel)" }} role="note">
        <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{NBA_FORECAST_DISCLOSURE}</p>
      </div>
      {AMENDMENT_A.enabled ? (
        /* COMPACT HUB (release owner 2026-10-21 · founder mandate 2026-10-24). The player rows live on /nba/projections only
           (full per-team tables measured /nba at 388 KB for an 11-game slate); here each game is ONE table row — the
           favoured side, the Elo-derived estimate where the receipt carries it, the board size and the freeze time.
           Today's game cards above link to the row (or to the game's full forecast on its Game Simulation page). */
        <>
          <div className="nbx-scroll" role="region" aria-label={`${PUBLIC_TERMS.OFFICIAL_FORECAST} for each game`} tabIndex={0}>
            <table className="nbx-ftable">
              <caption className="sr-only">{PUBLIC_TERMS.OFFICIAL_FORECAST} for each game</caption>
              <thead><tr><th scope="col">Game</th><th scope="col">Favoured side</th>{eloCol ? <th scope="col">{ELO_WIN_PROBABILITY_LABEL}</th> : null}<th scope="col">Players</th><th scope="col">Frozen</th></tr></thead>
              <tbody>
                {snapshot.games.map((g) => (
                  <tr key={g.providerEventId} id={forecastRowId(g.providerEventId)}>
                    <th scope="row">{code(g.away.abbr)} @ {code(g.home.abbr)}</th>
                    <td><strong>{favouredName(g) ?? "Neither side"}</strong></td>
                    {eloCol ? <td><EloWinProbability game={g} ctx={elo} /></td> : null}
                    <td>{g.players.away.length + g.players.home.length}{unavailableCount(g) ? ` · ${unavailableCount(g)} without a projection` : ""}</td>
                    <td>{et(g.frozenAt).replace(/^[A-Z][a-z]{2} \d+, /, "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
            The favoured side comes from a team rating (Elo) updated after every game. Each player&rsquo;s {PUBLIC_TERMS.PLAYER_STATISTICS} are
            medians of 10,000 simulated games — every player is on the <Link href="/nba/projections/" className="underline nbx-inl">player projections
            board</Link>, listed by expected minutes, not ranked.
            {snapshot.games.some(unavailableCount) ? " A rostered player without a projection — ruled out, a rookie, too little history or too few expected minutes — is listed there with the reason, never as zero." : ""}
          </p>
        </>
      ) : (
        snapshot.games.map((g) => (
          <article key={g.providerEventId} id={forecastRowId(g.providerEventId)} className="scroll-mt-24 flex flex-col gap-2 rounded-lg p-3" style={{ border: "1px solid var(--vault-border)" }} aria-label={`${g.away.abbr} at ${g.home.abbr}, frozen pregame forecast`}>
            <header className="flex flex-col gap-0.5">
              <h3 className="m-0 text-[15px] font-bold" style={{ color: "var(--vault-text)" }}>{g.away.name} at {g.home.name}</h3>
              <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
                Tip-off {et(g.tipUtc)} · frozen pregame forecast, frozen {et(g.frozenAt)}
              </p>
              {statuses[g.providerEventId] ? <p className="m-0 text-[12px]" style={{ color: "var(--vault-text)" }}>Game status: {statuses[g.providerEventId]}</p> : null}
            </header>
            <p className="m-0 text-[13px]" style={{ color: "var(--vault-text)" }}>
              <strong>Elo rating favours {favouredName(g) ?? "neither side"}.</strong>{" "}
              <span style={{ color: "var(--vault-text-mute)" }}>Source: {g.elo.source}.</span>
            </p>
            <EloWinProbability as="p" className="m-0 text-[13px]" game={g} ctx={elo} />
            <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>Team scores: {g.teamScores.reason}</p>
            <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
              Player medians — source: {g.players.source}. Players listed by expected minutes, not ranked.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <TeamTable team={g.away.name ?? g.away.abbr ?? "Away"} rows={g.players.away} />
              <TeamTable team={g.home.name ?? g.home.abbr ?? "Home"} rows={g.players.home} />
            </div>
            <p className="m-0 text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
              Receipt {g.receipt.modelVersion} · {g.receipt.payloadSha256.slice(0, 12)} · simulation engine {g.engine.simulation}
            </p>
            <TheaterLink id={g.providerEventId} theaterIds={theaterIds} />
          </article>
        ))
      )}
      <EloAccuracyDisclosure games={snapshot.games} ctx={elo} className="m-0 text-[12px] leading-relaxed" />
      {/* the snapshot's own statements of what is not published, and why — honest disclosures, printed as frozen */}
      <ul className="m-0 pl-5 text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        {Object.entries(snapshot.withheld).map(([k, v]) => <li key={k}>{v}</li>)}
      </ul>
      {/* founder mandate 2026-10-24: model ids, sources and receipts move here — out of the consumer text, never deleted */}
      <details className="nbx-details">
        <summary>Model details</summary>
        <ul className="nbx-md">
          <li>Favoured side: {snapshot.games[0]?.elo.source}</li>
          <li>{PUBLIC_TERMS.PLAYER_STATISTICS}: {snapshot.games[0]?.players.source}</li>
          <li>Model version: {versions.join(", ")}</li>
          <li>Receipts (payload hash of each frozen forecast): {snapshot.games.map((g) => `${code(g.away.abbr)} @ ${code(g.home.abbr)} ${g.receipt.payloadSha256.slice(0, 12)}`).join(" · ")}</li>
        </ul>
      </details>
    </section>
  );
}
