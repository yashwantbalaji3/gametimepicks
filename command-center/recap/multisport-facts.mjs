/**
 * FIVE-SPORT FACTS — what GameTimePicks actually has, per sport, for a seven-day content window. Read-only.
 *
 * Every fact comes from a committed public data file of the GameTimePicks repository, read at ONE pinned commit
 * (`git show <sha>:<path>`), so each reference is immutable: commit + path + the file's sha256. Nothing is fetched
 * from the internet and nothing is written.
 *
 *   capability   app/src/lib/sport-capability-registry.ts — the site's own per-sport state (FULL_MODEL,
 *                EXPERIMENTAL_PUBLIC, HISTORICAL_ONLY, SCAFFOLD_ONLY …) and its reason, quoted verbatim
 *   schedule     NFL / NBA / UFC: ESPN schedule captures · MLB: StatsAPI schedule · EPL: the public forecast file
 *   forecasts    NFL: daily public forecasts (PUBLIC_EXPERIMENTAL, not frozen until kickoff) · MLB: the official
 *                prediction snapshot (FULL_MODEL) · EPL: model-only public forecast (EXPERIMENTAL_PUBLIC)
 *                · NBA: none validated (its lane is an "UNVALIDATED EXPERIMENTAL SIMULATION", never product-
 *                eligible) · UFC: none independent (SCAFFOLD_ONLY)
 *   results      NFL / EPL: ESPN results captures · NBA: the write-once finals record · all: the Universal
 *                Forecast Ledger (data/internal/forecast-ledger/v1), whose rows enter only after an event starts
 *                and carry the canonical settlement — the source for "our forecast vs the final" recaps
 *
 * Each item is labelled with what it is: a canonical forecast, an experimental forecast, a historical record, or a
 * simulation — never one presented as another.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
export const etDate = (iso) => ET.format(new Date(iso));
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const pct = (p) => `${(Math.round(p * 1000) / 10).toFixed(1)}%`;

/** A read-only view of the data at one commit (git) or of a directory (tests). */
export function gitDataSource(repoRoot, ref) {
  const commit = execFileSync("git", ["rev-parse", `${ref}^{commit}`], { cwd: repoRoot, encoding: "utf8" }).trim();
  const cache = new Map();
  const lists = new Map();
  return {
    label: `git ${ref} @ ${commit.slice(0, 12)}`, commit,
    read(p) {
      if (!cache.has(p)) {
        try {
          cache.set(p, execFileSync("git", ["show", `${commit}:${p}`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }));
        } catch {
          cache.set(p, null);
        }
      }
      return cache.get(p);
    },
    list(dir) {
      if (!lists.has(dir)) {
        try {
          lists.set(dir, execFileSync("git", ["ls-tree", "--name-only", `${commit}:${dir}`], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n").filter(Boolean));
        } catch {
          lists.set(dir, []);
        }
      }
      return lists.get(dir);
    },
    /** When the commit was made: how fresh the data can be. */
    committedAt: execFileSync("git", ["show", "-s", "--format=%cI", commit], { cwd: repoRoot, encoding: "utf8" }).trim(),
  };
}

export function dirDataSource(root, label = `working tree ${root}`) {
  return {
    label, commit: null,
    read: (p) => (fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), "utf8") : null),
    list: (dir) => (fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)) : []),
  };
}

/** Parse the site's capability registry (states and reasons, verbatim). */
export function readCapabilities(src) {
  const text = src.read("app/src/lib/sport-capability-registry.ts") ?? "";
  const out = {};
  const re = /key:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*state:\s*"([A-Z_]+)",\s*reason:\s*"((?:[^"\\]|\\.)*)"/g;
  for (let m; (m = re.exec(text));) out[m[1]] = { state: m[3], reason: m[4].replace(/\\"/g, '"') };
  return out;
}

const FORECAST_CLASS = { FULL_MODEL: "canonical", EXPERIMENTAL_PUBLIC: "experimental" };

/**
 * @param {{ src: object, from: string (YYYY-MM-DD, ET), days?: number, lookbackDays?: number }} o
 */
export function multiSportFacts({ src, from, days = 7, lookbackDays = 3 }) {
  const to = addDays(from, days - 1);
  const lookFrom = addDays(from, -lookbackDays);
  const inWindow = (iso) => { const d = etDate(iso); return d >= from && d <= to; };
  const inLookback = (iso) => { const d = etDate(iso); return d >= lookFrom && d < from; };
  const files = [];
  const json = (p) => {
    const raw = src.read(p);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    files.push({ path: p, sha256: sha(raw), generatedAt: parsed.generatedAt ?? parsed.updatedAt ?? parsed.capturedAt ?? null });
    return parsed;
  };
  const ledger = (sport) => {
    const p = `data/internal/forecast-ledger/v1/${sport}.jsonl`;
    const raw = src.read(p);
    if (raw == null) return [];
    files.push({ path: p, sha256: sha(raw), generatedAt: null });
    return raw.trim().split("\n").map((l) => JSON.parse(l));
  };
  const caps = readCapabilities(src);
  // Fail closed: a data source without the GameTimePicks capability registry (e.g. the private ops repo on a hosted
  // runner, before GTP_CC_DATA_REPO points at the public data) must not produce a quietly empty calendar.
  if (!["nfl", "nba", "mlb", "ufc", "epl"].every((k) => caps[k])) {
    throw new Error(`${src.label} has no GameTimePicks capability registry for all five sports — point GTP_CC_DATA_REPO / GTP_CC_DATA_REF at the public data`);
  }
  const capOf = (key) => caps[key] ?? { state: "DISABLED", reason: "not in the capability registry — fails closed" };

  /** Our published forecast for a finished event, from the ledger (only rows that entered after the event started). */
  const ledgerRecap = (rows, family, match) => {
    const r = rows.find((x) => x.family === family && x.publicationStatus === "PUBLISHED" && !x.withdrawal && match(x));
    if (!r) return null;
    const settled = r.settlement?.state === "SETTLED" && r.settlement?.finality === "CANONICAL";
    const pick = r.categoryPrediction ?? r.direction ?? null;
    const hit = r.measurement?.topClassHit ?? r.measurement?.directionalResult ?? null;
    // Quote probabilities exactly as the row defines them: NFL rows hold P(HOME_WIN) whatever the pick; MLB rows hold
    // the pick's probability; EPL rows hold a class distribution.
    const [awayTeam, homeTeam] = String(r.matchup).split(/ @ | VS /i);
    const label = r.direction === "HOME_WIN"
      ? `pick ${pick === "AWAY" ? awayTeam : pick === "HOME" ? homeTeam : pick} (published home-win probability ${pct(r.probability)})`
      : `${pick ?? "forecast"}${r.probability != null ? ` ${pct(r.probability)}` : r.classProbabilities && pick ? ` ${pct(r.classProbabilities[pick])}` : ""}`;
    return {
      forecastId: r.forecastId, family, published: true, frozenAt: r.frozenAt ?? r.publishedAt, settled,
      display: `${label}${r.projection != null ? ` (projection ${r.projection})` : ""}`,
      outcome: settled ? (hit === true || hit === "WIN" ? "forecast favourite won" : hit === false || hit === "LOSS" ? "forecast missed" : `settled (${r.settlement.finalCategory ?? r.settlement.finalValue ?? "final"})`) : "not settled",
      ref: `data/internal/forecast-ledger/v1/${r.sport.toLowerCase()}.jsonl#${r.forecastId}`,
    };
  };

  const sports = {};

  // ── NFL ──
  {
    const cap = capOf("nfl");
    const sched = json("app/public/data/nfl/schedule/latest.json");
    const fcDates = src.list("app/public/data/nfl/forecasts").filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map((n) => n.slice(0, 10)).filter((d) => d <= from).sort();
    const fcPath = fcDates.length ? `app/public/data/nfl/forecasts/${fcDates.at(-1)}.json` : null;
    const fc = fcPath ? json(fcPath) : null;
    const byId = new Map((fc?.forecasts ?? []).map((f) => [String(f.providerEventId), f]));
    const results = json("app/public/data/nfl/results/latest.json");
    const rows = ledger("nfl");
    sports.NFL = {
      capability: cap,
      events: (sched?.rows ?? []).filter((r) => inWindow(r.dateUtc)).map((r) => {
        const f = byId.get(String(r.providerEventId));
        const s = f?.forecastSummary;
        return {
          id: `NFL:${r.providerEventId}`, date: etDate(r.dateUtc), startUtc: r.dateUtc, matchup: r.shortName, kind: "game",
          forecast: s ? {
            class: FORECAST_CLASS[cap.state] ?? "none", frozen: false, snapshotDate: fc.date,
            display: `${f.home.abbr} ${pct(s.winProbability.home)} to win · projected ${f.away.abbr} ${s.projectedScore.away}–${f.home.abbr} ${s.projectedScore.home}`,
            ref: `${fcPath}#${r.providerEventId}`,
          } : null,
          scheduleRef: `app/public/data/nfl/schedule/latest.json#${r.providerEventId}`,
        };
      }),
      results: (results?.rows ?? []).filter((r) => r.statusRaw === "STATUS_FINAL" && inLookback(r.dateUtc)).map((r) => ({
        id: `NFL:${r.providerEventId}:final`, date: etDate(r.dateUtc), matchup: r.shortName,
        final: `${r.away.abbr} ${r.ftAway}–${r.home.abbr} ${r.ftHome}`, ref: `app/public/data/nfl/results/latest.json#${r.providerEventId}`,
        forecast: ledgerRecap(rows, "nfl_game_winner", (x) => x.eventId === String(r.providerEventId)),
      })),
    };
  }

  // ── NBA ──
  {
    const cap = capOf("nba");
    const sched = json("app/public/data/nba/schedule/latest.json");
    const finals = json("app/public/data/nba/results/finals-2026-27.json");
    sports.NBA = {
      capability: cap,
      forecastNote: "No validated NBA forecast publishes. The experimental lane is labelled UNVALIDATED EXPERIMENTAL SIMULATION and is never product-eligible, so it is not used for content.",
      events: (sched?.rows ?? []).filter((r) => inWindow(r.dateUtc)).map((r) => ({
        id: `NBA:${r.providerEventId}`, date: etDate(r.dateUtc), startUtc: r.dateUtc, matchup: r.shortName, kind: "game", forecast: null,
        scheduleRef: `app/public/data/nba/schedule/latest.json#${r.providerEventId}`,
      })),
      results: (finals?.finals ?? []).filter((r) => inLookback(r.dateUtc) && !r.exhibition).map((r) => ({
        id: `NBA:${r.providerEventId}:final`, date: r.dateEt, matchup: `${r.away.tricode} @ ${r.home.tricode}`,
        final: `${r.away.tricode} ${r.ftAway}–${r.home.tricode} ${r.ftHome}`, ref: `app/public/data/nba/results/finals-2026-27.json#${r.providerEventId}`, forecast: null,
      })),
    };
  }

  // ── MLB ──
  {
    const cap = capOf("mlb");
    const rows = ledger("mlb");
    const events = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(from, i);
      const s = json(`app/public/data/mlb/statsapi-schedule/${d}.json`);
      const p = json(`app/public/data/mlb/predictions/${d}.json`);
      const preds = new Map((p?.predictions ?? []).map((x) => [String(x.gamePk), x]));
      for (const g of s?.games ?? []) {
        const pr = preds.get(String(g.gamePk));
        events.push({
          id: `MLB:${g.gamePk}`, date: etDate(g.gameDate), startUtc: g.gameDate, matchup: `${g.away.name} @ ${g.home.name}`, kind: "game",
          forecast: pr ? {
            class: FORECAST_CLASS[cap.state] ?? "none", frozen: false, status: pr.status,
            display: `${pr.predictedWinner?.team ?? "?"} predicted · median sim ${pr.awayTeam} ${pr.projectedScore?.away}–${pr.homeTeam} ${pr.projectedScore?.home}`,
            ref: `app/public/data/mlb/predictions/${d}.json#${g.gamePk}`,
          } : null,
          scheduleRef: `app/public/data/mlb/statsapi-schedule/${d}.json#${g.gamePk}`,
        });
      }
    }
    const recaps = [];
    for (const r of rows.filter((x) => x.family === "mlb_moneyline" && x.eventStart && inLookback(x.eventStart))) {
      const f = ledgerRecap(rows, "mlb_moneyline", (x) => x.forecastId === r.forecastId);
      recaps.push({ id: `MLB:${r.eventId}:final`, date: etDate(r.eventStart), matchup: r.matchup, final: f?.settled ? "settled in the Forecast Ledger" : null, ref: f?.ref ?? null, forecast: f });
    }
    sports.MLB = { capability: cap, events, results: recaps };
  }

  // ── UFC ──
  {
    const cap = capOf("ufc");
    const sched = json("app/public/data/ufc/schedule/latest.json");
    const bouts = sched?.bouts ?? [];
    sports.UFC = {
      capability: cap,
      forecastNote: "UFC has no independent GameTimePicks forecast (its moneyline is a de-vigged market price), so no forecast content.",
      events: (sched?.events ?? []).filter((e) => inWindow(e.dateUtc)).map((e) => ({
        id: `UFC:${e.providerEventId}`, date: etDate(e.dateUtc), startUtc: e.dateUtc, matchup: e.name, kind: "card", forecast: null,
        detail: `${e.boutCount} bouts at ${e.venue}; main: ${bouts.filter((b) => b.eventProviderId === e.providerEventId).slice(-1).map((b) => `${b.red} vs ${b.blue}`).join("") || "see card"}`,
        scheduleRef: `app/public/data/ufc/schedule/latest.json#${e.providerEventId}`,
      })),
      results: [],
    };
  }

  // ── EPL ──
  {
    const cap = capOf("epl");
    const fc = json("app/public/data/soccer/epl/forecasts/latest.json");
    const res = json("app/public/data/soccer/epl/results/latest.json");
    const rows = ledger("epl");
    sports.EPL = {
      capability: cap,
      events: (fc?.rows ?? []).filter((r) => inWindow(r.kickoffUtc)).map((r) => ({
        id: `EPL:${r.slug}`, date: etDate(r.kickoffUtc), startUtc: r.kickoffUtc, matchup: r.matchup, kind: "match",
        forecast: r.probs ? {
          class: FORECAST_CLASS[cap.state] ?? "none", frozen: false, modelOnly: Boolean(r.modelOnly),
          display: `${r.homeClub} ${pct(r.probs.home)} · draw ${pct(r.probs.draw)} · ${r.awayClub} ${pct(r.probs.away)}`,
          ref: `app/public/data/soccer/epl/forecasts/latest.json#${r.slug}`,
        } : null,
        scheduleRef: `app/public/data/soccer/epl/forecasts/latest.json#${r.slug}`,
      })),
      results: (res?.rows ?? []).filter((r) => /FULL_TIME|FINAL/.test(r.statusRaw) && inLookback(r.dateUtc)).map((r) => ({
        id: `EPL:${r.providerEventId}:final`, date: etDate(r.dateUtc), matchup: `${r.home} v ${r.away}`,
        final: `${r.home} ${r.ftHome}–${r.ftAway} ${r.away}`, ref: `app/public/data/soccer/epl/results/latest.json#${r.providerEventId}`,
        forecast: ledgerRecap(rows, "epl_1x2", (x) => x.matchup === `${r.home} v ${r.away}` && x.eventStart && etDate(x.eventStart) === etDate(r.dateUtc)),
      })),
    };
  }

  const stale = files.filter((f) => f.generatedAt && Date.parse(`${from}T12:00:00Z`) - Date.parse(f.generatedAt) > 3 * 86400_000).map((f) => f.path);
  return { window: { from, to, tz: "America/New_York", lookbackFrom: lookFrom }, source: { label: src.label, commit: src.commit }, files, stale, sports };
}
