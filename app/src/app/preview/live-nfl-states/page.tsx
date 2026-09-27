/**
 * /preview/live-nfl-states — INTERNAL fixture for the NFL Live card's lifecycle states.
 *
 * `guardInternalRoute()` 404s this in the production export and `prune-internal-routes.mjs` deletes
 * `out/preview/` outright, so it is unreachable in Production by two independent mechanisms.
 *
 * WHY THIS EXISTS. So the rendering of every state is inspected BEFORE kickoff rather than discovered
 * during it. Each row below feeds a synthetic envelope to the REAL `NflGameCard` — the same component
 * the public hub mounts — so what is verified here is the shipping code.
 *
 * ⚠ WHAT IS DELIBERATELY ABSENT. There is no canonical HIT / MISS / PUSH / VOID row, because the NFL
 *   hub passes `settlement: null`: per-leg NFL prop settlement is owned by the prop-settlement ledger,
 *   which this MVP does not read. Faking a settled row here would assert a capability the product does
 *   not have. The SETTLED chip's own rendering is shown, and nothing is claimed beyond it.
 */
import { guardInternalRoute } from "@/lib/internal-route-guard";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { NflGameCard } from "@/components/live/nfl-live-hub";
import type { NflHubRosterGame } from "@/lib/live/nfl-hub-data";

export const metadata = withRouteMetadata("/preview/live-nfl-states/", {
  title: "Internal Fixture · NFL Live states",
  robots: { index: false, follow: false },
});

const MONO = "var(--font-mono)";

/** One fixed game. Frozen numbers, so a screenshot is comparable across runs. */
const GAME: NflHubRosterGame = {
  providerEventId: "401872955",
  matchup: "SEA @ WSH",
  kickoffUtc: "2026-09-27T17:00:00Z",
  awayAbbr: "SEA",
  homeAbbr: "WSH",
  awayTeam: "Seattle Seahawks",
  homeTeam: "Washington Commanders",
  awayLogo: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png",
  homeLogo: "https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png",
  awayRef: null,
  homeRef: null,
  trackedPredictionCount: 4,
  trackedPredictions: [
    {
      playerId: "nfl-athlete-4430878", player: "Jaxon Smith-Njigba", teamAbbr: "SEA",
      market: "player_reception_yds", marketLabel: "Receiving yards",
      gtp: 108, pregameProbability: null, line: 90.5,
      sportsbook: "draftkings", capturedAt: "2026-09-26T16:49:46Z", liveTrackable: true,
    },
    {
      playerId: "nfl-athlete-3122840", player: "Zach Ertz", teamAbbr: "WSH",
      market: "player_receptions", marketLabel: "Receptions",
      gtp: 4.2, pregameProbability: null, line: 4.5,
      sportsbook: "draftkings", capturedAt: "2026-09-26T16:49:46Z", liveTrackable: true,
    },
    {
      /* A probability family: no rail, and no claim about whether it has happened. */
      playerId: "nfl-athlete-4361529", player: "Kenneth Walker III", teamAbbr: "SEA",
      market: "anytime_td", marketLabel: "Anytime touchdown",
      gtp: null, pregameProbability: 0.627, line: null,
      sportsbook: null, capturedAt: "2026-09-26T16:49:46Z", liveTrackable: false,
    },
  ],
  boardGeneratedAt: "2026-09-26T23:23:23Z",
};

/** A synthetic envelope. `playerStats` is what a real per-event box score would carry. */
const env = (o: Record<string, unknown>) => ({
  eventId: "401872955", sport: "NFL", provider: "espn-public", ...o,
});

const stats = (recYds: number | null, rec: number | null) => [
  { playerId: "nfl-athlete-4430878", markets: { player_reception_yds: recYds } },
  { playerId: "nfl-athlete-3122840", markets: { player_receptions: rec } },
];

const CASES: Array<{ title: string; note: string; state: string; label: string; envelope: any }> = [
  {
    title: "1 · PRE",
    note: "No score, no measurement, kickoff time shown. A zero here would be a score nobody reported.",
    state: "PRE", label: "Scheduled",
    envelope: env({ state: "PRE", period: { number: 0, label: null, clock: null }, competitors: { away: { abbr: "SEA", score: null }, home: { abbr: "WSH", score: null } }, playerStats: null }),
  },
  {
    title: "2 · LIVE · below line",
    note: "Live measurement present and under the frozen line. Words only — never a loss.",
    state: "LIVE", label: "Live",
    envelope: env({ state: "LIVE", period: { number: 2, label: "Q2", clock: "08:41" }, competitors: { away: { abbr: "SEA", score: 10 }, home: { abbr: "WSH", score: 7 } }, playerStats: stats(47, 2) }),
  },
  {
    title: "3 · LIVE · above line",
    note: "Same card, measurement now over the line.",
    state: "LIVE", label: "Live",
    envelope: env({ state: "LIVE", period: { number: 3, label: "Q3", clock: "02:15" }, competitors: { away: { abbr: "SEA", score: 17 }, home: { abbr: "WSH", score: 14 } }, playerStats: stats(112, 6) }),
  },
  {
    title: "4 · provider FINAL — grading pending",
    note: "The provider says the game is over. No HIT/MISS: that is the settlement owner's word, not the scoreboard's.",
    state: "FINAL_PENDING_SETTLEMENT", label: "Final — grading pending",
    envelope: env({ state: "FINAL", period: { number: 4, label: "Final", clock: null }, competitors: { away: { abbr: "SEA", score: 24 }, home: { abbr: "WSH", score: 20 } }, playerStats: stats(96, 5) }),
  },
  {
    title: "5 · stale feed · last known state kept",
    note: "The feed has aged. The last observed score and measurement stay; nothing continues to move.",
    state: "DELAYED", label: "Delayed",
    envelope: env({ state: "LIVE", period: { number: 3, label: "Q3", clock: "00:48" }, competitors: { away: { abbr: "SEA", score: 17 }, home: { abbr: "WSH", score: 14 } }, playerStats: stats(88, 4) }),
  },
  {
    title: "6 · feed unavailable · nothing observed yet",
    note: "No envelope at all. The card states the schedule fact and makes no claim about the present — it does NOT invent a 0-0.",
    state: "PRE", label: "Scheduled",
    envelope: null,
  },
  {
    title: "7 · SETTLED chip (game state only)",
    note: "How the chip renders when a slate is settled. Per-leg HIT/MISS is NOT shown: NFL prop settlement has no owner wired into this hub yet.",
    state: "SETTLED", label: "Settled",
    envelope: env({ state: "FINAL", period: { number: 4, label: "Final", clock: null }, competitors: { away: { abbr: "SEA", score: 24 }, home: { abbr: "WSH", score: 20 } }, playerStats: stats(96, 5) }),
  },
  {
    title: "8 · no forecasts for this game",
    note: "An empty slate reads as intentional rather than broken.",
    state: "PRE", label: "Scheduled",
    envelope: env({ state: "PRE", period: { number: 0, label: null, clock: null }, competitors: { away: { abbr: "SEA", score: null }, home: { abbr: "WSH", score: null } }, playerStats: null }),
  },
];

export default function NflLiveStatesFixture() {
  guardInternalRoute();
  return (
    <div className="mx-auto px-4 py-8" style={{ maxWidth: 1040 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px,4vw,30px)", color: "var(--vault-text)", margin: "0 0 6px" }}>
        NFL Live · state fixture
      </h1>
      <p style={{ fontSize: 13, color: "var(--vault-text-mute)", margin: "0 0 4px", maxWidth: 680, lineHeight: 1.6 }}>
        Deterministic states for the real NFL Live card. Internal: 404 in the production export and
        deleted from <code>out/</code> by the prune step.
      </p>
      <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "0 0 20px" }}>
        Fixed inputs · comparable across runs
      </p>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}>
        {CASES.map((c) => (
          <section key={c.title} aria-label={c.title}>
            <h2 style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-text)", margin: "0 0 4px", fontWeight: 400 }}>
              {c.title}
            </h2>
            <p style={{ fontSize: 11.5, color: "var(--vault-text-faint)", margin: "0 0 8px", lineHeight: 1.5 }}>{c.note}</p>
            <ul style={{ margin: 0, padding: 0 }}>
              <NflGameCard
                game={c.title.startsWith("8") ? { ...GAME, trackedPredictionCount: 0, trackedPredictions: [] } : GAME}
                envelope={c.envelope}
                state={c.state}
                label={c.label}
              />
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
