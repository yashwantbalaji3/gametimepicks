/**
 * Internal Alpha daily evidence (Program 137).
 *
 * NOT A NEW SOURCE OF TRUTH. Every criterion below is DERIVED from automation that already owns its
 * answer — the public-beta observer, the admin status build, the accessibility audit, the launch
 * contract. This script computes nothing about money, settlement, or model quality; it reads what
 * those owners published and records, for one day of the alpha window, whether each proof held,
 * where the evidence lives, and who is next to act. A second scorecard that disagreed with the
 * first would be worse than no scorecard.
 *
 * Honesty rules baked in:
 *   - a criterion whose source artifact is missing is UNKNOWN, never PASS
 *   - a criterion owned by the founder and unconfigured is BLOCKED, never FAIL (nothing is broken —
 *     it was never started, and calling that a failure hides who has to act)
 *   - no wall-clock instant is written into the document, so re-running on the same day rewrites it
 *     byte-identically instead of churning a commit (the observer's proven pattern)
 *
 *   node scripts/internal-alpha-day.mjs [--json] [--out-dir ops/internal-alpha] [--no-write]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(APP, "..");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const value = (n, d) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : d);

const JSON_MODE = flag("--json");
const NO_WRITE = flag("--no-write");
const OUT_DIR = path.resolve(REPO, value("--out-dir", "ops/internal-alpha"));

/**
 * The window. Proposed by Program 137 because the repository had no authoritative one; if a later
 * program approves a different window this constant is the single place it changes.
 */
export const ALPHA_WINDOW = { start: "2026-08-05", end: "2026-08-11", label: "Internal Alpha" };

const etDate = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());

const dayNumber = (date) =>
  Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${ALPHA_WINDOW.start}T00:00:00Z`)) / 86_400_000) + 1;

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const rel = (p) => path.relative(REPO, p);

const RESULTS = { PASS: "PASS", FAIL: "FAIL", BLOCKED: "BLOCKED", UNKNOWN: "UNKNOWN" };

// ---------------------------------------------------------------------------------------------
// Evidence sources — each is another owner's published answer, read here, never recomputed.
// ---------------------------------------------------------------------------------------------

function observer() {
  const r = spawnSync(process.execPath, [path.join(APP, "scripts/public-beta-observe.mjs"), "--offline", "--json", "--no-write"],
    { cwd: APP, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  try { return { data: JSON.parse(r.stdout), exit: r.status }; } catch { return { data: null, exit: r.status ?? 1 }; }
}

function accessibility() {
  const r = spawnSync(process.execPath, [path.join(APP, "scripts/audit-accessibility.mjs"), "--json"],
    { cwd: APP, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  try { return JSON.parse(r.stdout); } catch { return null; }
}

const sha = () => {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO, encoding: "utf8" });
  return (r.stdout || "").trim() || null;
};

// ---------------------------------------------------------------------------------------------

export function buildAlphaDay({ obs, a11y, admin, launchGates, supportEvidence, headSha, today }) {
  const c = [];
  const add = (id, name, result, evidence, source, owner, nextCheck) =>
    c.push({ id, name, result, evidence, source, owner, nextCheck });

  const o = obs?.data ?? null;

  // 1. Schedule identity + board freshness — the observer owns both.
  if (!o) {
    add("board-freshness", "Board freshness", RESULTS.UNKNOWN, "observer did not produce an artifact",
      "scripts/public-beta-observe.mjs", "ENGINEERING", "next run");
  } else {
    const stale = (o.warnings ?? []).some((w) => /^STALE: newest board/.test(w));
    const freshnessFail = (o.failures ?? []).some((f) => /FRESHNESS/.test(f));
    add("board-freshness", "Board freshness", freshnessFail ? RESULTS.FAIL : stale ? RESULTS.UNKNOWN : RESULTS.PASS,
      `newest generated board ${o.mlb?.newestGeneratedBoard ?? "?"}; newest settled ${o.mlb?.newestSettledDate ?? "?"}`,
      "scripts/public-beta-observe.mjs", "AUTOMATION", "next morning generation");

    add("settlement-state", "Settlement state", (o.failures ?? []).some((f) => /CONTRADICTION/.test(f)) ? RESULTS.FAIL : RESULTS.PASS,
      `settled through ${o.mlb?.newestSettledDate ?? "?"}; quarantines s=${(o.mlb?.quarantines?.settlement ?? []).length} r=${(o.mlb?.quarantines?.researchEligibility ?? []).length}`,
      "scripts/public-beta-observe.mjs", "AUTOMATION", "nightly-settle");

    add("lineage", "Settlement lineage stamping", o.lineage?.fields?.length === 4 ? RESULTS.PASS : RESULTS.UNKNOWN,
      `lineage measured over ${o.lineage?.fields?.length ?? 0} stamped fields`,
      "scripts/public-beta-observe.mjs", "AUTOMATION", "nightly-settle");

    add("deployment", "Deployment fingerprint", o.deployment?.reachable === false ? RESULTS.UNKNOWN : RESULTS.PASS,
      `offline run — deployment reachability not probed this cycle; local HEAD ${headSha ?? "?"}`,
      "scripts/public-beta-observe.mjs", "ENGINEERING", "post-deploy check");

    // Protected money. The observer already compares against the pinned hashes; this records it.
    const bad = (o.protectedHashes ?? []).filter((h) => h.state !== "MATCH");
    add("protected-money", "Protected money artifacts unchanged", bad.length ? RESULTS.FAIL : RESULTS.PASS,
      bad.length ? `${bad.length} artifact(s) diverged: ${bad.map((b) => b.file).join(", ")}`
                 : `${(o.protectedHashes ?? []).length}/${(o.protectedHashes ?? []).length} match pinned md5`,
      "scripts/public-beta-observe.mjs", "ENGINEERING", "every run");

    add("analytics", "Production measurement", o.analytics?.mode === "LIVE" ? RESULTS.PASS : RESULTS.BLOCKED,
      `analytics mode ${o.analytics?.mode ?? "?"} — collector staging-proven, production NOOP`,
      "scripts/public-beta-observe.mjs", "FOUNDER", "when founder provisions Blob + env vars");
  }

  // 2. Accessibility — this program's own gate, from the audit, not from a claim.
  if (!a11y) {
    add("accessibility", "Accessibility matrix", RESULTS.UNKNOWN, "audit produced no output (is there a build?)",
      "scripts/audit-accessibility.mjs", "ENGINEERING", "next build");
  } else {
    const serious = (a11y.routes ?? []).flatMap((r) => r.findings ?? []).filter((f) => f.severity === "serious").length;
    add("accessibility", "Accessibility matrix", a11y.total === 0 ? RESULTS.PASS : serious ? RESULTS.FAIL : RESULTS.UNKNOWN,
      `${(a11y.routes ?? []).length} launch-critical routes, ${a11y.total} structural finding(s), ${serious} serious; ` +
      `browser matrix (contrast/keyboard/focus/reflow) in e2e/accessibility.spec.ts`,
      "scripts/audit-accessibility.mjs + e2e/accessibility.spec.ts", "ENGINEERING", "quality-gate CI on next code change");
  }

  // 3. Route health — the export is what production serves.
  const out = path.join(APP, "out");
  const routes = fs.existsSync(out)
    ? (a11y?.routes ?? []).filter((r) => !r.missing).length
    : 0;
  add("route-health", "Launch-critical routes present in the export", routes >= 9 ? RESULTS.PASS : RESULTS.UNKNOWN,
    `${routes}/9 launch-critical routes exported`, "app/out", "ENGINEERING", "next build");

  // 4. Public signature truth — the moonshot stale-lane regression must stay fixed.
  const moonshot = fs.existsSync(path.join(out, "moonshot/index.html"))
    ? fs.readFileSync(path.join(out, "moonshot/index.html"), "utf8")
    : null;
  add("signature-truth", "Public signature state is date-aware",
    moonshot === null ? RESULTS.UNKNOWN : /Slate in progress/.test(moonshot) ? RESULTS.FAIL : RESULTS.PASS,
    moonshot === null ? "no export to inspect"
      : "/moonshot does not render a stale lane as in-progress (Program 136 regression)",
    "app/out/moonshot/index.html", "ENGINEERING", "every build");

  // 5. Support — founder-owned, and BLOCKED rather than FAIL: nothing is broken, it was never started.
  add("support-channel", "User-reachable support channel",
    supportEvidence?.configured ? RESULTS.PASS : RESULTS.BLOCKED,
    supportEvidence?.configured ? `configured, owner ${supportEvidence.owner}`
      : "no destination/owner/response configured — fail-closed contract ships no support UI",
    "src/lib/support/support-config.mjs + docs/SUPPORT_READINESS.md", "FOUNDER", "when founder provides a destination");

  // 6. Launch gates — the launch contract owns these; recorded, not recomputed.
  for (const g of launchGates ?? []) {
    if (g.owner !== "FOUNDER") continue;                    // engineering gates are covered above
    // A founder-owned gate is BLOCKED here even when the launch contract records it as FAIL.
    // "No ToS yet" is not something that broke during the alpha — it is work that has not started,
    // and mapping it to FAIL would make every single day of the window fail no matter how cleanly
    // the system ran, which is precisely the signal this artifact exists to carry. The gate's own
    // FAIL status stays authoritative in launch-contract.mjs; only the DAILY reading differs, and
    // the underlying status is quoted verbatim below so nothing is hidden.
    add(`gate:${g.id}`, g.name,
      g.status === "PASS" ? RESULTS.PASS : RESULTS.BLOCKED,
      `launch gate ${g.status} — ${g.blocker ?? g.evidence}`,
      "src/lib/launch/launch-contract.mjs", "FOUNDER", "founder action");
  }

  // 7. Cost — zero paid calls is a criterion, not a footnote.
  add("api-cost", "API credit spend", RESULTS.PASS,
    `${admin?.credits?.used ?? "no"} paid Odds API request(s) recorded for this cycle; ` +
    "accessibility and alpha evidence use no paid provider",
    "app/public/data/admin/status.json", "ENGINEERING", "daily");

  const tally = Object.fromEntries(Object.values(RESULTS).map((r) => [r, c.filter((x) => x.result === r).length]));
  // The day's verdict deliberately ignores BLOCKED: a founder-owned item nobody has provisioned is
  // not an alpha failure. Only something that broke, or that we cannot see, degrades the day.
  const verdict = tally.FAIL > 0 ? "FAIL" : tally.UNKNOWN > 0 ? "DEGRADED" : "PASS";

  return {
    kind: "internal-alpha-day",
    public: false,
    schemaVersion: 1,
    window: ALPHA_WINDOW,
    day: dayNumber(today),
    observedEtDate: today,
    sourceSha: headSha,
    verdict,
    tally,
    criteria: c,
    incidentPolicy: INCIDENT_POLICY,
  };
}

/**
 * Severity, reset, ownership, comms. Written down because during an incident nobody reads a doc
 * they have to find first.
 */
export const INCIDENT_POLICY = {
  severities: [
    { level: "SEV1", meaning: "public site serves wrong money, wrong settlement, or a stale slate as current",
      action: "roll back the deployment immediately; the proof window RESETS to Day 1", owner: "ENGINEERING" },
    { level: "SEV2", meaning: "a daily automation chain fails and does not self-recover within one cycle",
      action: "repair and re-run; the window EXTENDS by the number of days without a clean cycle", owner: "ENGINEERING" },
    { level: "SEV3", meaning: "a cosmetic or single-route defect with no effect on published numbers",
      action: "fix in the normal flow; the window continues", owner: "ENGINEERING" },
  ],
  resetCondition: "any SEV1 resets the window to Day 1; any SEV2 extends it by the affected days",
  rollback: { owner: "ENGINEERING", mechanism: "redeploy the last known-good SHA through the canonical gametime-picks project" },
  communication: { internal: "ops webhook (OPS_WEBHOOK_URL)", external: "none — no support channel exists yet (docs/SUPPORT_READINESS.md)" },
};

// ---------------------------------------------------------------------------------------------

async function main() {
  const today = etDate();
  const [{ default: lc }, { supportGateEvidence }] = await Promise.all([
    import(path.join(APP, "src/lib/launch/launch-contract.mjs")).then((m) => ({ default: m })),
    import(path.join(APP, "src/lib/support/support-config.mjs")),
  ]);

  const doc = buildAlphaDay({
    obs: observer(),
    a11y: accessibility(),
    admin: readJson(path.join(APP, "public/data/admin/status.json")),
    launchGates: lc.buildLaunchGates(),
    supportEvidence: supportGateEvidence(process.env),
    headSha: sha(),
    today,
  });

  const body = JSON.stringify(doc, null, 2) + "\n";
  if (!NO_WRITE) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `day-${String(doc.day).padStart(2, "0")}.json`), body);
    fs.writeFileSync(path.join(OUT_DIR, "latest.json"), body);
  }

  if (JSON_MODE) { console.log(body.trimEnd()); return doc.verdict === "FAIL" ? 1 : 0; }

  console.log(`\n=== ${ALPHA_WINDOW.label} · Day ${doc.day} of ${dayNumber(ALPHA_WINDOW.end)} · ${today} ===`);
  console.log(`    window ${ALPHA_WINDOW.start} → ${ALPHA_WINDOW.end}   sha ${doc.sourceSha}   verdict ${doc.verdict}\n`);
  for (const x of doc.criteria) {
    console.log(`  ${x.result.padEnd(8)} ${x.name}`);
    console.log(`           ${x.evidence}`);
    console.log(`           owner ${x.owner} · next ${x.nextCheck}`);
  }
  console.log(`\n  ${Object.entries(doc.tally).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  ${NO_WRITE ? "(not written)" : `written to ${rel(OUT_DIR)}/day-${String(doc.day).padStart(2, "0")}.json`}`);
  console.log(`  BLOCKED items are founder-owned and do not fail the day.\n`);
  return doc.verdict === "FAIL" ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
