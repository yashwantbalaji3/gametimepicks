/**
 * D1 · THE DAILY CONTENT QUEUE — approved calendar slots → one post package per proposed post.
 *
 * Approving the calendar authorized no post. This module turns the day's CHOSEN slots of the APPROVED calendar into
 * post packages; each package becomes its own founder decision, and only an approved package can be published — by
 * the founder, by hand (no X publishing integration is authorized), with the X link recorded as the receipt.
 *
 *   package = { postId, kind, sport, status, reasons, captions[] (each validated), media|null, claims (the evidence:
 *               every number a caption may state, with its file@commit), verification (pregame), xSources (replies) }
 *
 *   kind               from                                        status
 *   nfl-recap          one settled NFL game (Forecast Ledger +     READY when the integrity gate passes (else listed as
 *                      receipt), nfl-recap@1 card                  skipped with the gate's reasons)
 *   results-recap      NBA / EPL finals of one date (+ EPL         READY; matches without an admissible forecast are
 *                      Official Forecasts), results-card@1         shown as results only and listed
 *   pregame-forecast   NFL: the latest frozen version, via the     the freeze-time verifier's verdict, re-run at approval
 *                      freeze-time verifier                        and at publication, and confirmed after kickoff
 *   explainer          the public registry's method + Model        READY for sports whose forecast publishes (FULL_MODEL,
 *                      Performance sentence, verbatim              EXPERIMENTAL_PUBLIC); else NEEDS_VERIFICATION
 *   engagement         the day's schedule capture                  READY only when the capture is from the post's date
 *   x-reply            ChatGPT's calendar draft + Grok's cited     NEEDS_VERIFICATION until the founder confirms, when
 *                      X posts                                     approving, that they opened the cited posts
 *
 * Captions are deterministic templates built only from the package's claims, plus ChatGPT's draft from the approved
 * calendar where the slot has one (labelled as ChatGPT's wording, checked by the same rules). A caption that fails
 * its check is kept for the record but cannot be approved. Nothing here reads the clock or the network.
 */
import { digestOf, sha256 } from "../lib/util.mjs";
import { REASON } from "./index.mjs";
import { FORBIDDEN_TERMS } from "../../app/scripts/build-mlb-social-content.mjs";
import { retiredPhraseIn } from "../recap/public-registry.mjs";
import { etDisplay } from "../recap/fact-bundle-nfl.mjs";

export const POST_KINDS = Object.freeze(["nfl-recap", "results-recap", "pregame-forecast", "explainer", "engagement", "x-reply", "top5-daily", "top5-weekly"]);
export const POST_STATUS = Object.freeze({ READY: "READY", VERIFY: "NEEDS_VERIFICATION", BLOCKED: "BLOCKED" });
/** Lifecycle of a post after its package is proposed. */
export const LIFECYCLE = Object.freeze(["drafted", "approved", "scheduled", "published", "rejected", "revise", "deferred", "superseded"]);
export const MAX_CAPTION = 280;
const EXTRA_FORBIDDEN = ["odds", "bet", "bets", "betting", "parlay", "sure thing", "can't lose", "picks", "free money"];

const numbersIn = (s) => String(s ?? "").replace(/\b(49ers|76ers)\b/gi, "").match(/\d+(?:\.\d+)?/g) ?? [];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
export const etTime = (iso) => `${ET_TIME.format(new Date(iso))} ET`;
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
export const dayLabel = (ymd) => DAY.format(new Date(`${ymd}T12:00:00Z`));
const nickname = (name) => String(name).split(" ").at(-1);

/**
 * One checker for every caption that is not an NFL recap (those keep recap/caption-validator.mjs): numbers must be in
 * the package's claims, no forbidden term (outside the disclaimer itself), no link, ≤ 280 characters, no retired phrase,
 * and — when the package carries a missed forecast and the caption talks about forecasts — the miss is stated.
 */
export function checkCaption(text, pkg) {
  const problems = [];
  const allowed = new Set(pkg.claims.flatMap((c) => numbersIn(c.display)));
  for (const n of numbersIn(text)) if (!allowed.has(n)) problems.push({ code: REASON.UNTRACEABLE_NUMBER, detail: `"${n}" is not in this post's evidence` });
  // Founder-approved phrase (V2.3, 2026-10-28): "Our model picks <team> to win" states the published winner; "picks"
  // stays forbidden everywhere else ("our picks", "free picks", "lock").
  const plain = String(text).replace(/\bnot betting advice\b/gi, "").replace(/\bour model picks\b(?=[^\n]{1,40}\bto win\b)/gi, "");
  for (const t of [...FORBIDDEN_TERMS, ...EXTRA_FORBIDDEN]) if (new RegExp(`\\b${escapeRe(t)}\\b`, "i").test(plain)) problems.push({ code: REASON.FORBIDDEN_TERM, detail: `"${t}"` });
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co)\b/i.test(text)) problems.push({ code: REASON.URL_IN_CAPTION, detail: "no links in post text" });
  if (xLength(text) > MAX_CAPTION) problems.push({ code: REASON.TOO_LONG, detail: `${xLength(text)} > ${MAX_CAPTION} (X-weighted length)` });
  const retired = retiredPhraseIn(text, pkg.label?.retiredPhrases ?? []);
  if (retired) problems.push({ code: REASON.RETIRED_PHRASE, detail: `"${retired}" was retired from public surfaces` });
  // The public terms are Prediction / Projection (founder 2026-10-28); the factual rule is unchanged: talk about the
  // prediction and a miss must be said.
  if (pkg.hasMiss && /\b(forecast|prediction|predicted)/i.test(text) && !/\bmiss(ed)?\b/i.test(text)) problems.push({ code: REASON.MISS_NOT_DISCLOSED, detail: "a prediction here missed; say so" });
  // A post with no forecast in its evidence may mention forecasting, but may not assert a forecast value.
  if (pkg.noForecastClaims && /\b(forecast|prediction|predicted)/i.test(text) && /%|\bfavou?rite\b|\bto win\b/i.test(text)) problems.push({ code: "FORECAST_NOT_IN_EVIDENCE", detail: "this post has no forecast in its evidence: it can't state a forecast value" });
  return { ok: problems.length === 0, problems };
}

/** What the founder approves for one caption: everything that would go out, bound by digest. */
export function publishBundleOf(pkg, caption) {
  return {
    schema: "gtp.cc.post-bundle@1",
    postId: pkg.postId, kind: pkg.kind, channel: "x", captionId: caption.id,
    captionSha256: sha256(caption.text),
    mediaSha256: pkg.media?.sha256 ?? null,
    // a multi-image post binds every image, in order
    ...(pkg.mediaSet ? { mediaSetSha256: sha256(pkg.mediaSet.map((m) => m.sha256).join("|")) } : {}),
    // V2.3 game post: the event, the forecast version (freeze + receipt hash) and the requested publishing time are bound
    ...(pkg.kind === "nba-game" ? { eventId: pkg.eventId, forecastVersion: pkg.forecastVersion ?? null, requestedPublishAt: pkg.suggestedPublishAt ?? null, featuredKey: pkg.featuredKey ?? null } : {}),
    // Top 5: the stable package identity, exactly what appears (content key), the first start and the requested time
    // Imported (Launch Readiness): the package's identity and exactly what it shows; the publishing time is the founder's
    ...(String(pkg.kind).startsWith("lr-") ? { packageId: pkg.postId, dedupeId: pkg.imported?.dedupeId ?? null, contentKey: pkg.contentKey ?? null, firstStartUtc: pkg.firstStartUtc ?? null } : {}),
    ...(pkg.kind === "top5-daily" || pkg.kind === "top5-weekly" ? { packageId: pkg.postId, contentKey: pkg.contentKey ?? null, firstStartUtc: pkg.firstStartUtc ?? null, requestedPublishAt: pkg.suggestedPublishAt ?? null } : {}),
    claimsDigest: digestOf(pkg.claims),
    // The verified VERSION (file, hash, numbers) — never the check's timestamp, which changes on every build.
    verificationDigest: pkg.verification ? digestOf({ version: pkg.verification.version ? { path: pkg.verification.version.path, sha256: pkg.verification.version.sha256, numbers: pkg.verification.version.numbers } : null, kickoffUtc: pkg.verification.kickoffUtc ?? null }) : null,
    dataCommit: pkg.dataCommit,
    // V2.1: the approved design is part of what is approved — a new template or asset manifest is a new fingerprint.
    ...(pkg.template ? { template: pkg.template, assetManifest: pkg.assetManifest } : {}),
  };
}

/** Seal a package: check every caption and bind each to its publish bundle. */
export function sealPackage(pkg, { check = checkCaption } = {}) {
  const captions = pkg.captions.map((c) => {
    const result = c.check ?? check(c.text, pkg);
    const sealed = { ...c, chars: xLength(c.text), check: result };
    const bundle = publishBundleOf(pkg, sealed);
    return { ...sealed, publishBundle: bundle, digest: digestOf(bundle) };
  });
  const approvable = captions.filter((c) => c.check.ok);
  let { status, reasons } = pkg;
  if (!approvable.length && status !== POST_STATUS.BLOCKED) { status = POST_STATUS.BLOCKED; reasons = [...reasons, "no caption passes its check"]; }
  return { ...pkg, status, reasons, captions };
}

/** ChatGPT's draft from the approved calendar, as an extra caption labelled with whose wording it is. */
export function calendarDraftCaption(slot) {
  if (!slot.draft) return [];
  return [{ id: "C", tone: "ChatGPT draft (approved calendar)", source: "chatgpt-calendar-draft", text: slot.draft }];
}

// ── builders (pure: inputs are already-read data) ──────────────────────────────────────────────────────────────

/** NFL per-game recap from a built recap draft (recap/pipeline.mjs buildRecapDraft). */
export function nflRecapPackage({ date, slot, draft, dataCommit, label }) {
  const b = draft.bundle;
  return {
    postId: `${date}:NFL:recap:${b.eventId}`, slotId: slot.id, date, sport: "NFL", kind: "nfl-recap",
    title: `${draft.headline}`,
    status: POST_STATUS.READY, reasons: draft.verdict.warnings.map((w) => `${w.code}: ${w.detail}`),
    claims: b.claims.map((c) => ({ key: c.key, display: c.display, evidenceRef: c.evidenceRef })),
    media: draft.media ? { ...draft.media, kind: "graphic" } : null,
    captions: draft.captionSet.variants.map((v) => ({ id: v.id, tone: v.tone, source: "template", text: v.text, check: draft.captionChecks.find((c) => c.id === v.id) })),
    label, dataCommit, hasMiss: b.claims.find((c) => c.key === "result.side")?.value === "LOSS",
    evidence: [{ label: "Forecast Ledger", ref: `${b.sources.ledger.path}@${b.sources.ledger.sha256.slice(0, 12)}` }, { label: "receipt", ref: `${b.sources.receipt.path}@${b.sources.receipt.sha256.slice(0, 12)}` }],
  };
}

/** NBA / EPL results recap from a results bundle (recap/results-bundle.mjs). */
export function resultsPackage({ date, slot, bundle, captions, media, dataCommit, label, notes = [] }) {
  return {
    postId: `${date}:${bundle.sport}:results:${bundle.date}:${bundle.part}`, slotId: slot.id, date, sport: bundle.sport, kind: "results-recap",
    title: `${bundle.sport} ${bundle.tally ? `${label.term} vs final` : "final scores"}, ${bundle.dateLabel}${bundle.parts > 1 ? ` (${bundle.part}/${bundle.parts})` : ""}`,
    status: POST_STATUS.READY, reasons: notes,
    claims: bundle.claims, media, captions: captions.map((c) => ({ ...c, source: "template" })),
    label, dataCommit, hasMiss: Boolean(bundle.tally?.misses), noForecastClaims: !bundle.tally,
    evidence: bundle.sources.map((s) => ({ label: s.path, ref: `${s.commit ? s.commit.slice(0, 12) : "working tree"} · sha256 ${s.sha256.slice(0, 12)}` })),
  };
}

/** The explainer: the public registry's own sentences, verbatim. */
export function explainerPackage({ date, slot, label, sportName, dataCommit }) {
  const forecastPublishes = ["FULL_MODEL", "EXPERIMENTAL_PUBLIC"].includes(label.capability);
  const reasons = [];
  let status = POST_STATUS.READY;
  if (!forecastPublishes) {
    status = POST_STATUS.VERIFY;
    reasons.push(`capability is ${label.capability} while the public registry describes a ${sportName} ${label.term}: the founder decides the wording before an explainer goes out (CP3)`);
  }
  if (!label.method || !label.modelPerformanceNote) { status = POST_STATUS.BLOCKED; reasons.push("the public registry has no method or Model Performance sentence for this sport"); }
  const ref = { path: label.source.path, commit: label.source.commit };
  const claims = [
    { key: "method", display: label.method ?? "", evidenceRef: ref },
    { key: "modelPerformance", display: label.modelPerformanceNote ?? "", evidenceRef: ref },
    { key: "capability", display: label.capability, evidenceRef: { path: label.source.capabilityPath, commit: label.source.commit } },
  ];
  // The registry's method verbatim, or — when that won't fit one post — its first clause, verbatim, and no variant at all
  // if even that is too long (never a paraphrase).
  const head = `How our ${sportName} ${label.term} works: `;
  const firstClause = String(label.method ?? "").split(/(?<=[.;])\s/)[0].replace(/;$/, ".");
  const methodText = [`${head}${label.method}`, `${head}${firstClause}`].find((t) => t.length <= MAX_CAPTION);
  const captions = [
    ...(methodText ? [{ id: "A", tone: "how it works", text: methodText }] : []),
    { id: "B", tone: "track record", text: `Every ${sportName} ${label.term} is frozen before the start and graded in public. Model Performance so far: ${label.modelPerformanceNote} Not betting advice.` },
    ...calendarDraftCaption(slot),
  ];
  return {
    postId: `${date}:${slot.sport}:explainer`, slotId: slot.id, date, sport: slot.sport, kind: "explainer",
    title: `How GameTimePicks ${sportName} forecasts work`, status, reasons, claims, media: null, captions, label, dataCommit,
    evidence: [{ label: label.source.path, ref: label.source.commit ? label.source.commit.slice(0, 12) : "working tree" }],
  };
}

/** Schedule-led engagement post for one sport-day. */
export function engagementPackage({ date, slot, events, capture, dataCommit, label, sportName }) {
  const reasons = [];
  let status = POST_STATUS.READY;
  if (!events.length) { status = POST_STATUS.BLOCKED; reasons.push(`no ${sportName} events on ${date} at the data commit`); }
  const captureDay = capture?.generatedAt ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(capture.generatedAt)) : null;
  if (status === POST_STATUS.READY && captureDay !== date) {
    status = POST_STATUS.VERIFY;
    reasons.push(`the schedule capture is from ${captureDay ?? "an unknown time"}, not ${date} (sport-schedules runs at 05:07 ET): fetch fresh data, or confirm the games are still on`);
  }
  const sorted = [...events].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  const first = sorted[0];
  const claims = [
    { key: "count", display: String(events.length), evidenceRef: capture?.ref ?? null },
    { key: "date", display: dayLabel(date), evidenceRef: capture?.ref ?? null },
    ...sorted.map((e) => ({ key: e.id, display: `${e.matchup} ${etTime(e.startUtc)}`, evidenceRef: e.scheduleRef })),
  ];
  const plural = events.length === 1 ? "" : "s";
  const what = slot.sport === "UFC" ? "card" : "game";
  const captions = first ? [
    { id: "A", tone: "schedule", text: `${sportName} on ${dayLabel(date)}: ${events.length} ${what}${plural}. First up: ${first.matchup} at ${etTime(first.startUtc)}. Which one are you watching?` },
    { id: "B", tone: "question", text: `${events.length} ${sportName} ${what}${plural} today. Which matchup has the best storyline? Tell us below.` },
    ...calendarDraftCaption(slot),
  ] : [];
  return {
    postId: `${date}:${slot.sport}:engagement`, slotId: slot.id, date, sport: slot.sport, kind: "engagement",
    title: `${sportName} today: ${events.length} ${what}${plural}`, status, reasons, claims, media: null, captions, label, dataCommit, noForecastClaims: true,
    evidence: capture ? [{ label: capture.path, ref: `${capture.generatedAt ?? "?"} · sha256 ${capture.sha256?.slice(0, 12) ?? "?"}` }] : [],
  };
}

/** NFL pregame forecast for one game, from the freeze-time verifier's latest frozen version. */
export function pregamePackage({ date, slot, event, verification, versionReceipt, dataCommit, label }) {
  const v = verification;
  const r = versionReceipt;
  const claims = [];
  const captions = [];
  if (r && v.version && v.version.numbers.side) {
    const n = v.version.numbers;
    const side = r[n.side];
    const ref = { path: v.version.path, sha256: v.version.sha256, commit: dataCommit };
    claims.push(
      { key: "kickoff", display: etDisplay(r.kickoffUtc), evidenceRef: ref },
      { key: "frozenAt", display: etDisplay(v.version.frozenAt), evidenceRef: ref },
      { key: "side.winProbability", display: n.sideProbabilityDisplay, value: n.sideProbability, evidenceRef: ref },
      { key: "projected.home", display: `${r.home.abbr} ${n.projected.home}`, value: n.projected.home, evidenceRef: ref },
      { key: "projected.away", display: `${r.away.abbr} ${n.projected.away}`, value: n.projected.away, evidenceRef: ref },
    );
    captions.push(
      { id: "A", tone: "factual", text: `${nickname(r.away.name)} at ${nickname(r.home.name)}, ${etDisplay(r.kickoffUtc)}. Our ${label.term} (frozen ${etDisplay(v.version.frozenAt)}): ${side.name} ${n.sideProbabilityDisplay} to win, projected ${r.away.abbr} ${n.projected.away}, ${r.home.abbr} ${n.projected.home}. Not betting advice.` },
      { id: "B", tone: "short", text: `Before kickoff: our ${label.term} makes the ${nickname(side.name)} a ${n.sideProbabilityDisplay} favourite against the ${nickname((n.side === "home" ? r.away : r.home).name)}. Frozen ${etDisplay(v.version.frozenAt)} and graded in public after the final.` },
    );
  }
  return {
    postId: `${date}:NFL:pregame:${event.providerEventId}`, slotId: slot.id, date, sport: "NFL", kind: "pregame-forecast",
    title: `${event.matchup}: our ${label.term} before kickoff`, eventId: String(event.providerEventId),
    status: v.status, reasons: v.reasons, claims, media: null, captions, label, dataCommit,
    verification: v, numbers: v.version?.numbers ?? null,
    evidence: v.version ? [{ label: "latest frozen version", ref: `${v.version.path} · sha256 ${v.version.sha256.slice(0, 12)}` }, ...(v.site ? [{ label: "site file", ref: `${v.site.path} · sha256 ${v.site.sha256.slice(0, 12)}` }] : [])] : [],
  };
}

/** A reply to a conversation Grok found: ChatGPT's draft, with the posts the founder must open first. */
export function xReplyPackage({ date, slot, dataCommit, label }) {
  const xSources = (slot.sourceRefs ?? []).filter((u) => /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d+/.test(u));
  return {
    postId: `${date}:${slot.sport}:x-reply:${slot.key}`, slotId: slot.id, date, sport: slot.sport, kind: "x-reply",
    title: slot.opportunity, status: xSources.length ? POST_STATUS.VERIFY : POST_STATUS.BLOCKED,
    reasons: xSources.length
      ? ["the Command Center does not fetch X: open the cited posts and confirm them when you approve (recorded with your decision)"]
      : ["no specific X post is cited, so there is nothing to open and confirm"],
    claims: (slot.facts ?? []).map((f, i) => ({ key: `finding.${i}`, display: f, evidenceRef: "Grok research (reused from the approved calendar)" })),
    media: null, captions: calendarDraftCaption(slot), label, dataCommit, noForecastClaims: true,
    xSources,
    evidence: [],
  };
}

/** A chosen slot the queue can't turn into a post today, with the reason (shown, never silently dropped). */
export const skipped = (slot, reason, status = POST_STATUS.BLOCKED) => ({ slotId: slot.id, sport: slot.sport, format: slot.format, opportunity: slot.opportunity, status, reason });

// ── the receipt the founder records after posting by hand ──────────────────────────────────────────────────────

const X_POST = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/;
/** Normalise and check an X post link. @returns {{ ok: true, url, handle, statusId } | { ok: false, detail }} */
export function parseXPostUrl(url, { expectedHandle = null } = {}) {
  const m = String(url ?? "").trim().match(X_POST);
  if (!m) return { ok: false, detail: "paste the link of the post itself: https://x.com/<handle>/status/<id>" };
  const [, handle, statusId] = m;
  if (expectedHandle && handle.toLowerCase() !== String(expectedHandle).replace(/^@/, "").toLowerCase()) {
    return { ok: false, detail: `the link is from @${handle}, not the GameTimePicks account @${String(expectedHandle).replace(/^@/, "")}` };
  }
  return { ok: true, url: `https://x.com/${handle}/status/${statusId}`, handle, statusId };
}

/** Engagement numbers the founder copies from X analytics: non-negative integers, nothing else. */
export const METRICS = Object.freeze(["impressions", "likes", "reposts", "replies", "bookmarks"]);
export function parseMetrics(m) {
  const out = {};
  for (const k of METRICS) {
    if (m?.[k] === undefined || m[k] === "" || m[k] === null) continue;
    const n = Number(m[k]);
    if (!Number.isInteger(n) || n < 0 || n > 1e10) return { ok: false, detail: `${k} must be a whole number ≥ 0` };
    out[k] = n;
  }
  if (!Object.keys(out).length) return { ok: false, detail: `enter at least one of ${METRICS.join(", ")}` };
  return { ok: true, metrics: out };
}

/** Readable export of one day's queue. */
export function queueMarkdown(q, { commandId }) {
  const L = [`# Content queue · ${dayLabel(q.date)} (${q.date})`, ""];
  L.push(`Command \`${commandId}\` · approved calendar \`${q.calendar.decisionId}\` (sha256 ${q.calendar.digest.slice(0, 16)}…) · data ${q.dataLabel}${q.dataCommittedAt ? `, committed ${q.dataCommittedAt}` : ""}`, "");
  L.push("> Approving the calendar authorized no post. Each post below needs its own approval; the founder posts it by hand and records the X link.", "");
  for (const p of q.packages) {
    L.push(`## ${p.status} · ${p.sport} · ${p.title}`, "", `\`${p.postId}\` · ${p.kind}${p.media ? ` · graphic ${p.media.file} (${p.media.width}×${p.media.height}, sha256 ${p.media.sha256.slice(0, 12)}…)` : ""}`, "");
    if (p.reasons.length) L.push(...p.reasons.map((r) => `- ${r}`), "");
    for (const c of p.captions) L.push(`**${c.id} · ${c.tone}** (${c.chars} chars, ${c.check.ok ? "check ✓" : `check ✗ ${c.check.problems.map((x) => x.code).join(", ")}`})`, "", `> ${c.text}`, "");
    if (p.xSources?.length) L.push(`Cited posts to open first: ${p.xSources.join(" · ")}`, "");
  }
  if (q.skipped.length) {
    L.push("## Not in today's queue", "", "| Sport | Slot | Status | Why |", "|---|---|---|---|");
    for (const s of q.skipped) L.push(`| ${s.sport} | ${s.opportunity.replace(/\|/g, "/")} | ${s.status} | ${s.reason.replace(/\|/g, "/")} |`);
  }
  return L.join("\n");
}

/**
 * The queue's inventory, computed from the posts themselves — never typed by hand. Counts the OPEN posts (drafted, not
 * superseded or decided) and throws if any open post is uncounted, so a report can't add up wrong (founder 2026-10-28:
 * "61 graphics" vs "46 + 14").
 */
export function queueInventory(posts) {
  const open = posts.filter((p) => p.lifecycle === "drafted");
  const byStatus = { READY: 0, NEEDS_VERIFICATION: 0, BLOCKED: 0 };
  const byKind = {};
  for (const p of open) {
    if (!(p.package.status in byStatus)) throw new Error(`queue inventory does not add up: unknown status ${p.package.status} on ${p.postId}`);
    byStatus[p.package.status] += 1;
    const k = `${p.package.sport} ${p.package.format ?? p.package.kind}`;
    byKind[k] = (byKind[k] ?? 0) + 1;
  }
  const inv = {
    open: open.length, graphics: open.filter((p) => p.package.media).length, textOnly: open.filter((p) => !p.package.media).length,
    v21: open.filter((p) => p.package.template).length, byStatus, byKind,
  };
  const sum = Object.values(byStatus).reduce((a, b) => a + b, 0);
  if (sum !== inv.open || inv.graphics + inv.textOnly !== inv.open) throw new Error(`queue inventory does not add up: ${JSON.stringify(inv)}`);
  return inv;
}

/**
 * X's weighted length (twitter-text v3 rules): an emoji sequence counts 2, characters in the light ranges count 1,
 * anything else counts 2; line breaks count 1. The 280 limit is checked on this, not on string.length.
 */
const LIGHT = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
export function xLength(text) {
  let n = 0;
  for (const { segment } of new Intl.Segmenter("en", { granularity: "grapheme" }).segment(String(text))) {
    if (/\p{Extended_Pictographic}/u.test(segment)) { n += 2; continue; }
    for (const ch of segment) {
      const cp = ch.codePointAt(0);
      if (cp === 0xfe0f || cp === 0x200d) continue;
      n += LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
    }
  }
  return n;
}
