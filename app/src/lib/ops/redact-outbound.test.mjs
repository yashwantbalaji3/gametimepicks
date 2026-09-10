/**
 * Guards for outbound redaction.
 *
 * These mirror the assertions scripts/ops_alert_test.sh makes about the shell implementation, so
 * the two senders are held to ONE contract rather than to two that drift. They also live in the
 * suite, which the shell proof did not — that is how this whole class of gap survived three weeks.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OUTBOUND_MAX_CHARS, redactOutbound } from "./redact-outbound.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("local and CI paths never leave the repo", () => {
  assert.equal(redactOutbound("failed at /Users/someone/secret/repo/file.mjs"), "failed at <path>");
  assert.equal(redactOutbound("ENOENT /home/runner/work/gametimepicks/x.json"), "ENOENT <path>");
  assert.equal(redactOutbound("read /root/.env"), "read <path>");
});

test("key-shaped tokens and hashes are dropped", () => {
  assert.match(redactOutbound("using key abcdefghijklmnopqrstuvwxyz123"), /<redacted>/);
  // The protected-md5 shape this repo guards elsewhere.
  assert.match(redactOutbound("md5 affe6b21071f2b3be96bb2774eb347c3 mismatch"), /<redacted>/);
  assert.ok(!redactOutbound("md5 affe6b21071f2b3be96bb2774eb347c3").includes("affe6b21"));
});

test("secret-bearing parameters keep their name and lose their value", () => {
  // The NAME is deliberately kept: an operator needs to know WHICH credential is implicated.
  for (const k of ["apiKey", "api_key", "token", "secret", "password", "APIKEY"]) {
    const out = redactOutbound(`request failed ${k}=hunter2swordfish`);
    assert.match(out, new RegExp(`${k}=<redacted>`, "i"), k);
    assert.ok(!out.includes("hunter2swordfish"), `${k} value leaked`);
  }
});

test("only the first line survives, and it is truncated hard", () => {
  assert.equal(redactOutbound("first line\nsecond line\nthird"), "first line");
  // NB: a single 500-character alphanumeric run is itself token-shaped and correctly collapses to
  // "<redacted>" — which makes it useless for testing truncation. A realistic long line is words.
  const long = Array.from({ length: 120 }, (_, i) => `word${i % 7}`).join(" ");
  assert.ok(long.length > OUTBOUND_MAX_CHARS);
  assert.equal(redactOutbound(long).length, OUTBOUND_MAX_CHARS, "a stack trace is not an alert");
});

test("empty and nullish input produce an empty string, never 'undefined'", () => {
  // A literal "undefined" reaching a webhook is the shape this repo has shipped before.
  for (const v of [null, undefined, "", "   "]) assert.equal(redactOutbound(v), "");
});

test("an ordinary message passes through intact", () => {
  // Over-redaction is the safe direction, but a rule that mangles every alert gets removed.
  const msg = "publication-slo: no board and the deadline passed at 14:05 ET";
  assert.equal(redactOutbound(msg), msg);
});

/* THE INVARIANT THE SHELL GUARD WAS ALWAYS ABOUT — rebased, not deleted.
   ops_alert_test.sh asked which script a workflow names. That heuristic missed the composite-action
   path entirely and flagged two workflows that were doing nothing wrong, while the actual unvetted
   sender went unnoticed. The property that matters is not the name. */
test("every sender that can POST to OPS_WEBHOOK_URL redacts first", () => {
  const senders = [
    { file: "app/scripts/ops-notify.mjs", marker: /redactOutbound/ },
    { file: "scripts/ops_alert.sh", marker: /REDACTED_ERROR/ },
  ];
  for (const { file, marker } of senders) {
    const src = fs.readFileSync(path.join(REPO, file), "utf8");
    assert.match(src, /OPS_WEBHOOK_URL/, `${file} is expected to be an outbound sender`);
    assert.match(src, marker, `${file} POSTs without redacting its free-form field`);
  }

  /* And no THIRD sender appears without joining the contract.
   *
   * THE DETECTOR KEYS ON THE CAPABILITY, NOT THE NAME. A first cut flagged public-beta-observe.mjs
   * and settle-mlb-player-props.mjs, both of which merely DISCUSS OPS_WEBHOOK_URL in prose — one
   * reports it as UNVERIFIABLE_LOCALLY on purpose, the other explains a past paging incident. That
   * is precisely the mistake the shell guard made in the other direction, and repeating it would
   * have traded two false negatives for two false positives. Reading the variable is what makes a
   * file able to send; naming it is not. */
  const known = new Set(senders.map((s) => s.file));
  const roots = ["app/scripts", "scripts"];
  const offenders = [];
  for (const root of roots) {
    for (const f of fs.readdirSync(path.join(REPO, root))) {
      const rel = `${root}/${f}`;
      if (known.has(rel)) continue;
      if (!/\.(mjs|sh|js)$/.test(f)) continue;
      const src = fs.readFileSync(path.join(REPO, rel), "utf8");
      const readsUrl =
        /process\.env\.OPS_WEBHOOK_URL/.test(src) ||          // node
        /\$\{?OPS_WEBHOOK_URL\}?/.test(src);                  // shell expansion
      if (!readsUrl) continue;
      if (/\bfetch\s*\(|\bcurl\b/.test(src)) offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "a new outbound sender exists that does not redact — add it to the list and give it redactOutbound",
  );
});
