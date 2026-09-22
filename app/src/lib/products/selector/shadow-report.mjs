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

/** Grade the shadow's legs against the live settlement file for the same date, on legs both graded. */
function settlementDisagreements(days, settledByDate) {
  const out = [];
  for (const day of days) {
    const settled = settledByDate?.[day.date]; if (!settled?.lanes) continue;
    const live = new Map();
    for (const ln of settled.lanes) for (const l of ln.legs ?? []) if (l.matchup && l.selection && l.result) live.set(`${l.matchup}|${l.selection}`, l.result);
    for (const [name, p] of Object.entries(day.policies ?? {})) for (const lane of ["A", "B"]) {
      const x = p.lanes?.[lane]; if (!x || x.status !== "placed" || !x.graded?.legs) continue;
      x.legs.forEach((leg, i) => {
        const key = `${leg.displayMatchup}|${leg.displaySelection}`; const liveResult = live.get(key); const shadowResult = x.graded.legs[i];
        if (liveResult && shadowResult && shadowResult !== "pending" && liveResult !== shadowResult) out.push({ date: day.date, policy: name, lane, leg: key, shadow: shadowResult, live: liveResult });
      });
    }
  }
  return out;
}

/**
 * @param {object} inputs
 * @param {object|null} inputs.ledger      ledger.json as written by the grader (its metrics are cross-checked, never trusted alone)
 * @param {object[]} inputs.days           every <date>.json, any order
 * @param {object|null} inputs.state       state.json
 * @param {Record<string, object>} [inputs.settledByDate]   mr-dub/settled/<date>.json by date
 * @param {Record<string, {hash, committedAt, publicationFingerprint}>} [inputs.firstCommits]   by date
 * @param {string} inputs.now              the reporting instant (an input, so the report is deterministic)
 */
export function buildShadowReport({ ledger = null, days = [], state = null, settledByDate = {}, firstCommits = {}, now }) {
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
    policies[name] = { policyId: sorted.at(-1)?.policies?.[name]?.policyId ?? ledger?.policies?.[name]?.policyId ?? null, metrics: m, forwardOnlyMetrics: mf, survivalByRung, sportComposition: sports, probabilityBasis: basis, ledgerAgrees, position: state?.policies?.[name]?.positions ?? null };
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
  return {
    schemaVersion: 1, artifact: "selector-shadow-report", dataClass: "internal-research", status: REPORT_STATUS, reportedAt: now,
    ledgerGeneratedAt: ledger?.generatedAt ?? null, days: sorted.length, firstDate: sorted[0]?.date ?? null, lastDate: sorted.at(-1)?.date ?? null,
    candidatePool: { meanEligibleLegs: poolSizes.length ? +(poolSizes.reduce((a, b) => a + b, 0) / poolSizes.length).toFixed(1) : null, minEligibleLegs: poolSizes.length ? Math.min(...poolSizes) : null, maxEligibleLegs: poolSizes.length ? Math.max(...poolSizes) : null },
    integrity: { guardFailures, rewrites, retroactive, unverifiedRewriteChecks: integrity.filter((i) => i.rewrite === "UNVERIFIED").map((i) => i.date), days: integrity },
    settlementDisagreements: settlementDisagreements(sorted, settledByDate),
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
  L.push(``, `### No-play reasons · sport composition · ladder position`, ``, `| Policy | No-play lane-days | By reason | Sports (placed cards) | Lane A | Lane B | Ledger agrees |`, `|---|---|---|---|---|---|---|`);
  for (const [name, p] of Object.entries(r.policies)) { const m = p.metrics; const pos = (l) => (p.position?.[l] ? `s${p.position[l].step} $${p.position[l].stake}${p.position[l].pending ? " (pending)" : ""}` : "—"); L.push(`| ${name} | ${m.noPlayLaneDays} | ${Object.entries(m.noPlayByReason).map(([k, v]) => `${k} ${v}`).join(", ") || "—"} | ${Object.entries(p.sportComposition).map(([k, v]) => `${k} ${v}`).join(", ") || "—"} | ${pos("A")} | ${pos("B")} | ${p.ledgerAgrees == null ? "no ledger" : p.ledgerAgrees ? "yes" : "**NO**"} |`); }
  L.push(``, `## 3. Candidate pool`, ``, `Eligible legs per day file (after \`guardLegs\`): mean ${num(r.candidatePool.meanEligibleLegs)} · min ${num(r.candidatePool.minEligibleLegs)} · max ${num(r.candidatePool.maxEligibleLegs)}. Every policy in the shadow pools MLB only; the eligible universe is what every policy — control and candidates — ranked over.`, ``);
  L.push(`## 4. Integrity`, ``, `- Guard failures (legs the manifest called eligible that \`guardLegs\` refused at publication): **${r.integrity.guardFailures}**`,
    `- Day files rewritten after their first commit (publication content, grading fields excluded): **${r.integrity.rewrites.length}** ${r.integrity.rewrites.length ? `(${r.integrity.rewrites.join(", ")})` : ""}`,
    `- Day files built after the instant they claim (RETROACTIVE): **${r.integrity.retroactive.length}** ${r.integrity.retroactive.length ? `(${r.integrity.retroactive.join(", ")})` : ""}`,
    `- Rewrite checks that could not run (no first-commit record): ${r.integrity.unverifiedRewriteChecks.length ? r.integrity.unverifiedRewriteChecks.join(", ") : "none"}`,
    `- Settlement disagreements with \`mr-dub/settled/<date>.json\` on legs both graded: **${r.settlementDisagreements.length}**`, ``,
    `| Date | As of | Generated | First commit | Rewrite | Retroactive | Eligible (manifest → kept) | Guard failures | Universe sha256 | Flags |`, `|---|---|---|---|---|---|---|---|---|---|`);
  for (const d of r.integrity.days) L.push(`| ${d.date} | ${d.asOf} | ${d.generatedAt} | ${d.firstCommitAt ?? "—"} ${d.firstCommitHash ? `(${d.firstCommitHash.slice(0, 9)})` : ""} | ${d.rewrite} | ${d.retroactive ? "yes" : "no"} | ${d.eligibleByManifest} → ${num(d.eligibleLegs)} | ${d.guardFailures} | ${d.universeSha256 ? d.universeSha256.slice(0, 12) : "not recorded"} | ${d.flags.join(", ") || "—"} |`);
  if (r.settlementDisagreements.length) { L.push(``, `| Date | Policy | Lane | Leg | Shadow | Live |`, `|---|---|---|---|---|---|`); for (const x of r.settlementDisagreements) L.push(`| ${x.date} | ${x.policy} | ${x.lane} | ${x.leg} | ${x.shadow} | ${x.live} |`); }
  L.push(``, `## 5. Reading this page`, ``, `- Pending is never a loss; a missing linescore leaves a card pending. A push holds stake and rung. A won card rolls on the settled decimal (a pushed leg pays 1.0).`,
    `- The gate reports a state; it changes nothing. \`ELIGIBLE_FOR_ADOPTION_RECEIPT\` means the founder may write the receipt (docs/V17_FORWARD_SHADOW_RECEIPT.md §3), not that anything was switched.`,
    `- Every probability in the shadow is the de-vigged market price (basis \`market-implied\`); no forecast owner stands behind any card.`, ``);
  return L.join("\n") + "\n";
}
