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
import { buildAllGameDetails, gameSlug } from "@/lib/game-detail";
import Link from "next/link";
import { loadRoundOf32Board } from "@/lib/world-cup/round-of-32";
import { gameScriptFromBoard } from "@/lib/world-cup/game-script";
import { scriptSignal, topPropSignal } from "@/lib/games-board-signal";
import { getSportIdentity } from "@/lib/sport-identity";
import { featuredSimulations } from "@/lib/simulate-lobby-featured";
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
    const mlbSlug = gameSlug(g.awayTeamAbbr ?? "", g.homeTeamAbbr ?? "", mlbDate);
    const mlbDetail = detailMap.get(`mlb/${mlbSlug}`);
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
      detailHref: mlbDetail ? `/games/mlb/${mlbSlug}` : undefined,
      // A ready deterministic simulation artifact exists for this game → surface a "Simulation Ready" badge
      // (drives the simulate-first lobby). Real status from the game-detail view; never fabricated.
      simReady: mlbDetail?.gameLabSimulation?.status === "ready",
      // The game's single highest MARKET-implied prop (labelled "mkt", never a model claim).
      signal: topPropSignal(mlbPropsByGame.get(String(g.gamePk)) ?? []) ?? undefined,
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
      detailHref: detailMap.has(`nba/${gameSlug(g.awayTeamAbbr ?? "", g.homeTeamAbbr ?? "", nbaDate)}`)
        ? `/games/nba/${gameSlug(g.awayTeamAbbr ?? "", g.homeTeamAbbr ?? "", nbaDate)}`
        : undefined,
      // The game's single highest MARKET-implied prop (labelled "mkt", never a model claim).
      signal: topPropSignal(nbaPropsByGame.get(String(g.gameId)) ?? []) ?? undefined,
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

  const activeSports = new Set(rows.map((r) => r.sport)).size;

  // Featured simulations — the deterministic short list of games with a READY artifact, sorted by
  // their strongest generated-pick edge (see @/lib/simulate-lobby-featured). Currently MLB is the only
  // sport that carries a joined `gameLabSimulation`; the selector is honest either way (empty ⇒ empty
  // state, never fabricated cards). Reuses the SAME details the rows above are built from — now the
  // details ALSO thread through each fixture's real team logos so the featured cards can show them.
  const { featured, readyCount } = featuredSimulations([...detailMap.values()]);
  const overflowReady = Math.max(0, readyCount - featured.length);

  // ── SPORT-FIRST SELECTOR STATES ──
  // Every state/count below is DERIVED FROM THE REAL PER-SPORT DATA the rows above are built from — never
  // a hardcoded "active". A sport is only "active" when its board/sim artifacts genuinely exist; World
  // Cup is honestly flagged as carrying NO simulation artifact (soccer sims are never faked); NBA reads
  // "off-season" unless a fresh board exists; NHL has no provider wired ("provider pending"); UFC is
  // conditional on a real upcoming card. Counts (games / simulation-ready) come straight from `rows`.
  const rowsBySport = (s: GameRow["sport"]) => rows.filter((r) => r.sport === s);
  const simReadyCountFor = (s: GameRow["sport"]) => rowsBySport(s).filter((r) => r.simReady).length;

  const mlbRows = rowsBySport("mlb");
  const wcRows = rowsBySport("world_cup");
  const nbaRows = rowsBySport("nba");
  const ufcRows = rowsBySport("ufc");

  const mlbId = getSportIdentity("mlb");
  const wcId = getSportIdentity("world_cup");
  const nbaId = getSportIdentity("nba");
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

  const sports: SportState[] = [
    mk("today", "Today", "◎", rows.length > 0 ? "active" : "conditional", rows.length > 0 ? "live slate" : "no games", rows.length, readyCount),
    // MLB is active when the board carries games; sim-ready count is the real joined-artifact count.
    mlbRows.length > 0
      ? mk("mlb", mlbId.label, mlbId.icon, "active", "active", mlbRows.length, simReadyCountFor("mlb"))
      : mk("mlb", mlbId.label, mlbId.icon, "conditional", "no games", 0, 0, "No MLB board is posted for the current slate yet."),
    // World Cup: available only when current fixtures exist; NO simulation artifact for soccer (kept 0).
    wcRows.length > 0
      ? mk("world_cup", wcId.label, wcId.icon, "available", "fixtures", wcRows.length, 0,
          "Soccer simulations require a soccer simulation artifact — none exists yet, so World Cup fixtures show model reads (moneyline / totals / props) on the game page, not a generated simulation.")
      : mk("world_cup", wcId.label, wcId.icon, "conditional", "no current fixtures", 0, 0,
          "No current World Cup fixtures. Soccer also has no simulation artifact — fixtures show model reads, not a generated simulation."),
    // NBA: off-season unless a fresh board produced rows.
    nbaRows.length > 0
      ? mk("nba", nbaId.label, nbaId.icon, "active", "active", nbaRows.length, 0)
      : mk("nba", nbaId.label, nbaId.icon, "off_season", "off-season", 0, 0, "The NBA is off-season — no fresh board, and no simulation artifact for basketball yet."),
    // NHL: no provider wired into the lobby → honest "provider pending" (never faked availability).
    mk("nhl", nhlId.label, nhlId.icon, "provider_pending", "provider pending", 0, 0, "NHL data isn’t wired into the lobby yet — provider pending. No games or simulations to show."),
    // UFC: conditional on a real upcoming card.
    ufcRows.length > 0
      ? mk("ufc", ufcId.label, ufcId.icon, "available", "upcoming card", ufcRows.length, 0, "UFC surfaces a moneyline model for the next card — there’s no per-fight generated simulation artifact.")
      : mk("ufc", ufcId.label, ufcId.icon, "conditional", "no current card", 0, 0, "No current UFC card. Once a real upcoming card posts, its moneyline model appears here."),
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <SectionHeader
        eyebrow={`Simulate · ${rows.length} game${rows.length === 1 ? "" : "s"} across ${activeSports} sport${activeSports === 1 ? "" : "s"}`}
        title="Simulate Games"
        sub="Pick a game to run the model simulation — precomputed and deterministic, so everyone sees the same result. Watch a short reveal, then read the full model dashboard on the game page. Educational, paper-only."
        rightSlot={<FreshnessBadge slateDate={mlbDate} serverToday={today} noun="games" />}
      />

      {/* HERO — trimmed: one honest line + a scroll-to-games CTA + How It Works. The detailed
          flow/dashboard breakdown now lives on the game page, so the games are never buried. */}
      <section
        data-testid="simulate-hero"
        className="rounded-[14px] px-5 sm:px-7 py-6 sm:py-7 flex flex-col gap-4"
        style={{
          background: "linear-gradient(135deg, rgba(26,16,11,0.72), rgba(15,10,7,0.55))",
          border: "1px solid var(--vault-border-strong)",
          boxShadow: "var(--vault-shadow-soft)",
        }}
      >
        <div className="flex flex-col gap-2.5">
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>
            The simulator · pick a sport, pick a game, generate
          </span>
          <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(21px, 3.2vw, 29px)", lineHeight: 1.12, letterSpacing: "-0.015em", maxWidth: 720 }}>
            Simulate Today&rsquo;s Games
          </h3>
          <p className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 12, letterSpacing: "0.01em" }}>
            precomputed · deterministic · same output for every user · paper-only
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="#simulate-games"
            className="gtp-cta-lava vault-press inline-flex items-center rounded-[8px] px-4 py-2 font-mono uppercase tracking-[0.12em]"
            style={{ fontSize: 11, fontWeight: 700, textDecoration: "none", minHeight: 44 }}
          >
            Browse the games ↓
          </a>
          <Link
            href="/learn"
            className="vault-press inline-flex items-center rounded-[8px] px-4 py-2 font-mono uppercase tracking-[0.12em]"
            style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none", minHeight: 44 }}
          >
            How it works →
          </Link>
        </div>
      </section>

      {/* FEATURED SIMULATIONS — ready artifacts only, strongest-edge first (deterministic), now premium
          cards WITH real team logos (MatchupIdentity → TeamMark, monogram fallback). */}
      <section data-testid="simulate-featured" className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>Ready to simulate</span>
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>
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
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
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
                  className="group rounded-[14px] px-4 py-4 flex flex-col gap-3 vault-glow-hover"
                  style={{ background: "var(--vault-panel-elevated)", border: "1px solid var(--vault-border)", textDecoration: "none" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-flex items-center gap-1 font-mono font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full"
                      style={{ color: "var(--gtp-success-on-dark, #7ee2a8)", background: "rgba(46,160,102,0.14)", border: "1px solid rgba(46,160,102,0.4)", fontSize: 8.5 }}
                    >
                      <span aria-hidden>▶</span> Simulation Ready
                    </span>
                    <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>MLB</span>
                  </div>

                  {/* Team identity: away logo @ home logo (real mlbstatic SVGs; monogram fallback via TeamMark). */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MatchupIdentity
                      homeName={f.teams.home}
                      awayName={f.teams.away}
                      homeLogo={f.homeLogo}
                      awayLogo={f.awayLogo}
                      size="lg"
                    />
                    <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 15.5, fontWeight: 700, lineHeight: 1.12 }}>
                      {f.teams.away} @ {f.teams.home}
                    </span>
                  </div>

                  {meta ? (
                    <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{meta}</span>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono" style={{ fontSize: 10.5 }}>
                    {f.runCountLabel ? <span style={{ color: "var(--vault-text-mute)" }}>{f.runCountLabel}</span> : null}
                    <span style={{ color: "var(--vault-text-mute)" }}>{f.pickCount} generated pick{f.pickCount === 1 ? "" : "s"}</span>
                    {f.pickCount > 0 && f.topEdgePct > 0 ? (
                      <span style={{ color: "var(--vault-text-mute)" }}>
                        top lean <span style={{ color: "var(--vault-gold-bright)", fontWeight: 700 }}>+{f.topEdgePct.toFixed(1)}% edge</span>
                      </span>
                    ) : null}
                  </div>

                  {f.headline ? (
                    <span className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{f.headline}</span>
                  ) : null}

                  <span className="font-mono uppercase tracking-[0.1em] mt-auto pt-1" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
                    Generate Simulation →
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {r32Board ? (
        <Link
          href="/world-cup/round-of-32"
          className="block rounded-[10px] px-4 py-3.5 vault-glow-hover"
          style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-gold-bright)", borderLeft: "3px solid var(--vault-gold-bright)", textDecoration: "none" }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>World Cup · Round of 32 Board</span>
              <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14.5, fontWeight: 700 }}>
                {r32Board.gameCount} knockout games · model ML / totals / props through {r32Board.horizonEt}
              </span>
            </div>
            <span className="font-mono uppercase tracking-[0.1em] shrink-0" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>Open →</span>
          </div>
        </Link>
      ) : null}

      {/* SPORT-FIRST SELECTOR + all-games grid. The anchor is the hero CTA's scroll target. */}
      <div id="simulate-games" className="scroll-mt-4">
        <SportSelector sports={sports} rows={rows} />
      </div>
    </div>
  );
}
