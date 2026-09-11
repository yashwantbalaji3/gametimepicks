/**
 * Ledger REBUILD IDEMPOTENCE gate — the invariant that was missing when the canonical portfolio drifted
 * from what `build-mr-dub-ledger.mjs` reproduces. Running the rebuild MUST leave the canonical money state
 * (record · currentBankroll · crownBankroll · settledProfit) bit-for-bit unchanged — otherwise the
 * orchestrator's reconcile step silently corrupts the W/L count (the money gates check the bankroll CHAIN,
 * not the win/loss COUNT, so they don't catch it).
 *
 * The rebuild is self-contained (node builtins only), so we copy public/data + the script into a temp dir,
 * run it there, and compare the rebuilt portfolio to the committed canonical. NO real artifact is touched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pinnedLaneRoot } from "../bank-builder/fixtures/root.mjs";

const DATA = pinnedLaneRoot();
const SCRIPT = path.join(process.cwd(), "scripts", "build-mr-dub-ledger.mjs");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const pick = (o) => ({
  record: o.record,
  currentBankroll: o.currentBankroll,
  crownBankroll: o.crownBankroll,
  settledProfit: o.settledProfit,
});

// P192 · PINNED LANE STATE. This regression is about a specific historical lane state, so it reads a
// pinned snapshot instead of the live ladder. Reading `public/data` directly made the running
// product double as a fixture: Bank Builder and Moonshot could not advance to a live card without
// breaking assertions that require July's state to still be on disk. The assertions are unchanged —
// only where their data comes from is.
test("build-mr-dub-ledger is idempotent vs the canonical portfolio (rebuild reproduces record + bankroll exactly)", () => {
  /* P256: the live record = July base + the Rule S fold. This builder derives from the pre-fold card
     stores, so what it must reproduce is the July base the fold starts from. */
  const live = read(path.join(DATA, "mr-dub", "portfolio.json"));
  const base = live.protectedFold?.base;
  const canonical = base
    ? { record: base.record, currentBankroll: base.currentBankroll, crownBankroll: live.crownBankroll, settledProfit: Math.round((base.currentBankroll - live.startingBankroll) * 100) / 100 }
    : pick(live);

  // Sandbox: APP = tmp, so the script reads tmp/public/data and writes tmp/public/data/mr-dub/portfolio.json.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-ledger-idem-"));
  try {
    fs.cpSync(DATA, path.join(tmp, "public", "data"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "scripts"), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(tmp, "scripts", "build-mr-dub-ledger.mjs"));
    const tmpPortfolio = path.join(tmp, "public", "data", "mr-dub", "portfolio.json");
    if (base) {
      // Over the folded record the builder must REFUSE (it would erase every folded day) …
      const refused = spawnSync("npx", ["tsx", path.join(tmp, "scripts", "build-mr-dub-ledger.mjs"), "--now", "2026-06-30T18:00:00Z"], {
        encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: path.join(process.cwd(), "tsconfig.json") },
      });
      assert.equal(refused.status, 3, "build-mr-dub-ledger refuses over a folded record");
      assert.equal(fs.readFileSync(tmpPortfolio, "utf8"), fs.readFileSync(path.join(DATA, "mr-dub", "portfolio.json"), "utf8"), "and writes nothing");
      // … and, with the fold removed, must still reproduce the July base exactly.
      const { protectedFold, ...unfolded } = read(tmpPortfolio);
      fs.writeFileSync(tmpPortfolio, JSON.stringify(unfolded, null, 2) + "\n");
    }

    execFileSync("npx", ["tsx", path.join(tmp, "scripts", "build-mr-dub-ledger.mjs"), "--now", "2026-06-30T18:00:00Z"], {
      stdio: "ignore",
      env: { ...process.env, TSX_TSCONFIG_PATH: path.join(process.cwd(), "tsconfig.json") },
    });

    const rebuilt = pick(read(path.join(tmp, "public", "data", "mr-dub", "portfolio.json")));
    assert.deepEqual(rebuilt.record, canonical.record, "rebuild must reproduce the canonical W/L record");
    assert.equal(rebuilt.currentBankroll, canonical.currentBankroll, "rebuild must reproduce the canonical bankroll");
    assert.equal(rebuilt.crownBankroll, canonical.crownBankroll, "rebuild must reproduce the canonical crown");
    assert.equal(rebuilt.settledProfit, canonical.settledProfit, "rebuild must reproduce the canonical settled profit");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
