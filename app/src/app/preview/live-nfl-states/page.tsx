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
 * ⚠ WHAT IS DELIBERATELY ABSENT. There is no canonical HIT / MISS / PUSH / VOID row. The featured
 *   tracker caps finality at FINAL_PROVISIONAL (`trackForecast`), because whether the live-props
 *   producer's reconciled settlement may be shown as the canonical result has not been decided. Faking
 *   a settled row here would assert a capability the product does not have.
 *
 * V2B · the featured rows are fed a synthetic LIVE-PROPS RECORD (the same shape the producer writes)
 * and a pinned reader clock, so every measurement state — including stale — renders deterministically.
 */
import { guardInternalRoute } from "@/lib/internal-route-guard";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { NflGameCard } from "@/components/live/nfl-live-hub";
import type { FeaturedForecast, NflHubRosterGame } from "@/lib/live/nfl-hub-data";
import type { LivePropsState } from "@/components/live/use-live-props";

export const metadata = withRouteMetadata("/preview/live-nfl-states/", {
  title: "Internal Fixture · NFL Live states",
  robots: { index: false, follow: false },
});

const MONO = "var(--font-mono)";

/** One fixed game. Frozen numbers, so a screenshot is comparable across runs. */
const EID = "401872955";
const hs = (id: string) => `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${id}.png&w=96&h=96`;
const FROZEN_AT = "2026-09-27T14:42:05Z";

/* The five a real selection would feature — receiving · rushing · receptions · anytime TD · fill. */
const FEATURED: FeaturedForecast[] = [
  { predictionId: `${EID}:nfl-athlete-4430878:player_reception_yds`, playerId: "nfl-athlete-4430878", playerName: "Jaxon Smith-Njigba", team: "SEA", family: "player_reception_yds", kind: "VOLUME", label: "Receiving yards", modelValue: 107.5, modelLow: 58, modelHigh: 168, modelProbability: null, line: 92.5, sportsbook: "draftkings", frozenAt: FROZEN_AT, portraitUrl: hs("4430878") },
  { predictionId: `${EID}:nfl-athlete-4430807:player_rush_yds`, playerId: "nfl-athlete-4430807", playerName: "Jacory Croskey-Merritt", team: "WSH", family: "player_rush_yds", kind: "VOLUME", label: "Rushing yards", modelValue: 61.2, modelLow: 22, modelHigh: 110, modelProbability: null, line: 55.5, sportsbook: "draftkings", frozenAt: FROZEN_AT, portraitUrl: hs("4430807") },
  { predictionId: `${EID}:nfl-athlete-2976212:player_receptions`, playerId: "nfl-athlete-2976212", playerName: "Stefon Diggs", team: "SEA", family: "player_receptions", kind: "VOLUME", label: "Receptions", modelValue: 5, modelLow: 2, modelHigh: 8, modelProbability: null, line: 5, sportsbook: "draftkings", frozenAt: FROZEN_AT, portraitUrl: hs("2976212") },
  { predictionId: `${EID}:nfl-athlete-4567048:anytime_td`, playerId: "nfl-athlete-4567048", playerName: "Kenneth Walker III", team: "SEA", family: "anytime_td", kind: "PROBABILITY", label: "Anytime touchdown", modelValue: null, modelLow: null, modelHigh: null, modelProbability: 0.614, line: null, sportsbook: "draftkings", frozenAt: FROZEN_AT, portraitUrl: null },
  { predictionId: `${EID}:nfl-athlete-3122840:player_reception_yds`, playerId: "nfl-athlete-3122840", playerName: "Zach Ertz", team: "WSH", family: "player_reception_yds", kind: "VOLUME", label: "Receiving yards", modelValue: 38.4, modelLow: 12, modelHigh: 71, modelProbability: null, line: 34.5, sportsbook: "draftkings", frozenAt: FROZEN_AT, portraitUrl: hs("3122840") },
];

const GAME: NflHubRosterGame = {
  providerEventId: EID,
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
  trackedPredictionCount: 51,
  trackedPredictions: [],
  featured: FEATURED,
  featuredSource: "live-props",
  eligibleForecastCount: 51,
  boardGeneratedAt: FROZEN_AT,
};

/** The pinned reader clock. "Fresh" is 30s before it; "stale" is 3 minutes before it. */
const NOW_MS = Date.parse("2026-09-27T18:40:00Z");
const FRESH = "2026-09-27T18:39:30Z";
const STALE = "2026-09-27T18:37:00Z";

/** A synthetic envelope — scores and clock only; player values now come from the live-props record. */
const env = (o: Record<string, unknown>) => ({ eventId: EID, sport: "NFL", provider: "espn-public", ...o });
const liveEnv = (q: number, clock: string, a: number, h: number) =>
  env({ state: "LIVE", period: { number: q, label: `Q${q}`, clock }, competitors: { away: { abbr: "SEA", score: a }, home: { abbr: "WSH", score: h } } });

/** A live-props record in the producer's own shape: values keyed by predictionId, observedAt per row. */
type V = [number | null, number | null, number | null, number | null, number | null];
const record = (vals: V, observedAt: string, phase = "IN_PROGRESS", finals = false): LivePropsState => ({
  feed: "OK",
  artifact: {
    providerEventId: EID, phase, observedAt,
    rows: FEATURED.map((f, i) => ({
      predictionId: f.predictionId, playerId: f.playerId, family: f.family,
      live: { statValue: vals[i], observedAt },
      settlement: finals ? { state: "PENDING", finalStat: vals[i] } : { state: "PENDING", finalStat: null },
    })),
  },
});

/*                 JSN rec  JCM rush  Diggs rec  Walker TD  Ertz rec */
const CASES: Array<{ title: string; note: string; state: string; label: string; envelope: any; liveProps?: LivePropsState }> = [
  {
    title: "1 · PRE",
    note: "No score and no measurement: LIVE is a dash and every row says it starts at kickoff. A 0 here would be a stat nobody reported.",
    state: "PRE", label: "Scheduled",
    envelope: env({ state: "PRE", period: { number: 0, label: null, clock: null }, competitors: { away: { abbr: "SEA", score: null }, home: { abbr: "WSH", score: null } } }),
    liveProps: { feed: "NOT_ASKED", artifact: null },
  },
  {
    title: "2 · LIVE · no measurement yet",
    note: "The record exists but carries no value for these players. Missing is not zero: AWAITING FIRST MEASUREMENT.",
    state: "LIVE", label: "Live", envelope: liveEnv(1, "12:10", 0, 0),
    liveProps: record([null, null, null, null, null], FRESH),
  },
  {
    title: "3 · LIVE · measured zero",
    note: "The feed states 0 for these players — a real measurement, so LIVE reads 0 and the rail starts at the left.",
    state: "LIVE", label: "Live", envelope: liveEnv(1, "04:55", 0, 3),
    liveProps: record([0, 0, 0, 0, 0], FRESH),
  },
  {
    title: "4 · LIVE · below line",
    note: "JSN 63 against a frozen line of 92.5 and a GTP of 107.5. Words only — CURRENTLY BELOW LINE, never a miss.",
    state: "LIVE", label: "Live", envelope: liveEnv(2, "08:41", 10, 7),
    liveProps: record([63, 31, 3, 0, 18], FRESH),
  },
  {
    title: "5 · LIVE · exactly at line",
    note: "Diggs has 5 receptions against a whole-number line of 5: CURRENTLY AT LINE.",
    state: "LIVE", label: "Live", envelope: liveEnv(3, "11:02", 17, 10),
    liveProps: record([88, 49, 5, 0, 29], FRESH),
  },
  {
    title: "6 · LIVE · above line + touchdown scored",
    note: "Measurements past the line; Walker's touchdown is a FACT (TOUCHDOWN SCORED), not a canonical hit. JSN runs past the frozen scale and the dot clamps with ▸ — LINE and GTP do not move.",
    state: "LIVE", label: "Live", envelope: liveEnv(3, "02:15", 24, 14),
    liveProps: record([212, 71, 7, 1, 41], FRESH),
  },
  {
    title: "7 · LIVE · stale · last known state",
    note: "The record is 3 minutes old on the reader's clock: values stay, labelled LAST KNOWN with their age. Nothing reverts to PRE and nothing is shown as current.",
    state: "DELAYED", label: "Delayed", envelope: liveEnv(3, "00:48", 17, 14),
    liveProps: record([88, 49, 4, 0, 29], STALE),
  },
  {
    title: "8 · LIVE · tracking unavailable, nothing observed",
    note: "No live-props record could be read and none was ever seen: LIVE TRACKING TEMPORARILY UNAVAILABLE — not a zero, not an awaiting.",
    state: "LIVE", label: "Live", envelope: liveEnv(2, "06:30", 7, 7),
    liveProps: { feed: "UNAVAILABLE", artifact: null },
  },
  {
    title: "9 · FINAL · grading pending",
    note: "The provider says final. FINAL STAT replaces LIVE; the result belongs to settlement, so every row says grading pending — no HIT/MISS.",
    state: "FINAL_PENDING_SETTLEMENT", label: "Final — grading pending",
    envelope: env({ state: "FINAL", period: { number: 4, label: "Final", clock: null }, competitors: { away: { abbr: "SEA", score: 24 }, home: { abbr: "WSH", score: 20 } } }),
    liveProps: record([96, 58, 5, 1, 33], "2026-09-27T20:31:00Z", "FINAL", true),
  },
  {
    title: "10 · no forecasts for this game",
    note: "An empty slate reads as intentional rather than broken.",
    state: "PRE", label: "Scheduled",
    envelope: env({ state: "PRE", period: { number: 0, label: null, clock: null }, competitors: { away: { abbr: "SEA", score: null }, home: { abbr: "WSH", score: null } } }),
    liveProps: { feed: "NOT_ASKED", artifact: null },
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
                game={c.title.startsWith("10") ? { ...GAME, featured: [], eligibleForecastCount: 0, trackedPredictionCount: 0 } : GAME}
                envelope={c.envelope}
                state={c.state}
                label={c.label}
                liveProps={c.liveProps}
                nowMs={NOW_MS}
              />
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
