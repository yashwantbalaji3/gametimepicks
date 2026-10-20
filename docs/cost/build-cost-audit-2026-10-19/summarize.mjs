import fs from "node:fs";
const S = new URL(".", import.meta.url).pathname;
const P = JSON.parse(fs.readFileSync(S + "pushes.json", "utf8"));
const D = JSON.parse(fs.readFileSync(S + "deployments.json", "utf8")).filter((d) => d.created_at >= "2026-10-12T00:00:00Z");
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))].toFixed(1); };
const days = [...new Set(P.map((p) => p.day))].sort();
const END = P.at(-1).t;
const spanDays = (Date.parse(END) - Date.parse("2026-10-12T00:00:00Z")) / 864e5;
const out = [];
const log = (...a) => out.push(a.join(" "));
log("window 2026-10-12T00Z ->", END, "days", spanDays.toFixed(3));
log("## per day: day | commits | pushes | completed | ignored | canceled | failed | unresolved | GH deps success/inactive/failure | completed e2e p50/p90 | pend->final p50 | deploy-record (commit->dep created) p50");
const tot = { c: 0, p: 0 };
for (const d of days) {
  const ps = P.filter((p) => p.day === d);
  const by = (o) => ps.filter((p) => p.o === o).length;
  const deps = D.filter((x) => x.created_at.slice(0, 10) === d);
  const ds = (st) => deps.filter((x) => x.statuses.at(-1)?.state === st).length;
  const comp = ps.filter((p) => p.o === "completed");
  const depLag = comp.flatMap((p) => p.deployments.filter((x) => x.state === "success").map((x) => (Date.parse(x.at) - Date.parse(p.t)) / 6e4));
  const nc = ps.reduce((s, p) => s + p.n, 0);
  log(`| ${d} | ${nc} | ${ps.length} | ${by("completed")} | ${by("ignored")} | ${by("canceled")} | ${by("failed")} | ${by("unresolved")} | ${ds("success")}/${ds("inactive")}/${ds("failure")} | ${q(comp.map((p) => p.e2eMin), 0.5)}/${q(comp.map((p) => p.e2eMin), 0.9)} | ${q(comp.map((p) => p.pendMin), 0.5)} | ${q(depLag, 0.5)} |`);
}
const all = (o) => P.filter((p) => p.o === o).length;
const comp = P.filter((p) => p.o === "completed");
log("TOTAL pushes", P.length, "commits", P.reduce((s, p) => s + p.n, 0), "completed", all("completed"), "ignored", all("ignored"), "canceled", all("canceled"), "failed", all("failed"), "unresolved", all("unresolved"));
log("per day: pushes", (P.length / spanDays).toFixed(1), "completed", (all("completed") / spanDays).toFixed(1), "ignored", (all("ignored") / spanDays).toFixed(1), "canceled", (all("canceled") / spanDays).toFixed(1), "failed", (all("failed") / spanDays).toFixed(2));
log("GH deployments in window", D.length, JSON.stringify(D.reduce((m, x) => { const k = x.statuses.at(-1)?.state + ":" + (x.statuses.at(-1)?.description ?? "").slice(0, 30); m[k] = (m[k] ?? 0) + 1; return m; }, {})));
log("deployments with an 'Ignored' description:", D.filter((x) => x.statuses.some((s) => /ignor/i.test(s.description ?? ""))).length, "; statuses per deployment:", JSON.stringify(D.reduce((m, x) => (m[x.statuses.length] = (m[x.statuses.length] ?? 0) + 1, m), {})));
const stLag = D.map((x) => (Date.parse(x.statuses[0]?.created_at) - Date.parse(x.created_at)) / 1000);
log("deployment created -> first status seconds p50/max", q(stLag, 0.5), Math.max(...stLag));
log("completed e2e (commit->final status) p50/p90 overall", q(comp.map((p) => p.e2eMin), 0.5), q(comp.map((p) => p.e2eMin), 0.9), "pending->final p50/p90", q(comp.map((p) => p.pendMin), 0.5), q(comp.map((p) => p.pendMin), 0.9));
const late = comp.filter((p) => p.t >= "2026-10-16");
log("completed e2e since 10-16 p50/p90", q(late.map((p) => p.e2eMin), 0.5), q(late.map((p) => p.e2eMin), 0.9), "n", late.length);
const canc = P.filter((p) => p.o === "canceled");
log("canceled e2e p50", q(canc.map((p) => p.e2eMin), 0.5), "ignored e2e p50", q(P.filter((p) => p.o === "ignored").map((p) => p.e2eMin), 0.5));
log("deployments per completed head:", JSON.stringify(comp.reduce((m, p) => (m[p.deployments.length] = (m[p.deployments.length] ?? 0) + 1, m), {})), "per ignored head:", JSON.stringify(P.filter((p) => p.o === "ignored").reduce((m, p) => (m[p.deployments.length] = (m[p.deployments.length] ?? 0) + 1, m), {})));

// replay validation
log("## replay (deployed base) vs actual");
const cm = {};
for (const p of P) { const k = `${p.o} -> ${p.replay}(${p.replayWhy})`; cm[k] = (cm[k] ?? 0) + 1; }
for (const [k, v] of Object.entries(cm).sort()) log(" ", k, v);
const cmo = {};
for (const p of P) { const k = `${p.o} -> own ${p.ownReplay}(${p.ownWhy})${p.clockOnly ? " CLOCK" : ""}`; cmo[k] = (cmo[k] ?? 0) + 1; }
log("## own-diff replay (prev head -> head)");
for (const [k, v] of Object.entries(cmo).sort()) log(" ", k, v);
const mism = P.filter((p) => (p.o === "ignored" && p.replay === "BUILD") || ((p.o === "completed" || p.o === "failed") && p.replay === "SKIP"));
log("mismatches", mism.length, mism.slice(0, 12).map((p) => `${p.head.slice(0, 10)} ${p.t} ${p.o} replay=${p.replay}/${p.replayWhy} own=${p.ownReplay} base=${p.base?.slice(0, 10)} ${p.headWriter}`).join("\n   "));

// writers
log("## by head writer: writer | pushes | completed | ignored | canceled | failed | completed own-NO_INPUT | completed CLOCK_ONLY");
const W = {};
for (const p of P) { const w = (W[p.headWriter] ??= { n: 0, completed: 0, ignored: 0, canceled: 0, failed: 0, unresolved: 0, noin: 0, clock: 0 }); w.n++; w[p.o]++; if (p.o === "completed" && p.ownReplay === "SKIP") w.noin++; if (p.o === "completed" && p.clockOnly) w.clock++; }
for (const [k, w] of Object.entries(W).sort((a, b) => b[1].completed - a[1].completed)) log(`| ${k} | ${w.n} | ${w.completed} | ${w.ignored} | ${w.canceled} | ${w.failed} | ${w.noin} | ${w.clock} |`);

// bursts
const gaps = [5, 10];
for (const g of gaps) {
  const bursts = []; let cur = [];
  for (const p of P) { if (cur.length && (Date.parse(p.t) - Date.parse(cur.at(-1).t)) / 6e4 > g) { bursts.push(cur); cur = []; } cur.push(p); }
  bursts.push(cur);
  const multi = bursts.filter((b) => b.length > 1);
  log(`bursts(gap<=${g}m): groups ${bursts.length}, multi-push ${multi.length} covering ${multi.reduce((s, b) => s + b.length, 0)} pushes; multi with >=2 completed: ${multi.filter((b) => b.filter((p) => p.o === "completed").length >= 2).length} (${multi.reduce((s, b) => s + Math.max(0, b.filter((p) => p.o === "completed").length - 1), 0)} completed beyond the first)`);
}

// Lever 1: coalescing — debounce window W from the first push of a group; one build per group that has a build-input change in its own diffs
log("## lever1 coalescing (debounce): W | groups with input | actual completed+failed | avoided | /day | max added delay");
const actualBuilds = P.filter((p) => p.o === "completed" || p.o === "failed").length;
for (const w of [5, 10, 15, 30]) {
  let groups = 0, g0 = null, has = false;
  for (const p of P) {
    const t = Date.parse(p.t);
    if (g0 == null || (t - g0) / 6e4 > w) { if (g0 != null && has) groups++; g0 = t; has = false; }
    if (p.ownReplay === "BUILD") has = true;
  }
  if (has) groups++;
  log(`| ${w} min | ${groups} | ${actualBuilds} | ${actualBuilds - groups} | ${((actualBuilds - groups) / spanDays).toFixed(1)} | ${w} min |`);
}
// same, writer-side: only bot pushes coalesce (humans/PR merges always build alone)
// Lever 2: stamp-only builds
const clock = comp.filter((p) => p.clockOnly);
log("## lever2 CLOCK_ONLY completed:", clock.length, (clock.length / spanDays).toFixed(2), "/day; since 10-18T05Z:", clock.filter((p) => p.t >= "2026-10-18T05").length, "by writer", JSON.stringify(clock.reduce((m, p) => (m[p.inputWriters.join("+")] = (m[p.inputWriters.join("+")] ?? 0) + 1, m), {})));
const noin = comp.filter((p) => p.ownReplay === "SKIP");
log("completed with own-diff NO_INPUT (inherited via base lag):", noin.length, (noin.length / spanDays).toFixed(2), "/day; since 10-18T05Z:", noin.filter((p) => p.t >= "2026-10-18T05").length);
// Lever 3: low-urgency writers as the only input-changers of a completed push
const STRICT = new Set(["nba internal research", "forecast ledger", "soccer DC v2 shadow", "cron-slot coverage", "nfl sim v2 shadow", "top boards", "mlb pregame archive metadata", "auto-refresh (ops)"]);
const BROAD = new Set([...STRICT, "pregame weather", "soccer leagues", "ufc", "injuries facts", "morning projections", "epl", "nba other"]);
for (const [name, set] of [["strict", STRICT], ["broad", BROAD]]) {
  const hit = comp.filter((p) => p.inputWriters.length && p.inputWriters.every((w) => set.has(w)));
  const by = hit.reduce((m, p) => (m[p.inputWriters.join("+")] = (m[p.inputWriters.join("+")] ?? 0) + 1, m), {});
  const recent = hit.filter((p) => p.t >= "2026-10-18T05");
  log(`lever3 ${name}: completed builds whose only input-changers are low-urgency: ${hit.length} (${(hit.length / spanDays).toFixed(1)}/day); since 10-18T05Z ${recent.length} in ${((Date.parse(END) - Date.parse("2026-10-18T05:00:00Z")) / 864e5).toFixed(2)} d`, JSON.stringify(by));
  // batching into hourly slots: builds that remain = distinct UTC hours among hits that do not already contain another (non-low) completed build
  const hrsOther = new Set(comp.filter((p) => !hit.includes(p)).map((p) => p.t.slice(0, 13)));
  const remainH = new Set(hit.map((p) => p.t.slice(0, 13)).filter((h) => !hrsOther.has(h)));
  const remain3 = new Set(hit.map((p) => p.t.slice(0, 11) + String(Math.floor(+p.t.slice(11, 13) / 3)).padStart(2, "0")));
  log(`   if batched to ride the next non-low build in the same UTC hour, else 1 per hour: remaining ${remainH.size} -> avoided ${hit.length - remainH.size} (${((hit.length - remainH.size) / spanDays).toFixed(1)}/day); 3h slots one build each (upper): avoided ${hit.length - remain3.size}`);
}
// NFL Sunday 10-18 (UTC day) + NBA
for (const d of ["2026-10-18", "2026-10-11"]) {
  const ps = P.filter((p) => p.day === d);
  if (!ps.length) continue;
  const c = ps.filter((p) => p.o === "completed");
  const nfl = c.filter((p) => p.inputWriters.some(isNflW));
  log(`## ${d}: pushes ${ps.length}, completed ${c.length}, NFL-input completed ${nfl.length}, NFL-headed pushes ${ps.filter((p) => p.headWriter.startsWith("nfl")).length}`);
  const hrs = {};
  for (const p of ps) { const h = p.t.slice(11, 13); (hrs[h] ??= { p: 0, c: 0, nfl: 0, ig: 0, ca: 0 }); hrs[h].p++; if (p.o === "completed") hrs[h].c++; if (p.o === "completed" && p.inputWriters.some(isNflW)) hrs[h].nfl++; if (p.o === "ignored") hrs[h].ig++; if (p.o === "canceled") hrs[h].ca++; }
  log("   hour: pushes/completed/nflCompleted/ignored/canceled", Object.entries(hrs).map(([h, v]) => `${h}Z ${v.p}/${v.c}/${v.nfl}/${v.ig}/${v.ca}`).join("  "));
  log("   e2e p50/p90 completed", q(c.map((p) => p.e2eMin), 0.5), q(c.map((p) => p.e2eMin), 0.9));
}
function isNflW(w) { return w.startsWith("nfl"); }
const nbaP = P.filter((p) => p.writers.some((w) => w.startsWith("nba")));
log("## NBA: pushes containing an nba commit", nbaP.length, "completed", nbaP.filter((p) => p.o === "completed").length, "of which nba is an input-changer", nbaP.filter((p) => p.o === "completed" && p.inputWriters.some((w) => w.startsWith("nba"))).length, "nba sole input changer", nbaP.filter((p) => p.o === "completed" && p.inputWriters.length && p.inputWriters.every((w) => w.startsWith("nba"))).length, "by outcome", JSON.stringify(nbaP.reduce((m, p) => (m[p.headWriter + ":" + p.o] = (m[p.headWriter + ":" + p.o] ?? 0) + 1, m), {})));
const nbaByDay = {};
for (const p of nbaP) { (nbaByDay[p.day] ??= { p: 0, c: 0 }); nbaByDay[p.day].p++; if (p.o === "completed" && p.inputWriters.some((w) => w.startsWith("nba"))) nbaByDay[p.day].c++; }
log("   nba per day pushes/nba-input completed", JSON.stringify(nbaByDay));
// recent window (post #1088/#1124 release) normalised
const R = P.filter((p) => p.t >= "2026-10-18T04:54");
const rd = (Date.parse(END) - Date.parse("2026-10-18T04:54:00Z")) / 864e5;
log(`## since 10-18T04:54Z (${rd.toFixed(2)} d): pushes ${R.length} (${(R.length / rd).toFixed(1)}/d) completed ${R.filter((p) => p.o === "completed").length} (${(R.filter((p) => p.o === "completed").length / rd).toFixed(1)}/d) ignored ${R.filter((p) => p.o === "ignored").length} canceled ${R.filter((p) => p.o === "canceled").length} failed ${R.filter((p) => p.o === "failed").length}`);
fs.writeFileSync(S + "summary.txt", out.join("\n"));
// TSV per push
const tsv = ["head\tpushed_utc\tn_commits\tvercel_outcome\tfirst_status\tfinal_status\te2e_min\thead_writer\tinput_writers\treplay_deployed_base\tbase_sha\town_diff_replay\tclock_only\tn_input_files\tgh_deployments\ttouched_areas"];
for (const p of P) tsv.push([p.head.slice(0, 10), p.t, p.n, p.o, p.first, p.final, p.e2eMin.toFixed(1), p.headWriter, p.inputWriters.join("+"), `${p.replay}:${p.replayWhy}`, p.base?.slice(0, 10), `${p.ownReplay}:${p.ownWhy}`, p.clockOnly ? 1 : 0, p.nInput, p.deployments.map((d) => d.state).join("+"), p.areas.join(" ")].join("\t"));
fs.writeFileSync(S + "pushes.tsv", tsv.join("\n") + "\n");
console.log(out.join("\n"));
