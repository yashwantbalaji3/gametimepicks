/**
 * Sport data-source registry — every provider this repository touches, with its rights, cost and
 * authorization level recorded ONCE (Program 148 · Release A).
 *
 * The registry answers the question every adapter and every audit keeps re-answering ad hoc:
 * "may we use this, what does it cost, and where may its data appear?" Nothing here creates access
 * or spends anything — it RECORDS what already exists so a new adapter cannot quietly assume a
 * source is free, public, or contracted when it is not.
 *
 * authorization levels:
 *   PUBLIC_DISPLAY   — data may render on public surfaces (subject to each surface's own gates)
 *   PRIVATE_RESEARCH — data may feed internal research/shadow artifacts only
 *   BLOCKED          — known but unusable until the named deficiency is resolved
 */

export const SOURCE_REGISTRY_VERSION = 1;

export const SOURCES = Object.freeze({
  mlb_statsapi: {
    owner: "AUTOMATION",
    cost: "free",
    credentials: "none",
    terms: "MLB StatsAPI public endpoints; attribution not required; used since project start for schedule + official results",
    authorization: "PUBLIC_DISPLAY",
    sports: ["mlb"],
    roles: ["schedule", "official-results"],
    failureBehavior: "postponed games can report Final without scores — quarantine rule encoded in settlement",
  },
  odds_api: {
    owner: "FOUNDER (billing) / AUTOMATION (usage)",
    cost: "paid — ~$30/mo plan; every request credit-guarded with floors and 120-min cache",
    credentials: "ODDS_API_KEY (CI secret; local key 401s by design)",
    terms: "commercial licence via the-odds-api plan; display of derived de-vigged probabilities established practice",
    authorization: "PUBLIC_DISPLAY",
    sports: ["mlb", "epl"],
    roles: ["markets"],
    failureBehavior: "credit guards fail closed; ODDS_DRY_RUN for rehearsals",
  },
  espn_cdn: {
    owner: "AUTOMATION",
    cost: "free",
    credentials: "none",
    terms: "public CDN for team logos / NBA headshots; identity components enforce the host allowlist",
    authorization: "PUBLIC_DISPLAY",
    sports: ["mlb", "nba", "nfl"],
    roles: ["identity-assets"],
    failureBehavior: "clean 404 on unknown ids → identity components fall back to initials",
  },
  mlb_midfield: {
    owner: "AUTOMATION",
    cost: "free",
    credentials: "none",
    terms: "official MLB Static CDN (same source mlb.com uses); headshots by personId",
    authorization: "PUBLIC_DISPLAY",
    sports: ["mlb"],
    roles: ["identity-assets"],
    failureBehavior: "404 → initials fallback",
  },
  api_football: {
    owner: "AUTOMATION",
    cost: "free tier — VERIFIED 2026-08-09 via /status (founder account, plan Free, 100 req/day). Season access mechanically probed: 2026 REFUSED ('Free plans do not have access to this season, try from 2022 to 2024') — current-season EPL requires a founder-gated paid upgrade",
    credentials: "API_FOOTBALL_KEY (CI secret + repo-root .env)",
    terms: "api-sports licence; WC player portraits already rendered publicly via media.api-sports.io (allowlisted host); historical seasons 2022-2024 fetched for the private EPL research corpus (Release C)",
    authorization: "PUBLIC_DISPLAY",
    sports: ["world_cup", "epl"],
    roles: ["identity-assets", "schedule-candidate", "results-history"],
    failureBehavior: "rate-limited free tier; adapters must treat empty responses as SOURCE_STALE, never as an empty slate; season-window refusals are PLAN blockers, not outages",
  },
  espn_scoreboard: {
    owner: "AUTOMATION",
    cost: "free",
    credentials: "none",
    terms: "site.api.espn.com public scoreboard JSON, no key; point-in-time snapshots with attribution — the same usage class as the retired event hub's hand-verified ESPN snapshots. First capture: NFL preseason week, Program 148 (16 events, scripts/nfl/capture-nfl-schedule.mjs)",
    authorization: "PUBLIC_DISPLAY",
    sports: ["nfl"],
    roles: ["schedule-candidate", "results-candidate"],
    failureBehavior: "capture script refuses zero-event windows (an empty capture would render as an empty slate); adapter treats a missing capture as NO SOURCE, a stale one as STALE — never as no games",
  },
  openfootball: {
    owner: "AUTOMATION",
    cost: "free",
    credentials: "none",
    terms: "openfootball public-domain datasets (github.com/openfootball); free to use, attribution courteous. First exercised Program 148 Release C: england repo carried ALL 380 2025-26 results where the football.json mirror was missing 27",
    authorization: "PUBLIC_DISPLAY",
    sports: ["epl"],
    roles: ["results-history", "schedule-candidate"],
    failureBehavior: "community-maintained: club names outside the committed membership table QUARANTINE (2026-27 file names Coventry City + Hull City — capture blocked pending membership verification against an authoritative source); season completeness enforced by the corpus builder's exactly-380 refusal",
  },
  balldontlie: {
    owner: "AUTOMATION",
    cost: "free tier",
    credentials: "BALLDONTLIE_API_KEY (CI secret)",
    terms: "free NBA data API; provider tests fail pre-existing in this repo",
    authorization: "PRIVATE_RESEARCH",
    sports: ["nba"],
    roles: ["schedule-candidate", "results-candidate"],
    failureBehavior: "BLOCKED for public display until the failing provider tests are fixed and point-in-time behaviour is verified",
  },
});

/** May this source's data appear on a public surface? The registry is the single answer. */
export function authorizedForPublicDisplay(sourceId) {
  return SOURCES[sourceId]?.authorization === "PUBLIC_DISPLAY";
}

/** Sources available for a sport in a given role, most-authorized first. */
export function sourcesFor(sport, role) {
  return Object.entries(SOURCES)
    .filter(([, s]) => s.sports.includes(sport) && s.roles.includes(role))
    .sort(([, a], [, b]) => (a.authorization === "PUBLIC_DISPLAY" ? 0 : 1) - (b.authorization === "PUBLIC_DISPLAY" ? 0 : 1))
    .map(([id, s]) => ({ id, ...s }));
}
