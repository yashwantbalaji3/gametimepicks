#!/usr/bin/env node
/**
 * PREGAME QB-AVAILABILITY → MARGIN HEAD — walk-forward replay.
 *
 * Executes data/internal/research/nfl/reports/pregame-availability-margin-preregistration.json.
 *
 *   --acquire             hash-pin the registered sources (no scoring).
 *   --score --now <ISO>   the ONE look. Refuses unless the registration is committed and unmodified,
 *                         refuses if the evaluation exists, and refuses on any leakage it cannot rule out.
 *
 * ⚠ THE noLeakage BAR IS CHECKED BEFORE ANY METRIC IS COMPUTED, AND IT CAN END THE RUN.
 *
 * The registration requires, in its own words, that the scorer "assert, per game, that every
 * snapshot it read is stamped strictly before that game's date, and refuse if any is not". That is
 * not a formality: the whole reason this study exists is that the FIRST one had to be labelled a
 * ceiling because it conditioned on post-hoc snaps. A pregame study that cannot prove its inputs
 * predate kickoff is the same study with a better name.
 *
 * ⚠ AND A REFUSAL IS NOT A LOOK. When this refuses it writes NO evaluation file, so the one
 * permitted look survives for a corrected registration. Refusing and scoring are different
 * outcomes and must leave different traces.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const PREREG = "data/internal/research/nfl/reports/pregame-availability-margin-preregistration.json";
const OUT = "data/internal/research/nfl/reports/pregame-availability-margin-evaluation.json";
const REFUSAL = "data/internal/research/nfl/reports/pregame-availability-margin-refusal.json";
const RAW = "data/internal/research/nfl/raw/nflverse";
const SCORED_SEASONS = [2023, 2024, 2025];
const WARMUP_SEASON = 2022;

const argv = process.argv.slice(2);
const MODE = argv.includes("--score") ? "score" : argv.includes("--acquire") ? "acquire" : null;
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why, detail = null) => {
  console.error(`REFUSED: ${why}`);
  if (detail) {
    fs.writeFileSync(rel(REFUSAL), `${JSON.stringify({
      schemaVersion: 1, artifact: "pregame-availability-margin-refusal", dataClass: "PRIVATE_RESEARCH",
      preregistration: PREREG, refusedAt: argOf("--now") ?? null, reason: why, detail,
      oneLookPreserved: "No evaluation file was written. The registration's single permitted look is unspent.",
      verdictIsNot: "This is NOT a REJECTED verdict. REJECTED means the candidate was measured and did not clear its bars; this means the candidate could not be measured under the rules as frozen.",
    }, null, 2)}\n`);
    console.error(`wrote ${REFUSAL}`);
  }
  process.exit(1);
};
if (!MODE) refuse("usage: --acquire | --score --now <ISO>");

const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const seasons = [WARMUP_SEASON, ...SCORED_SEASONS];

if (MODE === "acquire") {
  const pins = {};
  for (const y of seasons) {
    for (const f of [`injuries_${y}.csv`, `depth_charts_${y}.csv`]) {
      const p = rel(path.join(RAW, f));
      pins[f] = fs.existsSync(p) ? sha(p) : null;
    }
  }
  console.log(JSON.stringify(pins, null, 2));
  process.exit(0);
}

if (!argOf("--now")) refuse("--score requires --now <ISO>");
if (fs.existsSync(rel(OUT))) refuse(`${OUT} already exists — this registration permits ONE look`);
const dirty = execFileSync("git", ["status", "--porcelain", "--", PREREG], { cwd: ROOT, encoding: "utf8" }).trim();
if (dirty) refuse(`the registration has uncommitted changes (${dirty}) — it must be frozen before it is scored`);

/*
 * ── THE LEAKAGE GATE ─────────────────────────────────────────────────────────────────────────────
 *
 * Every depth-chart row must carry a capture instant that can be compared to a kickoff date. The
 * nflverse depth_charts release changed shape partway through the registered window:
 *
 *   2022-2024   season, club_code, week, game_type, depth_team, gsis_id, position, ...   NO capture time
 *   2025        dt, team, gsis_id, pos_abb, pos_rank, ...                                 dt is an instant
 *
 * A week-keyed row is PROBABLY leak-free — a Week-N chart scraped during Week N cannot know the
 * Week-N result — but "probably" is exactly what this bar exists to refuse, and nothing in the file
 * records when the row was captured. It could equally be a post-season compilation.
 */
const STAMP_COLUMN = "dt";
const unstamped = [];
const stamped = [];
for (const y of seasons) {
  const p = rel(path.join(RAW, `depth_charts_${y}.csv`));
  if (!fs.existsSync(p)) { unstamped.push({ season: y, reason: "depth chart file absent" }); continue; }
  const header = fs.readFileSync(p, "utf8").slice(0, 4096).split("\n")[0].replace(/\r/g, "").split(",");
  if (header.includes(STAMP_COLUMN)) stamped.push({ season: y, columns: header.length });
  else unstamped.push({ season: y, reason: `no "${STAMP_COLUMN}" column — columns are ${header.slice(0, 6).join(", ")}…`, columns: header });
}
const scoredUnstamped = unstamped.filter((u) => SCORED_SEASONS.includes(u.season));
if (scoredUnstamped.length) {
  refuse(
    `the noLeakage bar cannot be satisfied: ${scoredUnstamped.length} of ${SCORED_SEASONS.length} scored seasons have depth-chart rows with no capture instant`,
    {
      bar: "noLeakage — 'the scorer must assert, per game, that every snapshot it read is stamped strictly before that game's date, and refuse if any is not'",
      stampedSeasons: stamped.map((s) => s.season),
      unstampedSeasons: unstamped,
      whyThisIsNotAWorkaroundAwayFromBeingFixed: [
        "Substituting the week number for a capture instant would replace a proven ordering with an assumed one — the exact substitution that made the first study a ceiling.",
        "Dropping the depth-chart arm changes the registered feature definition (absentPregame = depthChartQb1Change OR primaryQbOutOrDoubtful).",
        "Scoring only the stamped season changes the population and fails the everySeason bar by construction.",
      ],
      whatWouldMakeItExecutable: "A depth-chart source carrying a capture instant for 2022-2025, or a re-registration that declares week-keyed charts leak-free WITH evidence of when nflverse captured them — a decision that belongs in a registration, not in a scorer.",
    },
  );
}
refuse("unreachable: the leakage gate above should have decided this run");
