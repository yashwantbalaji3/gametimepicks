// Per-pass git/GitHub evidence for the live capture (read-only). Never touches Production.
//
//   node git-watch.mjs --repo <dir> --out <captures dir> --t <pass stamp> --events a,b --date <ET date>
//                      [--deployed <sha served by Production this pass, or empty>] [--gh 1]
//
// For each event it writes <out>/<t>-frozen-<ev>.txt (frozen forecast / board / receipt fingerprint and
// the committed live-props summary) and prints ONE JSON line, name "settlement", to stdout:
//   market        the MARKET paper record data/internal/nfl/settlement/<date>.json: settled | pending:<STATE> |
//                 absent | no-file-yet. Since the odds credit ceiling (2026-10-11) every event there reads
//                 pending:NO_TARGETS, so it can never end the watch on its own.
//   liveProps     app/public/data/nfl/live-props/<ev>.json on origin/main: phase, finality, row states
//   ledger        data/internal/nfl/prop-settlement/<date>.json rows for the event: canonical / provisional /
//                 observed / noMeasurement / decided
//   provisionalCommit, canonicalCommit
//                 the FIRST origin/main commit whose live-props file reads phase FINAL, and the first whose
//                 finality reads CANONICAL (cached in <out>/.git-watch-state.json once found)
//   servedProvisional / servedCanonical
//                 whether --deployed (build-info.json captured this pass) contains that commit
//   ghServedProvisional / ghServedCanonical
//                 with --gh 1: the first GitHub "Production" deployment (vercel[bot]) whose sha contains the
//                 commit and whose status is success — {id, sha, at}. Independent of the Vercel bot challenge;
//                 GitHub stamps can be off by up to ±60 s (docs: forecast-of-record evidence caveats).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : d; };
const REPO = arg("repo");
const OUT = arg("out");
const T = arg("t");
const DATE = arg("date");
const EVENTS = String(arg("events", "")).split(",").map((s) => s.trim()).filter(Boolean);
const DEPLOYED = arg("deployed", "") || "";
const GH = arg("gh", "0") === "1";
const GH_REPO = process.env.GTP_GH_REPO || "yashwantbalaji3/gametimepicks";
if (!REPO || !OUT || !T || !DATE || !EVENTS.length) { console.error("usage: git-watch.mjs --repo --out --t --events --date [--deployed] [--gh 1]"); process.exit(2); }

const git = (...a) => { try { return execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } };
const show = (p, rev = "origin/main") => git("show", `${rev}:${p}`);
const json = (s) => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
/** Key-sorted JSON, so a fingerprint changes only when a value does. */
const stable = (v) => Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`
    : JSON.stringify(v ?? null);
const isAncestor = (a, b) => { if (!a || !b) return false; try { execFileSync("git", ["-C", REPO, "merge-base", "--is-ancestor", a, b], { stdio: "ignore" }); return true; } catch { return false; } };
const gh = (p) => { try { return JSON.parse(execFileSync("gh", ["api", p], { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] })); } catch { return null; } };

const stateFile = path.join(OUT, ".git-watch-state.json");
const state = json(fs.existsSync(stateFile) ? fs.readFileSync(stateFile, "utf8") : null) ?? {};
const mainShort = (git("rev-parse", "--short", "origin/main") ?? "").trim();

// Shared reads, once per pass.
const forecasts = json(show("app/public/data/nfl/forecasts/latest.json"));
const boardFiles = (git("ls-tree", "-r", "--name-only", "origin/main", "app/public/data/nfl/player-board") ?? "").split("\n").filter(Boolean);
const receiptFiles = (git("ls-tree", "-r", "--name-only", "origin/main", "data/internal/nfl/forecast-receipts") ?? "").split("\n").filter(Boolean);
const settleRaw = show(`data/internal/nfl/settlement/${DATE}.json`);
const settle = json(settleRaw);
const ledger = json(show(`data/internal/nfl/prop-settlement/${DATE}.json`));

/** The first origin/main commit (oldest first) whose live-props file satisfies `pred`. */
function firstCommitWhere(file, pred) {
  const shas = (git("log", "--format=%H", "--reverse", "origin/main", "--", file) ?? "").split("\n").filter(Boolean);
  for (const s of shas) { const d = json(show(file, s)); if (d && pred(d)) return s; }
  return null;
}

let ghDeploys = null; // fetched lazily, at most once per pass
function ghFirstServed(commit) {
  if (!GH || !commit) return null;
  ghDeploys ??= gh(`repos/${GH_REPO}/deployments?environment=Production&per_page=100`) ?? [];
  const committedAt = Date.parse((git("log", "-1", "--format=%cI", commit) ?? "").trim());
  const cands = ghDeploys.filter((d) => Date.parse(d.created_at) >= committedAt - 60_000).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  for (const d of cands) {
    if (!isAncestor(commit, d.sha)) continue;
    const st = gh(`repos/${GH_REPO}/deployments/${d.id}/statuses`) ?? [];
    const ok = st.filter((s) => s.state === "success").sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
    if (ok) return { id: d.id, sha: d.sha, at: ok.created_at };
  }
  return null;
}

for (const ev of EVENTS) {
  // Frozen fingerprint — the parts that must never change once the game starts.
  const lines = [];
  const f = forecasts ? (forecasts.forecasts ?? []).filter((x) => x.providerEventId === ev) : null;
  lines.push(`forecast ${f == null ? "UNREADABLE" : f.length ? sha256(stable(f)) : "ABSENT"}`);
  for (const b of boardFiles.filter((p) => p.includes(ev))) lines.push(`board ${b} ${sha256(show(b) ?? "")}`);
  for (const r of receiptFiles.filter((p) => p.includes(ev))) lines.push(`receipt ${r}`);
  lines.push(`main ${mainShort}`);
  const lpFile = `app/public/data/nfl/live-props/${ev}.json`;
  const lp = json(show(lpFile));
  let liveProps = null;
  if (lp) {
    const rows = lp.rows ?? [];
    const st = {};
    for (const r of rows) { const k = r.settlement?.state ?? "NONE"; st[k] = (st[k] ?? 0) + 1; }
    const frozenHash = sha256(stable(rows.map((r) => [r.predictionId, r.frozenIdentity, r.frozen]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).slice(0, 16);
    liveProps = { phase: lp.phase ?? null, finality: lp.finality ?? null, observedAt: lp.observedAt ?? null, finalFirstObservedAt: lp.finalFirstObservedAt ?? null, rows: rows.length, withLive: rows.filter((r) => r.live?.statValue != null || r.live?.factual?.statValue != null).length, settlement: st, frozenHash, refused: rows.filter((r) => r.frozenRefusal).length };
    lines.push(`liveprops ${JSON.stringify(liveProps)}`);
  } else lines.push("liveprops none");
  fs.writeFileSync(path.join(OUT, `${T}-frozen-${ev}.txt`), lines.join("\n") + "\n");

  // Market paper record (kept for continuity; NO_TARGETS while the odds ceiling holds).
  let market = "no-file-yet";
  if (settleRaw != null) {
    if (!settle) market = "unreadable";
    else if ((settle.events ?? []).some((x) => String(x.providerEventId) === ev)) market = "settled";
    else { const p = (settle.pending ?? []).find((x) => JSON.stringify(x).includes(ev)); market = p ? `pending:${p.state ?? "?"}` : "absent"; }
  }

  // Player-prop ledger rows for this event.
  const lr = (ledger?.rows ?? []).filter((r) => String(r.eventId) === ev);
  const ledgerSummary = ledger ? {
    rows: lr.length,
    canonical: lr.filter((r) => r.finality === "CANONICAL").length,
    provisional: lr.filter((r) => r.finality === "PROVISIONAL").length,
    observed: lr.filter((r) => r.measurementState === "OBSERVED").length,
    noMeasurement: lr.filter((r) => r.measurementState === "NO_MEASUREMENT").length,
    noMeasurementWithValue: lr.filter((r) => r.measurementState === "NO_MEASUREMENT" && r.finalStat != null).length,
    decided: lr.filter((r) => r.forecastResult === "WIN" || r.forecastResult === "LOSS").length,
    generatedAt: ledger.generatedAt ?? null,
  } : null;

  // First commits (cached once found — history on main is append-only for our purposes).
  const s = (state[ev] ??= {});
  if (lp && !s.provisionalCommit && lp.phase === "FINAL") s.provisionalCommit = firstCommitWhere(lpFile, (d) => d.phase === "FINAL");
  if (lp && !s.canonicalCommit && lp.finality === "CANONICAL") s.canonicalCommit = firstCommitWhere(lpFile, (d) => d.finality === "CANONICAL");
  if (s.provisionalCommit && !s.ghServedProvisional) s.ghServedProvisional = ghFirstServed(s.provisionalCommit);
  if (s.canonicalCommit && !s.ghServedCanonical) s.ghServedCanonical = ghFirstServed(s.canonicalCommit);

  console.log(JSON.stringify({
    t: T, name: "settlement", event: ev, market, liveProps: liveProps && { phase: liveProps.phase, finality: liveProps.finality, settlement: liveProps.settlement, rows: liveProps.rows },
    ledger: ledgerSummary,
    provisionalCommit: s.provisionalCommit ?? null, canonicalCommit: s.canonicalCommit ?? null, deployed: DEPLOYED || null,
    servedProvisional: isAncestor(s.provisionalCommit, DEPLOYED), servedCanonical: isAncestor(s.canonicalCommit, DEPLOYED),
    ghServedProvisional: s.ghServedProvisional ?? null, ghServedCanonical: s.ghServedCanonical ?? null,
  }));
}
fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));
