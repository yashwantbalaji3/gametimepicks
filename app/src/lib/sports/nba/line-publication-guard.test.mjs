/**
 * NBA line publication GUARDS (source level, no build): prices may not be committed before the founder's display decision,
 * and never as a file the static export would serve (provider terms: display yes, redistribution as downloadable files no).
 *   1. while the "site" surface is not authorized, NO file exists under <repo>/data/odds-display/nba/lines/ — CI fails if
 *      someone commits prices before rights are confirmed;
 *   2. no file ever exists under app/public/data/nba/lines/ (authorized or not);
 *   3. when authorized and the display key is present, every committed (encrypted) artifact decrypts and validates
 *      against its committed lane (the reader would throw); plaintext is never stored (odds-display-at-rest.test.mjs);
 *   4. the artifact's home is a build input (vercel-ignore-build.sh) and is NOT an always-public export directory;
 *   5. no shipped module names the app/public lines path.
 * The exported-JSON check (no price or book in any served /data file) is the post-build guard odds-display-export.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { displayAuthorization } from "../../odds/display-authorization.mjs";
import { NBA_LINES_REPO_DIR, validateNbaLinePublication } from "./line-publication.mjs";
import { decryptDisplayArtifact, ODDS_DISPLAY_ENC_EXT, readDisplayKey } from "../../odds/display-crypto.mjs";
import { nbaLinesAad } from "./public-line-records.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const LINES = path.join(REPO, NBA_LINES_REPO_DIR);
const filesIn = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).filter((f) => fs.statSync(path.join(d, f)).isFile()) : []);

test("no NBA line artifact is committed while site display is not authorized", { skip: displayAuthorization("nba", "site").ok && "authorized: see the validation test" }, () => {
  assert.deepEqual(filesIn(LINES), [], `${NBA_LINES_REPO_DIR}/ must be empty until the display authorization record authorizes the site surface`);
});

test("no NBA line file is ever placed under app/public (the export would serve it as a downloadable file)", () => {
  assert.deepEqual(filesIn(path.join(APP, "public/data/nba/lines")), []);
  assert.deepEqual(filesIn(path.join(APP, "public/data/odds-display")), []);
});

test("when authorized and the key is present, every committed artifact decrypts and validates against its committed lane", { skip: !readDisplayKey().ok && "no display key in this environment (the at-rest guard still checks the envelopes)" }, () => {
  const key = readDisplayKey().key;
  for (const f of filesIn(LINES)) {
    assert.ok(f.endsWith(ODDS_DISPLAY_ENC_EXT), `${f}: only encrypted artifacts are stored`);
    const date = path.basename(f, ODDS_DISPLAY_ENC_EXT);
    let sha = null;
    try { sha = crypto.createHash("sha256").update(fs.readFileSync(path.join(APP, "public/data/nba/experimental-public", `${date}.json`))).digest("hex"); } catch { /* no lane */ }
    const text = decryptDisplayArtifact(fs.readFileSync(path.join(LINES, f), "utf8"), key, nbaLinesAad(date));
    assert.ok(text, `${f}: encrypted under another key`);
    const v = validateNbaLinePublication(JSON.parse(text), { date, laneSha256: sha });
    assert.equal(v.ok, true, `${f}: ${v.errors.join("; ")}`);
  }
});

test("the artifact home is a build input and is not an always-public export directory", () => {
  const sh = fs.readFileSync(path.join(APP, "scripts/vercel-ignore-build.sh"), "utf8");
  const block = /# GTP-BUILD-INPUTS-BEGIN\s*\nBUILD_INPUTS=\(([\s\S]*?)\n\)\s*\n# GTP-BUILD-INPUTS-END/.exec(sh);
  assert.ok(block && block[1].includes("':(top)data/odds-display/'"), "data/odds-display/ must be a BUILD_INPUT (a new artifact must rebuild the pages)");
  const prune = fs.readFileSync(path.join(APP, "scripts/prune-internal-routes.mjs"), "utf8");
  const dirs = /const ALWAYS_PUBLIC_DATA_DIRS = \[([^\]]*)\]/.exec(prune)[1];
  assert.doesNotMatch(dirs, /nba\/lines|odds-display/, "line comparisons are rendered into HTML, never served as data files");
});

test("no shipped module names an app/public lines path", () => {
  const hits = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "__fixtures__") walk(p); } else if (/\.(mjs|ts|tsx|js)$/.test(e.name) && !/\.test\./.test(e.name) && /public\/data\/nba\/lines|data["'], ?["']nba["'], ?["']lines/.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(APP, p)); } };
  walk(path.join(APP, "src")); walk(path.join(APP, "scripts"));
  assert.deepEqual(hits, []);
});
