/**
 * A POSTSEASON SLOT IS NOT A CANONICAL MLB CLUB (main recovery · R2).
 *
 * MLB has thirty clubs. On 2026-09-23 the follow registry resolved **37**, and
 * `mlbTeamRefByName("NL Wild Card #3")` returned a followable ref.
 *
 * StatsAPI publishes undecided postseason games with TBD sides. The capture window is today+6, so the
 * committed `2026-09-29` capture holds `AL #3 Seed`, `NL #3 Seed`, `NL Wild Card #1/#2/#3` and
 * `AL Wild Card #2/#3` — ids 4614–4947. The capture reduces a side to `{id, name}`, so nothing
 * downstream could tell a seed slot from a franchise.
 *
 * TWO MECHANISMS, because one cannot cover both directions of time:
 *
 *   FORWARD — the capture now stamps StatsAPI's own `placeholder: true`. ⚠ That flag is ONLY present on
 *   the `hydrate=team` response; the bare schedule URL the capture used returns `AL #3 Seed` with no flag
 *   at all, so this mechanism was inert until the URL was fixed too. Measured live 2026-09-23:
 *   09-29 bare 0 flagged / hydrated 7 of 8; 10-06 bare 0 / hydrated 4 of 4; 10-10 bare 0 / hydrated 3 of 4.
 *   Regular-season dates gain nothing (0 flagged), and reduced rows are identical either way — no churn.
 *
 *   BACKWARD — the flag cannot rescue an artifact written before it existed, and the committed 09-29
 *   capture is exactly that. So membership is CORROBORATED by a second owner: the season's full-game
 *   simulation slates name only clubs that actually play, and a TBD seed has nothing to simulate.
 *   Measured: schedule union 37 ids · simulations name exactly 30 clubs · intersection exactly 30.
 *
 * REJECTED, recorded so they are not retried: an id range (`id > 4000` — the provider publishes no
 * contract that 4-digit ids are synthetic, so it is magic) and a name regex (formatting, not identity).
 *
 * Run: cd app && npx tsx --test src/lib/follow/mlb-club-canonicalization.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const D = path.join(APP, "public", "data");

/** The seven TBD sides in the committed capture this recovery had to survive. */
const KNOWN_PLACEHOLDERS = Object.freeze([
  "AL #3 Seed", "NL #3 Seed", "NL Wild Card #1", "NL Wild Card #2", "NL Wild Card #3",
  "AL Wild Card #2", "AL Wild Card #3",
]);

const scheduleUnion = () => {
  const out = new Map();
  const dir = path.join(D, "mlb/statsapi-schedule");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const g of j.games ?? []) for (const s of [g.home, g.away]) if (s?.id != null) out.set(String(s.id), s);
  }
  return out;
};

test("PREMISE: the committed capture is still contaminated by TBD sides", () => {
  /*
   * ⚠ THIS PINNED THE EXACT NUMBER SEVEN, AND SEVEN WAS ALWAYS GOING TO EXPIRE (2026-09-25).
   *
   * The note here already said "if MLB resolves the seeds this premise changes… read this test
   * again rather than silently passing". MLB then resolved two of them, the count became five, and
   * the assertion failed on main — not because the rule below broke, but because a scheduled
   * producer rewrites this artifact every night and the test was asserting today's bracket.
   *
   * What the premise is actually FOR is anti-vacuity: "exactly the 30 real clubs survive" proves
   * nothing unless the raw union really does contain non-clubs. So that is what it asserts now —
   * some contamination, named — and it still fails loudly if the contamination disappears
   * ENTIRELY, which is the only change that would make the guards below meaningless.
   *
   * The seven names stay in KNOWN_PLACEHOLDERS: the rule test asserts none of them EVER resolves,
   * and that assertion is correct whether or not a given seed is still undecided today.
   */
  const union = scheduleUnion();
  const names = new Set([...union.values()].map((s) => s.name));
  const present = KNOWN_PLACEHOLDERS.filter((n) => names.has(n));
  assert.ok(present.length > 0,
    `no known TBD side remains in the committed schedule, so the canonicalization guards below are vacuous — re-point them at whatever the provider now publishes for an undecided game, rather than deleting them. Known: ${KNOWN_PLACEHOLDERS.join(", ")}`);
  assert.ok(union.size > 30,
    `the raw union must still be contaminated for these guards to mean anything (got ${union.size})`);
});

test("exactly the 30 real clubs survive, and every placeholder is excluded", async () => {
  const { registryCounts, mlbTeamRefByName } = await import("./entity-registry.ts");
  assert.equal(registryCounts().mlbTeams, 30, "canonical membership is exactly the real MLB club universe");
  for (const n of KNOWN_PLACEHOLDERS) {
    assert.equal(mlbTeamRefByName(n), null, `${n} must never resolve to a followable club`);
  }
});

test("a real club on the same contaminated slate is KEPT", async () => {
  /* The Yankees appear in the 09-29 capture beside four placeholders — the discriminator must be about
     the participant, not about the file it came from. */
  const { mlbTeamRefByName } = await import("./entity-registry.ts");
  const nyy = mlbTeamRefByName("New York Yankees");
  assert.ok(nyy, "a real club on the postseason slate must still resolve");
  assert.match(nyy.id, /^mlb-team-147$/);
});

test("no legitimate club is dropped — all 30 resolve by name", async () => {
  const { mlbTeamRefByName } = await import("./entity-registry.ts");
  /* Derived from the corroborating owner rather than hardcoded, so this cannot drift from the season. */
  const simDir = path.join(D, "mlb/full-game-simulations");
  const names = new Set();
  for (const f of fs.readdirSync(simDir).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(simDir, f), "utf8"));
    for (const g of j.games ?? []) { if (g.awayTeamName) names.add(g.awayTeamName); if (g.homeTeamName) names.add(g.homeTeamName); }
  }
  assert.equal(names.size, 30, `the simulation universe must name exactly 30 clubs (got ${names.size})`);
  const unresolved = [...names].filter((n) => !mlbTeamRefByName(n));
  assert.deepEqual(unresolved, [], `every simulated club must remain followable: ${unresolved.join(", ")}`);
});

test("an unknown participant does not become a canonical club — fail closed", async () => {
  const { mlbTeamRefByName } = await import("./entity-registry.ts");
  for (const n of ["Montreal Expos", "AL Higher Seed", "NL 3/6 Winner", "Totally Invented Club"]) {
    assert.equal(mlbTeamRefByName(n), null, `${n} must not resolve`);
  }
});

test("the capture ASKS for the flag — the hydrated endpoint", () => {
  /* The reducer reading `placeholder` is worthless if the request never returns one. This is the
     property; the reducer below is only its proxy. Removing `hydrate=team` silently restores the bug. */
  const src = fs.readFileSync(path.join(APP, "scripts/mlb/capture-mlb-schedule.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const urlLine = code.split("\n").find((l) => l.includes("api/v1/schedule"));
  assert.ok(urlLine, "the capture must still call the schedule endpoint");
  assert.match(urlLine, /hydrate=team/, "without hydrate=team StatsAPI never sends `placeholder`");
});

test("the capture stamps the provider's flag, and only when true", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/mlb/capture-mlb-schedule.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /placeholder === true/, "read from the provider payload");
  assert.match(code, /away: side\(/); assert.match(code, /home: side\(/);
  assert.doesNotMatch(code, /placeholder: false/, "a real club must not acquire a new field");
});

test("corroboration reads the SEASON, not a rolling window", () => {
  /* The abbreviation read was `.slice(-7)`. Seven files is fine for a convenience lookup and wrong for
     membership — a window is precisely what the R1 guard was written to catch. */
  const src = fs.readFileSync(path.join(APP, "src/lib/follow/entity-registry.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\.slice\(-7\)/, "membership must not depend on a 7-file window");
  /* The corroborating universe is built over every simulation file and handed whole to the rule.
     (The `.has(name)` test itself now lives in isCanonicalMlbClub, pinned by the behaviour test below.) */
  assert.match(code, /simulatedMlbNames\.add\(/, "the corroborating universe is accumulated");
  assert.match(code, /simulatedNames:\s*simulatedMlbNames/, "and passed whole into the membership rule");
});

test("BOTH refusal reasons are independently load-bearing", async () => {
  /* The provider flag was dead code against today's artifacts — none carries it yet — so a probe that
     deleted it broke nothing. Exercised directly here so neither branch can rot untested. */
  const { isCanonicalMlbClub } = await import("./entity-registry.ts");
  const sim = new Set(["New York Yankees", "Athletics"]);

  assert.equal(isCanonicalMlbClub({ name: "New York Yankees", flaggedPlaceholder: false, simulatedNames: sim }), true,
    "a corroborated, unflagged club is canonical");
  assert.equal(isCanonicalMlbClub({ name: "New York Yankees", flaggedPlaceholder: true, simulatedNames: sim }), false,
    "THE FLAG WINS: provider-stated placeholder is refused even when corroborated");
  assert.equal(isCanonicalMlbClub({ name: "NL Wild Card #1", flaggedPlaceholder: false, simulatedNames: sim }), false,
    "CORROBORATION WINS: an unsimulated participant is refused even with no flag — the pre-flag artifacts");
  assert.equal(isCanonicalMlbClub({ name: "NL Wild Card #1", flaggedPlaceholder: true, simulatedNames: sim }), false);
  assert.equal(isCanonicalMlbClub({ name: "Athletics", flaggedPlaceholder: false, simulatedNames: sim }), true,
    "negative control: an unusual but real club name is not refused on its shape");
});
