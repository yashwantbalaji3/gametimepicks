/**
 * NBA minutes by player type (founder P0C, EXPLORATORY): both committed reports re-derive byte-for-byte from committed
 * data, and the development replay never loads the 2025-26 season.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

for (const mode of ["dev", "forward"]) {
  test(`minutes-by-player-type --${mode} re-derives the committed report`, () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "minutes-type-")), `${mode}.json`);
    execFileSync("node", [path.join(process.cwd(), "scripts/nba/research/evaluate-nba-minutes-by-player-type.mjs"), `--${mode}`, "--out", out], { encoding: "utf8", maxBuffer: 1 << 26 });
    const committed = fs.readFileSync(path.resolve(process.cwd(), `../data/internal/research/nba/reports/minutes-by-player-type-${mode}.json`), "utf8");
    assert.equal(fs.readFileSync(out, "utf8"), committed);
    assert.match(JSON.parse(committed).label, /^EXPLORATORY/);
  });
}
