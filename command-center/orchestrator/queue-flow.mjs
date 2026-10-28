/**
 * D1 · DAILY CONTENT QUEUE WORKFLOW — "Team, prepare today's content queue."
 *
 *   queueBuild (deterministic)  read the APPROVED calendar from the ledger and re-check its approval digest → re-confirm
 *                               posts already published (freeze-time verifier, after kickoff) → build one package per
 *                               post from the day's chosen slots at the pinned data commit → render graphics
 *   queueConsolidate (CoS)      one founder decision per package; a Markdown export of the whole queue
 *
 * Founder actions on a post (all ledgered, all founder-only):
 *   decidePost      approve ONE caption (bound to its publish bundle's digest) · reject · revise (with a note) · defer.
 *                   Approval needs a READY package; an X reply instead needs the founder's confirmation that they opened
 *                   the cited posts; a pregame forecast is re-verified against the current data first.
 *   recordPost      after the founder posts by hand: "schedule" (they scheduled it in X), "publish" (the X link — the
 *                   receipt; checked for format, account handle and reuse, never fetched) and "engagement" (numbers
 *                   copied from X analytics, labelled founder-entered).
 * Nothing here posts anywhere. Calendar approval is never post approval.
 */
import fs from "node:fs";
import path from "node:path";
import { digestOf, sha256, shortId } from "../lib/util.mjs";
import { REASON } from "../contracts/index.mjs";
import {
  POST_STATUS, sealPackage, nflRecapPackage, resultsPackage, explainerPackage, engagementPackage, pregamePackage, xReplyPackage,
  skipped, parseXPostUrl, parseMetrics, queueMarkdown, publishBundleOf,
} from "../contracts/post-queue.mjs";
import { inspectSlate, buildRecapDraft } from "../recap/pipeline.mjs";
import { resultsBundles, resultsCaptions, validateResultsCaption } from "../recap/results-bundle.mjs";
import { renderResultsPng } from "../render/results-card.mjs";
import { publicLabelOf, readPublicRegistry } from "../recap/public-registry.mjs";
import { readCapabilities, multiSportFacts, etDate } from "../recap/multisport-facts.mjs";
import { verifyPregame, confirmAfterStart, nflVersions, DEFAULT_MAX_DATA_AGE_MIN } from "../recap/freeze-verifier.mjs";

const SPORT_NAME = { NFL: "NFL", NBA: "NBA", MLB: "MLB", UFC: "UFC", EPL: "Premier League" };
const addDay = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const POST_VERDICTS = Object.freeze(["approve", "reject", "revise", "defer"]);

/** The day the founder asked for: an explicit YYYY-MM-DD, "tomorrow", else today (US Eastern). */
export function queueDateOf(text, now) {
  const today = etDate(now);
  const explicit = String(text).match(/\b(20\d\d-\d\d-\d\d)\b/);
  if (explicit) return explicit[1];
  if (/\btomorrow\b/i.test(text)) return addDay(today, 1);
  return today;
}

/**
 * @param {object} ctx  { store, clock, env, outDir, render, dataSource(), helpers: { entries, contribute, report, isPaused } }
 */
export function createQueueFlow(ctx) {
  const { store, clock, env, helpers: h } = ctx;
  const mediaDir = () => path.join(ctx.outDir, "media");

  /** The latest approved calendar, with its approval digest re-computed from the stored request. */
  function approvedCalendar() {
    const all = h.entries();
    const approvals = all.filter((e) => e.kind === "decision" && e.data.verdict === "approve" && e.data.approvedExactDigest).map((e) => e.data);
    for (const d of approvals.reverse()) {
      const req = all.find((e) => e.kind === "decision-request" && e.data.decisionId === d.decisionId)?.data;
      if (req?.subjectType !== "content-calendar") continue;
      const recomputed = digestOf({ subjectType: req.subjectType, subject: req.subject });
      if (recomputed !== d.approvedExactDigest) return { ok: false, code: "CALENDAR_DIGEST_MISMATCH", detail: `approval ${d.decisionId} binds ${d.approvedExactDigest.slice(0, 12)}…, the stored calendar is ${recomputed.slice(0, 12)}…` };
      return { ok: true, decisionId: d.decisionId, commandId: req.commandId, digest: d.approvedExactDigest, approvedAt: d.approvedAt, calendar: req.subject.calendar };
    }
    return { ok: false, code: "NO_APPROVED_CALENDAR", detail: "approve a seven-day content calendar first; the queue only draws from an approved one" };
  }

  /** Every proposed post so far, with what happened to it (for de-duplication and the read model). */
  function postRecords() {
    const all = h.entries();
    // `order` is the ledger position: commit order, never a timestamp (two queues can share one).
    const reqs = all.map((e, order) => ({ e, order })).filter(({ e }) => e.kind === "decision-request" && e.data.kind === "post").map(({ e, order }) => ({ ...e.data, at: e.at, order }));
    return reqs.map((r) => ({
      request: r,
      decision: all.find((e) => e.kind === "decision" && e.data.decisionId === r.decisionId)?.data ?? null,
      receipt: all.find((e) => e.kind === "publish-receipt" && e.data.decisionId === r.decisionId)?.data ?? null,
    }));
  }

  // ── step 1: build ───────────────────────────────────────────────────────────────────────────────────────────
  async function build(run, task) {
    const cal = approvedCalendar();
    if (!cal.ok) return h.refuseTask(run, task, cal.code, cal.detail);
    const now = clock();
    const date = queueDateOf(run.text, now);
    const { window } = cal.calendar;
    if (date < window.from || date > window.to) return h.refuseTask(run, task, "OUTSIDE_CALENDAR", `${date} is outside the approved calendar (${window.from} → ${window.to})`);

    const src = ctx.dataSource();
    const dataCommit = src.commit ?? null;
    const registry = readPublicRegistry(src);
    const caps = readCapabilities(src);
    const labelOf = (sport) => publicLabelOf(sport, src, registry, caps);
    const maxDataAgeMin = Number(env.GTP_CC_MAX_DATA_AGE_MIN) > 0 ? Number(env.GTP_CC_MAX_DATA_AGE_MIN) : DEFAULT_MAX_DATA_AGE_MIN;

    const confirmations = reconfirmPublished(src, now);
    const decided = new Map();
    for (const p of postRecords()) {
      if (p.decision && !["revise", "defer"].includes(p.decision.verdict)) decided.set(p.request.postId, p);
    }

    // A slot belongs to its own date — except a game-day "recap" slot, whose window is the next morning: it is built in
    // the next day's queue, from the finals of its own date.
    const isNextMorningRecap = (s) => s.format === "postgame-recap" && s.key === "recap";
    const slots = cal.calendar.slots.filter((s) => s.chosen && (isNextMorningRecap(s) ? addDay(s.date, 1) === date : s.date === date));
    const packages = [];
    const skips = [];
    const lookback = [];
    for (let d = window.lookbackFrom; d < window.from; d = addDay(d, 1)) lookback.push(d);
    let facts = null;
    const factsFor = () => (facts ??= multiSportFacts({ src, from: date, days: 1, lookbackDays: 0 }));

    // One failure never takes other posts with it: each game / card / event is built in its own try.
    const each = async (slot, what, fn) => {
      try { await fn(); } catch (err) { skips.push(skipped(slot, `${what}: could not build — ${String(err.message ?? err).slice(0, 200)}`)); }
    };
    for (const slot of slots) {
      const label = labelOf(slot.sport);
      try {
        if (slot.format === "postgame-recap") {
          const dates = slot.key === "catchup" ? lookback : [slot.date];
          if (slot.sport === "NFL") {
            for (const d of dates) {
              const slate = inspectSlate({ repoRoot: ctx.repoRoot, date: d, src });
              for (const g of slate.games) {
                if (!g.verdict.pass) { skips.push(skipped(slot, `${g.matchup} (${d}): ${g.verdict.refusals.map((r) => `${r.code} ${r.detail}`).join("; ")}`)); continue; }
                await each(slot, `${g.matchup} (${d})`, async () => {
                  const draft = await buildRecapDraft(g.candidate, { outDir: mediaDir(), render: ctx.render !== false, label });
                  packages.push(nflRecapPackage({ date, slot, draft, dataCommit, label }));
                });
              }
              if (!slate.games.length) skips.push(skipped(slot, `no NFL game with a Forecast Ledger row on ${d} at the data commit`, POST_STATUS.VERIFY));
            }
          } else if (slot.sport === "NBA" || slot.sport === "EPL") {
            for (const d of dates) {
              const { bundles, refusals } = resultsBundles({ src, sport: slot.sport, date: d, label });
              // Nothing to recap is said out loud, with whatever the reader refused (a missing file has no event id).
              if (!bundles.length) skips.push(skipped(slot, `no ${slot.sport} finals for ${d} at the data commit${refusals.length ? ` — ${refusals.map((r) => `${r.code} ${r.detail}`).join("; ")}` : ""}`, POST_STATUS.VERIFY));
              for (const r of refusals.filter((x) => !x.eventId)) skips.push(skipped(slot, `${d}: ${r.code} ${r.detail}`));
              for (const b of bundles) await each(slot, `${slot.sport} ${d} card ${b.part}`, async () => {
                const media = ctx.render !== false ? await renderResultsPng(b, { outFile: path.join(mediaDir(), `results-${b.sport.toLowerCase()}-${b.date}-${b.part}.png`) }) : null;
                const captions = resultsCaptions(b).map((c) => ({ ...c, check: validateResultsCaption(c.text, b) }));
                const notes = refusals.filter((r) => b.games.some((g) => g.id === r.eventId)).map((r) => `${r.code}: ${r.detail}`);
                packages.push(resultsPackage({ date, slot, bundle: b, captions, media: media && { ...media, kind: "graphic" }, dataCommit, label, notes }));
              });
            }
          } else {
            skips.push(skipped(slot, `no ${slot.sport} results pathway in D1 (NFL, NBA and EPL have one; MLB's season is ending — optional)`));
          }
        } else if (slot.format === "educational") {
          packages.push(explainerPackage({ date, slot, label, sportName: SPORT_NAME[slot.sport], dataCommit }));
        } else if (slot.format === "engagement") {
          const sp = factsFor().sports[slot.sport];
          const events = sp.events.filter((e) => e.date === date);
          const schedPath = events[0]?.scheduleRef?.split("#")[0] ?? null;
          const file = schedPath ? factsFor().files.find((f) => f.path === schedPath) : null;
          const capture = file ? { path: file.path, sha256: file.sha256, generatedAt: file.generatedAt, ref: `${file.path}@${dataCommit?.slice(0, 12) ?? "working tree"}` } : null;
          packages.push(engagementPackage({ date, slot, events, capture, dataCommit, label, sportName: SPORT_NAME[slot.sport] }));
        } else if (slot.format === "pregame-forecast") {
          if (slot.sport !== "NFL") { skips.push(skipped(slot, `no freeze-time source for ${slot.sport} in D1: its frozen version is only visible in the Forecast Ledger after kickoff`, POST_STATUS.VERIFY)); continue; }
          const events = factsFor().sports.NFL.events.filter((e) => e.date === date);
          if (!events.length) { skips.push(skipped(slot, `no NFL game on ${date} at the data commit`)); continue; }
          for (const e of events) await each(slot, e.matchup, async () => {
            const eventId = e.id.split(":")[1];
            const verification = verifyPregame({ src, eventId, now, dataCommitAt: src.committedAt ?? null, maxDataAgeMin });
            const version = verification.version ? nflVersions(src, eventId).find((v) => v.path === verification.version.path) : null;
            packages.push(pregamePackage({ date, slot, event: { providerEventId: eventId, matchup: e.matchup }, verification, versionReceipt: version?.receipt ?? null, dataCommit, label }));
          });
        } else if (slot.format === "x-conversation") {
          packages.push(xReplyPackage({ date, slot, dataCommit, label }));
        } else {
          skips.push(skipped(slot, slot.reasons?.[0] ?? `${slot.format} is not produced by the queue`));
        }
      } catch (err) {
        skips.push(skipped(slot, `could not build: ${String(err.message ?? err).slice(0, 200)}`));
      }
    }

    const sealed = [];
    const seen = new Set();
    for (const p of packages) {
      if (seen.has(p.postId)) continue; // a catch-up slot and a next-morning recap slot can name the same card
      seen.add(p.postId);
      const s = sealPackage(p);
      const prior = decided.get(s.postId);
      if (prior) { skips.push({ slotId: s.slotId, sport: s.sport, format: s.kind, opportunity: s.title, status: s.status, reason: `already decided: ${prior.decision.verdict} in ${prior.request.decisionId}${prior.receipt ? `, published ${prior.receipt.canonicalUrl}` : ""}` }); continue; }
      sealed.push(s);
    }
    const queue = {
      date, calendar: { decisionId: cal.decisionId, commandId: cal.commandId, digest: cal.digest },
      dataLabel: src.label, dataCommit, dataCommittedAt: src.committedAt ?? null, packages: sealed, skipped: skips, confirmations,
    };
    const count = (st) => sealed.filter((p) => p.status === st).length;
    h.contribute(run, task, {
      seat: "deterministic", provider: "deterministic", model: null, artifactType: "post-queue",
      artifact: queue,
      summary: `${sealed.length} post(s) for ${date} from approved calendar ${cal.decisionId}: ${count("READY")} ready, ${count("NEEDS_VERIFICATION")} need verification, ${count("BLOCKED")} blocked · ${skips.length} slot item(s) not queued · ${sealed.filter((p) => p.media).length} graphic(s) · data ${src.label}${confirmations.length ? ` · ${confirmations.length} published pregame post(s) re-checked` : ""}.`,
      evidence: [{ label: "approved calendar", ref: `${cal.decisionId} sha256 ${cal.digest.slice(0, 16)}` }, { label: "data commit", ref: dataCommit ?? src.label }],
      proposedNextSteps: [], simulated: false,
    });
  }

  /** After kickoff, every published pregame post is checked against the forecast of record, once per data commit. */
  function reconfirmPublished(src, now) {
    const all = h.entries();
    const out = [];
    for (const p of postRecords()) {
      const pkg = p.request.package;
      if (pkg.kind !== "pregame-forecast" || !p.receipt || !pkg.numbers) continue;
      const done = all.filter((e) => e.kind === "post-verification" && e.data.decisionId === p.request.decisionId).map((e) => e.data);
      // Once per data commit; a source with no commit (a working tree) is re-checked every build and recorded only when
      // its verdict changes.
      if (src.commit && done.some((d) => d.status !== "PENDING" && d.dataCommit === src.commit)) continue;
      const r = confirmAfterStart({ src, eventId: pkg.eventId, now, numbers: pkg.numbers });
      if (r.status === "PENDING") continue;
      if (!src.commit && done.at(-1)?.status === r.status) continue;
      const entry = { decisionId: p.request.decisionId, postId: pkg.postId, phase: "after-kickoff", ...r };
      store.append("post-verification", "integrity-reviewer", entry);
      out.push({ postId: pkg.postId, status: r.status, reasons: r.reasons });
    }
    return out;
  }

  // ── step 2: one decision per post ───────────────────────────────────────────────────────────────────────────
  function consolidate(run, task) {
    const q = h.entries().filter((e) => e.kind === "contribution" && e.data.commandId === run.commandId && e.data.artifactType === "post-queue").at(-1)?.data?.artifact;
    if (!q) return h.refuseTask(run, task, REASON.MISSING_CLAIM, "no queue was built");
    const file = `queue-${q.date}-${run.commandId}.md`;
    const bytes = `${queueMarkdown(q, { commandId: run.commandId })}\n`;
    if (ctx.outDir) {
      fs.mkdirSync(path.join(ctx.outDir, "strategies"), { recursive: true });
      fs.writeFileSync(path.join(ctx.outDir, "strategies", file), bytes);
    }
    store.append("deliverable", "chief-of-staff", { commandId: run.commandId, kind: "queue-export", file: `strategies/${file}`, sha256: sha256(bytes) });
    for (const p of q.packages) {
      if (p.media) store.append("deliverable", "creative-renderer", { commandId: run.commandId, kind: "post-graphic", postId: p.postId, file: p.media.file, sha256: p.media.sha256, width: p.media.width, height: p.media.height, template: p.media.template, altText: p.media.altText });
    }
    const decidedNow = new Set(postRecords().filter((r) => r.decision && !["revise", "defer"].includes(r.decision.verdict)).map((r) => r.request.postId));
    const requests = q.packages.filter((p) => p.status !== POST_STATUS.BLOCKED && !decidedNow.has(p.postId)).map((p) => {
      const decisionId = shortId("post", { commandId: run.commandId, postId: p.postId });
      const d = {
        decisionId, commandId: run.commandId, kind: "post", subjectType: "post-package", postId: p.postId, date: q.date,
        package: p, calendar: q.calendar,
        question: `${p.sport} · ${p.title}: approve one caption, reject, ask for a revision, or defer? Approving authorizes this one post; you publish it yourself.`,
        options: p.captions.map((c) => ({ captionId: c.id, tone: c.tone, source: c.source, text: c.text, check: c.check, digest: c.digest, publishBundle: c.publishBundle })),
      };
      store.append("decision-request", "chief-of-staff", d);
      return d;
    });
    const blocked = q.packages.filter((p) => p.status === POST_STATUS.BLOCKED);
    h.contribute(run, task, {
      seat: "deterministic", provider: "deterministic", model: null, artifactType: "consolidated-report",
      artifact: { posts: requests.length, blocked: blocked.length, skipped: q.skipped.length },
      summary: `${requests.length} post decision(s) for ${q.date}; ${blocked.length} blocked package(s) and ${q.skipped.length} slot item(s) listed with reasons.`,
      evidence: [{ label: "queue export", ref: `strategies/${file}` }], proposedNextSteps: [], simulated: false,
    });
    h.report(run, {
      headline: requests.length ? `${requests.length} post(s) for ${q.date} ready for your decision` : `Nothing to approve for ${q.date} — see why`,
      lines: [
        `Drawn from approved calendar ${q.calendar.decisionId} (digest re-checked) at data ${q.dataLabel}.`,
        ...q.packages.map((p) => `${p.status} · ${p.sport} · ${p.title}${p.reasons.length && p.status !== "READY" ? ` — ${p.reasons[0]}` : ""}`),
        ...q.confirmations.map((c) => `After kickoff, ${c.postId}: ${c.status} — ${c.reasons[0]}`),
      ],
      deliverables: [`queue export strategies/${file}`, ...q.packages.filter((p) => p.media).map((p) => `graphic ${p.media.file}`)],
      refusals: [...blocked.map((p) => `${p.title}: ${p.reasons.join("; ")}`), ...q.skipped.map((s) => `${s.sport} ${s.opportunity}: ${s.reason}`)],
      warnings: ["Nothing is published by the Command Center: you post each approved draft yourself and record its X link.", "Approving the calendar authorized no post; each post has its own decision."],
      decisionsNeeded: requests.map((r) => r.question), final: true,
    });
  }

  // ── founder actions ─────────────────────────────────────────────────────────────────────────────────────────
  function supersededBy(request) {
    const records = postRecords();
    const mine = records.find((p) => p.request.decisionId === request.decisionId);
    return records.filter((p) => p.request.postId === request.postId && p.request.order > mine.request.order).at(-1)?.request.decisionId ?? null;
  }

  function decidePost(request, { verdict, captionId, digest, note, sourcesConfirmed }, actor) {
    if (!POST_VERDICTS.includes(verdict)) return { ok: false, code: "UNKNOWN_OPTION", detail: verdict };
    const newer = supersededBy(request);
    if (newer) return { ok: false, code: "SUPERSEDED", detail: `a newer queue proposed this post again (${newer}); decide there` };
    if (verdict === "revise" && !String(note ?? "").trim()) return { ok: false, code: "NOTE_REQUIRED", detail: "say what should change" };
    const pkg = request.package;
    let approval = null;
    if (verdict === "approve") {
      const option = request.options.find((o) => o.captionId === captionId);
      if (!option) return { ok: false, code: "UNKNOWN_OPTION", detail: `caption ${captionId}` };
      if (digest !== option.digest) return { ok: false, code: REASON.APPROVAL_DIGEST_MISMATCH, detail: "the approval does not match the caption on record" };
      if (!option.check?.ok) return { ok: false, code: "CAPTION_CHECK_FAILED", detail: option.check?.problems?.map((p) => `${p.code} ${p.detail}`).join("; ") };
      if (pkg.kind === "x-reply") {
        if (!pkg.xSources?.length) return { ok: false, code: "NO_SOURCES", detail: "this reply cites no specific X post: there is nothing to confirm" };
        if (sourcesConfirmed !== true) return { ok: false, code: "SOURCES_NOT_CONFIRMED", detail: "open the cited X posts and confirm they say what the finding claims, then approve with that confirmation" };
      } else if (pkg.status !== POST_STATUS.READY) {
        return { ok: false, code: "NOT_READY", detail: `${pkg.status}: ${pkg.reasons.join("; ")}` };
      }
      if (pkg.kind === "pregame-forecast") {
        const again = recheckPregame(pkg);
        if (again.status !== POST_STATUS.READY) return { ok: false, code: "VERIFICATION_CHANGED", detail: `re-checked just now: ${again.status} — ${again.reasons.join("; ")}. Rebuild the queue.` };
      }
      approval = { captionId, approvedExactDigest: option.digest, captionSha256: option.publishBundle.captionSha256, ...(pkg.kind === "x-reply" ? { sourcesConfirmed: true, sourcesConfirmedUrls: pkg.xSources } : {}) };
    }
    if (approval) {
      // One approved post per postId, whichever queue proposed it (closes the race with a queue built meanwhile).
      const once = store.claim(`post-approval|${request.postId}`, { decisionId: request.decisionId });
      if (!once.won && once.record.value.decisionId !== request.decisionId) return { ok: false, code: "ALREADY_APPROVED", detail: `this post was approved in ${once.record.value.decisionId}` };
    }
    const claim = store.claim(`decision|${request.decisionId}`, { verdict, ...(approval ? { captionId } : {}) });
    if (!claim.won) return { ok: true, duplicate: true, verdict: claim.record.value.verdict };
    store.append("decision", "founder", {
      decisionId: request.decisionId, commandId: request.commandId, postId: request.postId, verdict,
      note: note ? String(note).slice(0, 1000) : null, ...(approval ?? { approvedExactDigest: null }),
      approvedBy: actor.id ?? "founder", approvedAt: clock(), authentication: actor.authentication ?? "loopback-console (demo-grade)",
    });
    const next = {
      approve: "Approved: this one post may go out. Post it yourself on X, then record the link here (Record X link). Nothing was published by the Command Center.",
      reject: "Rejected. It won't be proposed again.",
      revise: "Revision requested and recorded with your note; it can be proposed again in a later queue.",
      defer: "Deferred. It can be proposed again in a later queue.",
    }[verdict];
    return { ok: true, verdict, next };
  }

  /** Re-run the freeze-time verifier for a pregame package against the current data source. */
  function recheckPregame(pkg) {
    const src = ctx.dataSource();
    const maxDataAgeMin = Number(env.GTP_CC_MAX_DATA_AGE_MIN) > 0 ? Number(env.GTP_CC_MAX_DATA_AGE_MIN) : DEFAULT_MAX_DATA_AGE_MIN;
    return verifyPregame({ src, eventId: pkg.eventId, now: clock(), numbers: pkg.numbers, dataCommitAt: src.committedAt ?? null, maxDataAgeMin });
  }

  /**
   * @param {{ decisionId: string, action: "schedule"|"publish"|"engagement", url?: string, publishedAt?: string, scheduledFor?: string, metrics?: object }} p
   */
  function recordPost({ decisionId, action, url, publishedAt, scheduledFor, metrics }, actor) {
    const rec = postRecords().find((p) => p.request.decisionId === decisionId);
    if (!rec) return { ok: false, code: "UNKNOWN_POST", detail: decisionId };
    if (rec.decision?.verdict !== "approve") return { ok: false, code: REASON.APPROVAL_MISSING, detail: "only an approved post can be scheduled, published or measured" };
    const pkg = rec.request.package;
    const kickoff = pkg.verification?.kickoffUtc ?? null;
    const by = { recordedBy: actor.id ?? "founder", recordedAt: clock(), authentication: actor.authentication ?? "loopback-console (demo-grade)" };

    if (action === "schedule") {
      const t = Date.parse(scheduledFor);
      if (!Number.isFinite(t)) return { ok: false, code: "BAD_TIME", detail: "give the time you scheduled it for" };
      if (rec.receipt) return { ok: false, code: "ALREADY_PUBLISHED", detail: rec.receipt.canonicalUrl };
      if (kickoff && t >= Date.parse(kickoff)) return { ok: false, code: "AFTER_KICKOFF", detail: `a pregame post must go out before kickoff (${kickoff})` };
      store.append("post-status", "founder", { decisionId, postId: rec.request.postId, status: "scheduled", scheduledFor: new Date(t).toISOString(), channel: "x", ...by });
      return { ok: true, status: "scheduled" };
    }
    if (action === "publish") {
      const x = parseXPostUrl(url, { expectedHandle: env.GTP_CC_X_HANDLE || null });
      if (!x.ok) return { ok: false, code: "BAD_X_LINK", detail: x.detail };
      const at = publishedAt ? Date.parse(publishedAt) : Date.parse(clock());
      if (!Number.isFinite(at)) return { ok: false, code: "BAD_TIME", detail: "publishedAt is not a time" };
      const warnings = [];
      if (!env.GTP_CC_X_HANDLE) warnings.push("GTP_CC_X_HANDLE is not set: the link's account was not checked against the GameTimePicks handle");
      if (kickoff && at >= Date.parse(kickoff)) warnings.push(`posted at/after kickoff (${kickoff}): it is not a pregame forecast any more — consider deleting it on X`);
      if (pkg.kind === "pregame-forecast") {
        const again = recheckPregame(pkg);
        if (again.status === "BLOCKED" && again.code === "NUMBER_CHANGED") warnings.push(`the frozen version changed since approval: ${again.reasons[0]}`);
      }
      // One receipt per post, and one post per X link — first writer wins, a repeat returns the first receipt. A post that
      // already has a receipt never claims a second link.
      if (rec.receipt) {
        return rec.receipt.providerPostId === x.statusId ? { ok: true, duplicate: true, receipt: rec.receipt } : { ok: false, code: "ALREADY_PUBLISHED", detail: `this post's receipt is ${rec.receipt.canonicalUrl}` };
      }
      const linkClaim = store.claim(`xpost|${x.statusId}`, { decisionId });
      if (!linkClaim.won && linkClaim.record.value.decisionId !== decisionId) return { ok: false, code: "LINK_ALREADY_USED", detail: `that X post is already the receipt for ${linkClaim.record.value.decisionId}` };
      const receipt = {
        schema: "gtp.cc.publish-receipt@1", provider: "manual-handoff", channel: "x", state: "PUBLISHED_MANUAL",
        decisionId, commandId: rec.request.commandId, postId: rec.request.postId, captionId: rec.decision.captionId,
        bundleDigest: rec.decision.approvedExactDigest, canonicalUrl: x.url, handle: x.handle, providerPostId: x.statusId,
        publishedAt: new Date(at).toISOString(), costUsd: 0, warnings,
        verification: "link format and account handle only — the Command Center does not fetch X",
        approvedBy: rec.decision.approvedBy, approvedAt: rec.decision.approvedAt, ...by,
      };
      const claim = store.claim(`publish|${decisionId}`, { receipt });
      if (!claim.won) return { ok: true, duplicate: true, receipt: claim.record.value.receipt };
      store.append("publish-receipt", "founder", receipt);
      return { ok: true, receipt };
    }
    if (action === "engagement") {
      if (!rec.receipt) return { ok: false, code: "NOT_PUBLISHED", detail: "record the X link first" };
      const m = parseMetrics(metrics);
      if (!m.ok) return { ok: false, code: "BAD_METRICS", detail: m.detail };
      store.append("engagement", "founder", { decisionId, postId: rec.request.postId, url: rec.receipt.canonicalUrl, metrics: m.metrics, source: "founder-entered from X analytics (not verified)", ...by });
      return { ok: true, metrics: m.metrics };
    }
    return { ok: false, code: "UNKNOWN_ACTION", detail: String(action) };
  }

  /** Read model: every proposed post with its lifecycle status. */
  function posts() {
    const all = h.entries();
    const records = postRecords();
    return records.map(({ request, decision, receipt }) => {
      const schedule = all.filter((e) => e.kind === "post-status" && e.data.decisionId === request.decisionId).at(-1)?.data ?? null;
      const engagement = all.filter((e) => e.kind === "engagement" && e.data.decisionId === request.decisionId).map((e) => ({ ...e.data, at: e.at }));
      const checks = all.filter((e) => e.kind === "post-verification" && e.data.decisionId === request.decisionId).map((e) => ({ ...e.data, at: e.at }));
      const newer = records.find((r) => r.request.postId === request.postId && r.request.order > request.order)
        ?? (!decision ? records.find((r) => r.request.postId === request.postId && r.request.decisionId !== request.decisionId && r.decision && !["revise", "defer"].includes(r.decision.verdict)) : null);
      const lifecycle = receipt ? "published"
        : decision?.verdict === "approve" ? (schedule ? "scheduled" : "approved")
        : decision?.verdict === "reject" ? "rejected"
        : decision?.verdict === "revise" ? "revise"
        : decision?.verdict === "defer" ? "deferred"
        : newer ? "superseded" : "drafted";
      const { order, ...req } = request;
      return { ...req, resolution: decision, receipt, schedule, engagement, checks, lifecycle, supersededBy: newer && !decision ? newer.request.decisionId : null };
    });
  }

  return { build, consolidate, decidePost, recordPost, posts, approvedCalendar, publishBundleOf };
}
