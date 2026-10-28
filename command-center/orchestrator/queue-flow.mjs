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
  skipped, parseXPostUrl, parseMetrics, queueMarkdown, publishBundleOf, queueInventory,
} from "../contracts/post-queue.mjs";
import { inspectSlate, buildRecapDraft } from "../recap/pipeline.mjs";
import { resultsBundles, resultsCaptions, validateResultsCaption } from "../recap/results-bundle.mjs";
import { renderResultsPng } from "../render/results-card.mjs";
import { publicLabelOf, readPublicRegistry } from "../recap/public-registry.mjs";
import { readCapabilities, multiSportFacts, etDate } from "../recap/multisport-facts.mjs";
import { verifyPregame, confirmAfterStart, nflVersions, DEFAULT_MAX_DATA_AGE_MIN } from "../recap/freeze-verifier.mjs";
import { pregameWinner, touchdowns, topBoard, postgame, nbaPregame, nbaPlayers, nbaFinal, withNbaMeter, BOARD_FAMILIES } from "../recap/social-v2.mjs";
import { renderSocial, SOCIAL_TEMPLATE, ASSET_MANIFEST } from "../render/social-v2.mjs";
import {
  baseIdOf, nflPregamePackage, nflTouchdownsPackage, nflTop5Package, nflPostgamePackage, nbaPregamePackage, nbaPlayersPackage, nbaFinalPackage, nbaGamePackage,
} from "../contracts/social-packages.mjs";

const SPORT_NAME = { NFL: "NFL", NBA: "NBA", MLB: "MLB", UFC: "UFC", EPL: "Premier League" };
const addDay = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const POST_VERDICTS = Object.freeze(["approve", "reject", "revise", "defer"]);
/** NBA Top 5 posts the founder asked for (one per stat), published only from an official board. */
const NBA_TOP5_STATS = Object.freeze(["points", "rebounds", "assists"]);

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
      invalidated: all.filter((e) => e.kind === "post-status" && e.data.decisionId === r.decisionId && e.data.status === "invalidated").at(-1)?.data ?? null,
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
    // Decided posts, by base id (a V2.1 package never re-proposes a post decided as V1). An approval invalidated by a
    // content change no longer counts as decided.
    const decided = new Map();
    for (const p of postRecords()) {
      if (p.decision && !["revise", "defer"].includes(p.decision.verdict) && !p.invalidated) decided.set(baseIdOf(p.request.postId), p);
    }
    const v2 = ctx.template !== "v1";
    const v2Covered = new Set(); // sport · format slots the V2.1 standing formats build instead
    const catchupSports = new Set();

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
      if (v2 && ((slot.format === "postgame-recap" && ["NFL", "NBA"].includes(slot.sport)) || (slot.format === "pregame-forecast" && slot.sport === "NFL"))) {
        if (slot.key === "catchup") catchupSports.add(slot.sport);
        v2Covered.add(`${slot.sport}:${slot.format}`);
        continue;
      }
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

    if (v2) await standingV2({ date, src, now, dataCommit, labelOf, maxDataAgeMin, lookback, catchupSports, packages, skips, factsFor });

    const sealed = [];
    const seen = new Set();
    for (const p of packages) {
      if (seen.has(baseIdOf(p.postId))) continue; // a catch-up slot and a next-morning recap slot can name the same card
      seen.add(baseIdOf(p.postId));
      const s = sealPackage(p);
      const prior = decided.get(baseIdOf(s.postId));
      if (prior) {
        // An approved, unpublished post whose graphic, caption or evidence changed loses its approval: the founder approved
        // other content. It is recorded as invalidated and the new version is proposed for a fresh decision.
        // Content = the approved caption's text, the graphic and the design version. New evidence or a new data commit with the
        // same content does not invalidate (the approval re-checks the data anyway); a changed caption or graphic does.
        const was = prior.request.options?.find((o) => o.captionId === prior.decision.captionId)?.publishBundle;
        const now2 = s.captions.find((c) => c.id === prior.decision.captionId)?.publishBundle;
        const contentOf = (b) => b && JSON.stringify([b.captionSha256, b.mediaSha256 ?? null, b.template ?? null, b.assetManifest ?? null, ...(b.mediaSetSha256 ? [b.mediaSetSha256] : [])]);
        const changed = prior.decision.verdict === "approve" && !prior.receipt && Boolean(was) && contentOf(was) !== contentOf(now2);
        if (!changed) { skips.push({ slotId: s.slotId, sport: s.sport, format: s.kind, opportunity: s.title, status: s.status, reason: `already decided: ${prior.decision.verdict} in ${prior.request.decisionId}${prior.receipt ? `, published ${prior.receipt.canonicalUrl}` : ""}` }); continue; }
        store.append("post-status", "integrity-reviewer", { decisionId: prior.request.decisionId, postId: prior.request.postId, status: "invalidated", reason: "the graphic, caption or evidence changed since approval; the new version needs its own approval", replacedBy: s.postId, recordedAt: now });
      }
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

  // ── V2.1 standing formats (founder 2026-10-28): every eligible game, not only chosen calendar slots ────────────
  const fileSafe = (id) => String(id).replace(/[^A-Za-z0-9._-]+/g, "-");
  async function withGraphic(pkg, m) {
    if (ctx.render === false || pkg.status === POST_STATUS.BLOCKED) return pkg;
    // rendered to a scratch name, then stored under its own content hash: a rebuild never overwrites the file a decided
    // or published post points at
    const tmp = path.join(mediaDir(), `.render-${process.pid}-${fileSafe(pkg.postId)}.png`);
    const rendered = await renderSocial(m, { outFile: tmp });
    const file = `${fileSafe(pkg.postId)}-${rendered.sha256.slice(0, 12)}.png`;
    fs.renameSync(tmp, path.join(mediaDir(), file));
    const media = { ...rendered, file };
    return { ...pkg, media: { ...media, kind: "graphic", altText: `${pkg.title}. ${pkg.captions[0]?.text ?? ""}`.slice(0, 900) } };
  }
  async function standingV2({ date, src, now, dataCommit, labelOf, maxDataAgeMin, lookback, catchupSports, packages, skips, factsFor }) {
    const extra = { template: SOCIAL_TEMPLATE, assetManifest: ASSET_MANIFEST, dataCommit };
    const skip = (sport, what, reason, status = POST_STATUS.BLOCKED) => skips.push({ slotId: `standing:${sport}`, sport, format: what, opportunity: what, status, reason });
    const one = async (sport, what, fn) => { try { await fn(); } catch (err) { skip(sport, what, `could not build — ${String(err.message ?? err).slice(0, 200)}`); } };
    const prev = addDay(date, -1);
    const nflLabel = labelOf("NFL");

    // NFL: Predicted Winner + Top 3 TD for every game today
    for (const e of factsFor().sports.NFL.events.filter((x) => x.date === date)) {
      const eventId = e.id.split(":")[1];
      await one("NFL", `${e.matchup} prediction`, async () => {
        const verification = verifyPregame({ src, eventId, now, dataCommitAt: src.committedAt ?? null, maxDataAgeMin });
        const m = pregameWinner({ src, eventId, now });
        if (!m.ok) return skip("NFL", `${e.matchup} prediction`, m.reason, POST_STATUS.VERIFY);
        packages.push(await withGraphic(nflPregamePackage({ date, m, verification, extra: { ...extra, label: nflLabel } }), m));
      });
      await one("NFL", `${e.matchup} Top 3 TD`, async () => {
        const m = touchdowns({ src, eventId, mode: "pregame", now });
        if (!m.ok) return skip("NFL", `${e.matchup} Top 3 TD`, m.reason);
        packages.push(await withGraphic(nflTouchdownsPackage({ date, m, extra: { ...extra, label: nflLabel } }), m));
      });
    }
    // NFL: Top 5 boards for today's slate — only families on the published board
    let boardMissing = false;
    for (const family of Object.keys(BOARD_FAMILIES)) {
      await one("NFL", `Top 5 ${family}`, async () => {
        const m = topBoard({ src, date, family });
        if (!m.ok) {
          if (m.held) return skip("NFL", `Top 5 ${BOARD_FAMILIES[family].title}`, `held: ${m.reason}`);
          if (!boardMissing) skip("NFL", "Top 5 boards", `${m.reason} (boards freeze before the slate's first kickoff)`, POST_STATUS.VERIFY);
          boardMissing = true;
          return;
        }
        let pkg = nflTop5Package({ date, m, extra: { ...extra, label: nflLabel } });
        if (m.firstKickoffUtc && Date.parse(now) >= Date.parse(m.firstKickoffUtc)) pkg = { ...pkg, status: POST_STATUS.BLOCKED, reasons: [`the slate's first kickoff (${m.firstKickoffUtc}) has passed: a pregame board is stale`] };
        packages.push(await withGraphic(pkg, m));
      });
    }
    // NFL: Prediction vs. Final for yesterday's games (and the calendar's catch-up window, lower priority)
    const nflDates = [prev, ...(catchupSports.has("NFL") ? lookback.filter((d) => d !== prev) : [])];
    for (const d of nflDates) {
      const slate = inspectSlate({ repoRoot: ctx.repoRoot, date: d, src });
      for (const g of slate.games) {
        await one("NFL", `${g.matchup} final`, async () => {
          if (!g.verdict.pass) return skip("NFL", `${g.matchup} (${d}) final`, g.verdict.refusals.map((r) => `${r.code} ${r.detail}`).join("; "));
          const m = postgame({ src, eventId: g.eventId, label: nflLabel });
          if (!m.ok) return skip("NFL", `${g.matchup} final`, m.reason);
          packages.push(await withGraphic(nflPostgamePackage({ date, m, extra: { ...extra, label: nflLabel }, priority: d === prev ? 2 : 3 }), m));
        });
      }
    }
    // NBA: Predicted Winner + projected stat lines for every game in today's public lane; finals of yesterday
    const nbaLabel = labelOf("NBA");
    const laneRaw = src.read(`app/public/data/nba/experimental-public/${date}.json`);
    if (laneRaw == null) skip("NBA", "NBA predictions", `today's NBA public lane (${date}) is not published at the data commit yet`, POST_STATUS.VERIFY);
    else {
      for (const g of JSON.parse(laneRaw).games ?? []) {
        let pre = null;
        let players = null;
        await one("NBA", `${g.away?.abbr} @ ${g.home?.abbr} prediction`, async () => {
          const m = await withNbaMeter(nbaPregame({ src, eventId: g.providerEventId, date }), { src, date });
          if (!m.ok) return skip("NBA", `${g.away?.abbr} @ ${g.home?.abbr} prediction`, m.reason);
          let pkg = nbaPregamePackage({ date, m, extra: { ...extra, label: nbaLabel }, laneDate: date });
          if (Date.parse(now) >= Date.parse(g.tipUtc)) pkg = { ...pkg, status: POST_STATUS.BLOCKED, reasons: ["tip-off has passed"] };
          // a component of the game post (both graphics in one post): built and kept, never proposed on its own
          packages.push((pre = await withGraphic({ ...pkg, componentOf: `${date}:NBA:game:${g.providerEventId}@v2` }, m)));
        });
        await one("NBA", `${g.away?.abbr} @ ${g.home?.abbr} stat lines`, async () => {
          const m = nbaPlayers({ src, eventId: g.providerEventId, date });
          if (!m.ok) return skip("NBA", `${g.away?.abbr} @ ${g.home?.abbr} stat lines`, m.reason);
          let pkg = nbaPlayersPackage({ date, m, extra: { ...extra, label: nbaLabel }, laneDate: date });
          if (Date.parse(now) >= Date.parse(g.tipUtc)) pkg = { ...pkg, status: POST_STATUS.BLOCKED, reasons: ["tip-off has passed"] };
          packages.push((players = await withGraphic({ ...pkg, componentOf: `${date}:NBA:game:${g.providerEventId}@v2` }, m)));
        });
        // the game post (both graphics, one caption) — the unit the scheduler publishes 45 minutes before tip-off
        if (pre && players) await one("NBA", `${g.away?.abbr} @ ${g.home?.abbr} game post`, async () => {
          packages.push(nbaGamePackage({ date, pre, players, extra: { ...extra, label: nbaLabel }, laneDate: date }));
        });
      }
    }
    // NBA Top 5 points / rebounds / assists: only from an official, published board. The NBA Top Boards are private
    // research today (data/internal/research/nba/top-boards), so nothing is ranked or posted from them.
    for (const stat of NBA_TOP5_STATS) {
      const board = src.read(`app/public/data/nba/top-boards/${date}.json`);
      if (board == null) skip("NBA", `Top 5 ${stat}`, `held: no official published NBA Top Board for ${date} (the boards are private research, not on the site); a ranking is never derived from the stat-line lane`, POST_STATUS.VERIFY);
      else skip("NBA", `Top 5 ${stat}`, `held: a published NBA board exists for ${date}, but its eligibility contract is not reviewed yet — add the reader before posting`, POST_STATUS.VERIFY);
    }
    const finalsRaw = src.read("app/public/data/nba/results/finals-2026-27.json");
    const nbaDates = [prev, ...(catchupSports.has("NBA") ? lookback.filter((d) => d !== prev) : [])];
    for (const r of finalsRaw ? JSON.parse(finalsRaw).finals ?? [] : []) {
      if (!nbaDates.includes(r.dateEt) || r.exhibition || r.statusRaw !== "STATUS_FINAL") continue;
      await one("NBA", `${r.away?.tricode} @ ${r.home?.tricode} final`, async () => {
        const m = nbaFinal({ src, eventId: r.providerEventId });
        if (!m.ok) return skip("NBA", "final", m.reason);
        packages.push(await withGraphic(nbaFinalPackage({ date, m, extra: { ...extra, label: nbaLabel }, priority: r.dateEt === prev ? 2 : 3 }), m));
      });
    }
  }

  /** Re-check a V2.1 package against the current data (approval time). null = nothing to re-check for this kind. */
  function recheck(pkg) {
    const src = ctx.dataSource();
    const now = clock();
    if (pkg.kind === "pregame-forecast") return recheckPregame(pkg);
    if (pkg.kind === "td-top3") {
      if (!Number.isFinite(Date.parse(pkg.kickoffUtc)) || Date.parse(now) >= Date.parse(pkg.kickoffUtc)) return { status: POST_STATUS.BLOCKED, reasons: ["kickoff has passed"] };
      const m = touchdowns({ src, eventId: pkg.eventId, mode: "pregame", now });
      if (!m.ok) return { status: POST_STATUS.BLOCKED, reasons: [m.reason] };
      const key = m.candidates.map((c) => `${c.id}:${c.probabilityDisplay}`).join("|");
      return key === pkg.candidatesKey ? { status: POST_STATUS.READY, reasons: [] } : { status: POST_STATUS.BLOCKED, reasons: ["the published top three changed since this draft: rebuild the queue"] };
    }
    if (pkg.kind === "top5-board") {
      if (!Number.isFinite(Date.parse(pkg.firstKickoffUtc)) || Date.parse(now) >= Date.parse(pkg.firstKickoffUtc)) return { status: POST_STATUS.BLOCKED, reasons: ["the slate's first kickoff has passed (or is unknown)"] };
      const m = topBoard({ src, date: pkg.date, family: pkg.family });
      return m.ok && m.evidence[0]?.sha256 === pkg.boardSha256 ? { status: m.status, reasons: [] } : { status: POST_STATUS.BLOCKED, reasons: [m.ok ? "the frozen board file changed" : m.reason] };
    }
    if (pkg.kind === "nba-game") {
      // both graphics' sources, the featured players and the start time, all as they were at approval
      if (!Number.isFinite(Date.parse(pkg.tipUtc)) || Date.parse(now) >= Date.parse(pkg.tipUtc)) return { status: POST_STATUS.BLOCKED, reasons: ["tip-off has passed"] };
      const pm = nbaPregame({ src, eventId: pkg.eventId, date: pkg.laneDate });
      const pl = nbaPlayers({ src, eventId: pkg.eventId, date: pkg.laneDate });
      if (!pm.ok || !pl.ok) return { status: POST_STATUS.BLOCKED, reasons: [pm.reason ?? pl.reason] };
      const reasons = [];
      if (pm.favouredTeam.abbr !== pkg.favoured) reasons.push(`the published predicted winner changed (${pkg.favoured} → ${pm.favouredTeam.abbr})`);
      if ([...pl.awayPlayers, ...pl.homePlayers].map((p) => `${p.id}:${p.pts}/${p.reb}/${p.ast}`).join("|") !== pkg.playersKey) reasons.push("the published stat lines changed");
      if (pl.featured.map((f) => `${f.team}:${f.player?.id ?? "-"}`).join("|") !== pkg.featuredKey) reasons.push("a featured player changed (injury report, lineup or availability)");
      if (pl.tipUtc && pl.tipUtc !== pkg.tipUtc) reasons.push(`the scheduled tip-off moved (${pkg.tipUtc} → ${pl.tipUtc})`);
      // V2.3: the forecast version the graphics and meter came from (the lane game's freeze + receipt hash)
      if (pkg.forecastVersion) {
        const lane = JSON.parse(src.read(`app/public/data/nba/experimental-public/${pkg.laneDate}.json`) ?? "{}");
        const lg = (lane.games ?? []).find((x) => String(x.providerEventId) === String(pkg.eventId));
        if (!lg || lg.frozenAt !== pkg.forecastVersion.frozenAt || (lg.receipt?.payloadSha256 ?? null) !== pkg.forecastVersion.receiptPayloadSha256) reasons.push("the published forecast version changed");
      }
      // an injury designation that appeared (or cleared) on a featured player since the draft
      if (Boolean(pl.featured.some((f) => f.verify)) !== Boolean(pkg.availabilityCheck?.length)) reasons.push("a featured player's injury designation changed");
      return reasons.length ? { status: POST_STATUS.BLOCKED, reasons: [...reasons, "rebuild the queue and approve the new version"] } : { status: POST_STATUS.READY, reasons: [] };
    }
    if (pkg.kind === "nba-pregame" || pkg.kind === "nba-players") {
      // fail closed: no start time on record means the window can't be shown to be open
      if (!Number.isFinite(Date.parse(pkg.tipUtc)) || Date.parse(now) >= Date.parse(pkg.tipUtc)) return { status: POST_STATUS.BLOCKED, reasons: ["tip-off has passed"] };
      const m = pkg.kind === "nba-pregame" ? nbaPregame({ src, eventId: pkg.eventId, date: pkg.laneDate }) : nbaPlayers({ src, eventId: pkg.eventId, date: pkg.laneDate });
      if (!m.ok) return { status: POST_STATUS.BLOCKED, reasons: [m.reason] };
      const same = pkg.kind === "nba-pregame" ? m.favouredTeam.abbr === pkg.favoured
        : [...m.awayPlayers, ...m.homePlayers].map((p) => `${p.id}:${p.pts}/${p.reb}/${p.ast}`).join("|") === pkg.playersKey;
      return same ? { status: POST_STATUS.READY, reasons: [] } : { status: POST_STATUS.BLOCKED, reasons: ["the published lane changed since this draft: rebuild the queue"] };
    }
    return null;
  }

  // ── design approval: separate from evidence readiness and from publishing approval ────────────────────────
  function designApproval(template, assetManifest) {
    return h.entries().filter((e) => e.kind === "design-approval" && e.data.template === template && e.data.assetManifest === assetManifest).at(-1)?.data ?? null;
  }
  function approveDesign({ template, assetManifest }, actor) {
    if (template !== SOCIAL_TEMPLATE || assetManifest !== ASSET_MANIFEST) return { ok: false, code: "UNKNOWN_DESIGN", detail: `the current design is ${SOCIAL_TEMPLATE} + ${ASSET_MANIFEST}` };
    const claim = store.claim(`design|${template}|${assetManifest}`, { by: actor.id ?? "founder" });
    if (!claim.won) return { ok: true, duplicate: true };
    store.append("design-approval", "founder", { template, assetManifest, approvedBy: actor.id ?? "founder", approvedAt: clock(), authentication: actor.authentication ?? "loopback-console (demo-grade)", scope: "visual design only — every post still needs its own publishing approval" });
    return { ok: true, next: "Design approved for this template and asset-manifest version. No post is approved by this; each still needs its own decision." };
  }
  function design() {
    const a = designApproval(SOCIAL_TEMPLATE, ASSET_MANIFEST);
    return { template: SOCIAL_TEMPLATE, assetManifest: ASSET_MANIFEST, approved: Boolean(a), approvedAt: a?.approvedAt ?? null };
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
    const decidedNow = new Set(postRecords().filter((r) => r.decision && !["revise", "defer"].includes(r.decision.verdict) && !r.invalidated).map((r) => baseIdOf(r.request.postId)));
    const requests = q.packages.filter((p) => p.status !== POST_STATUS.BLOCKED && !p.componentOf && !decidedNow.has(baseIdOf(p.postId))).sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2)).map((p) => {
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
    return records.filter((p) => baseIdOf(p.request.postId) === baseIdOf(request.postId) && p.request.order > mine.request.order).at(-1)?.request.decisionId ?? null;
  }

  function decidePost(request, { verdict, captionId, digest, note, sourcesConfirmed, availabilityConfirmed }, actor) {
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
      // Design approval is its own state: a V2.1 graphic can't be approved for publishing before its design version is.
      if (pkg.template && !designApproval(pkg.template, pkg.assetManifest)) return { ok: false, code: "DESIGN_NOT_APPROVED", detail: `approve the ${pkg.template} design (${pkg.assetManifest}) first — design approval and publishing approval are separate` };
      if (pkg.componentOf || ((pkg.kind === "nba-pregame" || pkg.kind === "nba-players") && postRecords().some((r) => r.request.package?.kind === "nba-game" && r.request.package.eventId === pkg.eventId))) {
        return { ok: false, code: "SUPERSEDED_BY_GAME_POST", detail: "this graphic is part of the game post (both graphics in one post): approve the game post instead" };
      }
      if (pkg.kind === "nba-game" && pkg.availabilityCheck?.length) {
        if (availabilityConfirmed !== true) return { ok: false, code: "AVAILABILITY_NOT_CONFIRMED", detail: `${pkg.availabilityCheck.join("; ")} — then approve with that confirmation` };
      } else if (pkg.kind === "td-top3") {
        if (availabilityConfirmed !== true) return { ok: false, code: "AVAILABILITY_NOT_CONFIRMED", detail: "confirm each listed player is active and in his expected role (no source confirms it), then approve with that confirmation" };
      } else if (pkg.kind === "x-reply") {
        if (!pkg.xSources?.length) return { ok: false, code: "NO_SOURCES", detail: "this reply cites no specific X post: there is nothing to confirm" };
        if (sourcesConfirmed !== true) return { ok: false, code: "SOURCES_NOT_CONFIRMED", detail: "open the cited X posts and confirm they say what the finding claims, then approve with that confirmation" };
      } else if (pkg.status !== POST_STATUS.READY) {
        return { ok: false, code: "NOT_READY", detail: `${pkg.status}: ${pkg.reasons.join("; ")}` };
      }
      const again = recheck(pkg);
      if (again && again.status !== POST_STATUS.READY) return { ok: false, code: "VERIFICATION_CHANGED", detail: `re-checked just now: ${again.status} — ${again.reasons.join("; ")}. Rebuild the queue.` };
      approval = {
        captionId, approvedExactDigest: option.digest, captionSha256: option.publishBundle.captionSha256,
        ...(pkg.template ? { template: pkg.template, assetManifest: pkg.assetManifest } : {}),
        ...(pkg.kind === "x-reply" ? { sourcesConfirmed: true, sourcesConfirmedUrls: pkg.xSources } : {}),
        ...(pkg.kind === "td-top3" ? { availabilityConfirmed: true, availabilityConfirmedFor: pkg.candidatesKey } : {}),
        ...(pkg.kind === "nba-game" && pkg.availabilityCheck?.length ? { availabilityConfirmed: true, availabilityConfirmedFor: pkg.featuredKey } : {}),
      };
    }
    if (approval) {
      // One approved post per postId, whichever queue proposed it (closes the race with a queue built meanwhile).
      // one live approval per post: a new generation starts each time an earlier approval is invalidated
      const generation = postRecords().filter((r) => baseIdOf(r.request.postId) === baseIdOf(request.postId) && r.invalidated).length;
      const once = store.claim(`post-approval|${baseIdOf(request.postId)}|${generation}`, { decisionId: request.decisionId });
      if (!once.won && once.record.value.decisionId !== request.decisionId) return { ok: false, code: "ALREADY_APPROVED", detail: `this post was approved in ${once.record.value.decisionId}` };
    }
    const claim = store.claim(`decision|${request.decisionId}`, { verdict, ...(approval ? { captionId } : {}) });
    if (!claim.won) return { ok: true, duplicate: true, verdict: claim.record.value.verdict };
    store.append("decision", actor?.id ?? "founder", {
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
    if (rec.invalidated && action !== "engagement") return { ok: false, code: "APPROVAL_INVALIDATED", detail: `${rec.invalidated.reason} — approve the new version (${rec.invalidated.replacedBy})` };
    const pkg = rec.request.package;
    const kickoff = pkg.verification?.kickoffUtc ?? pkg.kickoffUtc ?? pkg.tipUtc ?? pkg.firstKickoffUtc ?? null;
    const by = { recordedBy: actor.id ?? "founder", recordedAt: clock(), authentication: actor.authentication ?? "loopback-console (demo-grade)" };

    if (action === "verify") {
      // "Check before posting": re-run the package's freshness / latest-version check now and record the result.
      const again = recheck(pkg);
      const result = again ?? { status: POST_STATUS.READY, reasons: ["nothing time-sensitive to re-check for this kind"] };
      store.append("post-verification", "founder", { decisionId, postId: rec.request.postId, phase: "pre-publish", status: result.status, reasons: result.reasons, checkedAt: clock(), dataCommit: ctx.dataSource().commit ?? null, ...by });
      return { ok: result.status === POST_STATUS.READY, status: result.status, reasons: result.reasons, code: result.status === POST_STATUS.READY ? undefined : "NOT_CURRENT", detail: result.reasons.join("; ") };
    }
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
      const again = recheck(pkg);
      if (again && again.status !== POST_STATUS.READY) warnings.push(`re-checked at recording: ${again.status} — ${again.reasons.join("; ")}`);
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
    const approvedDesigns = new Set(all.filter((e) => e.kind === "design-approval").map((e) => `${e.data.template}|${e.data.assetManifest}`));
    const records = postRecords();
    return records.map(({ request, decision, receipt, invalidated }) => {
      const schedule = all.filter((e) => e.kind === "post-status" && e.data.decisionId === request.decisionId && e.data.status === "scheduled").at(-1)?.data ?? null;
      const engagement = all.filter((e) => e.kind === "engagement" && e.data.decisionId === request.decisionId).map((e) => ({ ...e.data, at: e.at }));
      const checks = all.filter((e) => e.kind === "post-verification" && e.data.decisionId === request.decisionId).map((e) => ({ ...e.data, at: e.at }));
      // V2.3: an undecided standalone NBA graphic is superseded by its game post (both graphics in one post)
      const game = !decision && ["nba-pregame", "nba-players"].includes(request.package?.kind)
        ? records.find((r) => r.request.package?.kind === "nba-game" && r.request.package.eventId === request.package.eventId) : null;
      const newer = game ?? records.find((r) => baseIdOf(r.request.postId) === baseIdOf(request.postId) && r.request.order > request.order)
        ?? (!decision ? records.find((r) => baseIdOf(r.request.postId) === baseIdOf(request.postId) && r.request.decisionId !== request.decisionId && r.decision && !["revise", "defer"].includes(r.decision.verdict) && !r.invalidated) : null);
      const lifecycle = receipt ? "published"
        : invalidated ? "invalidated"
        : decision?.verdict === "approve" ? (schedule ? "scheduled" : "approved")
        : decision?.verdict === "reject" ? "rejected"
        : decision?.verdict === "revise" ? "revise"
        : decision?.verdict === "defer" ? "deferred"
        : newer ? "superseded" : "drafted";
      const { order, ...req } = request;
      const designApproved = req.package?.template ? approvedDesigns.has(`${req.package.template}|${req.package.assetManifest}`) : null;
      return { ...req, resolution: decision, receipt, schedule, engagement, checks, lifecycle, invalidated, designApproved, supersededBy: newer && !decision ? newer.request.decisionId : null };
    });
  }

  return { build, consolidate, decidePost, recordPost, posts, approvedCalendar, publishBundleOf, approveDesign, design, recheck, designApproval, inventory: () => queueInventory(posts()) };
}
