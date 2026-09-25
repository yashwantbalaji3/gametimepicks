/**
 * Release E guards (Program 174): the Vault produces exactly one closed-set outcome, a watchlist
 * is never card-shaped, selections are never forced, and "could not look" never reads as
 * "found nothing".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const vault = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/end-zone-vault/latest.json"), "utf8"));
const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-end-zone-vault.mjs"), "utf8");
const STATES = ["ACTIVE", "WATCHLIST_ONLY", "NO_VAULT", "STALE", "INCIDENT"];

test("exactly one outcome from the closed set, with a stated reason", () => {
  assert.ok(STATES.includes(vault.state), `${vault.state} outside the closed set`);
  assert.ok(vault.reason && vault.reason.length > 30, "every outcome explains itself");
  assert.equal(vault.dataClass, "PUBLIC_DERIVED");
  assert.equal(vault.product.id, "end-zone-vault");
});

test("ONLY ACTIVE is a card — a watchlist carries no card, no return, no instruction", () => {
  assert.equal(vault.isCard, vault.state === "ACTIVE");
  if (vault.state !== "ACTIVE") {
    assert.deepEqual(vault.selections, [], "a non-active outcome carries zero selections");
    /*
     * The claim is that a non-card outcome SAYS it is not a card — a reader must not be left
     * wondering whether a card exists somewhere else. NO_VAULT states that by naming the absence of
     * anything to evaluate ("no upcoming NFL event in this window"), which is the same statement in
     * the vocabulary the producer actually uses. Pinning only the words "no card" failed a Vault
     * that was being perfectly clear. `isCard` is asserted above and remains the load-bearing check.
     */
    /* "no current comparable touchdown price is available" joined the vocabulary on 2026-09-12,
       when the capture stopped probing props (out of the renewed receipt's scope). It is the same
       statement — nothing was published, and here is the blocker — in the producer's own words.

       ⚠ AND ON 2026-09-25 A STATE ARRIVED THAT NO BLOCKER DESCRIBES. With the capture wired in, the
       data gates can BOTH be satisfied and the product still stay a watchlist — because publishing
       a card is a DECISION, and this P0 deliberately does not take it. "the Vault stays a watchlist
       until the card is authorized" is the honest sentence for that, and it belongs in this list
       for the same reason the others do: it names what did not happen and why. Reusing one of the
       price blockers instead would have been a false statement about the books. */
    assert.match(vault.reason, /not a card|no card|no upcoming .* event|no .* to evaluate|no .* market is captured|no current comparable .* price is available|stays a watchlist until the card is authorized/i,
      `a non-active outcome must state that nothing was published; got "${vault.reason}"`);
  }
  const blob = JSON.stringify(vault);
  // a watchlist must not be shaped like a slip
  for (const bannedKey of ["stake", "payout", "exposure", "combinedOdds", "potentialReturn", "roi"]) {
    assert.doesNotMatch(blob, new RegExp(`"${bannedKey}"\\s*:`, "i"), `a watchlist must not carry a "${bannedKey}" field`);
  }
  for (const banned of ["edge", "lock", "best bet", "guaranteed", "profitable"]) {
    assert.doesNotMatch(blob, new RegExp(`\\b${banned}\\b`, "i"), `must not contain "${banned}"`);
  }
});

test("MISSING INPUTS ARE INCIDENT, NOT NO_VAULT — the two answers are different", () => {
  assert.match(src, /"we could not look" is not "we found nothing"/);
  const incidentIdx = src.indexOf('state = "INCIDENT"');
  const noVaultIdx = src.indexOf('state = "NO_VAULT"');
  assert.ok(incidentIdx > 0 && noVaultIdx > 0 && incidentIdx < noVaultIdx, "the missing-input branch is evaluated before the nothing-qualified branch");
  // NO_VAULT is reachable only after a real evaluation over a real pool
  assert.match(src, /the evaluator ran over a real pool/);
});

test("selections are never forced to hit a count", () => {
  assert.match(src, /NEVER forced to hit a count/);
  assert.match(src, /slice\(0, VAULT_PRODUCT_CARD\.maxSelections\)/, "the cap truncates; it never pads");
  assert.doesNotMatch(src, /while \(selections\.length < |fill\(|padTo/, "no padding loop exists");
});

test("candidates carry role state and probability, and the residual is disclosed", () => {
  const rows = vault.state === "ACTIVE" ? vault.selections : vault.watchlist;
  /* A window with no events has no candidates — see the NO_VAULT note above. */
  if (vault.state === "NO_VAULT" || vault.candidateCount === 0) {
    assert.equal(vault.isCard, false, "a window with nothing to evaluate publishes no card");
    return;
  }
  assert.ok(rows.length > 0, "an evaluated window shows its candidates");
  for (const c of rows) {
    assert.ok(c.playerId && c.name && c.team && c.opponent, "identity is complete");
    assert.ok(c.tdProbability > 0 && c.tdProbability < 1);
    assert.ok(["ACTIVE_EXPECTED", "ROLE_UNCERTAIN", "QUESTIONABLE"].includes(c.roleState));
    assert.ok(c.roleNote, "role state is explained in words");
    assert.match(c.probabilityRange.note, /never sums to 100%/, "the defence/ST residual is disclosed");
    /*
     * ⚠ THIS READ `roleState !== ACTIVE_EXPECTED ⇒ marketPrice === null`, and it passed for a year
     * because `marketPrice` was a hardcoded `null` on EVERY candidate. It was never a rule anyone
     * chose: it was the literal, wearing the costume of an invariant. With real prices flowing, a
     * QUESTIONABLE player with a genuine DraftKings number now fails it — and showing that number
     * beside a labelled "questionable" is honest, not misleading.
     *
     * The two facts are independent and the rules that actually matter are asserted separately: a
     * price, whenever present, must name its book and its instant; and the CARD (below) may only
     * ever be built from role-ready candidates.
     */
    if (c.marketPrice) {
      assert.ok(c.marketPrice.sportsbook, `${c.name}: a displayed price with no book is unattributable`);
      assert.ok(Number.isFinite(Date.parse(c.marketPrice.capturedAt)), `${c.name}: a price must carry the instant it was captured`);
      assert.equal(c.pricingState, null, `${c.name}: a priced candidate must not also claim an absence`);
    } else {
      assert.ok(["NOT_OFFERED", "NOT_PROBED", "IDENTITY_UNRESOLVED", "STALE", null].includes(c.pricingState ?? null),
        `${c.name}: an unpriced candidate carries a typed absence, got ${JSON.stringify(c.pricingState)}`);
    }
    if (vault.isCard) assert.equal(c.roleState, "ACTIVE_EXPECTED", `${c.name}: a CARD is built only from role-ready candidates`);
  }
  assert.ok(vault.candidateCount >= rows.length);
});

test("the product card is committed and names every gate ACTIVE requires", () => {
  assert.match(src, /VAULT_PRODUCT_CARD/);
  for (const gate of ["current active/role evidence", "current comparable TD price", "settlement coverage"]) {
    assert.ok(src.includes(gate), `the card must require: ${gate}`);
  }
  for (const excl of ["first/last TD markets", "2\\+ TD markets", "defensive scorers"]) {
    assert.match(src, new RegExp(excl), "exclusions are declared");
  }
  assert.ok(vault.gates.required.length >= 4, "the artifact publishes what ACTIVE would need");
});

test("the ledger stays append-only and this run rewrote nothing", () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/nfl/end-zone-vault/ledger.json"), "utf8"));
  assert.equal(ledger.product, "end-zone-vault");
  const dates = ledger.entries.map((e) => e.date);
  assert.equal(new Set(dates).size, dates.length, "no duplicate dates — append-only");
  assert.match(src, /append-only, nothing rewritten/);
  for (const e of ledger.entries) {
    if (e.state !== "ACTIVE") assert.equal((e.legs ?? []).length, 0, "a non-active entry carries no legs");
  }
});

test("today's real outcome is the honest one: candidates exist, a card does not", () => {
  /*
   * THIS TEST NAMES A STATE, AND THE PRODUCT HAS MORE THAN ONE HONEST ONE. It pinned
   * WATCHLIST_ONLY — true while preseason games were inside the 48-hour horizon. Between cards the
   * honest outcome is NO_VAULT ("no upcoming NFL event in this window to evaluate"), and pinning the
   * other state failed the Vault for correctly reporting an empty window. Both are checked; neither
   * may publish a card.
   */
  assert.equal(vault.isCard, false, "no outcome here is a card");
  if (vault.state === "NO_VAULT") {
    assert.equal(vault.candidateCount, 0, "an empty window evaluates no candidates");
    assert.deepEqual(vault.selections, [], "and publishes none");
    assert.match(vault.reason, /no upcoming|no .* to evaluate/i, "and says the window was empty");
    return;
  }
  assert.equal(vault.state, "WATCHLIST_ONLY");
  /*
   * ⚠ OFFERED IS NOT PRICED, AND THIS GUARD USED TO CONFLATE THEM.
   *
   * It asserted `tdMarketOffered !== true`, on the stated premise that no probe would ever run
   * "because this receipt funds team markets only". On 2026-09-24 the founder authorized a
   * one-event player-prop probe and eight books returned an anytime-touchdown market, so the
   * premise expired and the proxy went false while nothing about the product had changed.
   *
   * The Vault's own gate has always named TWO conditions — "an offered anytime-touchdown market
   * PLUS current role evidence" — so a state where the market is offered and the card is still
   * withheld is anticipated, not contradictory. What must never happen is a card published without
   * a PRICED candidate, and that is asserted directly below rather than through a stand-in.
   *
   * All three values stay meaningful: true = books offer it, false = we looked and they did not,
   * null = we never asked.
   */
  assert.ok([true, false, null].includes(vault.gates.tdMarketOffered),
    `tdMarketOffered is a three-state fact about the books; got ${JSON.stringify(vault.gates.tdMarketOffered)}`);
  /*
   * THE LOAD-BEARING CLAIM: no priced candidate ⇒ no card, whatever the books offer.
   *
   * ⚠ IT WAS WRITTEN AS `pricedCandidates === 0`, WHICH IS THE CONTRAPOSITIVE OF NOTHING. That
   * equality held only because `marketPrice` was a hardcoded `null`, so the guard asserted the
   * defect rather than the rule — and the comment directly above it had the rule right the whole
   * time ("what must never happen is a card published without a PRICED candidate"). With 146 priced
   * candidates it fails while the product is behaving exactly as intended.
   */
  if (vault.isCard) {
    assert.ok(vault.gates.pricedCandidates > 0, "no card publishes while no candidate carries a price");
  }
  /* And the decision is recorded as a decision, so a reader can tell a product that CANNOT publish
     from one that has not been told to. */
  assert.ok(["FOUNDER_DECISION_PENDING", "AUTHORIZED"].includes(vault.gates.cardActivation),
    `cardActivation is a decision with a closed set of answers; got ${JSON.stringify(vault.gates.cardActivation)}`);
  if (vault.gates.cardActivation !== "AUTHORIZED") assert.equal(vault.isCard, false, "an unauthorized card must not publish, whatever the data gates say");
  /* P245: role-ready candidates EXIST now (the weekly population + the injuries-fed role
     evidence produce them) — pinning 0 was true only while the input chain was empty, and
     punished the inputs arriving. The load-bearing claim is unchanged and asserted above and
     below: no priced TD market ⇒ no selections, whatever the candidate pool holds. */
  assert.ok(vault.gates.roleReadyCandidates >= 0, "role-ready count is a fact of the inputs, not a gate");
  /*
   * A FIXED FLOOR IS THE WRONG SHAPE, AND THIS IS THE SECOND ONE.
   *
   * The comment above already records that a hard floor "pinned a 9-game window and broke when 5
   * games started" — and the fix was another hard floor, ten. On 2026-08-23 the window narrowed to
   * a single remaining preseason game, nine candidates was the honest answer, and the guard failed
   * for the same reason it had failed before.
   *
   * The claim worth protecting is not a number. It is that a window with games still ahead surfaces
   * SOMEBODY, and a window with none surfaces nobody — so it is asserted against the window itself,
   * which is the thing the count is supposed to scale with. That holds at one game and at sixteen.
   */
  const watching = (vault.watchlist ?? []).length;
  if (vault.candidateCount === 0) {
    assert.equal(watching, 0, "no candidates means nothing to watch — a populated watchlist would contradict the count");
  } else {
    assert.ok(vault.candidateCount > 0 && watching > 0,
      `a window with candidates must surface them (count ${vault.candidateCount}, watchlist ${watching})`);
  }
  /*
   * P250-W2: THE INVARIANT IS "NEVER OVERCLAIM", NOT A PARTICULAR SENTENCE. This pinned the exact
   * words "has not been shown to out-predict the sportsbook". The founder removed that sentence
   * from the product surface as over-hedging — a reader of a watchlist does not need a paragraph
   * disowning a claim the product never makes. What must stay true is that the disclaimer says
   * what the numbers ARE (model probabilities, educational) and asserts no superiority over the
   * market anywhere in the artifact; that is asserted positively and negatively here.
   */
  assert.match(vault.disclaimer, /model .*probabilit/i, "the disclaimer says what the numbers are");
  assert.match(vault.disclaimer, /educational/i, "…and what they are for");
  const blob = JSON.stringify(vault).toLowerCase();
  for (const overclaim of ["beat the market", "beat the sportsbook", "out-predict the sportsbook", "outperform the market", "better than the market"]) {
    assert.ok(!blob.includes(overclaim), `the artifact must never claim "${overclaim}"`);
  }
  const builder = fs.readFileSync(path.join(APP, "scripts/nfl/build-end-zone-vault.mjs"), "utf8");
  assert.match(builder, /no touchdown market is captured/, "the blocker states OUR capture state, never a claim about what the books offer");
  assert.ok(!builder.includes("the sportsbooks are not offering"), "the unobservable claim about the books is gone");
});
