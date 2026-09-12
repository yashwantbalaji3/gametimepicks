import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateGuardrails, guardrailAlerts, localDay } from "./guardrails.mjs";

const NOW = new Date("2026-09-12T18:00:00Z"); // 2 PM ET
const slip = (o = {}) => ({ stake: 20, price_american: 150, status: "lost", returned: 0, settled_at: "2026-09-12T17:00:00Z", ...o });

test("no limit set is SILENT — never a finding, never a nag", () => {
  assert.deepEqual(evaluateGuardrails([slip()], {}, { now: NOW }), []);
  assert.deepEqual(evaluateGuardrails([slip()], { daily_loss_limit: null, max_stake_per_slip: 0 }, { now: NOW }), [], "zero or null is unset, never a limit of zero");
});

test("the day is the reader's local day, not UTC", () => {
  assert.equal(localDay("2026-09-12T03:30:00Z"), "2026-09-11", "half past three UTC is still last night in New York");
  assert.equal(localDay("2026-09-12T17:00:00Z"), "2026-09-12");
  assert.equal(localDay("nonsense"), null);
});

test("a stake cap reports the breach and the largest one, or says everything is inside it", () => {
  const over = evaluateGuardrails([slip({ stake: 75 }), slip({ stake: 20 })], { max_stake_per_slip: 50 }, { now: NOW })[0];
  assert.equal(over.state, "EXCEEDED");
  assert.match(over.text, /1 slip staked more than the \$50\.00 you set per slip — the largest was \$75\.00/);
  const fine = evaluateGuardrails([slip({ stake: 20 })], { max_stake_per_slip: 50 }, { now: NOW })[0];
  assert.equal(fine.state, "OK");
});

test("the daily limit passes through OK, APPROACHING at 80%, then EXCEEDED", () => {
  const day = (stake) => [slip({ stake, status: "lost", returned: 0 })];
  assert.equal(evaluateGuardrails(day(10), { daily_loss_limit: 100 }, { now: NOW })[0].state, "OK");
  assert.equal(evaluateGuardrails(day(80), { daily_loss_limit: 100 }, { now: NOW })[0].state, "APPROACHING");
  const hit = evaluateGuardrails(day(120), { daily_loss_limit: 100 }, { now: NOW })[0];
  assert.equal(hit.state, "EXCEEDED");
  assert.match(hit.text, /past the \$100\.00 daily limit you set/);
});

test("a winning day is not a loss, and yesterday is not today", () => {
  const won = evaluateGuardrails([slip({ stake: 20, status: "won", returned: 70 })], { daily_loss_limit: 50 }, { now: NOW })[0];
  assert.equal(won.state, "OK");
  const yesterday = evaluateGuardrails([slip({ stake: 200, settled_at: "2026-09-11T17:00:00Z" })], { daily_loss_limit: 50 }, { now: NOW })[0];
  assert.equal(yesterday.state, "OK", "yesterday's loss is not today's");
  assert.match(yesterday.text, /nothing settled yet/);
});

test("the monthly limit adds up the month, and a pending slip is not a loss", () => {
  const rows = [
    slip({ stake: 100, settled_at: "2026-09-02T17:00:00Z" }),
    slip({ stake: 100, settled_at: "2026-09-09T17:00:00Z" }),
    slip({ stake: 500, status: "pending", returned: null, settled_at: null, placed_at: "2026-09-12T16:00:00Z" }),
    slip({ stake: 300, settled_at: "2026-08-30T17:00:00Z" }),
  ];
  const m = evaluateGuardrails(rows, { monthly_loss_limit: 150 }, { now: NOW }).find((f) => f.id === "monthly-loss");
  assert.equal(m.state, "EXCEEDED");
  assert.ok(Math.abs(m.value - 200) < 0.01, `September's settled losses only: ${m.value}`);
});

test("alerts are what needs saying, loudest first — and nothing when all is well", () => {
  const findings = evaluateGuardrails(
    [slip({ stake: 75 }), slip({ stake: 90 })],
    { max_stake_per_slip: 50, daily_loss_limit: 200, monthly_loss_limit: 1000 },
    { now: NOW },
  );
  const alerts = guardrailAlerts(findings);
  assert.ok(alerts.length >= 1);
  assert.equal(alerts[0].state, "EXCEEDED");
  assert.ok(!alerts.some((a) => a.state === "OK"), "an OK is not an alert");
  assert.deepEqual(guardrailAlerts(evaluateGuardrails([slip({ stake: 10 })], { max_stake_per_slip: 50 }, { now: NOW })), []);
});

test("it informs, it does not moralise", () => {
  const src = fs.readFileSync(new URL("./guardrails.mjs", import.meta.url), "utf8");
  for (const preachy of [/you should/i, /stop betting/i, /problem gambl/i, /take a break/i, /too much/i]) {
    assert.doesNotMatch(src, preachy, `guardrails state figures, never judgements: ${preachy}`);
  }
  assert.match(src, /nothing here blocks anything|nothing is prevented/i);
});

test("a typo cannot delete a limit the reader set", () => {
  /* Number("abc") is NaN, and NaN serialises to null on the wire: a fat-fingered entry would have
     silently removed the limit and said nothing. The form refuses the entry instead, and the refusal
     must sit BEFORE the write. */
  const src = fs.readFileSync(new URL("../../components/accounts/my-bets-record.tsx", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("async function saveLimits"));
  const body = fn.slice(0, fn.indexOf("\n  }"));
  const guard = body.indexOf("Number.isFinite");
  const write = body.indexOf(".upsert(");
  assert.ok(guard > -1, "an unparseable entry must be detected");
  assert.ok(write > guard, "and detected before anything is written");
  assert.match(body, /is unchanged/, "and the reader must be told the stored value stands");
  assert.match(body, /blank \? null : Number\(raw\)/, "while a blank entry still means \"no limit\"");
});
