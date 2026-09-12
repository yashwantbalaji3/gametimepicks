import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { decideStyleSync, normaliseStyle, sameStyle, styleStated, describeStyle, styleColumns } from "./style-sync.mjs";

const SRC = path.join(process.cwd(), "src");

test("a browser that stated nothing adopts the account style, and that is the only silent write", () => {
  const d = decideStyleSync({ risk: "low", bankroll: 500, unit_pct: 2 }, { bankroll: null, risk: null, unitPct: 2 });
  assert.equal(d.state, "ACCOUNT_ONLY");
  assert.equal(d.autoAdopt, true);
  for (const [profile, device] of [
    [null, { bankroll: 500, risk: "high", unitPct: 3 }],
    [{ risk: "low", bankroll: 500, unit_pct: 2 }, { bankroll: 900, risk: "high", unitPct: 5 }],
    [{ risk: "low", bankroll: 500, unit_pct: 2 }, { bankroll: 500, risk: "low", unitPct: 2 }],
    [null, null],
  ]) {
    assert.equal(decideStyleSync(profile, device).autoAdopt, false, "no other case may write without the reader");
  }
});

test("a disagreement is shown, never resolved for the reader", () => {
  const d = decideStyleSync({ risk: "low", bankroll: 500, unit_pct: 2 }, { risk: "longshot", bankroll: 100, unitPct: 4 });
  assert.equal(d.state, "DIFFER");
  assert.match(d.text, /nothing changes until you do/i);
  // Both sides survive the decision, so the panel can print them side by side.
  assert.equal(d.account.risk, "low");
  assert.equal(d.device.risk, "longshot");
});

test("an untouched percent is not a stated style", () => {
  // 2% is the default every reader carries without touching anything. If it counted as a statement,
  // a fresh browser would offer to overwrite a real saved style with its own defaults.
  assert.equal(styleStated(normaliseStyle({ unitPct: 2 })), false);
  assert.equal(styleStated(normaliseStyle({ unitPct: 7 })), false);
  assert.equal(styleStated(normaliseStyle({ risk: "low" })), true);
  assert.equal(styleStated(normaliseStyle({ bankroll: 250 })), true);
});

test("both sides are normalised the same way, so equal styles never read as different", () => {
  assert.ok(sameStyle(normaliseStyle({ risk: "low", bankroll: 500, unit_pct: "2" }), normaliseStyle({ risk: "low", bankroll: 500.004, unitPct: 2.4 })));
  assert.equal(decideStyleSync({ risk: "low", bankroll: 500, unit_pct: 2 }, { risk: "low", bankroll: 500, unitPct: 2 }).state, "MATCH");
});

test("garbage is dropped rather than carried into a comparison", () => {
  const s = normaliseStyle({ risk: "aggressive", bankroll: -40, unit_pct: 99 });
  assert.equal(s.risk, null, "an unknown risk word is not a risk");
  assert.equal(s.bankroll, null, "a negative bankroll is not a bankroll");
  assert.equal(s.unitPct, 10, "the percent is clamped to the same ceiling the prefs module uses");
  assert.equal(normaliseStyle(null).unitPct, 2);
});

test("a style save touches exactly three profile columns", () => {
  const cols = styleColumns(normaliseStyle({ risk: "medium", bankroll: 800, unitPct: 3 }));
  assert.deepEqual(Object.keys(cols).sort(), ["bankroll", "risk", "unit_pct"]);
  // The limits a person set for themselves live in the same row; a style save must never blank them.
  for (const banned of ["max_stake_per_slip", "daily_loss_limit", "monthly_loss_limit"]) {
    assert.ok(!(banned in cols), `a style save must not write ${banned}`);
  }
});

test("the description states the reader's own numbers and never tells them to stake", () => {
  const text = describeStyle(normaliseStyle({ risk: "low", bankroll: 500, unitPct: 2 }));
  assert.match(text, /\$500\.00 paper bankroll at 2% a card/);
  assert.equal(describeStyle(normaliseStyle({})), "nothing stated");
  const source = fs.readFileSync(path.join(SRC, "lib/accounts/style-sync.mjs"), "utf8");
  for (const banned of [/\bshould bet\b/i, /\bshould put\b/i, /\bwe recommend\b/i, /\bkelly\b/i]) {
    assert.ok(!banned.test(source), `style sync must not contain ${banned}`);
  }
});

test("the panel is the only thing that writes, and it writes only the style", () => {
  const panel = path.join(SRC, "components/accounts/style-sync-panel.tsx");
  if (!fs.existsSync(panel)) return; // the pure module ships first; the panel's guard applies once it exists
  const src = fs.readFileSync(panel, "utf8");
  assert.ok(src.includes("styleColumns("), "the panel must build its update from styleColumns, not a literal");
  assert.ok(!/from\("bet_slips"\)/.test(src), "a style panel must never touch a slip row");
  assert.match(src, /\.from\("profiles"\)/, "and it writes the reader's own profile row");
});
