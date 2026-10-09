/**
 * World Model V2 game review (docs/research/nfl/world-model-v2-reviews/). PRIVATE research; reads only frozen records.
 *
 * Usage: node scripts/research/nfl/wm2-review/conditional.mjs <work-dir> [<repo-checkout>]
 *   <work-dir> holds: worlds-<eventId>.json (the run's 10,000 worlds, dumped by re-running the builder at the producing
 *   commit with WM2_DUMP=<file> — the run reproduces exactly; the write-once guard refuses to overwrite the run file),
 *   frozen-<eventId>.json (the committed artifact), summary.json (ESPN game summary), grades-scratch.json (grade.mjs output).
 *   <repo-checkout>: a checkout of main for the market capture. Written for TB @ DAL (401872980); event id is fixed below.
 */
import fs from "node:fs";
const P = process.argv[2]; const d = JSON.parse(fs.readFileSync(`${P}/worlds-401872980.json`, "utf8")); const s = d.sim;
const V = (o) => Float64Array.from(Object.values(o)); const q = (xs, p) => { const t = [...xs].sort((a, b) => a - b); return t[Math.min(t.length - 1, Math.floor(p * t.length))]; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length; const share = (xs, f) => xs.filter(f).length / Math.max(1, xs.length);
const home = V(s.game.home), away = V(s.game.away); const idxAll = [...home.keys()];
const tbWin8 = idxAll.filter((i) => away[i] - home[i] >= 8), dalWin = idxAll.filter((i) => home[i] > away[i]);
const pick = (arr, idx) => idx.map((i) => arr[i]);
const row = (name, arr) => { const f = (idx) => { const xs = pick(arr, idx); return `${mean(xs).toFixed(1)} [${q(xs, .1).toFixed(0)}–${q(xs, .9).toFixed(0)}]`; }; return `${name.padEnd(22)} all ${f(idxAll).padEnd(16)} TB wins by 8+ (n=${tbWin8.length}) ${f(tbWin8).padEnd(16)} DAL wins ${f(dalWin)}`; };
const [TB, DAL] = s.team;
console.log(row("TB carries", V(TB.carries))); console.log(row("TB passAtt", V(TB.passAtt))); console.log(row("TB rushYds", V(TB.rushYds)));
console.log(row("DAL carries", V(DAL.carries))); console.log(row("DAL passAtt", V(DAL.passAtt))); console.log(row("DAL passYds", V(DAL.passYds)));
const irving = d.members[0].findIndex((m) => m.name === "Bucky Irving"), pickens = d.members[1].findIndex((m) => m.name === "George Pickens"), lamb = d.members[1].findIndex((m) => m.name === "CeeDee Lamb"), dak = d.members[1].findIndex((m) => m.name === "Dak Prescott");
const iC = V(TB.players[irving].carries), iY = V(TB.players[irving].rushYds);
console.log(row("Irving carries", iC)); console.log(row("Irving rushYds", iY));
console.log(`Irving: P(>=165)=${share(iY, (y) => y >= 165).toFixed(4)}  P(>=21 carries)=${share(iC, (c) => c >= 21).toFixed(4)}  ypc in worlds: mean ${(mean(iY) / mean(iC)).toFixed(2)} | actual 21 car 165 yds (7.86 ypc)`);
const iYc = idxAll.filter((i) => iC[i] >= 20).map((i) => iY[i] / iC[i]); console.log(`Irving ypc given >=20 carries: mean ${mean(iYc).toFixed(2)} p90 ${q(iYc, .9).toFixed(2)} p99 ${q(iYc, .99).toFixed(2)}  P(ypc>=7.86 | >=20 car)=${share(iYc, (x) => x >= 7.86).toFixed(4)}`);
const pT = V(DAL.players[pickens].targets), pY = V(DAL.players[pickens].recYds), lT = V(DAL.players[lamb].targets), lY = V(DAL.players[lamb].recYds), dY = V(DAL.players[dak].passYds);
console.log(row("Pickens targets", pT)); console.log(row("Pickens recYds", pY)); console.log(row("Lamb targets", lT)); console.log(row("Lamb recYds", lY)); console.log(row("Prescott passYds", dY));
console.log(`Pickens P(>=13 tgt)=${share(pT, (x) => x >= 13).toFixed(4)} P(>=130)=${share(pY, (x) => x >= 130).toFixed(4)} | Lamb P(<=5 tgt)=${share(lT, (x) => x <= 5).toFixed(4)} P(<=9 yds)=${share(lY, (x) => x <= 9).toFixed(4)} | Prescott P(>=316)=${share(dY, (x) => x >= 316).toFixed(4)}`);
// share of DAL targets: Pickens vs Lamb in worlds
const dTgt = V(DAL.passAtt); console.log(`target share in worlds: Pickens ${(mean(pT) / mean(dTgt)).toFixed(3)}  Lamb ${(mean(lT) / mean(dTgt)).toFixed(3)} | actual Pickens 13/42=${(13 / 42).toFixed(3)} Lamb 5/42=${(5 / 42).toFixed(3)}`);
// correlation: team margin vs carries
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };
const tbMargin = idxAll.map((i) => away[i] - home[i]);
console.log(`corr(TB margin, TB carries)=${corr(tbMargin, V(TB.carries)).toFixed(3)}  corr(TB margin, DAL passAtt)=${corr(tbMargin, V(DAL.passAtt)).toFixed(3)}  corr(TB margin, DAL carries)=${corr(tbMargin, V(DAL.carries)).toFixed(3)}  corr(TB margin, TB rushYds)=${corr(tbMargin, V(TB.rushYds)).toFixed(3)}`);
const tbPlays = idxAll.map((i) => TB.carries[i] + TB.passAtt[i]), dalPlays = idxAll.map((i) => DAL.carries[i] + DAL.passAtt[i]);
console.log(`plays (carries+passAtt, no sacks/kneels): TB mean ${mean(tbPlays).toFixed(1)} [${q(tbPlays, .1)}–${q(tbPlays, .9)}] actual 39+25=64 | DAL mean ${mean(dalPlays).toFixed(1)} [${q(dalPlays, .1)}–${q(dalPlays, .9)}] actual 13+42=55 | corr(TB plays, DAL plays)=${corr(tbPlays, dalPlays).toFixed(3)}`);
