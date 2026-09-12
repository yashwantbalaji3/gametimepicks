/**
 * THE FOUNDER GATES ARE QUESTIONS WITH EVIDENCE, NOT LABELS — Program 231 · F.
 *
 * Run: npx tsx --test src/lib/launch/gate-packets.test.mjs
 *
 * Two decisions have blocked activation across three programs, and every report so far has recorded
 * them as the phrase "founder-gated". That is a label. It does not tell the founder what is being
 * asked, what it costs, what happens either way, or what to type — so it waits another program.
 *
 * The figure that matters most here is a spend figure. A packet quoting a hand-typed credit number
 * would be asking someone to authorise money against a number nobody checked, which is the exact
 * shape of the mistake the packet exists to prevent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildGatePackets } from "./gate-packets.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const built = buildGatePackets({ appDir: APP });

/*
 * REPOINTED 2026-09-12 (P287). These guards pinned "the NFL gate is an open question about an
 * EXPIRED P171 authorization" — the state on the day they were written. The founder answered it on
 * 2026-09-10 and the packet now derives itself from the live receipt, so the old assertions were
 * holding the board at a stale state: they would have FAILED the honest packet and PASSED the one
 * that asked the founder to re-authorize spend they had already authorized.
 *
 * The invariant underneath is unchanged, and it is what these now assert: an OPEN gate is a question
 * with evidence and a closed set of answers; a RESOLVED gate asks nothing and states the terms in
 * force. Neither may be silent about its reason.
 */
const isOpen = (p) => p.gate !== "RESOLVED";

test("all three actions are present, and each is either answerable or settled", () => {
  const ids = built.packets.map((p) => p.id).sort();
  assert.deepEqual(ids, ["gate-console-redeploy", "gate-moonshot-disposition", "gate-nfl-odds-renewal"]);
  for (const p of built.packets) {
    assert.ok(p.evidence.length >= 3, `${p.id}: evidence, not an assertion`);
    assert.ok(p.dryRun && p.forbiddenWithoutToken, `${p.id}: says what may not happen without an answer`);
    if (isOpen(p)) {
      assert.ok(p.question.endsWith("?"), `${p.id}: an open gate is a QUESTION`);
      assert.ok(p.answerTokens.length >= 2, `${p.id}: a real choice, not a rubber stamp`);
    } else {
      assert.ok(!p.question.endsWith("?"), `${p.id}: a settled gate must not still be phrased as a question`);
      assert.equal(p.answerTokens.length, 0, `${p.id}: a settled gate offers nothing to answer`);
    }
  }
});

test("a settled gate is not counted as one still owed", () => {
  assert.equal(built.counts.total, built.packets.length);
  assert.equal(built.counts.open, built.packets.filter(isOpen).length);
  assert.equal(built.counts.resolved, built.packets.length - built.counts.open);
  assert.ok(built.counts.open <= built.packets.length, "open can never exceed the board");
});

test("THE SPEND FIGURES ARE DERIVED FROM THE LEDGER THE CALLS WROTE", () => {
  const ledger = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/odds/nfl/p171-ledger.json"), "utf8")); }
    catch { return null; }
  })();
  if (!ledger) return;

  const nfl = built.packets.find((p) => p.id === "gate-nfl-odds-renewal");
  const text = nfl.evidence.join(" ");

  /* The used figure and the request count must be the ledger's, not a number somebody remembered. */
  assert.ok(text.includes(String(ledger.cumulativeCredits)), "the credits used come from the ledger");
  assert.ok(text.includes(String((ledger.requests ?? []).length)), "so does the request count");

  /* And the module must not carry the spend figure as a literal — that is the hand-typed number. */
  const src = fs.readFileSync(path.join(APP, "src/lib/launch/gate-packets.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
  assert.ok(
    !new RegExp(`\\b${ledger.cumulativeCredits}\\b`).test(code),
    "the credits-used figure appears as a literal in source — derive it or do not state it",
  );
});

test("the NFL packet states the authorization's actual standing, and never its opposite", () => {
  /*
   * The old shape of this asserted the P171 expiry wording verbatim. That text is now false: an
   * authorization is in force. What must hold in EITHER state is that the packet names the terms it
   * is describing — a receipt with its scope, ceiling and expiry when one is authorized, and the
   * absence of one when it is not. A packet that says "expired" while the capture is spending, or
   * "authorized" while no receipt is readable, is the defect in both directions.
   */
  const nfl = built.packets.find((p) => p.id === "gate-nfl-odds-renewal");
  const text = nfl.evidence.join(" ");
  if (isOpen(nfl)) {
    assert.match(text, /No committed receipt|no readable/i, "an open gate says nothing is authorized");
    assert.doesNotMatch(text, /Live receipt:/, "and must not also claim a live receipt");
  } else {
    assert.match(text, /Live receipt: \S+\.md\b/, "a settled gate names the receipt it is reading");
    for (const term of [/Scope /, /Markets /, /Ceiling /, /Expiry: /]) {
      assert.match(text, term, `the terms in force must be stated: ${term}`);
    }
    assert.doesNotMatch(text, /expired|no priced|NOT_YET_CAPTURED/i, "and must not carry the un-authorized copy");
  }
});

test("the packet's standing agrees with the receipt on disk — neither is allowed to drift", () => {
  /*
   * The failure this catches is the one that actually happened: the packet asserting an expiry while
   * a valid receipt sat committed beside it. Read the receipts independently and require agreement.
   */
  const readable = ["docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md", "docs/receipts/ODDS_AUTHORIZATION_P171.md"]
    .map((rel) => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return null; } })
    .filter(Boolean);
  const anyLiveTerms = readable.some((t) => /## Operative terms/.test(t) && /\|\s*Cumulative ceiling\s*\|/i.test(t) && /\|\s*Expiry\s*\|/i.test(t));
  const nfl = built.packets.find((p) => p.id === "gate-nfl-odds-renewal");
  assert.equal(
    !isOpen(nfl), anyLiveTerms,
    anyLiveTerms
      ? "a receipt states full terms on disk, so the gate must read RESOLVED — it is asking for an authorization that exists"
      : "no receipt states full terms, so the gate must stay FOUNDER — silence must never render as permission",
  );
});

test("answer tokens are a CLOSED set and no token is a credential", () => {
  for (const p of built.packets) {
    for (const t of p.answerTokens) {
        /* Literals, or a literal with NAMED placeholders — the NFL answer carries its own scope,
         ceiling and expiry, because an authorisation whose limits someone else filled in is not a
         limit. Free prose is still refused. */
      assert.match(t.token, /^[A-Z0-9_:]+(:<[a-z-]+>)*$/, `${t.token}: tokens are copy-paste literals, never free text`);
      assert.ok(t.does && t.does.length > 10, `${t.token}: says what answering it does`);
      /* A token that looks like a secret would train someone to paste secrets into a console. */
      assert.ok(!/KEY|SECRET|TOKEN_[A-Z0-9]{8}|PASSWORD/.test(t.token), `${t.token}: must not resemble a credential`);
    }
  }
  const spend = built.packets.find((p) => p.neverShare);
  assert.ok(spend, "the packet that authorises spend carries its never-share warning");
  assert.match(spend.neverShare, /SPEND/);
});

test("PREPARE, DO NOT EXECUTE — the module cannot issue or schedule anything", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/launch/gate-packets.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
  for (const forbidden of ["fetch(", "https://", "writeFileSync", "execSync", "execFileSync", "spawn"]) {
    assert.ok(!code.includes(forbidden), `a packet builder must not ${forbidden} — it prepares a decision, it does not take one`);
  }
});

test("Moonshot's every branch preserves the record", () => {
  const ms = built.packets.find((p) => p.id === "gate-moonshot-disposition");
  assert.match(ms.preserved, /preserved byte-for-byte/);
  assert.equal(Object.keys(ms.consequences).sort().join(","), "pause,repair,retire", "all three answers have a stated consequence");
  for (const t of ms.answerTokens) assert.match(t.token, /^MOONSHOT_REPAIR_PAUSE_OR_RETIRE:/, "the exact token, with the branch");
});

test("when the NFL gate is open, its answer carries its OWN ceiling and expiry", () => {
  /*
   * Three fixed tokens would have meant the ceiling and expiry were inferred from a receipt rather
   * than stated by the person authorising the spend. That is not a limit; it is a guess wearing one.
   *
   * Only reachable while the gate is open — a settled gate offers no tokens at all, which the
   * answerable/settled guard above asserts. This still runs on the open branch, driven directly.
   */
  const nfl = built.packets.find((p) => p.id === "gate-nfl-odds-renewal");
  const openPacket = isOpen(nfl) ? nfl : buildGatePackets({ appDir: path.join(APP, "src/lib/launch/__no_receipts__") }).packets
    .find((p) => p.id === "gate-nfl-odds-renewal");
  assert.ok(isOpen(openPacket), "a tree with no committed receipt must produce an OPEN gate — silence is not permission");
  const authorize = openPacket.answerTokens.find((t) => t.token.startsWith("AUTHORIZE:"));
  assert.ok(authorize, "there is an authorise answer");
  for (const field of ["market-scope", "credit-ceiling", "expiry"]) {
    assert.ok(authorize.token.includes(`<${field}>`), `the answer must state its own ${field}`);
  }
  assert.ok(openPacket.answerTokens.some((t) => t.token === "DEFER"), "and declining is one word");
});

test("THE CONSOLE PACKET CARRIES THE ADR'S DOMAIN WARNING", () => {
  /*
   * The one way to reopen the hole. The ADR records a ~4-minute unauthenticated window created by a
   * production domain on this project; deployment URLs inherit protection and domains do not. A
   * packet that asks someone to deploy without repeating that is handing them the loaded half.
   */
  const c = built.packets.find((p) => p.id === "gate-console-redeploy");
  assert.ok(c, "the delivery action is present");
  assert.equal(c.gate, "EXTERNAL", "it is a host action, not a product decision");
  const rules = c.rules.join(" ");
  assert.match(rules, /NEVER re-add a production domain/i);
  assert.match(rules, /4-minute unauthenticated window|unauthenticated window/i, "and says what happened last time");
  assert.match(c.dryRun, /verify-console-delivery/, "its dry run is the verifier, which deploys nothing");
});

test("RENDERED · every packet's rules reach the page, not just the data", () => {
  /*
   * This guard checked the MODULE and passed while the console panel rendered evidence, tokens,
   * dry-run and the forbidden line — and silently dropped `rules`. The most safety-critical sentence
   * in the whole board ("never re-add a production domain", against a recorded ~4-minute
   * unauthenticated window) existed in the object and never reached a screen.
   *
   * Checking the data is not checking the delivery. This reads the built internal export.
   */
  const page = path.join(APP, "out", "launch", "index.html");
  if (!fs.existsSync(page)) return; // public build prunes /launch — only the internal build has it
  const text = fs.readFileSync(page, "utf8").replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  for (const p of built.packets) {
    for (const rule of p.rules ?? []) {
      const probe = rule.slice(0, 44).replace(/\s+/g, " ");
      assert.ok(text.includes(probe), `${p.id}: a rule is in the packet and not on the page — "${probe}…"`);
    }
  }
});
