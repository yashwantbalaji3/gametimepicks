/**
 * THE SETTLER MUST GRADE A FIGHT LEG, AND SAY WHICH SPORTS IT GRADED.
 *
 * Until this existed the lab settler could only read MLB box scores, so a cross-sport card was
 * publishable and ungradeable — it would have sat pending forever and never entered the record,
 * quietly computing the published hit rate over only the cards that happened to be settleable.
 *
 * These pin the three things that make fight grading trustworthy: the outcome comes from the
 * official results capture, a draw or no-contest never becomes a loss, and the receipt names what
 * it actually graded rather than stamping everything "mlb".
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(path.join(process.cwd(), "scripts", "parlays", "settle-lab-cards.mjs"), "utf8");
const BODY = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a fight leg is graded from the official results capture, not a stat line", () => {
  assert.match(BODY, /results-latest\.json/, "UFC grading must read the official results capture");
  assert.match(BODY, /gradeUfcLeg/, "fight legs need their own grading path");
  assert.match(BODY, /\(leg\.sport \?\? "mlb"\) === "ufc"/,
    "the grading path must be chosen by the LEG's sport — a cross-sport card carries more than one");
});

/*
 * THESE TWO USED TO SCAN THE SETTLER'S SOURCE for the exact lines that built its result index. That
 * index now lives in lib/sports/ufc/official-results.mjs, because the settler was reading only the
 * slower of the two official records we capture and reported "no result" for a card whose winners
 * were already on disk. The properties are unchanged and are asserted here by RUNNING the code the
 * settler actually calls, which is stronger than matching its text — and the settler is still
 * checked to be calling it.
 */
test("only a decisive bout settles a moneyline", async () => {
  // A draw or no-contest voids the leg. Indexing a non-decisive bout as a loss for one corner would
  // manufacture losses out of fights nobody lost.
  const { loadOfficialUfcResults, fighterIndexForDate } = await import("../sports/ufc/official-results.mjs");
  const { byBout } = loadOfficialUfcResults({
    corpus: { results: [
      { eventDate: "2026-08-22", fighterA: "A One", fighterB: "B Two", winner: null, loser: null },
      { eventDate: "2026-08-22", fighterA: "C Three", fighterB: "D Four", winner: "C Three", loser: "D Four" },
    ] },
  });
  const idx = fighterIndexForDate(byBout, "2026-08-22");
  assert.equal(idx.has("a one"), false, "a bout with no winner and loser must not be indexed as a result for either fighter");
  assert.equal(idx.has("b two"), false);
  assert.equal(idx.get("c three").won, true, "a decisive bout still settles both corners");
  assert.equal(idx.get("d four").won, false);
  assert.match(BODY, /if \(!r\) return "pending"/, "an unknown or undecided bout is pending, never a loss");
  assert.match(BODY, /fighterIndexForDate\(/, "the settler must build its index through the shared reader");
});

test("fighter names are folded on BOTH sides of the join", async () => {
  /*
   * The results capture writes "Kaue Fernandes" where a card may carry "Kauê Fernandes". An
   * unfolded compare reads a real result as "no result yet", which grades as pending — i.e. exactly
   * as if the fight had not happened. This repo has hit that encoding difference before.
   */
  const { loadOfficialUfcResults, fighterIndexForDate } = await import("../sports/ufc/official-results.mjs");
  const { byBout } = loadOfficialUfcResults({
    corpus: { results: [{ eventDate: "2026-08-22", fighterA: "Kauê Fernandes", fighterB: "Someone Else", winner: "Kauê Fernandes", loser: "Someone Else" }] },
  });
  const idx = fighterIndexForDate(byBout, "2026-08-22");
  assert.equal(idx.get("kaue fernandes")?.won, true, "the index must fold the winner's name");
  assert.equal(idx.get("someone else")?.won, false, "the index must fold the loser's name");
  assert.match(BODY, /ufcResults\.get\(norm\(leg\.player\)\)/, "the lookup must fold the leg's name too");
});

test("the receipt names the sports it graded, and never hardcodes one", () => {
  assert.ok(!/sport: "mlb",\s*tier:/.test(BODY), "the card's sport must not be hardcoded");
  assert.match(BODY, /sports\.length === 1 \? sports\[0\] : "multi"/,
    "a card drawing on more than one sport must be attributed to multi, not to whichever came first");
  assert.match(SRC, /UFC official bout results/, "the receipt's source line must name every source used");
});

test("PRODUCTION TRUTH · a settled receipt attributes every card", () => {
  const dir = path.join(process.cwd(), "public", "data", "parlays", "lab-settled");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const c of doc.cards ?? []) {
      assert.ok(c.sport, `${f}: a card with no sport attribution`);
      if (c.sports) {
        assert.ok(Array.isArray(c.sports) && c.sports.length > 0, `${f}: empty sports list on ${c.slipId}`);
        const expected = c.sports.length === 1 ? c.sports[0] : "multi";
        assert.equal(c.sport, expected, `${f}: ${c.slipId} is stamped "${c.sport}" but draws on ${c.sports.join("+")}`);
      }
    }
  }
});
