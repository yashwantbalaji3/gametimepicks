/**
 * RESULTS V2 · CROSS-SPORT SOCIAL FEED (B-5). PURE — no IO, no clock, no randomness: same inputs, same bytes.
 *
 * The MLB social pack (scripts/build-mlb-social-pack.mjs) drafts MLB content; this drafts the cross-sport RESULTS
 * posts it cannot: a day's graded records and the frozen Top-5 boards (published, then settled). It follows the
 * pack's contract exactly — INTERNAL (public:false), DRAFTS ONLY (never auto-posted), notBettingAdvice:true, the
 * shared FORBIDDEN_TERMS vocabulary, canonical first-party URLs — and every number in every post is carried in
 * that post's `numbers`, copied from the V2 read models (never recomputed here).
 *
 * Rules:
 *   - records are listed per sport, never summed into one percentage;
 *   - research / market-context records (MLB prop leans) are never posted;
 *   - a board's settled post is drafted only when EVERY row has an owner result — no partial scorecards;
 *   - a pending row is never a miss; a void is stated as a void.
 */

export const NOT_ADVICE = "Paper-only analytics · public beta · not betting advice.";

const record = (c) => `${c.won}–${c.lost}${c.push ? `–${c.push}` : ""}`;

/**
 * @param {{
 *   date: string, dayLabel: string, siteBase: string, dayPath: string,
 *   records: Array<{ id: string, label: string, class: string, won: number, lost: number, push: number, void: number }>,
 *   boards: null | { publishedAtLabel: string, boards: Array<{ propFamily: string, label: string, rows: Array<{ rank: number, name: string, team: string, projectionLabel: string, result: { state: string } }> }> },
 * }} input
 */
export function buildResultsSocialFeed({ date, dayLabel, siteBase, dayPath, records, boards }) {
  const url = `${siteBase}${dayPath}`;
  const posts = [];

  const pub = records.filter((r) => r.class === "PUBLIC" && r.won + r.lost + r.push + r.void > 0);
  if (pub.length) {
    posts.push({
      id: `${date}:day-recap`, kind: "DAY_RECAP", url,
      text: `${dayLabel} · ${pub.map((r) => `${r.label} ${record(r)}`).join(" · ")}. Each record graded against the official result and kept separately — pushes and voids are never losses. ${url}\n${NOT_ADVICE}`,
      numbers: Object.fromEntries(pub.map((r) => [r.id, { won: r.won, lost: r.lost, push: r.push, void: r.void }])),
    });
  }

  for (const b of boards?.boards ?? []) {
    if (!b.rows.length) continue;
    posts.push({
      id: `${date}:board:${b.propFamily}`, kind: "BOARD_FROZEN", url,
      text: `Frozen before kickoff (${boards.publishedAtLabel}) · Top ${b.rows.length} · ${b.label}: ${b.rows.map((r) => `${r.rank}. ${r.name} (${r.team}) ${r.projectionLabel}`).join(" · ")}. ${url}\n${NOT_ADVICE}`,
      numbers: { rows: b.rows.length },
    });
    const states = b.rows.map((r) => r.result.state);
    if (states.some((s) => s === "PENDING")) continue; // no partial scorecards
    const td = b.propFamily === "anytime_td";
    const good = states.filter((s) => s === (td ? "SCORED" : "INSIDE")).length;
    const bad = states.filter((s) => s === (td ? "DID_NOT_SCORE" : "OUTSIDE")).length;
    const voids = states.filter((s) => s === "VOID").length;
    const ungraded = states.filter((s) => s === "NOT_GRADED").length;
    const decided = good + bad;
    posts.push({
      id: `${date}:board-settled:${b.propFamily}`, kind: "BOARD_SETTLED", url,
      text: `${dayLabel} · Top ${b.rows.length} ${b.label}, frozen before kickoff: ${good} of ${decided} ${td ? "scored" : "finished inside the printed range"}${voids ? ` · ${voids} void (did not play)` : ""}${ungraded ? ` · ${ungraded} not graded` : ""}. ${url}\n${NOT_ADVICE}`,
      numbers: { good, decided, voids, ungraded },
    });
  }

  return { schemaVersion: 1, artifact: "results-social-feed", date, public: false, draftsOnly: true, notBettingAdvice: true, posts };
}
