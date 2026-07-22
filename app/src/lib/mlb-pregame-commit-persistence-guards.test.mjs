/**
 * MLB PREGAME COMMIT PERSISTENCE — guards (2026-07-22).
 *
 * PREGAME_ARCHIVE_COMMIT=true turns on durable in-repo accumulation of SMALL pregame archive metadata
 * (manifests, status, snapshots, freezes, root summaries ≈ 4–6 KB each). These guards pin the hardened
 * commit step: opt-in, path-scoped, size-guarded, money-safe (rebase, no force), never on pull_request.
 * The large raw/normalized market payloads (≥148 KB) stay gitignored → workflow artifacts only.
 *
 * Run: npx tsx --test src/lib/mlb-pregame-commit-persistence-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const repo = path.dirname(app);
const wf = fs.readFileSync(path.join(repo, ".github/workflows/mlb-pregame-capture.yml"), "utf8");
const ARCH = "data/internal/mlb/pregame-archive";
// isolate the commit step (from its name to end of file)
const commitStep = wf.slice(wf.indexOf("Durable in-repo persistence"));
const cap = Number((commitStep.match(/MAX_FILE_BYTES:\s*"(\d+)"/) || [])[1]);

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

test("1 · commit is opt-in (PREGAME_ARCHIVE_COMMIT=true) and never on pull_request", () => {
  assert.match(commitStep, /vars\.PREGAME_ARCHIVE_COMMIT == 'true'/, "gated on the opt-in var");
  assert.match(commitStep, /github\.event_name != 'pull_request'/, "never on PR");
  assert.ok(!/^\s*pull_request:/m.test(wf), "no pull_request trigger at all");
});

test("2 · commit is path-scoped — no blanket / money / public add", () => {
  const addLines = commitStep.split("\n").map((l) => l.trim()).filter((l) => /^git add /.test(l));
  assert.ok(addLines.length >= 1, "has a git add");
  for (const l of addLines) {
    assert.ok(!/git add\s+(-A|--all|-u|\.)(\s|$)/.test(l), `no blanket add: ${l}`);
    assert.match(l, /ARCHIVE_DIR|pregame-archive/, `archive-scoped: ${l}`);
  }
  assert.match(wf, /ARCHIVE_DIR:\s*data\/internal\/mlb\/pregame-archive/, "ARCHIVE_DIR is the internal archive path");
});

test("3 · a SIZE GUARD unstages any file at/over a byte cap between metadata and payloads", () => {
  assert.match(commitStep, /MAX_FILE_BYTES/, "byte cap defined");
  assert.match(commitStep, /git cat-file -s/, "reads the staged blob size");
  assert.match(commitStep, /-ge "\$\{MAX_FILE_BYTES\}"/, "compares against the cap");
  assert.match(commitStep, /restore --staged|reset -q HEAD/, "unstages oversized files");
  assert.ok(Number.isFinite(cap) && cap >= 20000 && cap <= 140000,
    `cap ${cap} sits above metadata (≤ ~6 KB) and below market payloads (≥ 148 KB)`);
});

test("4 · a SAFETY ASSERT aborts if any non-archive / money / public path is staged", () => {
  assert.match(commitStep, /grep -vE "\^\$\{ARCHIVE_DIR\}\/"/, "off-scope detector present");
  assert.match(commitStep, /grep -iE 'portfolio\|public\/data\|mr-dub/, "money/public/mr-dub detector present");
  assert.match(commitStep, /settled_leans/, "settlement source excluded");
  assert.match(commitStep, /bank-builder\|moonshot/, "product paths excluded");
  assert.match(commitStep, /ABORT/, "aborts and commits nothing on out-of-scope");
});

test("5 · push is rebase-safe (a concurrent money/settle push is never reverted) — no force push", () => {
  assert.match(commitStep, /git pull --rebase/, "rebases the archive-only commit onto latest origin before push");
  assert.ok(!/push\s+.*(--force|-f\b)/.test(commitStep), "no force push");
  assert.match(commitStep, /\[skip ci\]/, "commit message skips CI to avoid loops");
});

test("6 · large market payloads are gitignored; every non-payload archive file is under the cap", () => {
  const gi = fs.readFileSync(path.join(repo, ".gitignore"), "utf8");
  assert.match(gi, /market-snapshots\/\*\*\/raw\.json/, "raw payloads gitignored");
  assert.match(gi, /market-snapshots\/\*\*\/normalized\.json/, "normalized payloads gitignored");
  // no on-disk metadata/summary/snapshot/freeze file exceeds the size cap (so the guard never blocks real data)
  for (const p of walk(path.join(repo, ARCH))) {
    const base = path.basename(p);
    if (base === "raw.json" || base === "normalized.json") continue; // the (gitignored) large payloads
    assert.ok(fs.statSync(p).size < cap, `${path.relative(repo, p)} (${fs.statSync(p).size}B) is under the ${cap}B cap`);
  }
});

test("7 · only manifests / status / snapshots / freezes / summaries are committable — no payload is", () => {
  // On-disk, the only files at/over the cap are the gitignored raw/normalized market payloads.
  const oversized = walk(path.join(repo, ARCH)).filter((p) => fs.statSync(p).size >= cap);
  for (const p of oversized) {
    assert.match(path.basename(p), /^(raw|normalized)\.json$/, `oversized file is a market payload: ${path.relative(repo, p)}`);
  }
});

test("9 · REGRESSION: the abort-guard allows internal settlement-joins/ but still blocks official settlement/money", () => {
  // The commit step's BAD-path regex must NOT false-match the legitimate internal settlement-joins/ path (a bare
  // `settlement` token did — it aborted every CI commit carrying join files, persisting nothing). It MUST still
  // block the official settlement file (settled_leans) and money/public/product paths.
  const badLine = commitStep.split("\n").find((l) => /grep -iE '[^']*moonshot/.test(l));
  assert.ok(badLine, "found the BAD-path detector line");
  const badRe = new RegExp(badLine.match(/grep -iE '([^']+)'/)[1], "i");
  // allowed (internal research join artifacts):
  for (const ok of ["data/internal/mlb/pregame-archive/settlement-joins/2026-07-22/822784.json", "data/internal/mlb/pregame-archive/settlement-joins/2026-07-21/822787.json"]) {
    assert.ok(!badRe.test(ok), `settlement-joins path must be allowed: ${ok}`);
  }
  // still blocked (official settlement + money + public + product):
  for (const bad of ["app/public/data/mlb/results/settled_leans.jsonl", "app/public/data/mr-dub/portfolio.json", "app/public/data/anything.json", "app/out/index.html", "app/src/lib/bank-builder.ts"]) {
    assert.ok(badRe.test(bad), `must still block: ${bad}`);
  }
  assert.ok(!/\|settlement'|\|settlement\b/.test(badLine), "no bare `settlement` token (would collide with settlement-joins)");
});

test("8 · out/ never contains archive files; money md5 unchanged", () => {
  const out = path.join(app, "out");
  if (fs.existsSync(out)) {
    const hit = fs.readdirSync(out, { recursive: true }).filter((p) => String(p).includes("pregame-archive") || String(p).includes("market-snapshots"));
    assert.equal(hit.length, 0, "no internal archive under out/");
  }
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "money md5 unchanged");
});
