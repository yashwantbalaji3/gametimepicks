#!/usr/bin/env node
/**
 * GRADE THE LEVEL A RECORD FORWARD → data/internal/products/level-a/graded.jsonl (append-only). OFFLINE: committed
 * official finals only (no network, no key, no price):
 *   MLB      data/internal/mlb/linescores/<productDay>.json (gamePk → homeRuns, awayRuns, isFinal)
 *   EPL      the EPL lane's official finals (sports/epl/official-finals.mjs)
 *   Ligue 1  app/public/data/soccer/ligue-1/results/graded.json (eventId → full-time score)
 *   NBA      the committed NBA finals record (sports/nba/prop-settlement-source.mjs)
 * It reads the record and never writes it. Pending entries wait; conflicts with grades already written are reported
 * and change nothing. See src/lib/products/level-a/grade.mjs for the rules.
 *
 *   npx tsx scripts/products/grade-level-a-suggestions.mjs --now <ISO> [--write]
 *   Default: dry run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeRecord, gradeViolations } from "../../src/lib/products/level-a/grade.mjs";
import { eplOfficialFinals } from "../../src/lib/sports/epl/official-finals.mjs";
import { committedNbaPropResults } from "../../src/lib/sports/nba/prop-settlement-source.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const DIR = path.join(REPO, "data", "internal", "products", "level-a");
export const LEVEL_A_RECORD_FILE = path.join(DIR, "suggestions.jsonl");
export const LEVEL_A_GRADES_FILE = path.join(DIR, "graded.jsonl");

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const readLines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
const parseLines = (t) => t.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

/** The committed finals, read lazily and once. */
export function committedFinals({ repoRoot = REPO, nowIso }) {
  const lines = new Map();
  const mlbDay = (day) => {
    if (!lines.has(day)) {
      const doc = readJson(path.join(repoRoot, "data", "internal", "mlb", "linescores", `${day}.json`));
      lines.set(day, new Map((doc?.games ?? []).map((g) => [String(g.gamePk), g])));
    }
    return lines.get(day);
  };
  let epl = null, ligue = null, nba = null;
  return {
    /* An MLB game's linescore lives under its own date; Level A's product day is the ET date of first pitch. */
    mlb: (leg) => mlbDay(leg.productDay ?? String(leg.startUtc ?? "").slice(0, 10)).get(String(leg.eventId)) ?? null,
    soccer: (sport, eventId) => {
      if (sport === "epl") return (epl ??= eplOfficialFinals({ nowIso })).get(eventId) ?? null;
      if (sport === "ligue-1") {
        ligue ??= new Map((readJson(path.join(repoRoot, "app", "public", "data", "soccer", "ligue-1", "results", "graded.json"))?.matches ?? [])
          .filter((m) => Number.isInteger(m.final?.home) && Number.isInteger(m.final?.away))
          .map((m) => [m.eventId, { status: "FULL_TIME", homeGoalsFT: m.final.home, awayGoalsFT: m.final.away }]));
        return ligue.get(eventId) ?? null;
      }
      return null;
    },
    nba: (eventId) => (nba ??= committedNbaPropResults({ repoRoot }))({ eventId }),
  };
}

export function runGrade({ now, write = false, recordFile = LEVEL_A_RECORD_FILE, gradesFile = LEVEL_A_GRADES_FILE, finals = null, repoRoot = REPO }) {
  if (!Number.isFinite(Date.parse(now ?? ""))) throw new Error("--now <ISO> required");
  const record = parseLines(readLines(recordFile));
  const f = finals ?? committedFinals({ repoRoot, nowIso: now });
  /* The product day travels with the leg so the MLB reader finds the right linescore file. */
  const withDay = record.map((e) => ({ ...e, legs: e.legs.map((l) => ({ ...l, productDay: e.productDay })) }));
  const beforeText = readLines(gradesFile);
  const { rows, conflicts, pending } = gradeRecord({ record: withDay, graded: parseLines(beforeText), finals: f, gradedAt: new Date(Date.parse(now)).toISOString() });
  const afterText = beforeText + rows.map((r) => `${JSON.stringify(r)}\n`).join("");
  const v = gradeViolations({ beforeText, afterText, recordIds: new Set(record.map((e) => e.id)) });
  if (v.length) throw new Error(`grade guard: ${v.join("; ")}`);
  if (write && rows.length) {
    fs.mkdirSync(path.dirname(gradesFile), { recursive: true });
    if (beforeText) fs.appendFileSync(gradesFile, afterText.slice(beforeText.length));
    else fs.writeFileSync(gradesFile, afterText, { flag: "wx" });
    if (readLines(gradesFile) !== afterText) throw new Error("post-write check failed");
  }
  return { entries: record.length, added: rows.length, pending, conflicts, wrote: write && rows.length > 0, grades: rows.map((r) => `${r.productDay} ${r.policy}/${r.tier}: ${r.result}`) };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
  const out = runGrade({ now: arg("--now"), write: process.argv.includes("--write") });
  console.log(JSON.stringify(out, null, 2));
  if (out.conflicts.length) process.exit(3);
}
