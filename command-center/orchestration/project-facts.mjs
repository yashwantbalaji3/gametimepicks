/**
 * PROJECT FACTS — the standing GameTimePicks rules every agent must know, so no worker rediscovers them and no
 * handoff replays a whole conversation. A brief gets only the facts whose tags match it (selectFacts), capped in
 * size. These are rules the founder set; changing one is a founder decision, not an agent's.
 */
export const FACTS = Object.freeze([
  { id: "canonical-forecast", tags: ["forecast", "model", "nba", "nfl", "theater", "results", "social", "board", "prediction"], text: "Exactly one canonical official forecast per game, player, market and snapshot. Every surface (hubs, game pages, Top Boards, Simulation Theater, social, Results) shows that one; alternatives are clearly labelled and never feed picks." },
  { id: "no-history-rewrite", tags: ["forecast", "results", "history", "model", "settle"], text: "Never rewrite historical forecasts or settled records. Corrections are new versions with their own record." },
  { id: "no-fabrication", tags: ["social", "graphics", "odds", "lines", "props", "results", "publishing"], text: "No fabricated lines, prices, projections or results. Missing data means an omitted cell or a labelled fallback, never a guess." },
  { id: "labels", tags: ["social", "graphics", "publishing", "nba", "nfl"], text: "Social graphics use the label MODEL PROJECTION for projections and MODEL WIN PROBABILITY for winners; never ESTIMATE, PROJECTED MEDIAN or est." },
  { id: "never-after-start", tags: ["social", "publishing", "schedule", "approval"], text: "Never publish pregame content after the event starts, and never revive an expired post." },
  { id: "publishing-approval", tags: ["social", "publishing", "x", "post"], text: "Nothing is published without the founder's explicit approval of the exact package digest." },
  { id: "odds-terms", tags: ["odds", "lines", "props", "prices", "public", "data"], text: "Odds API prices stay private: no price, line or book name in a public file, feed or social graphic unless a receipt allows it. Paid credits only within a written authorization." },
  { id: "merge-policy", tags: ["engineering", "git", "pr", "merge", "release", "deploy", "claude-engineering"], text: "Merge, never rebase or force-push; stage explicit paths; merges to main need the founder's exact-head approval; never edit the release gate; avoid unnecessary Vercel builds (one release merge = one build)." },
  { id: "no-local-build", tags: ["engineering", "build", "claude-engineering", "claude-qa"], text: "Never run `next build` locally on the shared machine; tests run with network blocked where the suite supports it." },
  { id: "evidence-ladder", tags: ["report", "engineering", "qa", "release", "claude-engineering", "claude-qa"], text: "Report status on the ladder LOCAL, COMMITTED, PUSHED, MERGED, DEPLOYED, VERIFIED_IN_PRODUCTION, and separate measured facts from inferences." },
  { id: "spend", tags: ["api", "cost", "budget", "odds", "provider"], text: "Every paid call fits a cap set by the founder; caps default to $0; auto-recharge stays off." },
  { id: "x-research", tags: ["grok", "x", "research", "social", "grok-research"], text: "Grok researches public X and the web through the xAI API only; it never posts. Every finding carries a source URL." },
  { id: "prod-host", tags: ["website", "site", "production", "deploy", "qa", "claude-qa"], text: "Production is https://gametimepicks.yashwantbalaji.com (gametimepicks.com is a parking page and is never evidence)." },
]);

const MAX_BYTES = 4000;
const ALWAYS = new Set(["canonical-forecast", "no-fabrication"]);

/** The facts relevant to a piece of text, most specific first, at most MAX_BYTES of text. */
export function selectFacts(text) {
  const words = new Set(String(text).toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean));
  const scored = FACTS.map((f) => ({ f, score: f.tags.filter((t) => words.has(t)).length + (ALWAYS.has(f.id) ? 0.5 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.f.id.localeCompare(b.f.id));
  const out = [];
  let bytes = 0;
  for (const { f } of scored) {
    if (bytes + f.text.length > MAX_BYTES) break;
    out.push({ id: f.id, text: f.text });
    bytes += f.text.length;
  }
  return out;
}
