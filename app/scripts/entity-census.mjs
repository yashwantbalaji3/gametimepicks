/**
 * ENTITY CENSUS (Sprint 016 · Phase 1) — counts every player/team identity call site in src/ and buckets it
 * by the mechanism that renders it.
 *
 *   npx tsx app/scripts/entity-census.mjs            # summary
 *   npx tsx app/scripts/entity-census.mjs --files    # per-file detail
 *   npx tsx app/scripts/entity-census.mjs --json     # machine-readable (used by the guard test)
 *
 * This exists so migration progress is MEASURED, not asserted. The same script produced the pre-migration
 * baseline in docs/SPRINT_016_ENTITY_MIGRATION.md; re-run it after any batch and the canonical share must
 * rise while the non-canonical total falls. It reads source text only — it renders nothing and imports no
 * application code, so it can never be fooled by a component that merely re-exports another.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

/**
 * Mechanisms, in match priority order. A line is attributed to the FIRST pattern it matches, so the
 * canonical buckets must come first (a file importing both still gets each call site counted correctly
 * because we match per JSX tag, not per file).
 */
const MECHANISMS = [
  // ── Canonical (the target state) ──
  { key: "canonical:PlayerCard", kind: "player", canonical: true, re: /<PlayerCard(?:[\s/>]|$)/ },
  { key: "canonical:PlayerPortrait", kind: "player", canonical: true, re: /<PlayerPortrait(?:[\s/>]|$)/ },
  { key: "canonical:GameHeader", kind: "team", canonical: true, re: /<GameHeader(?:[\s/>]|$)/ },
  { key: "canonical:TeamLogo(entity)", kind: "team", canonical: true, re: /<TeamLogo(?:[\s/>]|$)/ },
  { key: "canonical:EntityHeader", kind: "team", canonical: true, re: /<EntityHeader(?:[\s/>]|$)/ },
  // ── Player rivals ──
  { key: "rival:PlayerAvatar", kind: "player", canonical: false, re: /<PlayerAvatar(?:[\s/>]|$)/ },
  { key: "rival:MlbPlayerAvatar", kind: "player", canonical: false, re: /<MlbPlayerAvatar(?:[\s/>]|$)/ },
  // ── Team rivals ──
  { key: "rival:MatchupIdentity", kind: "team", canonical: false, re: /<MatchupIdentity(?:[\s/>]|$)/ },
  { key: "rival:TeamMark", kind: "team", canonical: false, re: /<TeamMark(?:[\s/>]|$)/ },
  { key: "rival:TeamBadge", kind: "team", canonical: false, re: /<TeamBadge(?:[\s/>]|$)/ },
  { key: "rival:FlagBadge", kind: "team", canonical: false, re: /<FlagBadge(?:[\s/>]|$)/ },
  { key: "rival:CricketTeamBadge", kind: "team", canonical: false, re: /<CricketTeamBadge(?:[\s/>]|$)/ },
];

/** Files that DEFINE a primitive rather than consuming one — their internal usage is not a migration target. */
const DEFINITION_FILES = new Set([
  "components/entity/index.tsx",
  "components/player-avatar.tsx",
  "components/ui/player-avatar.tsx",
  "components/ui/team-mark.tsx",
  "components/ui/matchup-identity.tsx",
  "components/team-logo.tsx",
  "components/team-badge.tsx",
  "components/flag-badge.tsx",
  "components/mlb/mlb-player-avatar.tsx",
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const rows = [];
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file);
  if (DEFINITION_FILES.has(rel)) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const src = lines.join("\n");

  // Component NAMES are ambiguous — `TeamLogo` is both the canonical entity export and a legacy default
  // export, and two different files both export `PlayerAvatar`. Imports also mix alias and relative paths
  // ("@/components/team-logo" vs "./team-logo"), so matching the alias alone silently miscounts legacy call
  // sites as canonical. Resolve CANONICAL POSITIVELY: a name counts as canonical only when this file
  // actually imports it from "@/components/entity". Anything else is treated as non-canonical (fail-closed),
  // so the census can never overstate migration progress.
  const entityImport = src.match(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*components\/entity["']/);
  const canonicalNames = new Set(
    (entityImport?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/).pop().trim())
      .filter(Boolean),
  );
  const uiPlayerAvatar = /from\s+["'][^"']*ui\/player-avatar["']/.test(src);

  lines.forEach((line, i) => {
    for (const m of MECHANISMS) {
      if (!m.re.test(line)) continue;
      let key = m.key;
      let canonical = m.canonical;
      if (m.canonical) {
        // Claimed canonical — only honoured if the name really came from @/components/entity.
        const bare = m.key.split(":")[1].replace(/\(.*\)$/, "");
        if (!canonicalNames.has(bare)) {
          key = `rival:${bare}(legacy)`;
          canonical = false;
        }
      }
      if (m.key === "rival:PlayerAvatar" && uiPlayerAvatar) key = "rival:PlayerAvatar(ui)";
      rows.push({ file: rel, line: i + 1, key, kind: m.kind, canonical });
      break;
    }
    // Ad-hoc identity markup: a bare <img> whose surrounding text names a headshot/logo/crest/avatar.
    if (/<img\b/.test(line) && /headshot|logo|crest|avatar|portrait/i.test(line)) {
      rows.push({ file: rel, line: i + 1, key: "adhoc:img", kind: /headshot|avatar|portrait/i.test(line) ? "player" : "team", canonical: false });
    }
  });
}

const summary = {};
for (const r of rows) {
  summary[r.key] ??= { key: r.key, kind: r.kind, canonical: r.canonical, sites: 0, files: new Set() };
  summary[r.key].sites += 1;
  summary[r.key].files.add(r.file);
}
const list = Object.values(summary)
  .map((s) => ({ ...s, files: s.files.size }))
  .sort((a, b) => Number(b.canonical) - Number(a.canonical) || b.sites - a.sites);

const total = (pred) => rows.filter(pred).length;
const totals = {
  canonical: total((r) => r.canonical),
  nonCanonical: total((r) => !r.canonical),
  player: { canonical: total((r) => r.canonical && r.kind === "player"), nonCanonical: total((r) => !r.canonical && r.kind === "player") },
  team: { canonical: total((r) => r.canonical && r.kind === "team"), nonCanonical: total((r) => !r.canonical && r.kind === "team") },
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ totals, mechanisms: list, rows }, null, 2));
} else {
  console.log("=== ENTITY CENSUS ===");
  console.log("mechanism".padEnd(30), "kind".padEnd(7), "sites".padStart(6), "files".padStart(6));
  for (const s of list) {
    console.log(`${s.canonical ? "✓ " : "  "}${s.key}`.padEnd(30), s.kind.padEnd(7), String(s.sites).padStart(6), String(s.files).padStart(6));
  }
  console.log("\ncanonical:", totals.canonical, "| non-canonical:", totals.nonCanonical);
  console.log("player  canonical:", totals.player.canonical, "non-canonical:", totals.player.nonCanonical);
  console.log("team    canonical:", totals.team.canonical, "non-canonical:", totals.team.nonCanonical);
  if (process.argv.includes("--files")) {
    console.log("\n=== per site ===");
    for (const r of rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      console.log(`${r.canonical ? "✓" : " "} ${r.file}:${r.line}  ${r.key}`);
    }
  }
}
