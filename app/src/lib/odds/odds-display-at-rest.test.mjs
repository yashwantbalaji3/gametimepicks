/**
 * ODDS DISPLAY ARTIFACTS AT REST (source level, no build; founder 2026-10-29). The repository is PUBLIC, so a plaintext
 * price file committed under data/odds-display/ would itself be a downloadable file (provider terms: display in a website
 * yes; "your own API, data feed, downloadable files" no). Guards:
 *   1. nothing but `*.json.enc` ever exists under <repo>/data/odds-display/ (any sport, any depth) — a plaintext variant,
 *      a temp file, a stray .json fails CI;
 *   2. every `.json.enc` there is a well-formed `gtp.odds-display.enc@1` envelope whose authenticated identity matches its
 *      own path (<sport>/lines/<key>), carrying no plaintext field;
 *   3. a sport's lines directory is empty while its "site" surface is not authorized; once authorized (NBA and NFL since
 *      2026-10-29) every file there must be a valid envelope named `<event id>.json.enc` and bound to that path (NBA has
 *      its own copy of this guard: line-publication-guard.test.mjs);
 *   4. both exporters write only through encryptDisplayArtifact, to `<key>.json.enc`, with the key from the environment.
 * The exported-site check (no decrypted artifact or price in the static export) is the post-build guard
 * odds-display-export.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { displayAuthorization } from "./display-authorization.mjs";
import { ODDS_DISPLAY_ENC_EXT, ODDS_DISPLAY_ENC_FORMAT, readDisplayKey, decryptDisplayArtifact } from "./display-crypto.mjs";
import { NFL_LINES_REPO_DIR, validateNflLineArtifact, nflLinesAad } from "../sports/nfl/public-line-records.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const ROOT = path.join(REPO, "data", "odds-display");
const filesIn = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(d, f)).isFile()) : []);

test("nothing but *.json.enc is ever stored under data/odds-display/ (no plaintext variant is committed)", () => {
  const plain = filesIn(ROOT).filter((f) => !f.endsWith(ODDS_DISPLAY_ENC_EXT));
  assert.deepEqual(plain, [], "data/odds-display/ holds encrypted artifacts only");
});

test("every stored artifact is a well-formed encrypted envelope bound to its own path", () => {
  for (const f of filesIn(ROOT)) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    let e;
    assert.doesNotThrow(() => { e = JSON.parse(text); }, f);
    assert.deepEqual(Object.keys(e), ["format", "alg", "kid", "aad", "iv", "tag", "ct"], f);
    assert.deepEqual([e.format, e.alg], [ODDS_DISPLAY_ENC_FORMAT, "AES-256-GCM"], f);
    assert.equal(e.aad, f.split(path.sep).join("/").slice(0, -ODDS_DISPLAY_ENC_EXT.length), `${f}: identity matches the path`);
    assert.doesNotMatch(text, /"rows"|"events"|overPrice|underPrice|"book"/, `${f}: no plaintext field`);
  }
});

test("NFL lines folder: empty while NFL site display is not authorized; once authorized, every stored file is a valid envelope for its own game", () => {
  const dir = path.join(REPO, NFL_LINES_REPO_DIR);
  if (!displayAuthorization("nfl", "site").ok) {
    assert.deepEqual(filesIn(dir), [], `${NFL_LINES_REPO_DIR}/ must be empty until the display authorization record authorizes nfl "site"`);
    return;
  }
  for (const f of filesIn(dir)) {
    assert.match(f, /^\d{6,12}\.json\.enc$/, `${f}: only <event id>${ODDS_DISPLAY_ENC_EXT} files, flat`);
    const e = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    assert.deepEqual(Object.keys(e), ["format", "alg", "kid", "aad", "iv", "tag", "ct"], f);
    assert.deepEqual([e.format, e.alg, e.aad], [ODDS_DISPLAY_ENC_FORMAT, "AES-256-GCM", nflLinesAad(path.basename(f, ODDS_DISPLAY_ENC_EXT))], `${f}: envelope bound to its game`);
    assert.match(e.kid, /^[0-9a-f]{16}$/, f);
  }
});

test("when NFL is authorized and the key is present, every stored NFL artifact decrypts and validates", { skip: !(displayAuthorization("nfl", "site").ok && readDisplayKey().ok) && "not authorized, or no key in this environment" }, () => {
  const key = readDisplayKey().key;
  for (const f of filesIn(path.join(REPO, NFL_LINES_REPO_DIR))) {
    const eventId = path.basename(f, ODDS_DISPLAY_ENC_EXT);
    const text = decryptDisplayArtifact(fs.readFileSync(path.join(REPO, NFL_LINES_REPO_DIR, f), "utf8"), key, nflLinesAad(eventId));
    assert.ok(text, `${f}: encrypted under another key`);
    const v = validateNflLineArtifact(JSON.parse(text), eventId);
    assert.equal(v.ok, true, `${f}: ${v.errors.join("; ")}`);
  }
});

test("both exporters write only encrypted files, with the key from the environment, never printing it", () => {
  for (const rel of ["scripts/nba/publish-nba-line-board.mjs", "scripts/nfl/publish-nfl-line-board.mjs"]) {
    const src = fs.readFileSync(path.join(APP, rel), "utf8");
    const writes = [...src.matchAll(/writeFileSync\(([^,]+),\s*([^)]+)\)/g)].map((m) => m[2].trim());
    assert.ok(writes.length > 0, rel);
    assert.ok(writes.every((w) => w === "sealed"), `${rel}: every write is the sealed envelope (${writes.join(", ")})`);
    assert.match(src, /encryptDisplayArtifact\(/, rel);
    assert.match(src, /\$\{ODDS_DISPLAY_ENC_EXT\}/, rel);
    assert.match(src, /readDisplayKey\(\)/, rel);
    assert.doesNotMatch(src, /process\.env\.GTP_ODDS_DISPLAY_KEY|KEY\.key\.toString|console\.[a-z]+\([^)]*KEY\b/, `${rel}: the key is never read directly or printed`);
  }
});
