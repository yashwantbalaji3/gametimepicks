/**
 * LIVE RESULTS AUTOMATION, first slice: NBA game winners. After a post is published, this settles it against the official
 * finals record and prepares one deterministic reply, recorded once per post. It SENDS NOTHING: sending stays off until X's
 * automation rules are confirmed and the founder gives the one-time authorization. Misses are recorded like wins.
 * The prediction compared is the one the post published; a disagreement with the graded record is an exception, never a result.
 */
import { digestOf } from "../lib/util.mjs";
import { resultsAccuracy } from "../recap/results-accuracy.mjs";

const SETTLED_KINDS = new Set(["nba-game", "lr-nba-game", "lr-nba-game-winner"]);
const WIN = [
  (t) => `🏀 BANGGG! 💥\n${t} WIN! ✅🔥\nOur winner prediction comes through!`,
  (t) => `✅ ${t} get it done!\nOur winner prediction hits. 🔥`,
  (t) => `🏀 Called it. ${t} WIN! ✅\nAnother result added to the GameTimePicks record. 💚`,
];
const MISS = [
  () => "That one didn't land. ❌\nOur prediction missed, and the result is recorded.\nMore games ahead. Every prediction gets tracked.",
  () => "❌ Our prediction missed on this one.\nIt's on the record with every other result.",
];
export function replyText(outcome, team, key) {
  const list = outcome === "WIN" ? WIN : MISS;
  return list[parseInt(digestOf(key).slice(0, 8), 16) % list.length](String(team).toUpperCase());
}
const predictedOf = (pkg) => pkg.favoured ?? pkg.imported?.content?.game?.winner ?? null;

export function createResultsAutomation({ store, clock, posts, dataSource }) {
  const of = (k) => store.list().filter((e) => e.kind === k).map((e) => ({ ...e.data, at: e.at }));
  async function tick() {
    const todo = posts().filter((p) => p.receipt && SETTLED_KINDS.has(p.package?.kind) && p.package.eventId && !store.readClaim(`outcome|${p.postId}`));
    const out = { checked: todo.length, recorded: 0, waiting: 0, exceptions: 0 };
    const src = todo.length ? dataSource() : null;
    const bundles = new Map();
    for (const p of todo) {
      const date = p.package.laneDate ?? p.package.date;
      if (!bundles.has(date)) bundles.set(date, await resultsAccuracy({ src, date }).catch(() => null));
      const g = bundles.get(date)?.games?.find((x) => String(x.eventId) === String(p.package.eventId));
      if (!g) { out.waiting += 1; continue; } // not an official final yet: keep monitoring
      const predicted = predictedOf(p.package);
      if (predicted !== g.predictedWinner) {
        if (store.claim(`outcome-exception|${p.postId}`, { at: clock() }).won) store.append("result-exception", "results-automation", { postId: p.postId, eventId: g.eventId, code: "PREDICTION_MISMATCH", detail: `the post said ${predicted}, the graded record says ${g.predictedWinner}` });
        out.exceptions += 1; continue;
      }
      if (!store.claim(`outcome|${p.postId}`, { at: clock() }).won) continue;
      const outcome = g.correct ? "WIN" : "MISS";
      store.append("result-outcome", "results-automation", { postId: p.postId, decisionId: p.decisionId, sport: "NBA", eventId: g.eventId, parentPostId: p.receipt.providerPostId, parentUrl: p.receipt.canonicalUrl, predicted, actualWinner: g.actualWinner, final: `${g.away.abbr} ${g.finalAway}, ${g.home.abbr} ${g.finalHome}`, outcome, reply: replyText(outcome, g.predictedName ?? predicted, p.postId), replyState: "PREPARED_NOT_SENT" });
      out.recorded += 1;
    }
    return out;
  }
  const state = () => ({ sending: false, reason: "X automation rules not confirmed; no one-time authorization", outcomes: of("result-outcome").slice(-50).reverse(), exceptions: of("result-exception").slice(-20).reverse() });
  return { tick, state };
}
