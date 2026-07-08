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
import GamesExperience, { type GameRow } from "@/components/games-experience";
import SectionHeader from "@/components/section-header";
import FreshnessBadge from "@/components/ui/freshness-badge";
import { buildAllGameDetails, gameSlug } from "@/lib/game-detail";
import Link from "next/link";
import { loadRoundOf32Board } from "@/lib/world-cup/round-of-32";
import { gameScriptFromBoard } from "@/lib/world-cup/game-script";
import { scriptSignal, topPropSignal } from "@/lib/games-board-signal";
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
  // state, never fabricated cards). Reuses the SAME details the rows above are built from.
  const { featured, readyCount } = featuredSimulations([...detailMap.values()]);
  const overflowReady = Math.max(0, readyCount - featured.length);

  // The real dashboard modules a generated simulation reveals on the game page (see
  // components/game/game-simulation-runner). Factual — every one of these sections exists today.
  const dashboardModules = [
    "Priced prop snapshot",
    "Central read (strongest prop lean)",
    "Main takeaways",
    "Biggest leans",
    "Player / prop table",
    "Distributions",
    "Current-slate market agreement",
    "Recap",
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <SectionHeader
        eyebrow={`Simulate · ${rows.length} game${rows.length === 1 ? "" : "s"} across ${activeSports} sport${activeSports === 1 ? "" : "s"}`}
        title="Simulate Games"
        sub="Pick a game to run the model simulation — precomputed and deterministic, so everyone sees the same result. Watch a short reveal, then read the full model dashboard on the game page. Educational, paper-only."
        rightSlot={<FreshnessBadge slateDate={mlbDate} serverToday={today} noun="games" />}
      />

      {/* HERO — honest, simulation-first explainer of the flow + the new dashboard. */}
      <section
        data-testid="simulate-hero"
        className="rounded-[14px] px-5 sm:px-7 py-6 sm:py-7 flex flex-col gap-5"
        style={{
          background: "linear-gradient(135deg, rgba(26,16,11,0.72), rgba(15,10,7,0.55))",
          border: "1px solid var(--vault-border-strong)",
          boxShadow: "var(--vault-shadow-soft)",
        }}
      >
        <div className="flex flex-col gap-3">
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>
            Simulation-first · pick a game and run the model
          </span>
          <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(20px, 3vw, 27px)", lineHeight: 1.14, letterSpacing: "-0.015em", maxWidth: 720 }}>
            Run a precomputed model simulation, then read the full dashboard.
          </h3>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 680 }}>
            Choose any game below, press <span style={{ color: "var(--vault-text)" }}>Generate Simulation</span>, and watch a
            roughly ten-second reveal. The result is <span style={{ color: "var(--vault-text)" }}>precomputed and deterministic</span> —
            the same output for every user on the same game and model version, nothing computed in your browser. Every number is
            <span style={{ color: "var(--vault-text)" }}> educational and paper-only</span>: model reads, never wagering advice.
          </p>
        </div>

        {/* Three honest steps of the flow. */}
        <ol className="grid gap-3 sm:grid-cols-3 list-none p-0 m-0">
          {[
            { n: "1", t: "Pick a game", d: "Any game on today's slate below." },
            { n: "2", t: "Run the simulation", d: "A ~10-second deterministic reveal — same result for everyone." },
            { n: "3", t: "Read the dashboard", d: "The model's leans, table and distributions on the game page." },
          ].map((s) => (
            <li key={s.n} className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-border)" }}>
              <div className="flex items-center gap-2">
                <span className="font-mono inline-flex items-center justify-center rounded-full" style={{ color: "var(--vault-gold-bright)", border: "1px solid var(--vault-edge-gold)", width: 18, height: 18, fontSize: 10 }}>{s.n}</span>
                <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 700 }}>{s.t}</span>
              </div>
              <span className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{s.d}</span>
            </li>
          ))}
        </ol>

        {/* WHAT THE DASHBOARD SHOWS — factual list of the real modules that now exist. */}
        <div className="rounded-[10px] px-4 py-3.5 flex flex-col gap-2.5" style={{ background: "rgba(15,10,7,0.4)", border: "1px solid var(--vault-border)" }}>
          <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>What the dashboard shows</span>
          <ul className="flex flex-wrap gap-x-2 gap-y-2 list-none p-0 m-0">
            {dashboardModules.map((m) => (
              <li key={m} className="font-mono rounded-full px-2.5 py-1" style={{ color: "var(--vault-text-mute)", background: "var(--vault-panel)", border: "1px solid var(--vault-border)", fontSize: 10.5 }}>
                {m}
              </li>
            ))}
          </ul>
          <span className="text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            Baseball simulations report prop-level leans and distributions — no scoreline, first-scorer, xG, corners or cards (those aren&rsquo;t available for MLB).
          </span>
        </div>
      </section>

      {/* FEATURED SIMULATIONS — ready artifacts only, strongest-edge first (deterministic). */}
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((f) => (
              <Link
                key={f.slug}
                href={f.href}
                className="group rounded-[12px] px-4 py-4 flex flex-col gap-2.5 vault-glow-hover"
                style={{ background: "var(--vault-panel-elevated)", border: "1px solid var(--vault-border)", textDecoration: "none" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Simulation ready</span>
                  <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>MLB</span>
                </div>
                <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15.5, fontWeight: 700, lineHeight: 1.12 }}>
                  {f.teams.away} @ {f.teams.home}
                </span>
                <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
                  {f.runCountLabel ?? "Model simulation"} · {f.pickCount} generated pick{f.pickCount === 1 ? "" : "s"}
                </span>
                {f.headline ? (
                  <span className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{f.headline}</span>
                ) : null}
                <span className="font-mono uppercase tracking-[0.1em] mt-auto pt-1" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
                  Generate Simulation →
                </span>
              </Link>
            ))}
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
      <GamesExperience games={rows} />
    </div>
  );
}
