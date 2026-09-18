#!/usr/bin/env node
/**
 * BUILD THE ASK PROJECTION (v1.6) — the bounded, public-safe read model Ask GameTime answers from.
 *
 *   owners (TypeScript, server-side)  →  data/ask-projection/v1  (committed)
 *   data/ask-projection/v1            →  app/public/data/ask/v1  (emitted every build, gitignored)
 *
 * Runs under `npx tsx`, like the test suite and scripts/generate-mlb-predictions.mjs, because the
 * owners it reads ARE TypeScript: `buildAllGameDetails()`, `loadEplForecasts()`, `nflPageIds()`, the
 * capability registry and the parlay loaders. Importing them is the point — this script must not
 * re-derive a single sports value, only copy what an owner already decided.
 *
 * ⚠ WHY `npx tsx` AND NOT A PINNED DEVDEPENDENCY. Adding `tsx` to package.json was tried and reverted:
 * the locally-installed build resolves named exports from a `.ts` module imported by a `.mjs` one
 * differently from the version npx fetches, and the whole 6,800-test suite went red. The repository
 * has run on `npx tsx` since the suite was written (scripts/ci/run-suite.mjs spawns it), so this
 * inherits exactly the dependency CI already carries rather than introducing a second one. Pinning it
 * properly is a toolchain change with its own review, not a side effect of shipping a chat feature.
 *
 * WHEN THIS RUNS. Every `npm run build`, which on Vercel means every push that touches `app/` —
 * including the nightly bot's data commits (scripts/vercel-ignore-build.sh builds on any app/ diff).
 * So the daily artifacts below are as current as the deployment serving them.
 *
 * WHY A PROJECTION AND NOT A DIRECT READ
 * --------------------------------------
 * Vercel deploys `app/api/*.mjs` as functions independently of the Next build, so a function has the
 * imported module graph but neither `app/public/` nor a TypeScript loader. The Lab and Compare
 * already solved this shape for the browser: build a committed projection, emit it as a public asset,
 * read it at runtime. Ask does the same, so the endpoint reads exactly the bytes a reader could read
 * and there is no second copy of anything to drift.
 *
 * THREE RULES THIS FILE ENFORCES, EACH AT BUILD TIME RATHER THAN AT ANSWER TIME
 * ----------------------------------------------------------------------------
 * 1. SPORT ELIGIBILITY COMES FROM THE CAPABILITY REGISTRY, NOT FROM A JSON KEY. The optimizer artifact
 *    carries `publicRiskSections.<profile>.nba` on every snapshot; every one is empty and
 *    `sourcePools.nbaCount` is 0, because the key is dormant shape from when NBA was modelled. The
 *    registry says NBA is HISTORICAL_ONLY — `canEnterPredictionProducts` false. So a section whose
 *    sport is not eligible is DROPPED HERE, and dropped even if it is non-empty, with the drop
 *    recorded in the receipt. A legacy key cannot reopen a sport the product no longer stands behind.
 *
 * 2. A PAUSED MARKET SHIPS AS PAUSED, NEVER AS ABSENT. `pauseMlbMarkets` has already run inside
 *    `detailByMatchId`, so MLB totals arrive with `pick: "UNAVAILABLE"` and a `pausedReason`. Dropping
 *    those rows would leave Ask unable to answer "why is this MLB market paused?" — so the market is
 *    carried with status PAUSED and its own reason, and the tool layer refuses to present it as a
 *    forecast. Explaining a pause and publishing through one are different things.
 *
 * 3. ARITHMETIC HAPPENS ONCE, IN THE OWNER. A candidate's combined payout is computed here by
 *    `combinedParlayPayoutPer100` over the candidate's own pinned `oddsForSide`, so the runtime never
 *    multiplies odds and the model never does mental arithmetic on money.
 *
 * No network. No clock beyond the one stamp recorded in the receipt. Deterministic given its inputs,
 * so `--check` can prove the committed projection still matches a rebuild.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import { ASK_DAILY_FILES, ASK_PROJECTION_DIR, ASK_PROJECTION_SCHEMA_VERSION, ASK_RECENT_SHARDS, FORBIDDEN_ASK_FIELDS, askStoredGzipped, isApprovedLink, isAskDailyFile, recentShardOf, storedName } from "../../src/lib/ask/contract.mjs";
import { canEnterPredictionProducts, canShowLiveProjections, capabilityOf } from "../../src/lib/sport-capability-registry.ts";
import { buildAllGameDetails } from "../../src/lib/game-detail.ts";
import { nflPageIds, buildMyPlayerRows } from "../../src/lib/my/read-model.ts";
import { loadEplForecasts, reportableRows, eplMatchHref } from "../../src/lib/sports/epl/forecast-view.ts";
import { combinedParlayPayoutPer100 } from "../../src/lib/odds-math.ts";
import { buildHelpCorpus } from "../../src/lib/ask/help-source.mjs";
import { PLAYER_ROW, WINDOWS } from "../../src/lib/research-pages/player-read-model.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const OUT = path.join(REPO, ASK_PROJECTION_DIR);
const CHECK = process.argv.includes("--check");

const t0 = performance.now();
const notes = [];
const drops = [];

/* ────────────────────────────── canonical serialisation ────────────────────────────── */

/** Stable key order so two builds of the same inputs are byte-identical and `--check` means something. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
}
const serialise = (doc) => `${JSON.stringify(canonical(doc), null, 1)}\n`;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/**
 * LEAK GUARD. A public artifact carrying an internal field name is a build failure, not a review note.
 * Checked on the SERIALISED text so a forbidden name is caught wherever it sits — a key, a value, or
 * a path buried inside a nested note (§31, §136).
 */
function assertPublicSafe(name, text) {
  const lower = text.toLowerCase();
  for (const field of FORBIDDEN_ASK_FIELDS) {
    // Word-ish boundary so "internal" does not fire on "internationals" and "src" not on "source".
    const re = new RegExp(`["'\\s/\\-_.]${field.toLowerCase()}["'\\s:/\\-_.]`);
    if (re.test(lower)) throw new Error(`REFUSED: ${name} contains the forbidden field name "${field}"`);
  }
  /*
   * Credential and internal-path shapes. Each pattern is anchored so it matches a CREDENTIAL rather
   * than a substring: the first version of this check used /sk-[a-z0-9]{8}/ and refused the very first
   * artifact it inspected, because "ask-entities" contains "sk-entities". A guard that fires on its own
   * output teaches people to switch it off, which is worse than not having it.
   */
  const LEAK_SHAPES = [
    [/(?:^|[^\w-])\/(?:Users|home)\/[a-z]/i, "an absolute home-directory path"],
    [/data\/internal\//i, "an internal data path"],
    [/(?:^|[^\w.])\.env\b/i, "a dotenv reference"],
    [/\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|service[_-]?role)\b\s*[":=]/i, "a credential field"],
    [/\bsk-ant-[A-Za-z0-9_-]{16,}/, "an Anthropic key"],
    [/\bsk-[A-Za-z0-9]{24,}/, "an API key"],
    [/\bBearer\s+[A-Za-z0-9._-]{20,}/, "a bearer token"],
  ];
  for (const [re, what] of LEAK_SHAPES) {
    const m = text.match(re);
    if (m) throw new Error(`REFUSED: ${name} contains ${what} (near "${m[0].slice(0, 24)}")`);
  }
}

/** Every link an artifact carries must match the approved registry — checked here, not only at answer time. */
function assertLinks(name, links) {
  for (const l of links) {
    if (!isApprovedLink(l.href)) throw new Error(`REFUSED: ${name} carries an unapproved link ${l.href}`);
  }
}

/* ────────────────────────────────── 1. ENTITIES ────────────────────────────────── */

/**
 * The entity resolution index, projected from the research index — the SAME index the research pages
 * enumerate from, so a name Ask can resolve is a name the product has a page for.
 */
function buildEntities() {
  const src = JSON.parse(fs.readFileSync(path.join(REPO, "data/research-projection/v1/index.json"), "utf8"));
  const entries = (src.entries ?? [])
    .filter((e) => e.id && e.label && e.slug && e.sport)
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      sport: e.sport,
      label: e.label,
      slug: e.slug,
      hint: e.hint ?? null,
      path: e.path ?? null,
    }));
  // Deterministic order: a resolver that returns "the first match" must return the same first match
  // on every build, so ties are broken by canonical id rather than by file order.
  entries.sort((a, b) => (a.sport < b.sport ? -1 : a.sport > b.sport ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.label < b.label ? -1 : a.label > b.label ? 1 : a.id < b.id ? -1 : 1));
  notes.push(`entities ${entries.length}`);
  return { schemaVersion: ASK_PROJECTION_SCHEMA_VERSION, artifact: "ask-entities", count: entries.length, entries };
}

/* ────────────────────────────────── 2. MATCHUPS ────────────────────────────────── */

/** The compare projection's own matchup registry, re-serialised. No new join, no new identity. */
function buildMatchups() {
  const dir = path.join(REPO, "data/compare-projection/v1/matchups");
  const entries = [];
  for (const file of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
    const buf = fs.readFileSync(path.join(dir, file));
    const text = file.endsWith(".gz") ? zlib.gunzipSync(buf).toString("utf8") : buf.toString("utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      entries.push({
        gameId: String(e.gameId),
        sport: e.sport,
        seasonId: e.seasonId ?? null,
        startUtc: e.startUtc ?? null,
        homeTeamId: e.homeTeamId,
        awayTeamId: e.awayTeamId,
        neutralSite: Boolean(e.neutralSite),
        final: e.final ?? null,
        priorMeetings: e.priorMeetings ?? 0,
        path: e.path ?? null,
      });
    }
  }
  entries.sort((a, b) => (a.sport < b.sport ? -1 : a.sport > b.sport ? 1 : a.gameId < b.gameId ? -1 : 1));
  notes.push(`matchups ${entries.length}`);
  return { schemaVersion: ASK_PROJECTION_SCHEMA_VERSION, artifact: "ask-matchups", count: entries.length, entries };
}

/* ────────────────────────────────── 3. FORECASTS ────────────────────────────────── */

/** One market row, carrying its own status. PUBLISHED and PAUSED are both real states worth shipping. */
const market = (m) => ({
  market: m.market,
  label: m.label,
  status: m.status,
  pick: m.pick ?? null,
  team: m.team ?? null,
  line: m.line ?? null,
  modelProbability: m.modelProbability ?? null,
  marketImpliedProbability: m.marketImpliedProbability ?? null,
  confidence: m.confidence ?? null,
  agreement: m.agreement ?? null,
  pausedReason: m.pausedReason ?? null,
});

function mlbForecasts() {
  const out = [];
  for (const g of buildAllGameDetails()) {
    const sport = String(g.sport ?? "").toLowerCase();
    if (sport !== "mlb") continue;
    const p = g.prediction;
    if (!p || p.status === "unavailable") continue;

    const markets = [];
    if (p.moneyline) {
      markets.push(market({
        market: "moneyline", label: "Moneyline", status: "PUBLISHED",
        pick: p.moneyline.team ?? null, team: p.moneyline.team ?? null,
        modelProbability: p.moneyline.simulationProbability ?? null,
        marketImpliedProbability: p.moneyline.marketImpliedProbability ?? null,
        confidence: p.moneyline.strengthLabel ?? null,
        agreement: p.moneyline.marketAgreement ?? null,
      }));
    }
    if (p.runLine) {
      markets.push(market({
        market: "run_line", label: "Run line", status: "PUBLISHED",
        pick: p.runLine.pick ?? null, line: p.runLine.pickLine ?? p.runLine.line ?? null,
        modelProbability: p.runLine.coverProbability ?? null,
        confidence: p.runLine.strengthLabel ?? null,
      }));
    }
    if (p.total) {
      // THE PAUSE IS THE POINT. A paused market keeps its row and its reason so Ask can EXPLAIN the
      // pause; the tool layer then refuses to present it as a forecast. Two different jobs.
      const paused = p.total.pick === "UNAVAILABLE" || Boolean(p.total.pausedReason);
      markets.push(market({
        market: "total", label: "Over/Under", status: paused ? "PAUSED" : "PUBLISHED",
        pick: paused ? null : p.total.pick ?? null, line: p.total.line ?? null,
        modelProbability: paused ? null : p.total.overProbability ?? null,
        marketImpliedProbability: p.total.marketImpliedOver ?? null,
        confidence: paused ? null : p.total.strengthLabel ?? null,
        pausedReason: paused ? String(p.total.pausedReason ?? p.total.unavailableReason ?? "").slice(0, 220) || null : null,
      }));
    }

    const href = `/games/mlb/${g.slug}/`;
    const links = [{ id: "report", label: "Open the MLB game report", href }];
    assertLinks("mlb forecast", links);

    out.push({
      forecastId: `mlb-${g.matchId}`,
      sport: "MLB",
      capability: capabilityOf("mlb").state,
      experimental: false,
      gameId: String(g.matchId),
      slug: g.slug,
      date: g.date,
      startUtc: g.gameCenter?.firstPitch ?? null,
      away: g.awayTeam, home: g.homeTeam,
      awayName: p.awayTeamName ?? null, homeName: p.homeTeamName ?? null,
      predictedWinner: p.predictedWinner?.team ?? null,
      markets,
      // The owner's own completeness notes ARE the "why". Ask never writes a reason the model did not give.
      why: (p.completeness?.notes ?? []).slice(0, 4).map((n) => String(n).slice(0, 260)),
      completeness: p.completeness?.level ?? null,
      updatedAt: p.market?.capturedAt ?? null,
      links,
    });
  }
  out.sort((a, b) => (a.forecastId < b.forecastId ? -1 : 1));
  return out;
}

function nflForecasts() {
  const file = path.join(APP, "public/data/nfl/forecasts/latest.json");
  if (!fs.existsSync(file)) { notes.push("nfl forecasts absent"); return []; }
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const pageIds = nflPageIds();

  // Player ranges come from the PUBLISHED board only — buildMyPlayerRows has already excluded
  // ESTIMATE and WITHHELD families, so nothing research-only can arrive through this door.
  const byGame = new Map();
  for (const r of buildMyPlayerRows()) {
    if (!r.markets?.length) continue;
    const id = String(r.href ?? "").match(/\/nfl\/game\/(\d+)\//)?.[1];
    if (!id) continue;
    if (!byGame.has(id)) byGame.set(id, []);
    byGame.get(id).push({
      playerId: r.playerId, name: r.name, team: r.team ?? null,
      markets: r.markets.slice(0, 4).map((m) => ({ key: m.key, label: m.label, median: m.median, p10: m.p10, p90: m.p90 })),
      researchHref: r.researchHref ?? null,
    });
  }

  const out = [];
  for (const f of doc.forecasts ?? []) {
    const id = String(f.providerEventId ?? "");
    if (!id || !pageIds.has(id)) continue; // a forecast with no published report page is not published
    const href = `/nfl/game/${id}/`;
    const links = [{ id: "report", label: "Open the NFL game report", href }];
    assertLinks("nfl forecast", links);
    out.push({
      forecastId: `nfl-${id}`,
      sport: "NFL",
      capability: capabilityOf("nfl").state,
      /*
       * EXPERIMENTAL IS NOT A DECORATION. nfl/product-eligibility.json evaluates every event against
       * "permitsProductLeg — true only for VALIDATED_PICK" and currently qualifies 0 of 16. These
       * forecasts publish; they may not become a product leg. Ask must say both.
       */
      experimental: true,
      state: String(f.state ?? ""),
      gameId: id,
      matchup: f.matchup ?? null,
      week: f.week ?? null,
      startUtc: f.kickoffUtc ?? null,
      away: f.away?.abbr ?? null, home: f.home?.abbr ?? null,
      awayName: f.away?.name ?? null, homeName: f.home?.name ?? null,
      modelId: f.model?.id ?? null,
      players: (byGame.get(id) ?? []).slice(0, 6),
      updatedAt: doc.generatedAt ?? null,
      links,
    });
  }
  out.sort((a, b) => (a.forecastId < b.forecastId ? -1 : 1));
  return out;
}

function eplForecasts() {
  const set = loadEplForecasts();
  if (!set) { notes.push("epl forecasts absent"); return []; }
  const out = [];
  for (const r of reportableRows(set)) {
    if (!r.probs) continue; // by EPL policy only CURRENT_PRE_EVENT carries probabilities
    const href = eplMatchHref(r.slug);
    const links = [{ id: "report", label: "Open the EPL match report", href }];
    assertLinks("epl forecast", links);
    out.push({
      forecastId: `epl-${r.eventId}`,
      sport: "EPL",
      capability: capabilityOf("epl").state,
      experimental: true,
      state: r.state,
      gameId: String(r.eventId),
      slug: r.slug,
      matchup: r.matchup ?? null,
      matchweek: r.matchweek ?? null,
      startUtc: r.kickoffUtc ?? null,
      home: r.homeClub ?? null, away: r.awayClub ?? null,
      probabilities: { home: r.probs.home, draw: r.probs.draw, away: r.probs.away },
      expectedGoals: r.expectedGoals ?? null,
      over25: r.over25 ?? null,
      modelId: r.modelId ?? null,
      // A suspect input LABELS itself rather than being quietly dropped — the repair was rejected and
      // the recorded output stands, so the label travels with it.
      sparseInput: r.sparseInput ? String(r.sparseInput.note).slice(0, 200) : null,
      updatedAt: set.generatedAt ?? null,
      links,
    });
  }
  out.sort((a, b) => (a.forecastId < b.forecastId ? -1 : 1));
  return out;
}

function buildForecasts() {
  const forecasts = [];
  for (const [sport, fn] of [["mlb", mlbForecasts], ["nfl", nflForecasts], ["epl", eplForecasts]]) {
    // The registry decides, every time, whether this sport may show forward-looking output at all.
    if (!canShowLiveProjections(sport)) { drops.push({ what: "forecasts", sport, reason: capabilityOf(sport).state }); continue; }
    const rows = fn();
    notes.push(`forecasts ${sport.toUpperCase()} ${rows.length}`);
    forecasts.push(...rows);
  }
  return {
    schemaVersion: ASK_PROJECTION_SCHEMA_VERSION,
    artifact: "ask-forecasts",
    count: forecasts.length,
    eligibleSports: ["mlb", "nfl", "epl"].filter((s) => canShowLiveProjections(s)),
    forecasts,
  };
}

/* ────────────────────────────────── 4. PARLAYS ────────────────────────────────── */

/** Read the newest N optimizer snapshots. A date with no snapshot is absent, never back-filled. */
function buildParlays(days = 3) {
  const dir = path.join(APP, "public/data/parlays/optimizer");
  const files = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-days);

  const byDate = {};
  for (const file of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const date = String(doc.date ?? file.replace(".json", ""));
    const profiles = {};

    for (const [profile, cuts] of Object.entries(doc.publicRiskSections ?? {})) {
      const slips = [];
      for (const [cut, list] of Object.entries(cuts)) {
        if (cut === "all") continue; // "all" is a view over the sport cuts, not a separate pool
        if (!Array.isArray(list) || list.length === 0) continue;

        /*
         * ⚠ THE NBA RULE. A sport cut is admitted only if the capability registry says the sport may
         * enter prediction products. `nba` is HISTORICAL_ONLY, so it is dropped — and it is dropped
         * HERE, on the sport, rather than by trusting that the array happens to be empty today. The
         * drop is recorded so a non-empty drop is visible in the receipt instead of silent.
         */
        if (!canEnterPredictionProducts(cut)) {
          drops.push({ what: "parlay-sport-cut", sport: cut, date, profile, slips: list.length, reason: capabilityOf(cut).state });
          continue;
        }

        for (const s of list) {
          const legs = (s.legs ?? []).map((l) => ({
            sport: String(l.sport ?? "").toUpperCase(),
            playerId: l.playerId ?? null,
            playerName: l.playerName ?? null,
            team: l.team ?? null,
            opponent: l.opponent ?? null,
            market: l.market ?? null,
            marketLabel: l.marketLabel ?? null,
            side: l.side ?? null,
            line: l.line ?? null,
            projection: l.projection ?? null,
            edgePct: l.edgePct ?? null,
            confidence: l.confidence ?? null,
            bookmaker: l.bookmaker ?? null,
            oddsForSide: l.oddsForSide ?? null,
            commenceTime: l.commenceTime ?? null,
          }));
          // Arithmetic once, in the owner, over the candidate's own pinned prices.
          const payout = combinedParlayPayoutPer100(legs);
          slips.push({
            slipId: s.slipId,
            profile: String(s.profile ?? profile).toUpperCase(),
            sport: String(s.sport ?? cut).toUpperCase(),
            legCount: legs.length,
            legs,
            sameGame: Boolean(s.sameGame),
            score: s.score ?? null,
            /*
             * CORRELATION IS THE OWNER'S FIELD OR IT IS UNKNOWN. `correlationPenalty` is a number the
             * optimizer computed; it is carried verbatim. Where the owner has no correlation model for
             * a pairing, nothing here fills the gap and the tool says correlation is not modelled — it
             * never asserts that legs are independent (§40, §114).
             */
            correlationPenalty: s.correlationPenalty ?? null,
            rationale: typeof s.rationale === "string" ? s.rationale.slice(0, 240) : null,
            payoutPer100: payout ? { american: payout.american, decimal: Number(payout.decimal.toFixed(6)), profitPer100: Number(payout.profitPer100.toFixed(2)) } : null,
          });
        }
      }
      slips.sort((a, b) => (a.slipId < b.slipId ? -1 : 1));
      if (slips.length) profiles[String(profile).toUpperCase()] = slips;
    }

    byDate[date] = {
      date,
      generatedAt: doc.generatedAt ?? null,
      totalSlips: doc.totalSlips ?? null,
      eligibleSports: Object.keys(doc.sourcePools ?? {})
        .map((k) => k.replace(/Count$/, ""))
        .filter((s) => canEnterPredictionProducts(s)),
      profiles,
    };
    notes.push(`parlays ${date} ${Object.entries(profiles).map(([k, v]) => `${k}:${v.length}`).join(" ")}`);
  }

  return {
    schemaVersion: ASK_PROJECTION_SCHEMA_VERSION,
    artifact: "ask-parlays",
    dates: Object.keys(byDate).sort(),
    byDate,
    /*
     * NO APPROVED PRICE-AWARE EV OWNER EXISTS. Stated in the artifact, not only in a comment, so the
     * tool layer and its tests read the same fact from the same place (§36).
     */
    evOwner: null,
    stakePolicyOwner: null,
  };
}

/* ────────────────────────────── 5. RECENT (Last-N) ────────────────────────────── */

/**
 * GAP A, closed at the narrowest possible width.
 *
 * The player research page already owns Last 3/5/10 across recorded seasons. The Lab's player query is
 * ONE season per query BY DESIGN: player rows are partitioned by season, so "all seasons" would load
 * every partition — the exact cost that bound exists to prevent. Widening the Lab to serve a chat
 * question would move a proven boundary for convenience.
 *
 * So the existing cross-season read model is projected instead, using the research contract's own
 * tuple layout (PLAYER_ROW) and its own window sizes (WINDOWS = 3/5/10). Nothing is recomputed: the
 * `windows` aggregates are the page's own numbers, copied, and the dated rows are the page's own game
 * log, sliced to the newest ten. No new stat definitions, no new provider, no LLM arithmetic.
 */
function buildRecent() {
  const dir = path.join(REPO, "data/research-projection/v1");
  const out = {};

  for (const sport of ["MLB", "NFL", "EPL"]) {
    const file = path.join(dir, "players", `${sport}.jsonl.gz`);
    if (!fs.existsSync(file)) { notes.push(`recent ${sport} absent`); continue; }

    const players = {};
    const teams = {};
    let columns = null;
    let n = 0;

    for (const line of zlib.gunzipSync(fs.readFileSync(file)).toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      const p = JSON.parse(line);
      const log = Array.isArray(p.gameLog) ? p.gameLog : [];
      if (!log.length) continue;

      // Column order is per-sport and identical across that sport's players; captured once and
      // asserted thereafter, so a row's values can never be read against another player's header.
      const cols = (p.columns ?? []).map((c) => c.key);
      if (!columns) columns = (p.columns ?? []).map((c) => ({ key: c.key, label: c.label, unit: c.unit ?? null }));
      else if (cols.join(",") !== columns.map((c) => c.key).join(",")) {
        throw new Error(`REFUSED: ${sport} player ${p.id} has a different column order than its sport`);
      }

      /*
       * NEWEST TEN, ORDERED BY DATE — never by file order. The projection writes newest-first today,
       * but "last 10 games" must not depend on that staying true, so the sort is explicit here.
       */
      const rows = [...log]
        .sort((a, b) => String(b[PLAYER_ROW.DATE] ?? "").localeCompare(String(a[PLAYER_ROW.DATE] ?? "")))
        .slice(0, 10)
        .map((r) => {
          const opp = r[PLAYER_ROW.OPP] ?? null;
          if (opp) teams[opp] = teams[opp] ?? null;
          /*
           * PACKED, LIKE THE LAB'S ROW PARTITIONS. Named keys repeated across 751 players × 10 rows ×
           * 12 values cost 3.3 MB — past the loader's own 3 MB asset ceiling, so the artifact would
           * have been refused at runtime by the bound that exists to stop exactly this. The tuple
           * layout is ASK_RECENT_ROW and is unpacked in exactly one place (tools/recent.mjs), so no
           * consumer reads a row by index.
           */
          return [
            r[PLAYER_ROW.DATE] ?? null,
            r[PLAYER_ROW.SEASON] ?? null,
            opp,
            r[PLAYER_ROW.HA] ?? null,
            r[PLAYER_ROW.RESULT] ?? null,
            // Values stay aligned to `columns`; a null is NOT RECORDED and must never render as zero.
            ...r.slice(PLAYER_ROW.VALUES).map((v) => (v === undefined ? null : v)),
          ];
        });

      // The owner's own Last-N aggregates, copied verbatim — this is the page's arithmetic, not ours.
      const windows = {};
      for (const [key, list] of Object.entries(p.windows ?? {})) {
        const kept = (list ?? []).filter((w) => WINDOWS.includes(w.size));
        if (kept.length) windows[key] = kept.map((w) => ({ size: w.size, n: w.n, sum: w.sum, avg: w.avg }));
      }

      players[p.id] = {
        label: p.name ?? null,
        slug: p.slug ?? null,
        path: p.slug ? `/players/${sport.toLowerCase()}/${p.slug}/` : null,
        coverage: p.coverage?.status ?? null,
        rows,
        windows,
      };
      n += 1;
    }

    // Opponent labels, resolved from the entity index rather than re-derived from a team artifact.
    const idx = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
    for (const e of idx.entries ?? []) if (e.kind === "team" && Object.prototype.hasOwnProperty.call(teams, e.id)) teams[e.id] = e.label;

    /*
     * One asset per shard, so a lookup reads ~350 KB rather than 2.7 MB, and so adding a season grows
     * every shard slightly instead of pushing one file past the loader's ceiling. `columns` and the
     * opponent `teams` map are repeated into each shard: they are small, and a shard that cannot be
     * read on its own would force a second fetch for every single lookup.
     */
    for (let shard = 0; shard < ASK_RECENT_SHARDS; shard += 1) {
      const mine = Object.fromEntries(Object.entries(players).filter(([id]) => recentShardOf(id) === shard));
      out[`${sport.toLowerCase()}/${shard}`] = {
        schemaVersion: ASK_PROJECTION_SCHEMA_VERSION,
        artifact: "ask-recent",
        sport,
        shard,
        shards: ASK_RECENT_SHARDS,
        columns: columns ?? [],
        teams,
        count: Object.keys(mine).length,
        players: mine,
      };
    }
    notes.push(`recent ${sport} ${n} in ${ASK_RECENT_SHARDS} shards`);
  }
  return out;
}

/* ────────────────────────────────── 6. WRITE ────────────────────────────────── */

const artifacts = new Map();
const add = (rel, doc) => {
  const text = serialise(doc);
  assertPublicSafe(rel, text);
  artifacts.set(rel, text);
};

add("entities.json", buildEntities());
add("matchups.json", buildMatchups());
add("forecasts.json", buildForecasts());
add("parlays.json", buildParlays());
for (const [key, doc] of Object.entries(buildRecent())) add(`recent/${key}.json`, doc);
const help = buildHelpCorpus();
assertLinks("help corpus", help.chunks.flatMap((c) => (c.route ? [{ href: c.route }] : [])));
add("help.json", help);

const manifest = {
  schemaVersion: ASK_PROJECTION_SCHEMA_VERSION,
  artifact: "ask-manifest",
  builder: "gametime-ask-projection@1",
  files: [...artifacts.keys()].sort().map((rel) => ({ path: rel, bytes: Buffer.byteLength(artifacts.get(rel)), sha256: sha(artifacts.get(rel)) })),
  /* Every sport cut refused at a boundary, with its reason. An empty list here is a CLAIM that nothing
     was dropped, so it is written even when empty rather than omitted. */
  dropped: drops,
};
add("manifest.json", manifest);

if (CHECK) {
  const stale = [];
  for (const [rel, text] of artifacts) {
    /*
     * The daily artifacts are built, not committed, so there is nothing on disk to compare and
     * nothing that can be stale. Checking them would fail on `main` every time the nightly pipeline
     * landed a prediction snapshot — a currency check that cries wolf is a currency check nobody reads.
     */
    if (isAskDailyFile(rel) || rel === "manifest.json") continue;
    const abs = path.join(OUT, storedName(rel));
    if (!fs.existsSync(abs)) { stale.push(rel); continue; }
    const raw = fs.readFileSync(abs);
    const onDisk = askStoredGzipped(rel) ? zlib.gunzipSync(raw).toString("utf8") : raw.toString("utf8");
    if (onDisk !== text) stale.push(rel);
  }
  const expected = new Set([...artifacts.keys()].map(storedName));
  for (const existing of listCommitted()) {
    if (isAskDailyFile(existing) || existing === "manifest.json") continue;
    if (!expected.has(existing)) stale.push(`${existing} (orphan)`);
  }
  if (stale.length) {
    console.error(`STALE: ${stale.length} ask projection file(s) differ from a rebuild:`);
    for (const s of stale) console.error(`  ${s}`);
    process.exit(1);
  }
  const checked = [...artifacts.keys()].filter((r) => !isAskDailyFile(r) && r !== "manifest.json").length;
  console.log(`ask projection up to date (${checked} committed files checked; ${ASK_DAILY_FILES.length} daily artifacts are built, not committed) in ${Math.round(performance.now() - t0)} ms`);
  process.exit(0);
}

fs.rmSync(OUT, { recursive: true, force: true });
let bytes = 0;
let stored = 0;
for (const [rel, text] of artifacts) {
  const abs = path.join(OUT, storedName(rel));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const buf = askStoredGzipped(rel) ? zlib.gzipSync(Buffer.from(text), { level: 9 }) : Buffer.from(text);
  fs.writeFileSync(abs, buf);
  bytes += Buffer.byteLength(text);
  stored += buf.length;
}

console.log(`ask projection v1: ${artifacts.size} files · ${(bytes / 1024).toFixed(0)} KB content · ${(stored / 1024).toFixed(0)} KB stored in ${Math.round(performance.now() - t0)} ms`);
for (const n of notes) console.log(`  ${n}`);
for (const d of drops) console.log(`  DROPPED ${d.what} ${d.sport}${d.date ? ` ${d.date}` : ""}${d.profile ? `/${d.profile}` : ""} — ${d.reason}${d.slips ? ` (${d.slips} slips)` : ""}`);

function listCommitted(dir = OUT, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listCommitted(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}
