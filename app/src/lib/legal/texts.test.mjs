/**
 * Guards for the legal drafts. Two jobs: the publish gate is total and fail-closed, and every
 * factual statement in the privacy notice stays true of the code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LEGAL_DOCUMENTS, LEGAL_PARAMETERS, legalContentHash, legalReadiness, renderLegal } from "./texts.mjs";
import { LEGAL_CONTENT_MANIFEST } from "./content-manifest.mjs";

const SRC = path.resolve(process.cwd(), "src");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const SOURCE = walk(SRC).filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !/\.test\./.test(f));
/*
 * READ DEFENSIVELY. The identity suite writes `settlement-lineage.mutation-probe.ts` into src and
 * deletes it again, so a file listed by the walk above can be gone by the time this reads it — and a
 * plain readFileSync then fails these tests with an ENOENT that looks like a privacy finding. A file
 * that no longer exists ships nothing and can violate nothing; it is skipped, not excused.
 */
const readSource = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };

test("TODAY · neither document can publish, and each says exactly why", () => {
  for (const id of Object.keys(LEGAL_DOCUMENTS)) {
    const r = legalReadiness(id);
    assert.equal(r.publishable, false);
    assert.ok(r.reasons.some((x) => /only APPROVED publishes/.test(x)), `${id}: not approved`);
    assert.ok(r.unresolved.includes("state") || id === "privacy", `${id}: the governing state is still undecided`);
    assert.ok(r.unresolved.includes("contact"), `${id}: no contact until support is real`);
    assert.ok(r.unresolved.includes("effectiveDate"), `${id}: no effective date before approval`);
  }
  assert.ok(legalReadiness("terms").placeholders.includes("operator"), "the placeholder operator is named as a blocker");
});

test("the founder's answers are in the text", () => {
  const t = renderLegal("terms").text;
  assert.match(t, /adults aged 18 or older located in the United States/);
  assert.match(t, /research and education/);
  assert.match(t, /operated by GameTime Picks/);
  assert.match(renderLegal("privacy").text, /not directed to anyone under 18/);
});

const approvedManifest = (id, hash) => ({ ...LEGAL_CONTENT_MANIFEST, sections: { ...LEGAL_CONTENT_MANIFEST.sections, [id]: { status: "APPROVED", effectiveDate: "2026-10-01", approval: { reviewer: "A. Reviewer", role: "counsel", approvedOn: "2026-09-30", packetVersion: 1, contentHash: hash } } } });
const decided = { ...LEGAL_PARAMETERS, operator: { value: "Example LLC" }, state: { value: "New Jersey" }, contact: { value: "the support page" }, effectiveDate: { value: "October 1, 2026" } };

test("APPROVED + decided + the reviewed hash → publishes; change one sentence → locks again", () => {
  const hash = legalContentHash("terms", decided);
  assert.equal(legalReadiness("terms", { manifest: approvedManifest("terms", hash), params: decided }).publishable, true);
  const edited = { ...decided, state: { value: "New York" } };
  const r = legalReadiness("terms", { manifest: approvedManifest("terms", hash), params: edited });
  assert.equal(r.publishable, false);
  assert.ok(r.reasons.some((x) => /changed after it was reviewed/.test(x)));
});

test("a placeholder can never publish, even with an approval", () => {
  const withPlaceholder = { ...decided, operator: { value: "GameTime Picks", placeholder: true } };
  const hash = legalContentHash("terms", withPlaceholder);
  assert.equal(legalReadiness("terms", { manifest: approvedManifest("terms", hash), params: withPlaceholder }).publishable, false);
});

test("an unknown parameter in the text is an error, not a silent blank", () => {
  assert.throws(() => renderLegal("terms", { ...LEGAL_PARAMETERS, site: undefined }), /unknown parameter/);
});

/* ── The privacy notice is only as good as its facts. Each claim below is checked against the code. ── */

test("FACT · 'sets no cookies' — nothing in src sets a cookie", () => {
  const hits = SOURCE.filter((f) => /document\.cookie\s*=|cookies\(\)\.set|Set-Cookie/i.test(readSource(f)));
  assert.deepEqual(hits.map((f) => path.relative(SRC, f)), [], "a cookie now exists — the privacy notice must change first");
  assert.match(renderLegal("privacy").text, /sets no cookies/);
});

test("FACT · browser storage is exactly what the notice names (preferences, follows, slip, arrival)", () => {
  const users = SOURCE.filter((f) => /\b(localStorage|sessionStorage)\.(setItem|getItem)/.test(readSource(f))).map((f) => path.relative(SRC, f)).sort();
  assert.deepEqual(users, [
    "components/analytics-bootstrap.tsx",
    "lib/follow/follow-store.ts",
    "lib/prefs/reader-prefs.ts",
    "lib/slip/slip-store.ts",
  ], "a new browser-storage use exists — describe it in the privacy notice, then update this list");
  assert.ok(!SOURCE.some((f) => /\bindexedDB\b/.test(readSource(f))), "IndexedDB is not described");
});

test("FACT · the email section is true: no newsletter or form collects addresses; support email is disclosed", () => {
  const p = renderLegal("privacy").text;
  assert.match(p, /no newsletter or sign-up form/);
  assert.match(p, /If you write to us through the support link, we receive your message and your email address/);
  assert.match(p, /Support email is handled by Google \(Gmail\)/);
  // The newsletter posts only when NEXT_PUBLIC_BUTTONDOWN_USERNAME is set. It is not set for the
  // public build; if it ever is, the notice's email section is false and must change first.
  assert.equal(process.env.NEXT_PUBLIC_BUTTONDOWN_USERNAME ?? "", "");
});

test("FACT · the analytics section follows the build's analytics switch, both ways", async () => {
  const { execFileSync } = await import("node:child_process");
  const render = (env) => execFileSync(process.execPath, ["--input-type=module", "-e",
    'import { renderLegal } from "./src/lib/legal/texts.mjs"; process.stdout.write(renderLegal("privacy").text);'],
    { env: { ...process.env, NEXT_PUBLIC_ANALYTICS_ENABLED: "", NEXT_PUBLIC_ANALYTICS_ENDPOINT: "", ...env }, encoding: "utf8" });
  const off = render({});
  assert.match(off, /Visitor analytics are switched off/);
  const on = render({ NEXT_PUBLIC_ANALYTICS_ENABLED: "1", NEXT_PUBLIC_ANALYTICS_ENDPOINT: "https://gametimepicks.yashwantbalaji.com/api/collect/" });
  assert.doesNotMatch(on, /switched off/);
  assert.match(on, /first-party, cookieless measurement/);
  assert.match(on, /deleted automatically after 90 days/);
  assert.equal(render({ NEXT_PUBLIC_ANALYTICS_ENABLED: "1" }).includes("switched off"), true, "a switch with no endpoint sends nothing, so the notice says off");
});
