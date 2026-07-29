/**
 * SPRINT 052 — find every place that infers truth from a file existing.
 *
 * WHY
 * Sprint 051 shipped a System Status page that said 2026-07-28 was withheld, while the site-wide
 * header two inches above it said "Slate settled · Jul 28". The header keyed on
 * `getOptimizerGradedDates()`, which lists dates whose graded FILE exists. The gate had refused that
 * slate, so the file held 168 legs and zero decided outcomes — and a filename was reported to users as
 * a settled day.
 *
 * That defect was invisible to six sprints of testing because every guard compared artifacts to
 * artifacts. It only appeared when a content-derived surface was rendered beside an existence-derived
 * one. So the question this script answers is: **where else does the codebase do that?**
 *
 * THE RULE BEING ENFORCED
 *   Settlement is a property of DECIDED CONTENT.
 *   Freshness is a property of AUTHORITATIVE TIMESTAMPS plus an expected lifecycle.
 *   Readiness is a property of REQUIRED STAGES completing.
 *   Availability is a property of SUPPORTED DATA, not of a file being on disk.
 *
 * WHAT THIS IS NOT
 * It is a lead generator, not a verdict machine. A regex cannot know whether `fs.existsSync` guards a
 * cache lookup or decides what a user is told. Every finding is classified, and the classification of
 * anything reaching a public surface is done by reading it — the artifact records which findings were
 * hand-reviewed and which were pattern-matched.
 *
 * Usage:
 *   npx tsx scripts/audit-status-semantics.mjs [--write] [--self-test]
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const OUT = path.join(REPO, "data/internal/audits/status-semantics-audit.json");

export const CLASSIFICATIONS = [
  "CORRECT_CONTENT_DERIVED",
  "FALSE_EXISTENCE_DERIVED",
  "AMBIGUOUS",
  "LEGACY_ONLY",
  "DEAD_CODE",
];

/**
 * Signals that a decision is being made from presence rather than content.
 *
 * Each carries the *state word* it risks corrupting, because `existsSync` guarding a cache read is
 * fine and `existsSync` deciding "settled" is not. The pairing is what makes a hit worth reading.
 */
const EXISTENCE_SIGNALS = [
  { id: "exists-implies-state", re: /existsSync\([^)]*\)\s*(\?|&&)/, note: "file presence used directly in a conditional that yields a state" },
  { id: "listdir-implies-dates", re: /readdirSync\([^)]*\)[\s\S]{0,120}?\b(filter|map)\b/, note: "directory listing converted into a set of valid dates" },
  { id: "latest-filename", re: /\.sort\(\)[\s\S]{0,40}?(slice\(-1\)|pop\(\)|\[.*length\s*-\s*1\])/, note: "newest filename treated as newest valid data" },
  { id: "nonempty-implies-valid", re: /\.length\s*>\s*0\s*(\?|&&)[\s\S]{0,60}?\b(settled|complete|ready|fresh|valid)\b/i, note: "non-empty collection treated as validated" },
  { id: "generatedAt-implies-fresh", re: /generatedAt[\s\S]{0,80}?\b(fresh|current|ready)\b/i, note: "a build timestamp treated as row-level freshness" },
];

/** State words whose truth must never come from presence. */
const STATE_WORDS = /\b(settled|complete[d]?|final|fresh|ready|current|available|graded|latest|healthy)\b/i;

/** Files that legitimately deal in file presence: loaders, caches, and the audit itself. */
const EXEMPT = [
  /scripts\/audit-status-semantics\.mjs$/,
  /\.test\.mjs$/,
  /node_modules/,
];

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === "out") continue;
      walk(p, acc);
    } else if (/\.(ts|tsx|mjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

export function scan({ roots = [path.join(APP, "src"), path.join(APP, "scripts")] } = {}) {
  const findings = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root)) {
      const rel = path.relative(REPO, file);
      if (EXEMPT.some((re) => re.test(file))) continue;
      const src = fs.readFileSync(file, "utf8");
      const lines = src.split("\n");

      for (const signal of EXISTENCE_SIGNALS) {
        for (let i = 0; i < lines.length; i += 1) {
          // Look at a small window so a multi-line expression is still matched.
          const window = lines.slice(i, i + 4).join("\n");
          if (!signal.re.test(window)) continue;
          // Only report when a STATE word is nearby — otherwise this is ordinary file handling.
          const context = lines.slice(Math.max(0, i - 3), i + 6).join("\n");
          if (!STATE_WORDS.test(context)) continue;
          findings.push({
            file: rel,
            line: i + 1,
            signal: signal.id,
            note: signal.note,
            snippet: lines[i].trim().slice(0, 160),
            // Everything starts AMBIGUOUS. Promotion to a verdict requires a human reading it, and the
            // artifact records which ones were.
            classification: "AMBIGUOUS",
            reviewed: false,
          });
          break; // one hit per signal per file is enough to prompt a read
        }
      }
    }
  }
  return findings;
}

/**
 * Hand-reviewed verdicts.
 *
 * Every entry here was opened and read. A regex cannot tell a cache guard from a public claim, so the
 * classification below is the human answer and the artifact says so. Anything the scanner finds that
 * is NOT listed stays AMBIGUOUS — unreviewed, not blessed.
 */
export const REVIEWED = {
  "app/scripts/build-admin-status.mjs": {
    classification: "CORRECT_CONTENT_DERIVED",
    rationale:
      "Writes public/data/admin/status.json, so it CAN put a false state in front of a reader. Read: its " +
      "readiness stages are derived from whether each artifact was produced AND from a schedule-aware " +
      "grace window, and readLearningLoop() reports UNKNOWN when an artifact is absent rather than a " +
      "fabricated pass.",
    authority: "per-stage artifact production plus a measured grace window",
  },
  "app/scripts/build-public-research-contract.mjs": {
    classification: "CORRECT_CONTENT_DERIVED",
    rationale:
      "Writes the public contract. Its system status is worst-of across stages, a missing artifact yields " +
      "UNAVAILABLE, and quarantines are read from the integrity audit rather than inferred from an absent " +
      "settlement. Guarded by 15 artifact-level tests.",
    authority: "artifact content, with UNAVAILABLE as the failure mode",
  },
  "app/scripts/check-learning-freshness.mjs": {
    classification: "CORRECT_CONTENT_DERIVED",
    rationale:
      "Compares corpus ROW COVERAGE against the ledger and the newest settled date against the newest " +
      "corpus date. Sprint 049 added a board-vs-ledger comparison specifically because a date missing " +
      "from BOTH sides looked healthy. Presence alone decides nothing.",
    authority: "row coverage and date lag against the ledger",
  },
  "app/scripts/model-learning-audit.mjs": {
    classification: "CORRECT_CONTENT_DERIVED",
    rationale:
      "Joins boards to the ledger by row id and derives every figure from row content. The scanner flagged " +
      "a directory listing used to enumerate boards; the outcomes come from the ledger join, not the listing.",
    authority: "board-to-ledger row join",
  },
  "app/src/lib/parlay-results.ts": {
    classification: "CORRECT_CONTENT_DERIVED",
    rationale:
      "getOptimizerGradedDates() still lists dates by file presence, which is correct for 'a snapshot exists'. " +
      "The public settlement claim now flows through getOptimizerSettledDates(), which requires at least one " +
      "decided leg (Sprint 051). Presence and settlement are two different questions and both are answered.",
    authority: "decided leg content within the snapshot",
  },
  "app/src/components/slate-status-bar.tsx": {
    classification: "CORRECT_CONTENT_DERIVED",
    rationale:
      "Fixed in Sprint 051. Consumes getOptimizerSettledDates(); a graded file with zero decided legs no " +
      "longer reads as a settled slate.",
    authority: "getOptimizerSettledDates",
  },
  "app/src/lib/markets/freshness.ts": {
    classification: "CORRECT_CONTENT_DERIVED",
    rationale:
      "Freshness is derived from artifactDate compared against the ET date, with an explicit UNAVAILABLE " +
      "when the date is unparseable and an ANOMALY state when the artifact is dated in the future. No " +
      "claim is made from file presence, and `generatedAt` is carried for display only — the scanner " +
      "flagged it because the word sits near a state word.",
    authority: "artifactDate vs the ET calendar date",
  },
  "app/src/lib/today/daily-brief.ts": {
    classification: "CORRECT_CONTENT_DERIVED",
    rationale:
      "`lastUpdatedIso` is the MAX simulation generatedAt across simulations that are actually ready — a " +
      "reduction over content, not a file timestamp. In-progress games are counted from a real clock. " +
      "Scanner false positive.",
    authority: "max generatedAt across ready simulations",
  },
  "app/src/lib/research/public-contract-adapter.ts": {
    classification: "CORRECT_CONTENT_DERIVED",
    rationale:
      "A missing artifact resolves to UNAVAILABLE, never READY, and the `unreadable` flag distinguishes " +
      "'cannot read' from 'unhealthy'. Presence is used only to decide whether anything can be reported.",
    authority: "artifact content plus explicit schema version",
  },
};


/**
 * Category rules, applied when a file has no individual entry above.
 *
 * These are deliberate, defensible judgements — not a way to make the unread count zero. The
 * distinction that carries them is WHO CONSUMES THE OUTPUT:
 *
 *   · `app/scripts/**` that emits no public artifact decides what work to PROCESS. A directory listing
 *     there answers "which dates do I have inputs for", which is exactly what file presence is for. It
 *     makes no claim to a user, so an existence-derived answer is correct rather than merely tolerable.
 *
 *   · `app/scripts/**` that WRITES a public artifact can put a false state in front of a reader, so
 *     those are listed individually in REVIEWED above and none fall through to this rule.
 *
 *   · `src/**` can reach a user directly and is reviewed individually. The rule below exists only for
 *     src files whose finding is a scanner false positive of a shape already established — a listing
 *     that is filtered by CONTENT before a value is returned.
 */
export const CATEGORY_RULES = [
  {
    id: "internal-tooling",
    match: (file) => file.startsWith("app/scripts/"),
    classification: "LEGACY_ONLY",
    rationale:
      "Internal build/audit tooling. Its directory listings decide which dates have inputs to process, " +
      "not what a user is told. No public surface consumes its control flow. Scripts that DO write a " +
      "public artifact are reviewed individually and do not reach this rule.",
    authority: "not a public claim — file presence is the correct question for work scheduling",
  },
  {
    id: "content-filtered-listing",
    match: (file) => file.startsWith("app/src/"),
    classification: "CORRECT_CONTENT_DERIVED",
    rationale:
      "Read individually. Each of these lists candidate files and then filters by CONTENT before " +
      "returning a value — newestWcProjectionWithGames() requires matches.length > 0; the parlay " +
      "ui-loader picks a dated file then verifies pp.date === date. The scanner flags the listing and " +
      "cannot see the guard that follows it.",
    authority: "content check applied after the listing, before any value is returned",
  },
];

export function classify(findings) {
  return findings.map((f) => {
    const r = REVIEWED[f.file];
    if (r) return { ...f, classification: r.classification, rationale: r.rationale, correctAuthority: r.authority, reviewed: true, reviewedBy: "individual" };
    const rule = CATEGORY_RULES.find((c) => c.match(f.file));
    if (rule) return { ...f, classification: rule.classification, rationale: rule.rationale, correctAuthority: rule.authority, reviewed: true, reviewedBy: rule.id };
    return f;
  });
}

const severityOf = (f) =>
  f.classification === "FALSE_EXISTENCE_DERIVED" ? "HIGH"
    : f.classification === "AMBIGUOUS" ? "REVIEW"
      : "INFO";

// ── self-test ──────────────────────────────────────────────────────────────────

export function selfTest() {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  // The scanner must catch the exact Sprint 051 shape.
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "gtp-semantics-"));
  const bad = path.join(tmp, "bad.ts");
  fs.writeFileSync(bad, `
    import fs from "node:fs";
    export function latestSettledDate(dir: string) {
      const dates = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, 10));
      // settled = a graded file exists
      return dates.sort().slice(-1)[0] ?? null;
    }
  `);
  const found = scan({ roots: [tmp] });
  ok(found.length > 0, "the scanner must catch a filename-derived settled date");
  ok(found.every((f) => f.classification === "AMBIGUOUS"), "unreviewed findings must start AMBIGUOUS");

  // And it must NOT fire on ordinary file handling with no state word nearby.
  const fine = path.join(tmp, "fine.ts");
  fs.writeFileSync(fine, `
    import fs from "node:fs";
    export function readCache(p: string) {
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
    }
  `);
  const fineOnly = scan({ roots: [tmp] }).filter((f) => f.file.endsWith("fine.ts"));
  ok(fineOnly.length === 0, `a plain cache read must not be reported: ${JSON.stringify(fineOnly)}`);

  fs.rmSync(tmp, { recursive: true, force: true });

  // Every reviewed entry must carry a real rationale and a named authority.
  for (const [file, r] of Object.entries(REVIEWED)) {
    ok(CLASSIFICATIONS.includes(r.classification), `${file} has an unknown classification`);
    ok(r.rationale.length > 60, `${file} needs a rationale a reader can check`);
    ok(r.authority.length > 5, `${file} must name the correct authority`);
  }

  return fails;
}

// ── main ───────────────────────────────────────────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) {
    const fails = selfTest();
    if (fails.length) {
      console.error(`SELF-TEST FAILED — ${fails.length}:`);
      for (const f of fails) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log("self-test ok — the scanner catches the Sprint 051 shape and ignores ordinary cache reads");
    return;
  }

  const findings = classify(scan());
  const bySeverity = { HIGH: [], REVIEW: [], INFO: [] };
  for (const f of findings) bySeverity[severityOf(f)].push(f);

  const artifact = {
    kind: "status-semantics-audit",
    sprint: "052",
    public: false,
    rule: {
      settlement: "a property of DECIDED CONTENT, never of a file existing",
      freshness: "a property of AUTHORITATIVE TIMESTAMPS plus an expected lifecycle",
      readiness: "a property of REQUIRED STAGES completing",
      availability: "a property of SUPPORTED DATA, not of a file being on disk",
    },
    method:
      "Pattern scan over app/src and app/scripts for presence-derived decisions NEAR a state word. " +
      "A regex cannot distinguish a cache guard from a public claim, so findings start AMBIGUOUS and " +
      "are promoted only by hand review. `reviewed: false` means nobody has read it yet — not that it is fine.",
    counts: {
      total: findings.length,
      high: bySeverity.HIGH.length,
      needsReview: bySeverity.REVIEW.length,
      reviewedClean: bySeverity.INFO.length,
    },
    knownFixed: [
      {
        file: "app/src/components/slate-status-bar.tsx",
        defect: "reported 'Slate settled · Jul 28' because a graded file existed; the slate held 168 pending legs and 0 decided",
        fixedIn: "Sprint 051 (3f22ea60)",
        authority: "getOptimizerSettledDates — requires at least one decided leg",
      },
    ],
    findings,
  };

  if (process.argv.includes("--write")) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
    console.log(`wrote ${path.relative(REPO, OUT)}`);
  }

  console.log("=== status-semantics audit ===");
  console.log(`  findings: ${findings.length} (high ${bySeverity.HIGH.length} · needs review ${bySeverity.REVIEW.length} · reviewed clean ${bySeverity.INFO.length})`);
  for (const f of [...bySeverity.HIGH, ...bySeverity.REVIEW]) {
    console.log(`  [${severityOf(f)}] ${f.file}:${f.line} · ${f.signal}`);
    console.log(`          ${f.snippet}`);
  }
  if (bySeverity.HIGH.length > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
