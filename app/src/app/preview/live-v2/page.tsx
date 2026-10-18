/**
 * /preview/live-v2 — INTERNAL fixture for the Live Hub V2 foundation (founder directive, 2026-10-14).
 *
 * `guardInternalRoute()` 404s this in the production export and `prune-internal-routes.mjs` deletes
 * `out/preview/`, so it is unreachable in Production by two independent mechanisms. View it locally with a
 * build run under `NEXT_PUBLIC_INTERNAL_ROUTES=1`.
 *
 * EVERYTHING BELOW IS SYNTHETIC FIXTURE DATA, labelled as such on the page. It exists so every state —
 * scheduled, live, delayed, provisional final, canonical final, postponed, cancelled, unavailable, an
 * untracked sport, an empty forecast list, an unmeasured value — is inspected on the REAL `LiveV2Board`
 * before any sport is switched on. Nothing here is a forecast, a result or a price anyone published.
 */
import { guardInternalRoute } from "@/lib/internal-route-guard";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import LiveV2Board, { type LiveV2Event } from "@/components/live/v2/live-v2-board";

export const metadata = withRouteMetadata("/preview/live-v2/", {
  title: "Internal Fixture · Live Hub V2 foundation",
  robots: { index: false, follow: false },
});

/** A pinned clock so the grouping is deterministic across runs. */
const NOW = Date.parse("2026-10-18T20:00:00Z");

const fx = (f: Omit<LiveV2Event, "reportHref"> & { reportHref?: string }): LiveV2Event => ({ reportHref: "/live/", ...f });

const EVENTS: LiveV2Event[] = [
  fx({ id: "nfl-live", sport: "nfl", status: "LIVE", startUtc: "2026-10-18T17:00:00Z",
    away: { abbr: "SEA", name: "Seattle Seahawks", score: 17 }, home: { abbr: "DEN", name: "Denver Broncos", score: 13 },
    progress: { quarter: 3, clock: "7:27" }, forecastLocked: "Fixture · forecast locked before kickoff",
    forecasts: [
      { id: "a", label: "Fixture WR · receiving yards", frozen: "Over 64.5", line: 64.5, side: "over", current: 41, unit: "yds" },
      { id: "b", label: "Fixture RB · rushing yards", frozen: "Under 55.5", line: 55.5, side: "under", current: 38, unit: "yds" },
      { id: "c", label: "Fixture TE · receptions", frozen: "Over 3.5", line: 3.5, side: "over", current: null, unit: "rec" },
    ] }),
  fx({ id: "mlb-delayed", sport: "mlb", status: "DELAYED", startUtc: "2026-10-18T18:05:00Z",
    away: { abbr: "CLE", name: "Cleveland Guardians", score: 2 }, home: { abbr: "TB", name: "Tampa Bay Rays", score: 3 },
    progress: { inning: 7, half: "bottom", outs: 1 }, forecasts: [] }),
  fx({ id: "nfl-soon", sport: "nfl", status: "PREGAME", startUtc: "2026-10-18T20:25:00Z",
    away: { abbr: "KC", name: "Kansas City Chiefs", score: null }, home: { abbr: "BUF", name: "Buffalo Bills", score: null },
    forecastLocked: "Fixture · forecast locked", forecasts: [{ id: "d", label: "Fixture QB · passing yards", frozen: "Over 245.5", line: 245.5, side: "over", current: null, unit: "yds" }] }),
  fx({ id: "nba-sched", sport: "nba", status: "PREGAME", startUtc: "2026-10-20T23:30:00Z",
    away: { abbr: "BOS", name: "Boston Celtics", score: null }, home: { abbr: "DET", name: "Detroit Pistons", score: null } }),
  fx({ id: "nba-live-untracked", sport: "nba", status: "LIVE", startUtc: "2026-10-18T19:00:00Z",
    away: { abbr: "NY", name: "New York Knicks", score: 54 }, home: { abbr: "PHI", name: "Philadelphia 76ers", score: 50 },
    progress: { quarter: 2, clock: "1:12" } }),
  fx({ id: "soccer-live-untracked", sport: "soccer", status: "LIVE", startUtc: "2026-10-18T14:00:00Z",
    away: { abbr: "Chelsea", name: "Chelsea", score: 1 }, home: { abbr: "Arsenal", name: "Arsenal", score: 1 }, progress: { minute: 67 } }),
  fx({ id: "nfl-final-prov", sport: "nfl", status: "FINAL_PROVISIONAL", startUtc: "2026-10-18T13:30:00Z",
    away: { abbr: "NYJ", name: "New York Jets", score: 20 }, home: { abbr: "MIA", name: "Miami Dolphins", score: 24 },
    forecasts: [{ id: "e", label: "Fixture WR · receiving yards", frozen: "Over 70.5", line: 70.5, side: "over", current: 82, unit: "yds" }] }),
  fx({ id: "ufc-final", sport: "ufc", status: "FINAL_CANONICAL", startUtc: "2026-10-18T02:00:00Z",
    away: { abbr: "", name: "Fixture Fighter A", score: null }, home: { abbr: "", name: "Fixture Fighter B", score: null },
    result: { winner: "Fixture Fighter A", method: "Decision", round: 3, official: true }, reportHref: "/ufc/" }),
  fx({ id: "mlb-old", sport: "mlb", status: "FINAL_CANONICAL", startUtc: "2026-10-15T23:00:00Z",
    away: { abbr: "LAD", name: "Los Angeles Dodgers", score: 5 }, home: { abbr: "NYM", name: "New York Mets", score: 2 } }),
  fx({ id: "mlb-pp", sport: "mlb", status: "POSTPONED", startUtc: "2026-10-18T17:10:00Z",
    away: { abbr: "SEA", name: "Seattle Mariners", score: null }, home: { abbr: "HOU", name: "Houston Astros", score: null } }),
  fx({ id: "nfl-unknown", sport: "nfl", status: "DATA_UNAVAILABLE", startUtc: "2026-10-18T17:00:00Z",
    away: { abbr: "CHI", name: "Chicago Bears", score: null }, home: { abbr: "GB", name: "Green Bay Packers", score: null } }),
];

export default function LiveV2Preview() {
  guardInternalRoute();
  return (
    <div className="mx-auto px-4 py-8" style={{ maxWidth: 1040 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: "0 0 6px", color: "var(--vault-text)" }}>Live Hub V2 · foundation fixture</h1>
      <p style={{ fontSize: 13, color: "var(--vault-warn)", margin: "0 0 18px" }}>
        Internal QA only. Every team, score, line and value on this page is synthetic fixture data — not a forecast, result or price.
        NFL and MLB render as tracked (their flags are on in this fixture); NBA, soccer and UFC render as untracked, as they are in Production.
      </p>
      <LiveV2Board events={EVENTS} nowMs={NOW} flags={{ nfl: true, mlb: true }} />
    </div>
  );
}
