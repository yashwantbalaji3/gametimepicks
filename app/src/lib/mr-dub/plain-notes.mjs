/**
 * PLAIN SETTLEMENT NOTES (overnight 2026-10-28, SIMPLIFY) — display only.
 *
 * The protected fold writes one note per settled day into the ledger (lib/mr-dub/protected-fold.mjs), e.g.
 *   "Rule S: 2 Bank Builder step(s) lost ($100 seed each), 1 Moonshot lane(s) lost ($25 each); 0 win(s) rolled
 *    without touching the bankroll".
 * /mr-dub printed that note verbatim 33 times — an internal rule name ("Rule S") and pipeline plurals. The ledger is
 * NEVER edited (committed data); this turns the same counts into the reader's words at render time:
 *   "2 Bank Builder steps lost ($100 seed each) · 1 Moonshot run lost ($25 seed)".
 * Every count in the note survives (zero counts are dropped as words, never shown as a different number), and a note
 * this parser does not recognise is returned with only the "Rule S:" prefix removed — never invented.
 */
const FOLD_NOTE = /^Rule S:\s*(\d+) Bank Builder step\(s\) lost \(\$(\d+) seed each\),\s*(\d+) Moonshot lane\(s\) lost \(\$(\d+) each\);\s*(\d+) win\(s\) rolled without touching the bankroll\s*$/;

const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** @param {string|null|undefined} note @returns {string|null} */
export function plainSettlementNote(note) {
  if (typeof note !== "string") return note ?? null;
  const m = note.match(FOLD_NOTE);
  if (!m) return note.replace(/^Rule S:\s*/, "");
  const [bbLost, bbSeed, msLost, msSeed, rolled] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  const parts = [];
  if (bbLost) parts.push(`${n(bbLost, "Bank Builder step", "Bank Builder steps")} lost ($${bbSeed} seed${bbLost === 1 ? "" : " each"})`);
  if (msLost) parts.push(`${n(msLost, "Moonshot run", "Moonshot runs")} lost ($${msSeed} seed${msLost === 1 ? "" : " each"})`);
  if (rolled) parts.push(`${n(rolled, "win", "wins")} rolled on, bankroll unchanged`);
  return parts.length ? parts.join(" · ") : "No seed lost and no win rolled";
}

/** The timeline's label for a ledger event type, in words ("folded_day" was printed as "Folded Day"). */
export function plainEventLabel(type) {
  if (type === "folded_day") return "Day settled";
  if (type === "dual_lane_losses") return "Two-ladder phase seeds";
  return typeof type === "string" ? type.replace(/_/g, " ") : "settlement";
}
