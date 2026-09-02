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

test("all three actions are present and each is answerable", () => {
  const ids = built.packets.map((p) => p.id).sort();
  assert.deepEqual(ids, ["gate-console-redeploy", "gate-moonshot-disposition", "gate-nfl-odds-renewal"]);
  for (const p of built.packets) {
    assert.ok(p.question.endsWith("?"), `${p.id}: a gate is a QUESTION`);
    assert.ok(p.evidence.length >= 3, `${p.id}: evidence, not an assertion`);
    assert.ok(p.answerTokens.length >= 2, `${p.id}: a real choice, not a rubber stamp`);
    assert.ok(p.dryRun && p.forbiddenWithoutToken, `${p.id}: says what may not happen without an answer`);
  }
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

test("the packet states WHY the authorization ended — the fact that changes the ask", () => {
  /*
   * P171 expired at program close having used a fraction of its ceiling. "Renew permission" and
   * "grant more money" are different questions, and only the evidence distinguishes them.
   */
  const nfl = built.packets.find((p) => p.id === "gate-nfl-odds-renewal");
  const text = nfl.evidence.join(" ");
  assert.match(text, /PROGRAM CLOSE/, "it says what expired it");
  assert.match(text, /never spent/, "and that the budget was not the constraint");
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

test("the NFL answer carries its OWN ceiling and expiry", () => {
  /*
   * Three fixed tokens would have meant the ceiling and expiry were inferred from a receipt rather
   * than stated by the person authorising the spend. That is not a limit; it is a guess wearing one.
   */
  const nfl = built.packets.find((p) => p.id === "gate-nfl-odds-renewal");
  const authorize = nfl.answerTokens.find((t) => t.token.startsWith("AUTHORIZE:"));
  assert.ok(authorize, "there is an authorise answer");
  for (const field of ["market-scope", "credit-ceiling", "expiry"]) {
    assert.ok(authorize.token.includes(`<${field}>`), `the answer must state its own ${field}`);
  }
  assert.ok(nfl.answerTokens.some((t) => t.token === "DEFER"), "and declining is one word");
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
