/**
 * SimulateLobby — the unified "simulate today's games" board across every sport in one place. Aggregates
 * today's games from World Cup + MLB + NBA + UFC into one filterable board; each card links into the sport
 * hub, the game simulation/report, and the Build betslip. Public data only; static-export compatible.
 *
 * Mounted at BOTH `/simulate` (the clear user-facing route) and `/games` (kept for compatibility) — one
 * component, no duplicated logic. Never touches money; reads committed artifacts only.
 */
import { currentEtDate, daysOldVs } from "@/lib/freshness";
import { teamByName } from "@/lib/data-world-cup";
import { loadWorldCupProjections } from "@/lib/world-cup/projections";
import { getMlbBoardForDate, activeMlbDate } from "@/lib/data-mlb";
import { getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import { formatTipoffEt } from "@/lib/format-mlb";
import { mlbTeamLogoUrl } from "@/lib/player-headshots";
import { normalizeMlbLeans, normalizeNbaLeans } from "@/lib/normalize";
import fs from "node:fs";
import path from "node:path";
import { type GameRow } from "@/components/games-experience";
import SportSelector, { type SportState, type SportStateTone } from "@/components/games/sport-selector";
import MatchupIdentity from "@/components/ui/matchup-identity";
import SectionHeader from "@/components/section-header";
import FreshnessBadge from "@/components/ui/freshness-badge";
import { buildAllGameDetails, detailByMatchId } from "@/lib/game-detail";
import Link from "next/link";
import { loadRoundOf32Board } from "@/lib/world-cup/round-of-32";
import { gameScriptFromBoard } from "@/lib/world-cup/game-script";
import { scriptSignal, topPropSignal } from "@/lib/games-board-signal";
import { getSportIdentity } from "@/lib/sport-identity";
import { nflSimulateEligibility } from "@/lib/sports/nfl/simulate-eligibility";
import { loadEplForecasts, reportableRows, eplMatchHref } from "@/lib/sports/epl/forecast-view";
import { featuredSimulations } from "@/lib/simulate-lobby-featured";
import { mlbAvailabilityBadges, worldCupAvailabilityBadges } from "@/lib/simulate-availability";
import type { PublicProjection } from "@/lib/normalize";

/** Group projections by their game key (matchId) for per-game top-prop selection. */
function groupByGame(projections: PublicProjection[]): Map<string, PublicProjection[]> {
  const m = new Map<string, PublicProjection[]>();
  for (const p of projections) {
    const k = String(p.matchId ?? "");
    if (!k) continue;
    m.set(k, [...(m.get(k) ?? []), p]);
  }
  return m;
}

function countBy<T>(items: T[], key: (t: T) => string | number | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k == null) continue;
    m.set(String(k), (m.get(String(k)) ?? 0) + 1);
  }
  return m;
}

/** ET kickoff for an NFL row — same clock rule the NFL hub uses, stated once here. */
const formatNflKickoff = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";

/* EPL fixtures span Friday to Monday, so the day is part of the label rather than just the time. */
const formatEplKickoff = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";

export default function SimulateLobby() {
  const today = currentEtDate();
  const rows: GameRow[] = [];
  // Fixture detail pages (real data only) — link "View game" + the exact build URL when present.
  const detailMap = new Map(buildAllGameDetails().map((d) => [`${d.sport}/${d.slug}`, d]));

  // World Cup — driven by the CANONICAL projection-backed game details (same source as /world-cup and
  // the game-detail pages): real team names, real kickoff, the exact game-detail slug. The bracket
  // schedule carries PLACEHOLDER teams for knockout fixtures (home/away null), so using it produced
  // "undefined vs undefined" — it must NOT power the matchup label. Started/finished games are excluded.
  // Load the knockout board ONCE — reused for both the per-game model-read signal (below) and the
  // Round-of-32 board banner (near the bottom of the page), so the artifact is read a single time.
  const r32Board = loadRoundOf32Board();
  const wcProj = loadWorldCupProjections();
  const wcKickoff = new Map<string, string>();
  for (const m of wcProj?.matches ?? []) if (m.matchId != null && m.kickoffUtc) wcKickoff.set(String(m.matchId), m.kickoffUtc);
  const nowMs = Date.now();
  for (const d of detailMap.values()) {
    if (d.sport !== "world_cup") continue;
    const ko = d.matchId != null ? wcKickoff.get(String(d.matchId)) : null;
    if (ko && Date.parse(ko) <= nowMs) continue; // never list a started/finished game as active
    const etTime = ko
      ? new Date(ko).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }) + " ET"
      : "";
    rows.push({
      id: `wc_${d.matchId ?? d.slug}`,
      sport: "world_cup",
      sportLabel: "World Cup",
      matchup: d.title || `${d.homeTeam} vs ${d.awayTeam}`,
      timeLabel: etTime,
      statusLabel: "Upcoming",
      projections: d.teamProjections.length,
      props: d.playerProps.length,
      homeCode: teamByName(d.homeTeam ?? "")?.code ?? "",
      awayCode: teamByName(d.awayTeam ?? "")?.code ?? "",
      homeLogo: d.homeLogo ?? null,
      awayLogo: d.awayLogo ?? null,
      href: "/world-cup?tab=games",
      buildHref: d.buildUrl ?? `/build?sport=world_cup&game=${encodeURIComponent(String(d.matchId ?? ""))}`,
      detailHref: `/games/world-cup/${d.slug}`,
      // The board's coherent game-script for this fixture (winner + projected score + confidence) — the
      // SAME read the knockout board / game-detail render, never fabricated. Undefined when no live read.
      signal: scriptSignal(gameScriptFromBoard(r32Board, d.homeTeam ?? "", d.awayTeam ?? "")) ?? undefined,
      // Artifact-backed availability chips (market-implied 90' modules + expanded markets). Never a
      // run-count claim for soccer; only markets the de-vigged Game Center / expanded artifact carry.
      availabilityBadges: worldCupAvailabilityBadges(d),
    });
  }

  // MLB
  const mlbDate = activeMlbDate() ?? today;
  const mlbBoard = getMlbBoardForDate(mlbDate);
  const mlbProjs = normalizeMlbLeans(mlbBoard as Parameters<typeof normalizeMlbLeans>[0]);
  const mlbByGame = countBy(mlbProjs, (l) => l.matchId);
  const mlbPropsByGame = groupByGame(mlbProjs);
  // Bridge gamePk → optimizer gameId (hash) via the leans so "Build from this game" deep-links to
  // exactly that game's legs (build legs key on the hash, board games key on gamePk).
  const mlbGameIdByPk = new Map<string, string>();
  for (const l of (mlbBoard.leans ?? []) as Array<{ gamePk?: number | string; gameId?: string }>) {
    if (l.gamePk != null && l.gameId) mlbGameIdByPk.set(String(l.gamePk), l.gameId);
  }
  for (const g of mlbBoard.games ?? []) {
    const gid = mlbGameIdByPk.get(String(g.gamePk));
    // Resolve by the stable gamePk (unique) — never by the team+date base slug, which collides on doubleheaders.
    const mlbDetail = detailByMatchId("mlb", g.gamePk);
    rows.push({
      id: `mlb_${g.gamePk ?? `${g.awayTeamAbbr}-${g.homeTeamAbbr}`}`,
      sport: "mlb",
      sportLabel: "MLB",
      homeLogo: mlbTeamLogoUrl(g.homeTeamId),
      awayLogo: mlbTeamLogoUrl(g.awayTeamId),
      matchup: `${g.awayTeamAbbr ?? "?"} @ ${g.homeTeamAbbr ?? "?"}`,
      timeLabel: `${formatTipoffEt(g.gameDate)}${g.venue ? " · " + g.venue : ""}`,
      statusLabel: mlbDate === today ? "Today" : mlbDate.slice(5),
      projections: mlbByGame.get(String(g.gamePk)) ?? 0,
      href: "/mlb?tab=games",
      buildHref: gid ? `/build?sport=mlb&game=${encodeURIComponent(gid)}` : "/build?sport=mlb",
      detailHref: mlbDetail ? `/games/mlb/${mlbDetail.slug}` : undefined,
      // A ready deterministic simulation artifact exists for this game → surface a "Simulation Ready" badge
      // (drives the simulate-first lobby). Real status from the game-detail view; never fabricated.
      simReady: mlbDetail?.gameLabSimulation?.status === "ready",
      // The game's single highest MARKET-implied prop (labelled "mkt", never a model claim).
      signal: topPropSignal(mlbPropsByGame.get(String(g.gamePk)) ?? []) ?? undefined,
      // Artifact-backed availability chips (run-count sim + de-vigged team markets + player props).
      // The run-count label is read from the artifact by the loader, never hardcoded here. Only
      // emitted when the joined detail genuinely carries each module; empty when no detail.
      availabilityBadges: mlbDetail ? mlbAvailabilityBadges(mlbDetail) : undefined,
    });
  }

  // NBA (latest slate with leans) — ONLY when the board is recent. NBA is off-season after the Finals;
  // a weeks-old "Finals" board must never appear under "Tonight's games" (mirrors the UFC settled-event
  // gate below and the MLB/WC started-game exclusion). Stale board → no NBA rows.
  let nbaDate = "";
  for (const d of getAvailableBoardDates()) if ((getBoardForDate(d).leans?.length ?? 0) > 0) nbaDate = d;
  const nbaFresh = !!nbaDate && daysOldVs(nbaDate, today) <= 2;
  const nbaBoard = nbaFresh ? getBoardForDate(nbaDate) : undefined;
  const nbaProjs = normalizeNbaLeans(nbaBoard as Parameters<typeof normalizeNbaLeans>[0]);
  const nbaByGame = countBy(nbaProjs, (l) => l.matchId);
  const nbaPropsByGame = groupByGame(nbaProjs);
  for (const g of nbaBoard?.games ?? []) {
    const nbaDetail = detailByMatchId("nba", g.gameId);
    rows.push({
      id: `nba_${g.gameId}`,
      sport: "nba",
      sportLabel: "NBA",
      matchup: `${g.awayTeamAbbr ?? "?"} @ ${g.homeTeamAbbr ?? "?"}`,
      timeLabel: nbaDate ? nbaDate.slice(5) : "",
      statusLabel: "Finals",
      projections: nbaByGame.get(String(g.gameId)) ?? 0,
      href: "/nba?tab=games",
      buildHref: g.gameId ? `/build?sport=nba&game=${encodeURIComponent(g.gameId)}` : "/build?sport=nba",
      detailHref: nbaDetail ? `/games/nba/${nbaDetail.slug}` : undefined,
      // The game's single highest MARKET-implied prop (labelled "mkt", never a model claim).
      signal: topPropSignal(nbaPropsByGame.get(String(g.gameId)) ?? []) ?? undefined,
    });
  }

  // ── NFL (P178-A) ──────────────────────────────────────────────────────────────────────────────
  // The founder's defect: /simulate listed Today, MLB, NBA, NHL and UFC while live NFL simulations
  // existed only behind /nfl. Every NFL number below — rows, card count, chip count, ready count —
  // comes from ONE selector, so they cannot disagree with each other or with /nfl.
  const nflEligibility = nflSimulateEligibility();
  for (const e of nflEligibility.events) {
    rows.push({
      id: `nfl_${e.providerEventId}`,
      sport: "nfl",
      sportLabel: "NFL",
      matchup: `${e.away.abbr} @ ${e.home.abbr}`,
      timeLabel: formatNflKickoff(e.kickoffUtc),
      // P179-A0: BASELINE ONLY is the honest label while the engine has no event-specific signal.
      // Ten games rendering 19-18 under a green "Simulation Ready" badge told a reader they were
      // looking at ten game-specific model reads. They were looking at one shared prior ten times.
      statusLabel: e.lifecycle === "STARTED" ? "Kicked off · locked" : e.simulationReady ? "Upcoming" : "BASELINE ONLY",
      // The simulation's own outputs, not a prop count: NFL publishes team distributions, and the
      // Vault's player rows are candidates rather than published projections.
      projections: 0,
      props: e.playerCandidates,
      href: "/nfl",
      buildHref: "/build",
      // The NATIVE per-game report P177 built — not a /games/* slug NFL does not have.
      detailHref: e.reportHref,
      // Drives the green SIMULATION READY badge. Read from the artifact's own signal state — the
      // previous `simReady: true` said "a file exists", which is not the same claim.
      simReady: e.simulationReady,
      // "script" is the coherent model read (renders as "Model read"), which is exactly what an NFL
      // forecast is: one joint distribution, not a top prop. Confidence is LOW and always will be
      // while the model is an experimental preseason beta held near a coin flip.
      // Lead with the RANGE, not the rounded scoreline. A single "19-18" reads as a specific
      // prediction; the interval is what this model actually produces, and it is wide.
      signal: {
        kind: "script",
        pick: e.simulationReady
          ? `${e.away.abbr} ${e.projectedScore.away} — ${e.projectedScore.home} ${e.home.abbr}`
          : `Total likely ${e.total.p10}–${e.total.p90}`,
        sub: e.simulationReady
          ? `total ${e.total.median} · ${e.home.abbr} ${(e.winProbability.home * 100).toFixed(1)}% to win`
          : `baseline only · near a coin flip either way`,
        confidence: "Low",
      },
    });
  }

  // UFC (one event row) — only when there is a real UPCOMING card. Once the
  // event is officially settled it belongs in /results, not the games board, so
  // a finished card (e.g. UFC 250) never lingers as "Upcoming".
  try {
    let ufcDone = false;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "results-settled-latest.json"), "utf8"));
      ufcDone = s?.status === "final";
    } catch { /* no settlement file → treat as not settled */ }
    const proj = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", "projections-latest.json"), "utf8"));
    if (!ufcDone && proj?.moneylineV1Ready && Array.isArray(proj.projections) && proj.projections.length > 0) {
      rows.push({
        id: "ufc_event",
        sport: "ufc",
        sportLabel: "UFC",
        matchup: proj.eventName ?? "Next UFC card",
        timeLabel: "Moneyline model",
        statusLabel: "Upcoming",
        projections: proj.projections.length,
        href: "/ufc?tab=fight-card",
        buildHref: "/picks",
      });
    }
  } catch {
    /* no-op */
  }

  /*
   * ── EPL (P188) ────────────────────────────────────────────────────────────────────────────────
   * The Simulation Hub listed MLB, NBA, NFL and UFC while nine per-fixture Premier League
   * distributions existed only behind /epl — the same absence P178-A found for NFL. Every number
   * below comes from the SAME committed artifact /epl and /epl/match/[slug] read, through the same
   * loader, so the hub cannot report a different fixture count from the page it links to.
   *
   * `simReady` is the ladder's own verdict, not the presence of a file: only CURRENT_PRE_EVENT rows
   * carrying probabilities qualify, which is exactly the set that has a report page. The tenth
   * opening fixture is READY_EXCEPT_ODDS and is deliberately NOT listed as ready.
   *
   * Unlike MLB and NFL this model is NOT sampled — it evaluates an exact score matrix — so no
   * run-count chip is emitted for EPL anywhere. Borrowing that vocabulary would claim a method the
   * sport does not use.
   */
  const eplSet = loadEplForecasts();
  for (const r of reportableRows(eplSet)) {
    const home = r.homeClub ?? r.matchup.split(" v ")[0];
    const away = r.awayClub ?? r.matchup.split(" v ")[1];
    const kickoff = Date.parse(r.kickoffUtc);
    rows.push({
      id: `epl_${r.slug}`,
      sport: "epl",
      sportLabel: "EPL",
      matchup: `${home} v ${away}`,
      timeLabel: formatEplKickoff(r.kickoffUtc),
      statusLabel: Number.isFinite(kickoff) && kickoff <= Date.now() ? "Kicked off · locked" : "Upcoming",
      /* The distribution is the product; EPL publishes no player projections, so this is honestly 0. */
      projections: 0,
      href: "/epl",
      buildHref: "/build",
      detailHref: eplMatchHref(r.slug as string),
      /*
       * READ FROM THE ROW, not asserted. `reportableRows` has already filtered to exactly this
       * condition, so a literal `true` would have been correct today and still wrong — it is the
       * shape P179 banned, where a badge stops tracking the artifact it claims to describe. The
       * guard caught it here. Stated as the condition, it stays true only while it is true.
       */
      simReady: r.state === "CURRENT_PRE_EVENT" && r.probs != null,
      signal: {
        kind: "script",
        pick: `${home} ${Math.round(r.probs!.home * 100)}% · draw ${Math.round(r.probs!.draw * 100)}% · ${away} ${Math.round(r.probs!.away * 100)}%`,
        sub: r.coldStart?.home || r.coldStart?.away
          ? "league-average baseline on one side — newly promoted club"
          : `${r.expectedGoals?.toFixed(2) ?? "—"} expected goals · not validated out of sample`,
        confidence: "Low",
      },
    });
  }

  const activeSports = new Set(rows.map((r) => r.sport)).size;
  /*
   * Sports that are actually SIMULATING, which is not the same as sports on the board. The header
   * chip read `activeSports` beside "15 simulation-ready" and said "2 sports live" while one sport
   * carried every one of those fifteen — the pair invited the reading that the other sport's games
   * were pending rather than a different product.
   */
  const simulatingSports = new Set(rows.filter((r) => r.simReady).map((r) => r.sport)).size;

  // Featured simulations — the deterministic short list of games with a READY artifact, sorted by
  // their strongest generated-pick edge (see @/lib/simulate-lobby-featured). Currently MLB is the only
  // sport that carries a joined `gameLabSimulation`; the selector is honest either way (empty ⇒ empty
  // state, never fabricated cards). Reuses the SAME details the rows above are built from — now the
  // details ALSO thread through each fixture's real team logos so the featured cards can show them.
  const { featured, readyCount, allCurrent } = featuredSimulations([...detailMap.values()], today);
  /** Every row on this board that carries a ready simulation — the one number every surface reads. */
  const boardReadyCount = rows.filter((r) => r.simReady).length;
  const overflowReady = Math.max(0, readyCount - featured.length);

  // ── SPORT-FIRST SELECTOR STATES ──
  // Every state/count below is DERIVED FROM THE REAL PER-SPORT DATA the rows above are built from — never
  // a hardcoded "active". A sport is only "active" when its board/sim artifacts genuinely exist; World
  // Cup is honestly flagged as carrying NO simulation artifact (soccer sims are never faked); NBA reads
  // "off-season" unless a fresh board exists; NHL has no provider wired ("provider pending"); UFC is
  // conditional on a real upcoming card. Counts (games / simulation-ready) come straight from `rows`.
  // ── UFC — tonight's card, from the SAME artifact /ufc renders ──────────────────────────────────
  // The lobby used to hard-code "no current card" for UFC because no source fed it. It now reads the
  // card artifact, so a live card appears here the moment it is built, and each bout links to the
  // page that carries its winner / method / round prediction.
  try {
    const cardPath = path.join(process.cwd(), "public", "data", "ufc", "card-latest.json");
    if (fs.existsSync(cardPath)) {
      const card = JSON.parse(fs.readFileSync(cardPath, "utf8")) as {
        event?: { name?: string; slateDate?: string };
        bouts?: Array<{
          boutId: string; weightClass: string; startUtc: string; scheduledRounds: number;
          red: { name: string; photoUrl?: string | null }; blue: { name: string; photoUrl?: string | null };
          prediction: { winner?: { name: string; probability: number } | null } | null;
        }>;
      };
      for (const b of card.bouts ?? []) {
        if (card.event?.slateDate && card.event.slateDate !== today) continue;
        rows.push({
          id: `ufc-${b.boutId}`,
          sport: "ufc",
          sportLabel: "UFC",
          matchup: `${b.red.name} vs ${b.blue.name}`,
          timeLabel: formatNflKickoff(b.startUtc),
          statusLabel: `${b.weightClass} · ${b.scheduledRounds} rounds`,
          projections: b.prediction ? 3 : 0,
          href: "/ufc/",
          buildHref: "/ufc/",
          detailHref: "/ufc/",
          homeLogo: b.blue.photoUrl ?? null,
          awayLogo: b.red.photoUrl ?? null,
          simReady: Boolean(b.prediction),
          signal: b.prediction?.winner
            ? { label: `${b.prediction.winner.name} ${Math.round(b.prediction.winner.probability * 100)}%`, tone: "info" as const }
            : undefined,
        } as GameRow);
      }
    }
  } catch { /* a missing or malformed card leaves UFC absent, exactly as before */ }

  const rowsBySport = (s: GameRow["sport"]) => rows.filter((r) => r.sport === s);
  const simReadyCountFor = (s: GameRow["sport"]) => rowsBySport(s).filter((r) => r.simReady).length;

  const mlbRows = rowsBySport("mlb");
  const wcRows = rowsBySport("world_cup");
  const nbaRows = rowsBySport("nba");
  const nflRows = rowsBySport("nfl");
  const ufcRows = rowsBySport("ufc");
  const eplRows = rowsBySport("epl");

  const eplId = getSportIdentity("epl");
  const mlbId = getSportIdentity("mlb");
  const wcId = getSportIdentity("world_cup");
  const nbaId = getSportIdentity("nba");
  const nflId = getSportIdentity("nfl");
  const nhlId = getSportIdentity("nhl");
  const ufcId = getSportIdentity("ufc");

  const mk = (
    key: SportState["key"],
    label: string,
    icon: string,
    tone: SportStateTone,
    stateLabel: string,
    gameCount: number,
    simReadyCount: number,
    note?: string,
  ): SportState => ({ key, label, icon, tone, stateLabel, gameCount, simReadyCount, note });

  const unorderedSports: SportState[] = [
    // P178-A: Today's ready count is derived from THE SAME ROWS the board renders. It previously
    // read `readyCount`, which counts joined MLB game-detail artifacts only — so the moment NFL
    // rows appeared, the aggregate would have under-reported its own board.
    mk("today", "Today", "◎", rows.length > 0 ? "active" : "conditional", rows.length > 0 ? "live slate" : "no games", rows.length, boardReadyCount),
    // MLB is active when the board carries games; sim-ready count is the real joined-artifact count.
    mlbRows.length > 0
      ? mk("mlb", mlbId.label, mlbId.icon, "active", "active", mlbRows.length, simReadyCountFor("mlb"))
      : mk("mlb", mlbId.label, mlbId.icon, "conditional", "no games", 0, 0, "No MLB board is posted for the current slate yet."),
    // World Cup: the 2026 tournament is COMPLETE — it is NOT a current simulation sport (archive only), so it
    // is omitted from the lobby entirely. Included again only if current fixtures ever exist (future tournament).
    ...(wcRows.length > 0
      ? [mk("world_cup", wcId.label, wcId.icon, "available", "fixtures", wcRows.length, 0,
          "Soccer simulations require a soccer simulation artifact — none exists yet, so World Cup fixtures show model reads (moneyline / totals / props) on the game page, not a generated simulation.")]
      : []),
    // NFL (P178-A): active ONLY when the canonical eligible set carries simulations. Its counts are
    // the SAME numbers the rows above were built from, so the card, the chip and the list agree by
    // construction rather than by three call sites happening to compute the same thing. An outage
    // reads as an outage; an empty slate reads as an empty slate; they are never merged.
    /*
     * P185-D: the comment above says NFL is active "ONLY when the canonical eligible set carries
     * simulations", and the condition is `nflRows.length > 0` — which is TRUE for a slate of games
     * that are all BASELINE ONLY. Today that is exactly the state: 15 scheduled games, zero with an
     * event-specific signal, badged with the same word as MLB's 15-of-15. The charter's rule for
     * this hub is that a schedule-only sport "cannot look active through visual polish", so the
     * state word now follows the READY COUNT rather than the row count. The sport stays listed,
     * keeps its games and its note — it just stops claiming a kind of readiness it does not have.
     */
    nflRows.length > 0
      ? mk("nfl", nflId.label, nflId.icon,
          simReadyCountFor("nfl") > 0 ? "active" : "conditional",
          simReadyCountFor("nfl") > 0 ? "active" : "baseline only",
          nflRows.length, simReadyCountFor("nfl"),
          "Experimental preseason simulations — every NFL game here carries a deterministic team distribution. The model has not been shown to beat the sportsbook market.")
      : nflEligibility.state === "ARTIFACT_UNAVAILABLE"
        ? mk("nfl", nflId.label, nflId.icon, "provider_pending", "data unavailable", 0, 0, nflEligibility.note)
        : mk("nfl", nflId.label, nflId.icon, "conditional", "no current slate", 0, 0, nflEligibility.note),
    /*
     * EPL (P188). Listed on the same terms as every other sport: the state word follows the READY
     * count, which is the rule P185-D established after NFL wore "active" on fifteen shared-prior
     * games. The note carries the one thing a reader must not have to hunt for — this model has
     * graded ZERO matches, so a rich readout is not a record.
     */
    eplRows.length > 0
      ? mk("epl", eplId.label, eplId.icon,
          simReadyCountFor("epl") > 0 ? "active" : "conditional",
          simReadyCountFor("epl") > 0 ? "active" : "no priced fixtures",
          eplRows.length, simReadyCountFor("epl"),
          "Per-fixture score distributions from an exact Poisson matrix — match result, scorelines, goals ladder and each side's goal curve. Not validated out of sample: no Premier League match has been graded under this model.")
      : mk("epl", eplId.label, eplId.icon, "conditional", "no current fixtures", 0, 0,
          "No Premier League fixtures inside the forecast window. The schedule stays on /epl."),
    // NBA: off-season unless a fresh board produced rows.
    nbaRows.length > 0
      ? mk("nba", nbaId.label, nbaId.icon, "active", "active", nbaRows.length, 0)
      : mk("nba", nbaId.label, nbaId.icon, "off_season", "off-season", 0, 0, "The NBA is off-season — no fresh board, and no simulation artifact for basketball yet."),
    // NHL: no provider wired into the lobby → honest "provider pending" (never faked availability).
    mk("nhl", nhlId.label, nhlId.icon, "provider_pending", "provider pending", 0, 0, "NHL data isn’t wired into the lobby yet — provider pending. No games or simulations to show."),
    // UFC: conditional on a real upcoming card.
    ufcRows.length > 0
      ? mk("ufc", ufcId.label, ufcId.icon, "available", "tonight's card", ufcRows.length, ufcRows.filter((r) => r.simReady).length, "Winner, method and finishing round for every bout the model can read.")
      : mk("ufc", ufcId.label, ufcId.icon, "conditional", "no current card", 0, 0, "No current UFC card. Once a real upcoming card posts, its moneyline model appears here."),
  ];

  // P178-A: order DELIBERATELY and DERIVED — Today first, then sports with a live modeled slate,
  // then everything that is merely available, then off-season / provider-pending. Hand-ordering is
  // what let NFL sit below three inactive sports while its simulations were live, and a calendar
  // literal would rot; this reads each sport's own tone instead.
  const TONE_RANK: Record<SportStateTone, number> = { active: 0, available: 1, conditional: 2, off_season: 3, provider_pending: 4 };
  const sports = [...unorderedSports].sort((a, b) => {
    if (a.key === "today") return -1;
    if (b.key === "today") return 1;
    const d = TONE_RANK[a.tone] - TONE_RANK[b.tone];
    return d !== 0 ? d : b.gameCount - a.gameCount;
  });

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <SectionHeader
        /* The page's own title, so it is the document's h1 — /simulate had no top-level heading at
           all, which leaves a screen-reader user pressing "1" with nowhere to land on the hub the
           whole product points at. SectionHeader already supports the level; it was never passed. */
        as="h1"
        eyebrow={`Simulate · ${rows.length} game${rows.length === 1 ? "" : "s"} across ${activeSports} sport${activeSports === 1 ? "" : "s"}`}
        title="Simulate Games"
        sub="Pick a game to run the model simulation — precomputed and deterministic, so everyone sees the same result. Watch a short reveal, then read the full model dashboard on the game page. Educational, paper-only."
        rightSlot={<FreshnessBadge slateDate={mlbDate} serverToday={today} noun="games" />}
      />

      {/* HERO — cinematic simulator front door: a strong headline + one honest subheadline, compact
          proof chips (active sports · simulation-ready · paper-only · deterministic), a primary CTA to
          the games and a secondary CTA to How It Works. The detailed flow lives on the game page, so the
          games are never buried. Presentation only — every count is real. */}
      <section
        data-testid="simulate-hero"
        className="relative overflow-hidden rounded-[16px] px-5 sm:px-8 py-7 sm:py-9 flex flex-col gap-5"
        style={{
          background:
            "radial-gradient(130% 130% at 0% 0%, rgba(52, 211, 153, 0.13) 0%, transparent 52%), radial-gradient(120% 120% at 100% 0%, rgba(217,164,65,0.08) 0%, transparent 55%), linear-gradient(140deg, rgba(20,20,22,0.94) 0%, rgba(10,10,11,0.97) 100%)",
          border: "1px solid var(--vault-border-strong)",
          boxShadow: "0 24px 60px -30px rgba(0,0,0,0.8)",
        }}
      >
        {/* faint field-grid texture behind the copy (decorative, motion-free) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(52, 211, 153, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(52, 211, 153, 0.05) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
            opacity: 0.5,
            maskImage: "radial-gradient(120% 100% at 0% 0%, #000 25%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(120% 100% at 0% 0%, #000 25%, transparent 80%)",
          }}
        />
        <div className="relative flex flex-col gap-3">
          <span className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.22em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>
            <span className="gtp-ember-dot" aria-hidden /> The simulator · sport → game → generate
          </span>
          {/* h2, not h3: the page's h1 is the section header above, and jumping a level leaves a
              screen-reader user's heading list with a hole where this hero should be. Purely
              semantic — the size is set by the style, not by the tag. */}
          <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(26px, 4.4vw, 40px)", lineHeight: 1.05, letterSpacing: "-0.02em", maxWidth: 760 }}>
            Simulate Today&rsquo;s Games
          </h2>
          <p style={{ color: "var(--vault-text-mute)", fontSize: "clamp(13px, 1.6vw, 15px)", lineHeight: 1.5, maxWidth: 640 }}>
            Pick a matchup to run its simulation.</p>
          <p className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11, letterSpacing: "0.01em" }}>
            precomputed · deterministic · same output for every user · paper-only
          </p>
        </div>

        {/* proof chips — active-sport count · simulation-ready count · paper-only · deterministic (all real). */}
        <div className="relative flex flex-wrap items-center gap-2">
          {[
            { v: `${simulatingSports}`, l: `sport${simulatingSports === 1 ? "" : "s"} simulating`, accent: true },
            // P178-A: the SAME derived number the Today card shows. It read `readyCount` (joined MLB
            // game-detail artifacts only), so the hero and the sport card printed two different
            // "simulation-ready" totals on one page the moment a second modeled sport appeared.
            { v: `${boardReadyCount}`, l: "simulation-ready", accent: true },
            { v: "Paper-only", l: "no real money", accent: false },
            { v: "Deterministic", l: "same for everyone", accent: false },
          ].map((c) => (
            <span
              key={c.l}
              className="inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5"
              style={{ background: "rgba(10,10,11,0.5)", border: "1px solid var(--vault-rule)" }}
            >
              <span className="font-display" style={{ color: c.accent ? "var(--vault-gold-bright)" : "var(--vault-text)", fontSize: 14, fontWeight: 800, lineHeight: 1 }}>{c.v}</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{c.l}</span>
            </span>
          ))}
        </div>

        <div className="relative flex flex-wrap items-center gap-2.5">
          <a
            href="#simulate-games"
            className="gtp-cta-lava vault-press inline-flex items-center rounded-[10px] px-5 py-2.5 font-mono uppercase tracking-[0.12em]"
            style={{ fontSize: 12, fontWeight: 700, textDecoration: "none", minHeight: 46 }}
          >
            Browse the games ↓
          </a>
          <Link
            href="/learn"
            className="vault-press inline-flex items-center rounded-[10px] px-5 py-2.5 font-mono uppercase tracking-[0.12em]"
            style={{ border: "1px solid var(--vault-border-strong)", color: "var(--vault-text-mute)", fontSize: 12, textDecoration: "none", minHeight: 46 }}
          >
            How it works →
          </Link>
        </div>
      </section>

      {/* FEATURED SIMULATIONS — ready artifacts only, strongest-edge first (deterministic), now premium
          cards WITH real team logos (MatchupIdentity → TeamMark, monogram fallback). */}
      <section data-testid="simulate-featured" className="flex flex-col gap-3.5">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.18em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>
              <span className="gtp-ember-dot" aria-hidden /> {allCurrent ? "Ready to simulate" : "Latest available slate"}
            </span>
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em" }}>
              {featured.length > 0 ? "Featured simulations" : "No featured simulations yet"}
            </span>
          </div>
          {overflowReady > 0 ? (
            <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>+{overflowReady} more ready below</span>
          ) : null}
        </div>

        {featured.length === 0 ? (
          <div data-testid="simulate-featured-empty" className="rounded-[12px] px-5 py-6 text-center flex flex-col gap-1" style={{ background: "var(--vault-panel)", border: "1px dashed var(--vault-border-strong)" }}>
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>
              No simulations are ready for today&rsquo;s slate yet
            </span>
            <span className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
              Pick any game below to see its model report.
            </span>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((f) => {
              // Honest, artifact-derived meta line: venue and/or slate date only when present.
              const dateLabel = f.date
                ? new Date(`${f.date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
                : null;
              const meta = [f.venue, dateLabel].filter(Boolean).join(" · ");
              return (
                <Link
                  key={f.slug}
                  href={f.href}
                  className="group relative overflow-hidden rounded-[16px] flex flex-col vault-glow-hover"
                  style={{ background: "var(--vault-panel-elevated)", border: "1px solid var(--vault-border-strong)", textDecoration: "none", boxShadow: "0 14px 40px -26px rgba(0,0,0,0.75)" }}
                >
                  {/* Top strip — Simulation Ready badge + sport tag over a subtle ember wash. */}
                  <div
                    className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2.5"
                    style={{ background: "radial-gradient(120% 140% at 0% 0%, rgba(52, 211, 153, 0.10) 0%, transparent 60%)" }}
                  >
                    <span
                      className="inline-flex items-center gap-1 font-mono font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full"
                      style={{ color: "var(--gtp-success-on-dark, #7ee2a8)", background: "rgba(46,160,102,0.14)", border: "1px solid rgba(46,160,102,0.4)", fontSize: 9 }}
                    >
                      <span aria-hidden>▶</span> Simulation Ready
                    </span>
                    <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>MLB</span>
                  </div>

                  {/* Matchup band — LARGE team logos (away @ home) with the matchup as the dominant line. */}
                  <div className="flex flex-col items-center gap-2.5 px-4 pb-3.5 pt-1 text-center" style={{ borderBottom: "1px solid var(--vault-rule)" }}>
                    <MatchupIdentity
                      homeName={f.teams.home}
                      awayName={f.teams.away}
                      homeLogo={f.homeLogo}
                      awayLogo={f.awayLogo}
                      size="xl"
                    />
                    <span className="font-display tracking-tight leading-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(16px, 2vw, 19px)", fontWeight: 800, letterSpacing: "-0.01em" }}>
                      {f.teams.away} <span style={{ color: "var(--vault-text-faint)", fontWeight: 600 }}>@</span> {f.teams.home}
                    </span>
                    {meta ? (
                      <span className="font-mono truncate max-w-full" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{meta}</span>
                    ) : null}
                  </div>

                  {/* Metadata + strongest-lean preview + a high-contrast Generate CTA. */}
                  <div className="flex flex-col gap-2.5 px-4 py-3.5 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono" style={{ fontSize: 10.5 }}>
                      {f.runCountLabel ? <span style={{ color: "var(--vault-text-mute)" }}>{f.runCountLabel}</span> : null}
                      <span style={{ color: "var(--vault-text-mute)" }}>{f.pickCount} generated pick{f.pickCount === 1 ? "" : "s"}</span>
                      {f.pickCount > 0 && f.topEdgePct > 0 ? (
                        <span style={{ color: "var(--vault-text-mute)" }}>
                          <span style={{ color: "var(--vault-text-mute)", fontWeight: 600 }}>{f.pickCount} market{f.pickCount === 1 ? "" : "s"} simulated</span>
                        </span>
                      ) : null}
                    </div>

                    {f.headline ? (
                      <span className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{f.headline}</span>
                    ) : null}

                    <span
                      className="gtp-cta-lava vault-press mt-auto inline-flex items-center justify-center gap-1.5 rounded-[10px] py-2.5 font-mono uppercase tracking-[0.1em]"
                      style={{ fontSize: 11.5, fontWeight: 700, minHeight: 42 }}
                    >
                      Generate Simulation →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* A Round-of-32 banner used to sit here, gated on the knockout board having games. The 2026 World
          Cup is complete (0 games) so it could never render again, and the board route it linked is gone.
          `r32Board` is still loaded above — the completed knockout results feed the game-script signal. */}

      {/* SPORT-FIRST SELECTOR + all-games grid. The anchor is the hero CTA's scroll target. This block is
          the secondary "browse everything" surface below the featured picks above. */}
      <div id="simulate-games" className="scroll-mt-4 flex flex-col gap-3.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono uppercase tracking-[0.18em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Browse by sport</span>
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>· pick a sport, then a game to generate</span>
        </div>
        <SportSelector sports={sports} rows={rows} />
      </div>
    </div>
  );
}
