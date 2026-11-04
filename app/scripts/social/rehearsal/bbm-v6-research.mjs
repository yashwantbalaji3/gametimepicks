// BBM V6 FOUNDER-REVIEW PREVIEWS of the engine's Level B research selections (PD 2026-11-04): drawn straight from the
// sealed card@2 records (no lane log exists before approval). FOUNDER REVIEW ribbon, never VERIFIED unless the record's
// price event is verified, no probability rows, the engine's k/n evidence line, lineup flags, the actual payout with the
// step target beneath. Writes to --out: full/, mobile/ (400 px), captions/, manifest.json (parity rows against the
// records). Never a package: the founder approves before anything is packaged for posting.
//
//   npx tsx scripts/social/rehearsal/bbm-v6-research.mjs --selection <research-selection.json> --out <dir outside the repo>
//       [--held ms-a,ms-b] [--held-code ML_EVIDENCE_UNFITTED] (draw those lanes HELD; the engine code in plain words)
//       [--alt bb-b=<other selection.json>] (an alternate: that file's sealed record for the lane, drawn as <lane>-alt)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { parseArgs } from "../render-social-pack.mjs";
import { X_LIMIT, CAPTION_PRICE_TEXT, rendererCommit, xWeighted } from "../render-bbm.mjs";
import { american, cents } from "../bbm-cards.mjs";
import { RULES_V2, bbmCardV6, bbmV6LayoutErrors, heldReasonText, verifyBbmCardV6 } from "../bbm-cards-v6.mjs";
import { BADGE, BBM_LANES, RUNG, VIEW, socialPricesOk } from "../../../src/lib/social/bbm-lane.mjs";
import { evidenceLine } from "../../../src/lib/challenge-lanes/card-fields.mjs";

const a = parseArgs(process.argv.slice(2));
const FINAL = a.final != null && a.final !== "0" && a.final !== false;
const out = path.resolve(a.out);
const raw = fs.readFileSync(a.selection);
const sel0 = JSON.parse(raw);
// A sealed-records file (records["<lane>:<A|B|C>"].record): option A is the lane's card, the others render as alternates.
const sel = sel0.records ? { now: sel0.evaluatedAt, lanes: Object.fromEntries(["bb-a", "bb-b", "ms-a", "ms-b"].filter((l) => sel0.records[`${l}:A`]).map((l) => [l, { card: sel0.records[`${l}:A`].record }])) } : sel0;
const RECORD_ALTS = sel0.records && !FINAL ? Object.keys(sel0.records).filter((k) => !k.endsWith(":A") && sel0.records[k].record?.classification !== "HOLD").map((k) => { const [laneId, opt] = k.split(":"); return { laneId, name: `${laneId}-${opt}`, sel: { lanes: { [laneId]: { card: sel0.records[k].record } } }, file: `${a.selection}#${k}` }; }) : [];
const TEAMS = JSON.parse(fs.readFileSync(path.resolve("src/lib/simulation-theater/nba/nba-team-colors.json"), "utf8"));
const teamName = (abbr) => TEAMS.teams[abbr]?.name ?? TEAMS.teams[TEAMS.aliases?.[abbr]]?.name ?? abbr;
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
if (!socialPricesOk()) throw new Error("the display record does not authorize NBA challenge-graphics prices; prices are not drawn");
const TERMS = { "bank-builder": { baseCents: 10000, targetCents: 1000000 }, moonshot: { baseCents: 2500, targetCents: 100000 } };
const SHORT = { player_points: "PTS", player_rebounds: "REB", player_assists: "AST", player_threes: "3PM" };
const WORD = { player_points: "points", player_rebounds: "rebounds", player_assists: "assists", player_threes: "threes" };
// --final 1 (founder 2026-11-04): the FINAL images, final-first. No review ribbon and no preliminary; every record must carry
// the run-2 PRICE_VERIFIED event and the founder's approval, and its money must reconcile with an independent recompute.
const REVIEW = FINAL ? null : "Founder review · not approved · do not post";
const decimalOf = (am) => (am > 0 ? 1 + am / 100 : 1 + 100 / -am);
/** Fail-closed field checks for a final record: price event, approval, combined decimal, gross and profit (1 cent). */
function finalProblems(c) {
  const p = [];
  if (!c.priceEventSha256) p.push("no PRICE_VERIFIED event (priceEventSha256 is null)");
  if (!c.approvalStatus || /PENDING|REJECT/i.test(c.approvalStatus)) p.push(`approval is ${c.approvalStatus ?? "missing"}`);
  const dec = c.legs.reduce((x, l) => x * decimalOf(l.price), 1);
  if (Math.abs(dec - c.combined.decimal) > 1e-6) p.push(`combined decimal ${c.combined.decimal} is not the leg product ${dec}`);
  const gross = c.money.stakeCents * dec;
  if (Math.abs(gross - c.money.grossPayoutCents) > 1) p.push(`gross ${c.money.grossPayoutCents} is not stake × ${dec.toFixed(6)} = ${gross.toFixed(2)}`);
  if (c.money.grossPayoutCents - c.money.stakeCents !== c.money.profitCents) p.push(`profit ${c.money.profitCents} is not gross minus stake`);
  const am = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  if (Math.abs(am - c.combined.american) > 1) p.push(`combined american ${c.combined.american} is not ${am}`);
  return p;
}

const HELD = new Set(String(a.held ?? "").split(",").filter(Boolean));
// A preview record the engine classifies HOLD draws as held (never as a card); a final file with a HOLD lane is refused.
// PD 2026-11-04: final mode draws a HOLD lane truthfully too, with the engine's own reason code in plain words.
const HELD_CODE = {};
for (const [laneId, v] of Object.entries(sel.lanes ?? {})) if (v.card?.classification === "HOLD") { HELD.add(laneId); HELD_CODE[laneId] = v.card.heldCode ?? String(v.card.reasons?.[0] ?? "").split(" ")[0] ?? null; }
// --alt lane=<selection.json> (that file's lanes[lane].card) or lane=<sealed-alternates.json>#<records key> (its .record).
const ALTS = String(a.alt ?? "").split(",").filter(Boolean).map((x) => {
  const [laneId, ref] = x.split("="); const [f, key] = ref.split("#"); const j = JSON.parse(fs.readFileSync(f, "utf8"));
  if (key && !j.records?.[key]?.record) throw new Error(`${f}: no sealed record ${key}`);
  return { laneId, file: ref, sel: key ? { lanes: { [laneId]: { card: j.records[key].record } } } : j };
});
/** An unmapped engine flag code in plain words: prefix dropped, sentence case ("ML_KEY_UNCERTAIN" → "Key uncertain"). */
const flagWords = (code) => { const t = code.replace(/^[A-Z]+_/, "").replace(/_/g, " ").toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const isMoneyline = (l) => ["winner", "moneyline", "h2h", "ml"].includes(String(l.market ?? l.family ?? "").toLowerCase());
/** The engine's Level B leg flags in plain words (the record's flags[] codes). */
const FLAG_WORDS = { B_ROLE_UNSTABLE: "Role unstable", B_MINUTES_VOLATILE: "Minutes volatile", B_MINUTES_UNCERTAIN: "Minutes uncertain", B_MINUTES_DROP: "Minutes drop", ML_SMALL_SAMPLE: "Small sample", ML_ROSTER_TURNOVER: "Roster turnover", ML_KEY_OUT: "Key player out", ML_KEY_DTD: "Key player day-to-day", ML_TOP5_OUT: "Top 5 player out" };
/** The lane's minutes disclosure from the record's role note ("lane projected 15.5 min; L5 mean 24.4"). */
const minutesNote = (role) => { const m = /lane projected ([\d.]+) min; L5 mean ([\d.]+)/.exec(role?.note ?? ""); return m ? `Projected minutes ${m[1]} vs ${m[2]} recent` : null; };
const models = [];
const jobs = [...["bb-a", "bb-b", "ms-a", "ms-b"].map((laneId) => ({ laneId, name: laneId, sel, file: a.selection })), ...ALTS.map((x) => ({ laneId: x.laneId, name: `${x.laneId}-alt`, sel: x.sel, file: x.file, alt: true })), ...RECORD_ALTS.map((x) => ({ ...x, alt: true }))].filter((j) => j.alt || HELD.has(j.laneId) || sel.lanes[j.laneId]);
for (const { laneId, name, sel: src, file: srcFile, alt } of jobs) {
  const L0 = BBM_LANES[laneId];
  if (HELD.has(laneId) && !alt) {
    const product = L0.product;
    const rungs = RULES_V2.milestonesCents[product].map((m, i) => ({ step: i + 1, milestoneCents: m, state: i ? RUNG.UPCOMING : RUNG.ACTIVE }));
    models.push({ laneId, name, held: true, legsRaw: [], model: { product, letter: L0.letter, laneId, date: "2026-11-04", step: 1, steps: 5, rungs, ...TERMS[product], bankrollCents: TERMS[product].baseCents, badge: BADGE.HELD, view: VIEW.NO_ELIGIBLE_CARD, template: false, legs: [], payout: null, heldSub: "No card tonight", heldReason: HELD_CODE[laneId] ? heldReasonText(HELD_CODE[laneId]) : a["held-code"] ? heldReasonText(a["held-code"]) : "Held pending the founder's decision on tonight's research selections.", researchLine: true, reviewRibbon: REVIEW } });
    continue;
  }
  const lane = src.lanes[laneId]; const c = lane?.card;
  if (!c || c.schema !== "gtp.bbm.card@2" || c.rulesVersion !== "bbm-rules@2") throw new Error(`${laneId}: no card@2 record under rules v2`);
  // Level B: research, never a probability. Level A: the model probability per leg (no other claim is drawn).
  if (!["LEVEL_A", "LEVEL_B"].includes(c.classification) || (c.classification === "LEVEL_B" && (c.probability != null || c.evClaim))) throw new Error(`${laneId}: ${c.classification} with a probability or an EV claim is not drawn`);
  if (c.legs.length > RULES_V2.maxLegs) throw new Error(`${laneId}: ${c.legs.length} legs`);
  const L = BBM_LANES[laneId]; const product = L.product;
  const legs = c.legs.map((l) => {
    const [away, home] = l.eventLabel.split(" @ ");
    const inj0 = c.injuryStatus?.find((x) => x.legId === l.legId);
    if (isMoneyline(l)) {
      // A moneyline leg (lane A): the team, and the model win probability the record carries; none is invented.
      const side = l.selection?.teamAbbr ?? l.team;
      // Founder 2026-11-04: only a Level A leg shows a probability (the Elo winner probability is not calibrated); Level B shows the engine's evidence line.
      const levelA = (l.classification ?? c.classification) === "LEVEL_A";
      const shown = levelA ? (l.probabilityShown ?? (l.probability != null ? `${Math.round(l.probability * 100)}%` : null)) : null;
      if (levelA && !shown) throw new Error(`${laneId}: Level A moneyline ${l.legId} carries no model win probability`);
      const evText = levelA ? null : (l.evidenceLine ?? l.evidenceText ?? evidenceLine(l));
      if (!levelA && !evText) throw new Error(`${laneId}: Level B moneyline ${l.legId} carries no evidence line`);
      const flags = [...(inj0?.lineup?.sensitive ? [`Lineup watch: ${inj0.lineup.tonightScenario}`] : []), ...(l.flagText ?? []).filter((t) => !/^[A-Z0-9]+_[A-Z0-9_]+\b/.test(t)), ...(c.flags ?? []).filter((f) => f.legId === l.legId).map((f) => FLAG_WORDS[f.code] ?? flagWords(f.code))];
      return { legId: l.legId, team: { abbr: side, name: l.teamName ?? teamName(side) }, opponent: { abbr: side === home ? away : home }, home: side === home, tipUtc: l.startUtc, level: levelA ? "A" : "B", ...(levelA ? { projectionText: shown } : { evidenceText: evText }), flagText: [...new Set(flags)] };
    }
    const ev = evidenceLine(l);
    if (!ev) throw new Error(`${laneId}: ${l.legId} lacks L10 or L20 hit counts`);
    const w10 = l.hitRate.windows.find((w) => w.window === "last10");
    const inj = c.injuryStatus?.find((x) => x.legId === l.legId);
    const flags = [...(inj && inj.status !== "ACTIVE" ? [`${l.player.name} ${String(inj.status).toLowerCase()}`] : []), ...(inj?.lineup?.sensitive ? [`Lineup watch: ${inj.lineup.tonightScenario}`] : []), ...(minutesNote(l.role) ? [minutesNote(l.role)] : []), ...(c.flags ?? []).filter((f) => f.legId === l.legId).map((f) => FLAG_WORDS[f.code] ?? flagWords(f.code))];
    const levelA = l.classification === "LEVEL_A" && l.probability != null;
    return { kind: "PROP", legId: l.legId, player: { name: l.player.name }, team: { abbr: l.team, name: l.team }, opponent: { abbr: l.team === home ? away : home }, home: l.team === home, tipUtc: l.startUtc, level: levelA ? "A" : "B", ...(levelA ? { projectionText: l.probabilityShown ?? `${Math.round(l.probability * 100)}%` } : {}), lineText: `${l.side.toUpperCase()} ${l.line} ${SHORT[l.market] ?? ""}`.trim(), evidenceText: ev, evidenceBig: `${w10.hits}/${w10.n}`, flagText: [...new Set(flags)] };
  });
  const verified = c.priceEventSha256 != null;
  if (FINAL) { const fp = finalProblems(c); if (fp.length) throw new Error(`${name}: not final: ${fp.join("; ")}`); }
  const rungs = RULES_V2.milestonesCents[product].map((m, i) => ({ step: i + 1, milestoneCents: m, state: i ? RUNG.UPCOMING : RUNG.ACTIVE }));
  models.push({ laneId, name, alt: alt === true, sourceFile: srcFile, record: c, legsRaw: c.legs, model: {
    product, letter: L.letter, laneId, date: c.date, step: 1, steps: 5, rungs, ...TERMS[product], bankrollCents: c.money.stakeCents, badge: BADGE.ACTIVE, view: VIEW.CARD, template: false,
    laneType: c.laneType ?? lane.laneType ?? undefined, legs, selectionLabel: c.selectionLabel ?? (c.classification === "LEVEL_B" ? "Research selection — no validated edge claim" : null), reviewRibbon: REVIEW, showStepTarget: true,
    payout: { combinedLabel: c.combinedLabel ?? c.combined?.label ?? null, combinedAmerican: c.combined.american, grossCents: c.money.grossPayoutCents, profitCents: c.money.profitCents, stakeCents: c.money.stakeCents, preliminary: !verified, fixture: false, estimate: false, legs: Object.fromEntries(c.legs.map((l) => [l.legId, { price: l.price, oddsFormat: "american", line: l.line }])) },
  } });
}
// Founder 2026-11-04, diversity@2: no leg repeats across the day's four lanes. Identity is the underlying selection
// (game + team for a moneyline; game + player + stat family + side for a prop), whatever the line, book or odds.
const selectionOf = (l) => (isMoneyline(l) ? `${l.gameId}:ml:${l.selection?.teamAbbr ?? l.team}` : `${l.gameId}:${l.family ?? l.market}:${l.player?.playerId ?? l.player?.name}:${l.side}`);
const seen = new Map(); const repeats = [];
for (const m of models.filter((x) => !x.alt && !x.held)) for (const l of m.legsRaw) {
  const id = selectionOf(l);
  if (seen.has(id)) repeats.push(`${id} is on ${seen.get(id)} and ${m.laneId}`); else seen.set(id, m.laneId);
}
if (repeats.length && FINAL) throw new Error(`diversity@2: a leg repeats across lanes; the day's set is refused:\n  ${repeats.join("\n  ")}`);
if (repeats.length) console.log(`DIVERSITY WARNING (a final render would refuse):\n  ${repeats.join("\n  ")}`);
const cards = models.map((m) => ({ ...m, card: { ...bbmCardV6(m.model), name: m.name } }));
const bad = cards.flatMap((m) => verifyBbmCardV6(m.card).map((e) => `${m.name}: ${e}`));

function caption(product, pair) {
  const head = product === "bank-builder" ? "🏦 Bank Builder · Nov 4" : "🚀 Moonshot · Nov 4";
  const lanes = pair.map((m) => (m.held ? `Lane ${BBM_LANES[m.laneId].letter} · Held · Step 1 of 5` : `Lane ${BBM_LANES[m.laneId].letter} · Step 1 of 5\n${m.legsRaw.map((l) => (isMoneyline(l) ? `${l.teamName ?? teamName(l.selection?.teamAbbr ?? l.team)} to win` : `${l.player.name} · ${WORD[l.market] ?? l.family}`)).join("\n")}`));
  const t = pair.every((m) => m.held)
    ? [head, ...lanes, "No card tonight; both lanes hold their place and tracked bankroll. Tracked challenge, no real wager placed. #NBA"].join("\n\n")
    : [head, ...(pair.some((m) => m.record?.classification === "LEVEL_B") ? ["Research selection · no validated edge claim"] : []), ...lanes, `${pair.every((m) => m.record?.classification === "LEVEL_A") ? "Model probabilities" : "Research evidence"} on the graphic. Tracked challenge, no real wager placed. #NBA`].join("\n\n");
  if (xWeighted(t) > X_LIMIT || CAPTION_PRICE_TEXT.test(t)) throw new Error(`${product}: caption fails (${xWeighted(t)} X-weighted; ${t.match(CAPTION_PRICE_TEXT)?.[0] ?? "no price text"})`);
  return t;
}

/** The image's printed cells against the record (fail-closed). */
function parity(m) {
  const c = m.record; const cells = m.card.cells; const mis = [];
  const want = { "money.wager": cents(c.money.stakeCents), "money.payout": cents(c.money.grossPayoutCents), "money.profit": cents(c.money.profitCents), "price.combined": american(c.combined.american) };
  c.legs.forEach((l, i) => Object.assign(want, isMoneyline(l) ? { [`leg${i + 1}.team`]: m.model.legs[i].team.abbr, [`leg${i + 1}.odds`]: american(l.price), ...(m.model.legs[i].level === "A" ? { [`leg${i + 1}.proj`]: m.model.legs[i].projectionText } : { [`leg${i + 1}.evidence`]: m.model.legs[i].evidenceText }) } : { [`leg${i + 1}.name`]: l.player.name, [`leg${i + 1}.odds`]: american(l.price), [`leg${i + 1}.line`]: m.model.legs[i].lineText, [`leg${i + 1}.evidence`]: evidenceLine(l) }));
  for (const [k, v] of Object.entries(want)) if (cells[k] !== v) mis.push(`${k}: printed ${cells[k]} record ${v}`);
  if (c.classification === "LEVEL_B" && Object.keys(cells).some((k) => /\.proj$/.test(k))) mis.push("a Level B card with a probability row");
  if ("price.verified" in cells && c.priceEventSha256 == null) mis.push("VERIFIED on an unverified price");
  return mis;
}

const require = createRequire(path.resolve("package.json"));
const { chromium } = require("playwright");
const browser = await chromium.launch();
const layout = await bbmV6LayoutErrors(browser, cards.map((m) => m.card));
const full = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
const mobile = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 400 / 1080 });
const rows = [];
try {
  for (const d of ["full", "mobile", "captions"]) fs.mkdirSync(path.join(out, d), { recursive: true });
  const shoot = async (m) => {
    const shots = {};
    for (const [pg, d, suf] of [[full, "full", ""], [mobile, "mobile", "-400w"]]) {
      await pg.setContent(m.card.html, { waitUntil: "load" });
      await pg.evaluate(() => document.fonts.ready); // eslint-disable-line no-undef
      const b = await pg.screenshot({ type: "png" });
      fs.writeFileSync(path.join(out, d, `${m.name}${suf}.png`), b);
      shots[d] = sha(b);
    }
    return shots;
  };
  const row = (m, { pkg, mediaIndex, cap, shots }) => {
    const c = m.record;
    const base = { laneId: m.laneId, name: m.name, alternate: m.alt === true, date: "2026-11-04", packageId: pkg ? `${pkg}-2026-11-04` : null, mediaIndex, imageSha256: shots.full, mobileSha256: shots.mobile, captionSha256: cap ? sha(Buffer.from(cap, "utf8")) : null, caption: cap, graphicVersion: rendererCommit(), designVersion: m.card.design, sourceFile: m.sourceFile ?? a.selection };
    if (m.held) return { ...base, view: "NO_ELIGIBLE_CARD", status: "HELD", heldReason: m.model.heldReason, rulesVersion: "bbm-rules@2", step: 1, bankrollCents: m.model.bankrollCents, legs: [], priceClass: "NONE", priceEventSha256: null, payoutEventSha256: null, refEventSha256: null, recordSha256: null, parity: { ok: true, mismatches: [], note: "HELD is the PD's recommendation pending the founder; no engine HELD record exists" } };
    return {
      ...base, rulesVersion: c.rulesVersion, recordSha256: c.recordSha256, candidateId: c.candidateId, classification: c.classification, approvalStatus: c.approvalStatus, step: 1, bankrollCents: c.money.stakeCents,
      legs: c.legs.map((l) => ({ legId: l.legId, side: l.side, line: l.line, market: l.market, odds: american(l.price), book: l.book, quotedAt: l.quotedAt, fetchedAt: l.fetchedAt, evidence: evidenceLine(l), minutes: minutesNote(l.role), injury: c.injuryStatus?.find((x) => x.legId === l.legId) ?? null })),
      combinedAmerican: american(c.combined.american), payoutCents: c.money.grossPayoutCents, profitCents: c.money.profitCents,
      priceClass: c.priceEventSha256 ? "VERIFIED" : "QUOTE_UNVERIFIED", priceEventSha256: c.priceEventSha256, payoutEventSha256: null, refEventSha256: null,
      parity: { ok: parity(m).length === 0, mismatches: parity(m) },
    };
  };
  for (const [product, ids, pkg] of [["bank-builder", ["bb-a", "bb-b"], "bb"], ["moonshot", ["ms-a", "ms-b"], "ms"]]) {
    const pair = ids.map((id) => cards.find((m) => m.name === id));
    const cap = caption(product, pair);
    fs.writeFileSync(path.join(out, "captions", `${pkg}-2026-11-04.txt`), cap);
    for (const [i, m] of pair.entries()) rows.push(row(m, { pkg, mediaIndex: i + 1, cap, shots: await shoot(m) }));
  }
  // Alternates: images only (a chosen alternate replaces its lane and the package caption is rewritten then).
  for (const m of cards.filter((x) => x.alt)) rows.push(row(m, { pkg: null, mediaIndex: null, cap: null, shots: await shoot(m) }));
} finally { await browser.close(); }
const manifest = { schema: FINAL ? "gtp.bbm-v6-final@1" : "gtp.bbm-v6-founder-review@1", final: FINAL, diversity: { rule: "diversity@2", repeats }, source: { file: a.selection, sha256: sha(raw), now: sel.now ?? null }, note: FINAL ? "FINAL images from run-2 PRICE_VERIFIED records with founder approval; reconciled field by field. Not yet packaged or posted." : "FOUNDER-REVIEW previews only: not approved, never packaged, never posted. Prices are quotes, not verified price events.", checker: bad, layout, parityRows: rows };
fs.writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`checker problems: ${bad.length}${bad.length ? `\n  ${bad.join("\n  ")}` : ""}`);
console.log(`layout problems: ${layout.length}${layout.length ? `\n  ${layout.join("\n  ")}` : ""}`);
for (const r of rows) console.log(`${r.name} parity=${r.parity.ok}${r.parity.ok ? "" : ` ${r.parity.mismatches.join("; ")}`} full=${r.imageSha256} 400w=${r.mobileSha256}`);
