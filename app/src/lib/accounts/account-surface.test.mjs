/**
 * THE ACCOUNT SURFACE, GUARDED (P266) — before a single person signs in.
 *
 * This is the only page that will ever hold something personal, so the rules it must keep are pinned
 * here rather than trusted to review: it fails closed with no project, it never saves a reading the
 * person has not confirmed, the browser refuses exactly what the endpoint refuses, and the record
 * view only reads.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const EXPERIENCE = "src/components/accounts/account-experience.tsx";
const UPLOAD = "src/components/accounts/slip-upload.tsx";
const CONFIRM = "src/components/accounts/slip-confirm.tsx";
const RECORD = "src/components/accounts/my-bets-record.tsx";

test("with no project connected the surface explains itself and builds no client", () => {
  assert.match(code(EXPERIENCE), /cfg\.state !== "READY"/, "the unconfigured state is rendered, not assumed away");
  assert.match(code(EXPERIENCE), /accountsNotice\(cfg\)/);
  const client = code("src/lib/accounts/client.mjs");
  assert.match(client, /if \(cfg\.state !== "READY"\) return null/, "no client without a project");
  // Next inlines process.env.NEXT_PUBLIC_* only where it appears literally.
  assert.match(client, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(client, /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

test("the browser refuses exactly what the endpoint refuses — one definition, imported", () => {
  assert.match(code(UPLOAD), /import \{ ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES \} from "@\/lib\/accounts\/slip-reading\.mjs"/);
  const core = read("api/_slip-read-core.mjs");
  assert.match(core, /from "\.\.\/src\/lib\/accounts\/slip-reading\.mjs"/, "the endpoint imports the same limits");
  assert.ok(!/ALLOWED_TYPES = Object\.freeze/.test(core), "and no longer keeps its own copy");
});

test("a slip is uploaded to the person's OWN folder and saved only after they confirm", () => {
  assert.match(code(UPLOAD), /\$\{userId\}\/\$\{crypto\.randomUUID\(\)\}/, "one folder per person");
  assert.match(code(CONFIRM), /toBetSlipRow\(/);
  assert.match(code(CONFIRM), /confirmedAt: new Date\(\)\.toISOString\(\)/, "the row carries the moment THEY confirmed");
  assert.match(code(CONFIRM), /Nothing is saved yet/, "and the screen says so before they do");
  assert.ok(!/\.insert\(/.test(code(UPLOAD)), "the upload step writes no row");
});

test("a blank field is never treated as a zero", () => {
  const c = code(CONFIRM);
  assert.match(c, /stakeMissing/, "a missing stake blocks the save");
  assert.match(c, /missingOdds/, "so does a missing price");
  assert.match(c, /a blank is not a zero/);
});

test("the record view only reads, and says the sample is small when it is", () => {
  const r = code(RECORD);
  assert.match(r, /\.select\("\*"\)/);
  for (const write of [".insert(", ".update(", ".delete(", ".upsert("]) assert.ok(!r.includes(write), `the record view must not ${write}`);
  assert.match(r, /MIN_DECIDED/, "the small-sample caption comes from the shared floor");
  assert.match(r, /never part of the site's published record/);
});

test("the page is noindex and registered as a destination that is deliberately not in the nav", () => {
  const page = read("src/app/account/page.tsx");
  assert.match(page, /robots: \{ index: false/);
  const inventory = read("src/lib/public-route-inventory.test.mjs");
  assert.match(inventory, /"\/account",/, "registered in APPROVED_DESTINATIONS with its reason");
  for (const surface of ["src/lib/navigation.ts", "src/components/nav.tsx", "src/components/footer.tsx"]) {
    assert.ok(!read(surface).includes('"/account"'), `${surface} must not link accounts until they open`);
  }
});

test("an uploaded slip is read by the SAME engine as our own cards, and claims nothing about itself", () => {
  const panel = code("src/components/accounts/slip-read-panel.tsx");
  assert.match(panel, /from "@\/lib\/parlays\/lab\/slip-insight\.mjs"/, "one engine, not a second implementation");
  assert.match(panel, /not this slip, which has\s+not settled and which nothing here can predict/);
  assert.match(code(CONFIRM), /<SlipReadPanel/, "the read is shown BEFORE saving");
  assert.match(code("src/app/account/page.tsx"), /loadRiskLadderRecord/, "the band record comes from the published ladder");
});

test("the record's trend keeps quiet weeks visible", () => {
  const r = code(RECORD);
  assert.match(r, /weeklyTrend\(rows, \{ weeks: 8 \}\)/);
  assert.match(r, /a faint bar is a week with nothing settled/);
  assert.match(r, /aria-label=\{trend\.map/, "the bars are readable without sight");
});

test("the 'enter it by hand' the upload errors promise actually exists, on the same path", () => {
  const up = code(UPLOAD);
  assert.match(up, /enter the slip by hand|enter it by hand/i, "the uploader makes the promise");
  const exp = code(EXPERIENCE);
  assert.match(exp, /Or enter one by hand/, "and the surface offers it");
  assert.match(exp, /source=\{manual \? "manual" : "screenshot"\}/, "hand-entered slips are recorded as manual");
  assert.match(exp, /<SlipConfirm/, "through the SAME confirm-and-save step, not a second one");
  const confirm = code(CONFIRM);
  assert.match(confirm, /source,\s*imagePath,\s*confirmedAt/, "the row carries whichever source it came from");
  assert.match(confirm, /\+ another leg/, "a hand-entered slip can have more than one leg");
  assert.match(confirm, /removeLeg\(i\)/, "and a leg added by mistake can go");
});
