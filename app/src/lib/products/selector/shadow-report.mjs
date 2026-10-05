/**
 * Shadow dashboard / receipt (v1.7 Phase 7.2) — a PURE function of the ledger, the day files, the state
 * file and the live settlement files. No clock (`now` is an input), no fs, no hand edits: the same inputs
 * always render the same report, and nothing here can adopt a policy or touch the live selector.
 *
 *   buildShadowReport(inputs)      → JSON report (data/internal/products/selector-shadow/report.json)
 *   renderShadowReportMarkdown(r)  → docs/V17_SHADOW_REPORT.md
 *
 * Vocabulary rule: a shadow policy is never "adopted" here. The only states are the gate's own
 * (NOT_YET / ELIGIBLE_FOR_ADOPTION_RECEIPT), and even the second one means "the founder may write the
 * receipt", nothing more. The header always says SHADOW_RUNNING · NOT ADOPTED.
 */
import { createHash } from "node:crypto";
import { policyMetrics, adoptionGate, SHADOW_POLICIES } from "./shadow.mjs";

export const REPORT_STATUS = "SHADOW_RUNNING · NOT ADOPTED";
/** A day whose generatedAt trails its asOf by more than this was built after the instant it claims. */
export const RETROACTIVE_TOLERANCE_MS = 60 * 60 * 1000;

const sha = (s) => createHash("sha256").update(s).digest("hex");
const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const num = (x) => (x == null ? "—" : String(x));

/**
 * The PUBLICATION content of a day file: everything except what the nightly grader is allowed to add
 * (lane.graded, lane.completed). Two day files with the same fingerprint published the same cards.
 */
export function publicationFingerprint(day) {
  const clone = JSON.parse(JSON.stringify(day));
  for (const p of Object.values(clone.policies ?? {})) for (const l of Object.values(p.lanes ?? {})) { delete l.graded; delete l.completed; }
  return sha(JSON.stringify(clone));
}

/** Lane-day rows in the grader's shape, from the day files (one grading rule: the grader's own fields). */
export function laneRows(days, retroactiveDates = new Set()) {
  const rows = {};
  for (const day of days) for (const [name, p] of Object.entries(day.policies ?? {})) for (const lane of ["A", "B"]) {
    const x = p.lanes?.[lane]; if (!x) continue;
    (rows[name] ??= []).push({ date: day.date, lane, status: x.status === "placed" ? (x.graded?.status ?? "pending") : "NO_QUALIFYING_PLAY", reason: x.reason ?? null, step: x.step, jointP: x.jointP ?? null, american: x.american ?? null, completed: !!x.completed, sports: x.sports ?? [], probabilityBasis: x.probabilityBasis ?? null, retroactive: retroactiveDates.has(day.date) });
  }
  return rows;
}

function dayIntegrity(day, firstCommit) {
  const asOfMs = Date.parse(day.asOf), genMs = Date.parse(day.generatedAt);
  const flags = [];
  if (!Number.isFinite(asOfMs) || !Number.isFinite(genMs)) flags.push("MISSING_TIMESTAMP");
  else if (genMs - asOfMs > RETROACTIVE_TOLERANCE_MS) flags.push("RETROACTIVE");
  else if (genMs < asOfMs) flags.push("GENERATED_BEFORE_AS_OF");
  const fp = publicationFingerprint(day);
  let rewrite = "UNVERIFIED";
  if (firstCommit?.publicationFingerprint) rewrite = firstCommit.publicationFingerprint === fp ? "INTACT" : "REWRITE";
  if (rewrite === "REWRITE") flags.push("REWRITE_AFTER_FIRST_COMMIT");
  const eligibleByManifest = Object.values(day.availability ?? {}).reduce((a, s) => a + (s.eligible ?? 0), 0);
  const guardFailures = Math.max(0, eligibleByManifest - (day.eligibleLegs ?? 0));
  if (guardFailures > 0) flags.push("GUARD_FAILURE");
  return { date: day.date, asOf: day.asOf, generatedAt: day.generatedAt, retroactive: flags.includes("RETROACTIVE"), rewrite, firstCommitAt: firstCommit?.committedAt ?? null, firstCommitHash: firstCommit?.hash ?? null, publicationFingerprint: fp, universeSha256: day.universe?.sha256 ?? null, eligibleLegs: day.eligibleLegs ?? null, eligibleByManifest, guardFailures, flags };
}

/**
 * Compare the shadow's graded legs with the live settlement file for the same date.
 *
 * WHICH GAME, NOT WHICH WORDS (2026-10-05). Legs used to be joined on `matchup|selection` text. On a
 * doubleheader both games carry the same text, so on 2026-09-22 a shadow "Yankees to win" on game 1
 * (gamePk 823543, won 2-0) was compared with the live card's "Yankees to win" on game 2 (823494, lost
 * 1-6) and listed as a disagreement. Legs are now joined on the game: the shadow leg's MLB eventId is
 * its gamePk, and a live leg's gamePk is the one its receipt stored (F3) or, for an older receipt, the
 * one `liveIdentityByDate` proves from the slate's own artifacts (the settler's resolver, gathered by
 * the report script). The text join is kept only where the slate proves the game is not a doubleheader
 * or no identity was supplied at all; an unproven doubleheader leg is listed as UNMATCHED, never guessed.
 *
 * Pending is never compared as a result. A live leg still `pending` while the shadow decided the same
 * leg is a different fact (the live record never graded it) and is listed in `liveUngraded`.
 */
function settlementComparison(days, settledByDate, liveIdentityByDate = {}) {
  const disagreements = [], liveUngraded = [], unmatched = [];
  for (const day of days) {
    const settled = settledByDate?.[day.date]; if (!settled?.lanes) continue;
    const identity = liveIdentityByDate?.[day.date] ?? null;
    const byGame = new Map(), byText = new Map(), ambiguousText = new Set();
    for (const ln of settled.lanes) for (const l of ln.legs ?? []) {
      if (!l.matchup || !l.selection) continue;
      const stored = Number(l.gamePk);
      const proof = Number.isInteger(stored) && stored > 0 ? { gamePk: stored, doubleheader: false } : (identity?.[l.id] ?? null);
      const entry = { result: l.result ?? "pending", gamePk: proof?.gamePk ?? null };
      const text = `${l.matchup}|${l.selection}`;
      if (entry.gamePk) byGame.set(`${entry.gamePk}|${l.selection}`, entry);
      else if (identity && (!proof || proof.doubleheader)) ambiguousText.add(text);
      else byText.set(text, entry);
    }
    for (const [name, p] of Object.entries(day.policies ?? {})) for (const lane of ["A", "B"]) {
      const x = p.lanes?.[lane]; if (!x || x.status !== "placed" || !x.graded?.legs) continue;
      x.legs.forEach((leg, i) => {
        const shadowResult = x.graded.legs[i];
        if (!shadowResult || shadowResult === "pending") return;
        const text = `${leg.displayMatchup}|${leg.displaySelection}`;
        const pk = leg.sport === "mlb" ? Number(leg.eventId) : NaN;
        const row = { date: day.date, policy: name, lane, leg: text, gamePk: Number.isInteger(pk) && pk > 0 ? pk : null };
        const live = (row.gamePk ? byGame.get(`${row.gamePk}|${leg.displaySelection}`) : undefined) ?? byText.get(text);
        if (!live) { if (ambiguousText.has(text)) unmatched.push({ ...row, shadow: shadowResult, reason: "LIVE_GAME_UNPROVEN" }); return; }
        if (live.result === "pending") liveUngraded.push({ ...row, shadow: shadowResult, live: "pending" });
        else if (live.result !== shadowResult) disagreements.push({ ...row, shadow: shadowResult, live: live.result });
      });
    }
  }
  return { disagreements, liveUngraded, unmatched };
}

/**
 * ACTUAL vs MARKET-EXPECTED WINS (measurement only — the adoption gate does not read it; founder decision
 * 2026-10-05 #3/#5). Every shadow card's jointP is the de-vigged market's own probability, so the sum of
 * jointP over decided won/lost cards is how many wins the market expected. Actual − expected, with the
 * binomial sd √Σp(1−p), separates "this selector picked better cards" from "this selector got lucky",
 * which raw survival cannot: on 2026-10-05 the control led on survival while winning ~1.9 sd above its
 * own market expectation. Per rung too, because policies sit on different rungs (different prices).
 * Pushes and cards without a jointP are excluded and counted, never treated as zero.
 */
function marketExpectation(rows) {
  const tally = (rs) => {
    const d = rs.filter((x) => (x.status === "won" || x.status === "lost") && typeof x.jointP === "number");
    const expected = d.reduce((a, x) => a + x.jointP, 0), variance = d.reduce((a, x) => a + x.jointP * (1 - x.jointP), 0);
    const won = d.filter((x) => x.status === "won").length, sd = Math.sqrt(variance);
    return { n: d.length, won, expectedWins: +expected.toFixed(2), sd: +sd.toFixed(2), actualMinusExpected: +(won - expected).toFixed(2), z: sd > 0 ? +((won - expected) / sd).toFixed(2) : null };
  };
  const excluded = rows.filter((x) => (x.status === "won" || x.status === "lost") && typeof x.jointP !== "number").length;
  const byRung = {};
  for (const step of [...new Set(rows.map((x) => x.step).filter((s) => s != null))].sort((a, b) => a - b)) byRung[step] = tally(rows.filter((x) => x.step === step));
  return { ...tally(rows), excludedNoJointP: excluded, byRung };
}

/**
 * @param {object} inputs
 * @param {object|null} inputs.ledger      ledger.json as written by the grader (its metrics are cross-checked, never trusted alone)
 * @param {object[]} inputs.days           every <date>.json, any order
 * @param {object|null} inputs.state       state.json
 * @param {Record<string, object>} [inputs.settledByDate]   mr-dub/settled/<date>.json by date
 * @param {Record<string, Record<string, {gamePk: number|null, doubleheader: boolean}>>} [inputs.liveIdentityByDate]
 *   per date, per live leg id: the game the slate proves that leg was on (legs whose receipt stores a gamePk need none)
 * @param {Record<string, {hash, committedAt, publicationFingerprint}>} [inputs.firstCommits]   by date
 * @param {string} inputs.now              the reporting instant (an input, so the report is deterministic)
 */
export function buildShadowReport({ ledger = null, days = [], state = null, settledByDate = {}, liveIdentityByDate = {}, firstCommits = {}, now }) {
  const sorted = [...days].filter((d) => d && d.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const integrity = sorted.map((d) => dayIntegrity(d, firstCommits[d.date]));
  // Inputs are never mutated (the report must be a pure function of them).
  const rows = laneRows(sorted, new Set(integrity.filter((i) => i.retroactive).map((i) => i.date)));
  const guardFailures = integrity.reduce((a, i) => a + i.guardFailures, 0);
  const rewrites = integrity.filter((i) => i.rewrite === "REWRITE").map((i) => i.date);
  const retroactive = integrity.filter((i) => i.retroactive).map((i) => i.date);

  const policies = {};
  for (const [name, r] of Object.entries(rows)) {
    const forward = r.filter((x) => !x.retroactive);
    const placed = r.filter((x) => x.status !== "NO_QUALIFYING_PLAY");
    const sports = {}; for (const x of placed) for (const s of x.sports) sports[s] = (sports[s] ?? 0) + 1;
    const basis = {}; for (const x of placed) basis[x.probabilityBasis ?? "none"] = (basis[x.probabilityBasis ?? "none"] ?? 0) + 1;
    const m = policyMetrics(r), mf = policyMetrics(forward);
    const survivalByRung = Object.fromEntries(Object.entries(m.byStep).map(([s, c]) => [s, { ...c, survival: c.won + c.lost ? +(c.won / (c.won + c.lost)).toFixed(3) : null }]));
    const ledgerM = ledger?.policies?.[name]?.metrics ?? null;
    const ledgerAgrees = ledgerM ? ["placed", "decided", "won", "lost", "push", "pending"].every((k) => ledgerM[k] === m[k]) : null;
    const vsMarket = marketExpectation(r);
    policies[name] = { vsMarket, policyId: sorted.at(-1)?.policies?.[name]?.policyId ?? ledger?.policies?.[name]?.policyId ?? null, metrics: m, forwardOnlyMetrics: mf, survivalByRung, sportComposition: sports, probabilityBasis: basis, ledgerAgrees, position: state?.policies?.[name]?.positions ?? null };
  }
  const gates = {};
  for (const [product, cfg] of Object.entries(SHADOW_POLICIES)) for (const s of cfg.shadow) {
    if (!policies[s] || !policies[cfg.control]) continue;
    const all = adoptionGate({ shadow: policies[s].metrics, control: policies[cfg.control].metrics, guardFailures });
    const fwd = adoptionGate({ shadow: policies[s].forwardOnlyMetrics, control: policies[cfg.control].forwardOnlyMetrics, guardFailures });
    const ledgerGate = ledger?.gates?.[s]?.state ?? null;
    gates[s] = { product, control: cfg.control, allDays: all, forwardOnly: fwd, ledgerState: ledgerGate, publicationVsControl: policies[cfg.control].metrics.placed ? +(policies[s].metrics.placed / policies[cfg.control].metrics.placed).toFixed(3) : null };
  }
  const poolSizes = sorted.map((d) => d.eligibleLegs ?? 0);
  const settlement = settlementComparison(sorted, settledByDate, liveIdentityByDate);
  return {
    schemaVersion: 1, artifact: "selector-shadow-report", dataClass: "internal-research", status: REPORT_STATUS, reportedAt: now,
    ledgerGeneratedAt: ledger?.generatedAt ?? null, days: sorted.length, firstDate: sorted[0]?.date ?? null, lastDate: sorted.at(-1)?.date ?? null,
    candidatePool: { meanEligibleLegs: poolSizes.length ? +(poolSizes.reduce((a, b) => a + b, 0) / poolSizes.length).toFixed(1) : null, minEligibleLegs: poolSizes.length ? Math.min(...poolSizes) : null, maxEligibleLegs: poolSizes.length ? Math.max(...poolSizes) : null },
    integrity: { guardFailures, rewrites, retroactive, unverifiedRewriteChecks: integrity.filter((i) => i.rewrite === "UNVERIFIED").map((i) => i.date), days: integrity },
    settlementDisagreements: settlement.disagreements,
    liveUngraded: settlement.liveUngraded,
    unmatchedLegs: settlement.unmatched,
    policies, gates,
  };
}

export function renderShadowReportMarkdown(r) {
  const L = [];
  L.push(`# v1.7 — Selector shadow report`, ``, `**Status:** \`${r.status}\` — nothing on this page changes what the live products publish.`,
    `**Reported at:** ${r.reportedAt} · **ledger built:** ${r.ledgerGeneratedAt ?? "—"} · **day files:** ${r.days} (${r.firstDate ?? "—"} → ${r.lastDate ?? "—"})`,
    `Generated by \`app/scripts/products/report-selector-shadow.mjs\` from the ledger, the day files, the state file and \`mr-dub/settled/<date>.json\`. Do not hand-edit.`, ``);
  L.push(`## 1. Gate per shadow policy (preregistered: ≥ 20 decided lane-days · survival ≥ control · published on ≥ 50% of the control's placed days · zero guard failures)`, ``,
    `| Policy | Control | Gate (all days) | Gate (forward days only) | Ledger's own gate | Reasons (all days) | Published vs control |`, `|---|---|---|---|---|---|---|`);
  for (const [name, g] of Object.entries(r.gates)) L.push(`| ${name} | ${g.control} | \`${g.allDays.state}\` | \`${g.forwardOnly.state}\` | \`${g.ledgerState ?? "—"}\` | ${g.allDays.reasons.join("; ") || "—"} | ${g.publicationVsControl == null ? "—" : `${(g.publicationVsControl * 100).toFixed(0)}%`} |`);
  L.push(``, `A "forward day" is a day file generated within ${RETROACTIVE_TOLERANCE_MS / 60000} minutes of the as-of instant it claims. A day built later (a seeded day) is counted in the ledger but labelled RETROACTIVE here; the preregistration's forward gate is the forward-only column.`, ``);
  L.push(`## 2. Per policy`, ``, `| Policy | Lane-days | Placed | Decided | W-L-P | Pending | Survival/step (SE) | Publication rate | Completions | Furthest step | Mean joint p | Basis |`, `|---|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const [name, p] of Object.entries(r.policies)) { const m = p.metrics; L.push(`| ${name} | ${m.laneDays} | ${m.placed} | ${m.decided} | ${m.won}-${m.lost}-${m.push} | ${m.pending} | ${num(m.survivalPerStep)} (${num(m.survivalSe)}) | ${pct(m.publicationRate)} | ${m.completions} | ${m.furthestStep} | ${num(m.meanJointP)} | ${Object.entries(p.probabilityBasis).map(([k, v]) => `${k} ${v}`).join(", ") || "—"} |`); }
  L.push(``, `### Survival by rung`, ``, `| Policy | Rung | Won | Lost | Push | Survival |`, `|---|---|---|---|---|---|`);
  let anyRung = false;
  for (const [name, p] of Object.entries(r.policies)) for (const [s, c] of Object.entries(p.survivalByRung)) { anyRung = true; L.push(`| ${name} | ${s} | ${c.won} | ${c.lost} | ${c.push} | ${num(c.survival)} |`); }
  if (!anyRung) L.push(`| — | — | — | — | — | no decided lane-day yet |`);
  L.push(``, `### Actual vs market-expected wins (measurement only — not read by the gate)`, ``,
    `Each card's joint p is the de-vigged market price, so Σ joint p over decided cards is the market's expected wins. Actual − expected (in sd units, z) separates selection from luck; raw survival does not. Policies sit on different rungs, so the per-rung rows are the like-for-like comparison.`, ``,
    `| Policy | Rung | Decided | Won | Market-expected | Actual − expected | sd | z |`, `|---|---|---|---|---|---|---|---|`);
  for (const [name, p] of Object.entries(r.policies)) {
    const v = p.vsMarket; L.push(`| ${name} | all | ${v.n} | ${v.won} | ${v.expectedWins} | ${v.actualMinusExpected} | ${v.sd} | ${num(v.z)} |`);
    for (const [s, x] of Object.entries(v.byRung)) if (x.n) L.push(`| ${name} | ${s} | ${x.n} | ${x.won} | ${x.expectedWins} | ${x.actualMinusExpected} | ${x.sd} | ${num(x.z)} |`);
  }
  L.push(``, `### No-play reasons · sport composition · ladder position`, ``, `| Policy | No-play lane-days | By reason | Sports (placed cards) | Lane A | Lane B | Ledger agrees |`, `|---|---|---|---|---|---|---|`);
  for (const [name, p] of Object.entries(r.policies)) { const m = p.metrics; const pos = (l) => (p.position?.[l] ? `s${p.position[l].step} $${p.position[l].stake}${p.position[l].pending ? " (pending)" : ""}` : "—"); L.push(`| ${name} | ${m.noPlayLaneDays} | ${Object.entries(m.noPlayByReason).map(([k, v]) => `${k} ${v}`).join(", ") || "—"} | ${Object.entries(p.sportComposition).map(([k, v]) => `${k} ${v}`).join(", ") || "—"} | ${pos("A")} | ${pos("B")} | ${p.ledgerAgrees == null ? "no ledger" : p.ledgerAgrees ? "yes" : "**NO**"} |`); }
  L.push(``, `## 3. Candidate pool`, ``, `Eligible legs per day file (after \`guardLegs\`): mean ${num(r.candidatePool.meanEligibleLegs)} · min ${num(r.candidatePool.minEligibleLegs)} · max ${num(r.candidatePool.maxEligibleLegs)}. Every policy in the shadow pools MLB only; the eligible universe is what every policy — control and candidates — ranked over.`, ``);
  L.push(`## 4. Integrity`, ``, `- Guard failures (legs the manifest called eligible that \`guardLegs\` refused at publication): **${r.integrity.guardFailures}**`,
    `- Day files rewritten after their first commit (publication content, grading fields excluded): **${r.integrity.rewrites.length}** ${r.integrity.rewrites.length ? `(${r.integrity.rewrites.join(", ")})` : ""}`,
    `- Day files built after the instant they claim (RETROACTIVE): **${r.integrity.retroactive.length}** ${r.integrity.retroactive.length ? `(${r.integrity.retroactive.join(", ")})` : ""}`,
    `- Rewrite checks that could not run (no first-commit record): ${r.integrity.unverifiedRewriteChecks.length ? r.integrity.unverifiedRewriteChecks.join(", ") : "none"}`,
    `- Settlement disagreements with \`mr-dub/settled/<date>.json\` on the same game, both graded: **${r.settlementDisagreements.length}**`,
    `- Legs the shadow graded that the live receipt still holds \`pending\` (live never graded them; not a disagreement): **${r.liveUngraded.length}**`,
    `- Shadow legs on a doubleheader whose live game could not be proven (not compared): **${r.unmatchedLegs.length}**`, ``,
    `| Date | As of | Generated | First commit | Rewrite | Retroactive | Eligible (manifest → kept) | Guard failures | Universe sha256 | Flags |`, `|---|---|---|---|---|---|---|---|---|---|`);
  for (const d of r.integrity.days) L.push(`| ${d.date} | ${d.asOf} | ${d.generatedAt} | ${d.firstCommitAt ?? "—"} ${d.firstCommitHash ? `(${d.firstCommitHash.slice(0, 9)})` : ""} | ${d.rewrite} | ${d.retroactive ? "yes" : "no"} | ${d.eligibleByManifest} → ${num(d.eligibleLegs)} | ${d.guardFailures} | ${d.universeSha256 ? d.universeSha256.slice(0, 12) : "not recorded"} | ${d.flags.join(", ") || "—"} |`);
  const legRows = [...r.settlementDisagreements.map((x) => ({ ...x, kind: "disagreement" })), ...r.liveUngraded.map((x) => ({ ...x, kind: "live ungraded" })), ...r.unmatchedLegs.map((x) => ({ ...x, live: "—", kind: "unmatched" }))];
  if (legRows.length) { L.push(``, `| Date | Policy | Lane | Leg | gamePk | Shadow | Live | Kind |`, `|---|---|---|---|---|---|---|---|`); for (const x of legRows) L.push(`| ${x.date} | ${x.policy} | ${x.lane} | ${x.leg.replace("|", " — ")} | ${x.gamePk ?? "—"} | ${x.shadow} | ${x.live} | ${x.kind} |`); }
  L.push(``, `## 5. Reading this page`, ``, `- Pending is never a loss; a missing linescore leaves a card pending. A push holds stake and rung. A won card rolls on the settled decimal (a pushed leg pays 1.0).`,
    `- The gate reports a state; it changes nothing. \`ELIGIBLE_FOR_ADOPTION_RECEIPT\` means the founder may write the receipt (docs/V17_FORWARD_SHADOW_RECEIPT.md §3), not that anything was switched.`,
    `- Every probability in the shadow is the de-vigged market price (basis \`market-implied\`); no forecast owner stands behind any card.`, ``);
  return L.join("\n") + "\n";
}
