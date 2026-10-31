/**
 * X PUBLISHER V1 — scheduled and manual publishing of APPROVED posts, behind one gate.
 *
 *   verified prediction → graphic → checked caption → founder approval → scheduled job → THE GATE → X → receipt
 *
 * The gate (execute) runs immediately before anything is sent, in this order, and refuses on the first failure:
 *   1. publishing not paused (its own Pause Publishing switch, and the Command Center's global Pause);
 *   2. the post is approved, the approval was not invalidated or superseded, and the design version is approved;
 *   3. the approval's fingerprint equals the fingerprint recomputed from the package now (caption, every image's
 *      sha256, claims, template) and every image file on disk still hashes to its approved value;
 *   4. before the start time (tip-off / kickoff), and not before the job's due time;
 *   5. fresh data: the data source is fetched now (git fetch of the public repo) and the package's own re-check runs
 *      against it — for an NBA game post: the same predicted winner, the same published stat lines, the same featured
 *      players (an injury or lineup change moves them) and the same tip-off. All numbers come from the one canonical
 *      published lane; nothing from Simulation Theater is ever read here;
 *   6. live only: the founder's live authorization (scheduled publishing), or a founder-triggered one-off live test;
 *      an explicit monthly spend cap the quote fits under; and a connected X account;
 *   7. once-only: a ledger claim on (post, attempt) is taken BEFORE the request. A post with a PUBLISHED or UNKNOWN
 *      result is never sent again; only a definite NOT_SENT failure allows another attempt.
 * Every step and result is in the ledger (audit). Refusals, failures, unknown outcomes and missed windows raise
 * alerts the console shows until acknowledged.
 *
 * Dry run is the default and the only mode until the founder authorizes live publishing. A dry run sends nothing and
 * never writes a publish-receipt; it records exactly what would have been sent.
 */
import fs from "node:fs";
import path from "node:path";
import { digestOf, shortId } from "../lib/util.mjs";
import { publishBundleOf, parseXPostUrl } from "../contracts/post-queue.mjs";
import { baseIdOf } from "../contracts/social-packages.mjs";
import { IMPORT_SENDABLE, isImported, isReviewCopy } from "../contracts/imported-packages.mjs";
import { createXPublisher, XPublishError, MAX_IMAGES } from "../publishers/x-api.mjs";
import { checkFounder, SCHEDULER_ACTOR, DAILY_QUEUE_COMMAND } from "./policy.mjs";

export const MAX_SPEND_CAP_USD = 25;
export const PUBLISHER_HOSTS = Object.freeze(["local", "hosted"]);
/** The exact words the founder types to hand live sending from this host to the other one. */
export const handOffText = (to) => `I hand live X publishing to the ${to} publisher`;
/** The exact words the founder types to authorize live publishing (and its cap). */
export const liveAuthorizationText = (capUsd) => `I authorize live X publishing up to $${capUsd} per month`;
/** Live TEST posts only (founder-triggered, one at a time): scheduled publishing stays in dry run. */
export const liveTestAuthorizationText = (capUsd) => `I authorize live X test posts up to $${capUsd} per month`;
// NBA Predicted Winner and stat lines go out together as the game post (V2.3), never on their own
// Top 5 (founder 2026-10-29): one consolidated post per sport per daily slate, one per NFL week. Their once-only send
// claim keys on the post's base identity (top5-week|NFL|2026-W08), so no version of a week can go out twice.
const SCHEDULABLE = new Set(["nba-game", "pregame-forecast", "td-top3", "top5-board", "top5-daily", "top5-weekly", ...IMPORT_SENDABLE]);
/** The X scopes a send needs: posting, and media.write whenever the post carries images. */
export const requiredScopes = (mediaCount) => ["tweet.write", ...(mediaCount ? ["media.write"] : [])];
const startOf = (pkg) => pkg.tipUtc ?? pkg.kickoffUtc ?? pkg.verification?.kickoffUtc ?? pkg.firstKickoffUtc ?? null;
const mediaOf = (pkg) => pkg.mediaSet ?? (pkg.media ? [pkg.media] : []);
const monthOf = (iso) => iso.slice(0, 7);

// ── US Eastern wall clock (America/New_York; DST handled by Intl) ─────────────────────────────────────────────────
const ET_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** The Eastern date ("YYYY-MM-DD") and wall time ("HH:MM", 24 h) of an instant. */
export function etParts(iso) {
  const p = Object.fromEntries(ET_FORMAT.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}
const wallMs = (date, hhmm) => { const [y, m, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number); return Date.UTC(y, m - 1, d, h, mi); };
/**
 * The instant (ISO) at which the Eastern wall clock reads `hhmm` on `date`. Eastern is UTC−4 (EDT) or UTC−5 (EST):
 * the earlier matching instant wins (the first 01:30 on the fall-back night); a time the spring-forward jump skips
 * (02:30) resolves to the later candidate, just after the jump.
 */
export function etInstant(date, hhmm) {
  const want = wallMs(date, hhmm);
  const candidates = [want + 4 * 3600_000, want + 5 * 3600_000];
  const hit = candidates.find((t) => { const p = etParts(new Date(t).toISOString()); return p.date === date && p.time === hhmm; });
  return new Date(hit ?? candidates[1]).toISOString();
}
export const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
/** "HH:MM", 24-hour. */
export const TIME_ET = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * @param {{ store: object, clock: () => string, posts: () => object[], recheck: (pkg: object) => object|null,
 *           designApproved: (template: string, manifest: string) => boolean, isPaused: () => boolean,
 *           mediaDir: string, refreshData: () => Promise<{ok: boolean, detail?: string}>, oauth?: object|null,
 *           fetch?: typeof fetch, handle?: string|null }} ctx
 */
export function createPublishFlow(ctx) {
  const { store, clock } = ctx;
  const entries = () => store.list();
  const of = (kind) => entries().filter((e) => e.kind === kind);
  let running = false;
  let lastTickAt = null;

  // ── settings ────────────────────────────────────────────────────────────────────────────────────────────────
  const policy = () => of("publish-policy").at(-1)?.data ?? { mode: "dry-run", capUsd: 0 };
  const publishingPaused = () => Boolean(of("publish-pause").at(-1)?.data?.paused);
  const paused = () => publishingPaused() || ctx.isPaused();
  /**
   * ONE live publisher. The publisher-host record with the highest generation names the only host allowed to send
   * live; with none it is the local Mac. Generation n+1 can only be written by the holder of generation n, so the
   * order never depends on either machine's clock and two ledgers holding the same records always agree. A host can only hand publishing AWAY
   * (setPublisherHost); the other host learns of it only when the ledger sync copies that record — together with
   * every once-only send claim — so at any moment zero or one host can send, never two.
   */
  const thisHost = ctx.publisherHost ?? "local";
  const hostRecord = () => of("publisher-host").reduce((best, e) => (!best || e.data.generation > best.data.generation ? e : best), null);
  const activeHost = () => hostRecord()?.data.host ?? "local";
  const spentThisMonth = () => [...of("publish-result").filter((e) => e.data.live), ...of("publish-spend")].filter((e) => monthOf(e.at) === monthOf(clock())).reduce((s, e) => s + (e.data.costUsd ?? 0), 0);
  /** Commit what is buffered (hosted SQL ledger); a lost claim race is not an error for records that follow a send. */
  const durable = async () => {
    if (typeof store.flush !== "function") return;
    try { await store.flush(); } catch (err) { if (err.code !== "CLAIM_CONFLICT") throw err; }
  };
  /** A queued live test is valid this long; after that it must be asked for again. */
  const LIVE_TEST_TTL_MS = 15 * 60_000;

  function setPaused(value, actor) {
    const f = checkFounder(value ? "pause" : "resume", actor);
    if (!f.ok) return f;
    store.append("publish-pause", actor.id ?? "founder", { paused: Boolean(value), by: actor.id ?? "founder", authentication: actor.authentication ?? null });
    return { ok: true, paused: Boolean(value) };
  }

  /**
   * Founder: scheduled publishing mode. "live" needs the exact authorization sentence with a cap ($1–25/month) and a
   * connected X account; "dry-run" always succeeds (it is how to turn live publishing off).
   */
  async function setPolicy({ mode, capUsd, authorization }, actor) {
    const f = checkFounder("publishing-policy", actor);
    if (!f.ok) return f;
    if (mode === "dry-run") {
      store.append("publish-policy", actor.id ?? "founder", { mode: "dry-run", capUsd: policy().capUsd ?? 0, by: actor.id ?? "founder" });
      // turning live off also withdraws any live test still waiting in the queue
      const withdrawn = cancelQueued((j) => j.manual && j.live, `scheduled publishing switched to dry run by ${actor.id ?? "founder"}`, actor);
      return { ok: true, mode: "dry-run", withdrawnLiveTests: withdrawn };
    }
    if (mode !== "live" && mode !== "test-only") return { ok: false, code: "UNKNOWN_MODE", detail: String(mode) };
    const cap = Number(capUsd);
    if (!(cap > 0 && cap <= MAX_SPEND_CAP_USD)) return { ok: false, code: "CAP_INVALID", detail: `a monthly cap between $1 and $${MAX_SPEND_CAP_USD}` };
    const words = mode === "live" ? liveAuthorizationText(cap) : liveTestAuthorizationText(cap);
    if (String(authorization ?? "").trim() !== words) return { ok: false, code: "AUTHORIZATION_TEXT", detail: `type exactly: ${words}` };
    const x = ctx.oauth ? await ctx.oauth.status() : { connected: false };
    if (!x.connected) return { ok: false, code: "X_NOT_CONNECTED", detail: "connect the X account first" };
    if (mode === "test-only") {
      // a cap for founder-triggered live tests; scheduled publishing stays a dry run
      store.append("publish-policy", actor.id ?? "founder", { mode: "dry-run", liveTests: true, capUsd: cap, authorization: words, by: actor.id ?? "founder", authentication: actor.authentication ?? null });
      return { ok: true, mode: "dry-run", liveTests: true, capUsd: cap };
    }
    store.append("publish-policy", actor.id ?? "founder", { mode: "live", capUsd: cap, authorization: liveAuthorizationText(cap), by: actor.id ?? "founder", authentication: actor.authentication ?? null });
    return { ok: true, mode: "live", capUsd: cap };
  }

  // ── jobs ────────────────────────────────────────────────────────────────────────────────────────────────────
  function jobs() {
    const results = of("publish-result");
    const cancels = new Set(of("publish-job-cancel").map((e) => e.data.jobId));
    // a live attempt is committed before the request: one with no recorded outcome (a crash, a timeout, a lost write)
    // may have posted, so it counts as UNKNOWN until reconciled
    const liveAttempts = new Map(of("publish-attempt").filter((e) => e.data.live).map((e) => [e.data.jobId, e]));
    return of("publish-job").map((e) => {
      const r = results.filter((x) => x.data.jobId === e.data.jobId).map((x) => ({ ...x.data, at: x.at }));
      const last = r.at(-1) ?? null;
      const a = liveAttempts.get(e.data.jobId);
      const status = last ? last.state.toLowerCase() : a ? "unknown" : cancels.has(e.data.jobId) ? "cancelled" : "scheduled";
      const results2 = !last && a ? [{ state: "UNKNOWN", code: "NO_OUTCOME_RECORDED", detail: "the send started but its outcome was never recorded — check X, then reconcile", live: true, attemptedAt: a.at, text: a.data.text ?? null }] : r;
      return { ...e.data, scheduledAt: e.at, status, results: results2 };
    });
  }
  /** Withdraw queued jobs (a live test whose requester lost the right, or live switched off). */
  function cancelQueued(match, reason, actor = { id: "system" }) {
    const out = [];
    for (const j of jobs().filter((x) => x.status === "scheduled" && match(x))) {
      store.append("publish-job-cancel", actor.id ?? "system", { jobId: j.jobId, by: actor.id ?? "system", reason });
      out.push(j.jobId);
    }
    return out;
  }
  /** Hosted: an account was disabled or lost publish rights — its queued jobs go with it. */
  const cancelQueuedBy = (userId, reason, actor) => cancelQueued((j) => j.by === userId, reason, actor);
  const recordOf = (decisionId) => ctx.posts().find((p) => p.decisionId === decisionId) ?? null;

  /** Founder: schedule an approved post. Default time: the package's suggested time (NBA game: 45 min before tip). */
  function schedule({ decisionId, at = null }, actor) {
    const f = checkFounder("publish", actor);
    if (!f.ok) return f;
    const rec = recordOf(decisionId);
    if (!rec) return { ok: false, code: "UNKNOWN_POST", detail: decisionId };
    const pkg = rec.package;
    if (!SCHEDULABLE.has(pkg.kind)) return { ok: false, code: "NOT_SCHEDULABLE", detail: pkg.kind === "nba-pregame" || pkg.kind === "nba-players" ? "NBA graphics go out together as the game post: schedule the game post" : `${pkg.kind} posts are published by hand` };
    if (isImported(pkg) && pkg.status !== "READY") return { ok: false, code: "IMPORT_BLOCKED", detail: pkg.reasons.join("; ") };
    if (isReviewCopy(pkg)) return { ok: false, code: "REVIEW_COPY", detail: "this image carries the review banner: Launch Readiness must deliver the clean export first" };
    if (rec.resolution?.verdict !== "approve" || rec.invalidated) return { ok: false, code: "NOT_APPROVED", detail: "only an approved, current post can be scheduled" };
    if (rec.receipt) return { ok: false, code: "ALREADY_PUBLISHED", detail: rec.receipt.canonicalUrl };
    const start = startOf(pkg);
    const due = at ? Date.parse(at) : Date.parse(pkg.suggestedPublishAt ?? "");
    if (!Number.isFinite(due)) return { ok: false, code: "BAD_TIME", detail: "give a publish time" };
    if (!start || due >= Date.parse(start)) return { ok: false, code: "AFTER_START", detail: `must be before the start (${start ?? "unknown"})` };
    if (due < Date.parse(clock()) - 60_000) return { ok: false, code: "IN_THE_PAST", detail: new Date(due).toISOString() };
    const closes = Date.parse(pkg.imported?.window?.closesAt ?? "");
    if (Number.isFinite(closes) && due >= closes) return { ok: false, code: "AFTER_WINDOW", detail: `must be before the publishing window closes (${pkg.imported.window.closesAt})` };
    const base = baseIdOf(pkg.postId);
    const open = jobs().find((j) => j.baseId === base && ["scheduled", "running"].includes(j.status));
    if (open) return { ok: false, code: "ALREADY_SCHEDULED", detail: `${open.jobId} at ${open.dueAt}` };
    const jobId = shortId("pubjob", { decisionId, due, n: of("publish-job").length });
    const job = { jobId, decisionId, postId: pkg.postId, baseId: base, title: pkg.title, sport: pkg.sport, dueAt: new Date(due).toISOString(), startUtc: start, by: actor.id ?? "founder" };
    store.append("publish-job", actor.id ?? "founder", job);
    return { ok: true, job };
  }

  function cancel({ jobId }, actor) {
    const f = checkFounder("pause", actor);
    if (!f.ok) return f;
    const j = jobs().find((x) => x.jobId === jobId);
    if (!j) return { ok: false, code: "UNKNOWN_JOB", detail: jobId };
    if (j.status !== "scheduled") return { ok: false, code: "NOT_CANCELLABLE", detail: j.status };
    store.append("publish-job-cancel", actor.id ?? "founder", { jobId, by: actor.id ?? "founder" });
    return { ok: true };
  }

  function alert(job, severity, code, detail) {
    store.append("publish-alert", "publisher", { alertId: shortId("alert", { jobId: job.jobId, code, at: clock() }), jobId: job.jobId, postId: job.postId, severity, code, detail });
  }
  function result(job, state, extra = {}) {
    store.append("publish-result", "publisher", { jobId: job.jobId, decisionId: job.decisionId, postId: job.postId, baseId: job.baseId, state, ...extra });
    return { ok: ["DRY_RUN", "PUBLISHED"].includes(state), state, ...extra };
  }

  /** The gate. `live` is decided by the caller (policy or a founder-triggered test), never by the job. */
  async function execute(job, { live, trigger }) {
    const refuse = (code, detail, severity = "warning") => { alert(job, severity, code, detail); return result(job, "REFUSED", { code, detail, live, trigger }); };
    const rec = recordOf(job.decisionId);
    if (!rec) return refuse("UNKNOWN_POST", job.decisionId);
    const pkg = rec.package;
    const base = baseIdOf(pkg.postId);
    // a window that closed while paused (or while the Mac was asleep) is recorded as missed, not left pending
    const startAt = Date.parse(startOf(pkg) ?? "");
    if (Number.isFinite(startAt) && Date.parse(clock()) >= startAt) {
      alert(job, "warning", "MISSED", `not published before ${startOf(pkg)}`);
      return result(job, "MISSED", { code: "AFTER_START", detail: `start ${startOf(pkg)} has passed`, live, trigger });
    }
    if (paused()) return { ok: false, state: "HELD", code: "PAUSED", detail: "publishing is paused" };
    // 2. approval, design
    if (rec.resolution?.verdict !== "approve") return refuse("NOT_APPROVED", "the post is not approved");
    if (rec.invalidated) return refuse("APPROVAL_INVALIDATED", rec.invalidated.reason);
    if (isImported(pkg) && (pkg.status !== "READY" || !SCHEDULABLE.has(pkg.kind))) return refuse("IMPORT_BLOCKED", pkg.reasons.join("; ") || pkg.kind, "critical");
    if (isReviewCopy(pkg)) return refuse("REVIEW_COPY", "this image carries the review banner: it can never be sent", "critical");
    if (pkg.template && !ctx.designApproved(pkg.template, pkg.assetManifest)) return refuse("DESIGN_NOT_APPROVED", `${pkg.template} is not approved`);
    const published = ctx.posts().find((p) => baseIdOf(p.package?.postId ?? "") === base && p.receipt);
    if (published) return refuse("ALREADY_PUBLISHED", published.receipt.canonicalUrl, "info");
    // 3. fingerprint + images
    const option = rec.options.find((o) => o.captionId === rec.resolution.captionId);
    if (!option) return refuse("CAPTION_MISSING", rec.resolution.captionId);
    const nowDigest = digestOf(publishBundleOf(pkg, { id: option.captionId, text: option.text }));
    if (nowDigest !== rec.resolution.approvedExactDigest) return refuse("FINGERPRINT_CHANGED", "the caption, images or evidence differ from what was approved", "critical");
    const media = mediaOf(pkg);
    if (pkg.kind === "nba-game" && media.length !== 2) return refuse("MEDIA_MISSING", "an NBA game post carries exactly two graphics");
    if (isImported(pkg) && (media.length < 1 || media.length > MAX_IMAGES)) return refuse("MEDIA_MISSING", `an imported post carries 1–${MAX_IMAGES} images; this one has ${media.length}`);
    if ((pkg.kind === "top5-daily" || pkg.kind === "top5-weekly") && (media.length < 1 || media.length > MAX_IMAGES || media.length !== (pkg.groups?.length ?? -1))) return refuse("MEDIA_MISSING", `a Top 5 post carries one image per board group (1–${MAX_IMAGES}); this one has ${media.length}`);
    for (const m of media) {
      const file = path.join(ctx.mediaDir, path.basename(m.file));
      if (!fs.existsSync(file)) return refuse("MEDIA_MISSING", m.file, "critical");
    }
    // 4. time window
    const now = Date.parse(clock());
    const start = startOf(pkg);
    if (!start || !Number.isFinite(Date.parse(start))) return refuse("NO_START_TIME", "no start time on record: the window can't be shown to be open");
    if (trigger === "schedule" && now < Date.parse(job.dueAt)) return { ok: false, state: "WAITING", code: "NOT_DUE", detail: job.dueAt };
    if (trigger === "founder-live-test" && now - Date.parse(job.dueAt) > LIVE_TEST_TTL_MS) return refuse("LIVE_TEST_EXPIRED", "a live test must run within 15 minutes of being asked for: ask again");
    // 5. fresh data + re-check against it
    const fresh = await ctx.refreshData();
    if (!fresh.ok) return refuse("DATA_NOT_REFRESHED", fresh.detail ?? "could not fetch the latest published data");
    const again = ctx.recheck(pkg);
    if (!again) return refuse("NO_RECHECK", `${pkg.kind} has no pre-publish re-check`);
    if (again.status !== "READY") return refuse("VERIFICATION_CHANGED", again.reasons.join("; "), "critical");
    // the data fetch can take a while: the window is checked again here, and the provider checks it once more
    // immediately before each request
    if (Date.parse(clock()) >= Date.parse(start)) return refuse("AFTER_START", `start ${start} passed while checking`);
    // 6. live requirements
    const pol = policy();
    if (live) {
      if (activeHost() !== thisHost) return refuse("OTHER_PUBLISHER_HOST", `live sending belongs to the ${activeHost()} publisher; this is the ${thisHost} one`, "critical");
      if (trigger === "schedule" && pol.mode !== "live") return refuse("LIVE_NOT_AUTHORIZED", "scheduled publishing is in dry-run mode");
      if (!(pol.capUsd > 0)) return refuse("SPEND_NOT_AUTHORIZED", "no monthly spend cap is authorized");
      const xs = ctx.oauth ? await ctx.oauth.status() : { connected: false };
      if (!xs.connected) return refuse("X_NOT_CONNECTED", "connect the X account");
      const missing = requiredScopes(media.length).filter((sc) => !(xs.scopes ?? []).includes(sc));
      if (missing.length) return refuse("X_SCOPE_MISSING", `the connected X account did not grant ${missing.join(", ")}: reconnect X and allow it (images can't be uploaded without media.write)`, "critical");
    }
    const provider = createXPublisher({ mode: live ? "live" : "dry-run", oauth: ctx.oauth, fetch: ctx.fetch, readMedia: (f) => fs.readFileSync(path.join(ctx.mediaDir, path.basename(f))), sendBefore: start, clock });
    const bundle = { text: option.text, media: media.map((m) => ({ file: path.basename(m.file), sha256: m.sha256 })) };
    const quote = provider.quoteCost(bundle);
    if (live && spentThisMonth() + quote.maxUsd > pol.capUsd) return refuse("SPEND_CAP_REACHED", `$${spentThisMonth().toFixed(3)} spent + $${quote.maxUsd} > $${pol.capUsd} cap`, "critical");
    // 7. once-only
    // judged on each earlier job's LATEST state: a reconciled "not posted" lifts the block, an unrecorded attempt doesn't
    const earlier = jobs().filter((j) => j.baseId === base && j.jobId !== job.jobId);
    const done = earlier.find((j) => j.status === "published") ?? earlier.find((j) => j.status === "unknown");
    if (live && done) return refuse(done.status === "published" ? "ALREADY_PUBLISHED" : "OUTCOME_UNKNOWN", done.status === "published" ? done.results.at(-1)?.canonicalUrl ?? done.jobId : "an earlier attempt's outcome is unknown: reconcile it first", done.status === "published" ? "info" : "critical");
    const attempt = of("publish-attempt").filter((e) => e.data.live && baseIdOf(e.data.postId) === base).length;
    const claimKey = live ? `xlive|${base}|${attempt}` : `xdry|${job.jobId}`;
    const claim = store.claim(claimKey, { jobId: job.jobId, at: clock() });
    if (!claim.won) return refuse("IN_FLIGHT", `attempt ${attempt} of ${base} was already started by ${claim.record.value.jobId}`, "critical");
    store.append("publish-attempt", "publisher", { jobId: job.jobId, postId: pkg.postId, live, trigger, attempt, claimKey, digest: nowDigest, dataFetched: fresh.detail ?? null, text: live ? option.text : null });
    // Durable before the request: a hosted (SQL) ledger buffers writes, so the claim and the attempt are committed now —
    // a crash after X answers can then never lead to a second send. A lost race here means another process has it.
    if (typeof store.flush === "function") {
      try { await store.flush(); } catch (err) {
        if (err.code === "CLAIM_CONFLICT") return { ok: false, state: "IN_FLIGHT", code: "IN_FLIGHT", detail: "another publisher process took this attempt" };
        throw err;
      }
    }

    try {
      const r = await provider.publish(bundle);
      if (r.state === "DRY_RUN") { const d = result(job, "DRY_RUN", { live: false, trigger, digest: nowDigest, requests: r.requests, wouldCostUsd: createXPublisher({ mode: "live", readMedia: () => Buffer.alloc(0) }).quoteCost(bundle).maxUsd }); await durable(); return d; }
      const receipt = {
        schema: "gtp.cc.publish-receipt@1", provider: "x-api", channel: "x", state: "PUBLISHED",
        decisionId: job.decisionId, commandId: rec.commandId, postId: pkg.postId, captionId: option.captionId, bundleDigest: nowDigest,
        canonicalUrl: r.canonicalUrl, handle: ctx.handle ?? null, providerPostId: r.providerPostId, publishedAt: clock(), costUsd: quote.maxUsd,
        warnings: [], verification: "posted by the X API; post id returned by X", approvedBy: rec.resolution.approvedBy, approvedAt: rec.resolution.approvedAt,
        recordedBy: "publisher", recordedAt: clock(), authentication: trigger === "schedule" ? `scheduled under ${pol.authorization}` : `live test requested by ${job.by ?? "unknown"}`,
      };
      // The result and the receipt are committed first, on their own (no claim can make this write fail); the claims
      // that index them follow in a second commit, where losing a race is harmless.
      const done2 = result(job, "PUBLISHED", { live: true, trigger, providerPostId: r.providerPostId, canonicalUrl: r.canonicalUrl, costUsd: quote.maxUsd });
      if (!store.readClaim?.(`publish|${job.decisionId}`)) store.append("publish-receipt", "publisher", receipt);
      await durable();
      store.claim(`publish|${job.decisionId}`, { receipt });
      store.claim(`xpost|${r.providerPostId}`, { decisionId: job.decisionId });
      await durable();
      return done2;
    } catch (err) {
      const e = err instanceof XPublishError ? err : new XPublishError("UNKNOWN", "PUBLISHER_ERROR", String(err.message ?? err).slice(0, 200));
      if (e.outcome === "NOT_SENT") {
        alert(job, "critical", e.code, e.detail);
        const f2 = result(job, "FAILED_NOT_SENT", { live, trigger, code: e.code, detail: e.detail, costUsd: live ? PRICE_FOR_UPLOADS(e.mediaIds) : 0 });
        await durable();
        return f2;
      }
      alert(job, "critical", "OUTCOME_UNKNOWN", `${e.code}: ${e.detail} — check X, then reconcile (never re-sent automatically)`);
      const u = result(job, "UNKNOWN", { live, trigger, code: e.code, detail: e.detail, costUsd: live ? quote.maxUsd : 0, text: option.text, attemptedAt: clock() });
      await durable();
      return u;
    }
  }

  /** Scheduler tick: every scheduled job that is due, oldest first. One tick at a time per process. */
  async function runDue() {
    if (running) return { ok: true, skipped: "a tick is already running" };
    // the inactive host leaves the schedule alone: no run, no result, no alert — its copies of the jobs stay "scheduled"
    // so the active host (or this one, after a hand-off) runs each exactly once
    if (activeHost() !== thisHost) return { ok: true, ran: [], skipped: `the ${activeHost()} publisher runs the schedule` };
    running = true;
    const out = [];
    try {
      const now = Date.parse(clock());
      for (const j of jobs().filter((x) => x.status === "scheduled" && Date.parse(x.dueAt) <= now).sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
        // a founder-queued job carries its own mode (a dry run stays a dry run; a live test is live); scheduled jobs
        // follow the publishing policy at the moment they run
        const r = await execute(j, j.manual ? { live: j.live === true, trigger: j.live ? "founder-live-test" : "founder-dry-run" } : { live: policy().mode === "live", trigger: "schedule" });
        out.push({ jobId: j.jobId, state: r.state, code: r.code ?? null });
      }
    } finally {
      running = false;
    }
    lastTickAt = clock();
    if (out.length) store.append("publish-tick", "publisher", { at: lastTickAt, ran: out, paused: paused(), mode: policy().mode });
    return { ok: true, ran: out };
  }

  /**
   * Founder: publish one approved post now. live: false → a dry run of the full gate; live: true → the one-off live
   * test (needs a spend cap and a connected account, but not scheduled-live mode).
   */
  async function publishNow({ decisionId, live = false }, actor) {
    const f = checkFounder(live ? "publish-live" : "publish", actor);
    if (!f.ok) return f;
    const rec = recordOf(decisionId);
    if (!rec) return { ok: false, code: "UNKNOWN_POST", detail: decisionId };
    const pkg = rec.package;
    const job = { jobId: shortId("pubjob", { decisionId, now: clock(), live, n: of("publish-job").length }), decisionId, postId: pkg.postId, baseId: baseIdOf(pkg.postId), title: pkg.title, sport: pkg.sport, dueAt: clock(), startUtc: startOf(pkg), by: actor.id ?? "founder", manual: true, live };
    store.append("publish-job", actor.id ?? "founder", job);
    return execute(job, { live, trigger: live ? "founder-live-test" : "founder-dry-run" });
  }

  /**
   * Hosted: the web app can't fetch fresh data or reach X, so a founder's "dry run now" / "live test" is queued as a
   * job due now; the publisher job (worker/run-publish.mjs) runs it through the same gate within minutes.
   */
  function queueNow({ decisionId, live = false }, actor) {
    const f = checkFounder(live ? "publish-live" : "publish", actor);
    if (!f.ok) return f;
    const rec = recordOf(decisionId);
    if (!rec) return { ok: false, code: "UNKNOWN_POST", detail: decisionId };
    if (rec.resolution?.verdict !== "approve" || rec.invalidated) return { ok: false, code: "NOT_APPROVED", detail: "only an approved, current post" };
    const pkg = rec.package;
    const job = { jobId: shortId("pubjob", { decisionId, now: clock(), live, n: of("publish-job").length }), decisionId, postId: pkg.postId, baseId: baseIdOf(pkg.postId), title: pkg.title, sport: pkg.sport, dueAt: clock(), startUtc: startOf(pkg), by: actor.id ?? "founder", manual: true, live };
    store.append("publish-job", actor.id ?? "founder", job);
    return { ok: true, queued: true, job };
  }
  /** Jobs due within the next `withinMs` (the hosted cron dispatches the publisher job when this is non-empty). */
  const dueSoon = (withinMs = 10 * 60_000) => (activeHost() !== thisHost ? [] : jobs()).filter((j) => j.status === "scheduled" && Date.parse(j.dueAt) <= Date.parse(clock()) + withinMs);

  /**
   * After an UNKNOWN outcome: the founder records the X link they found (or "not posted"), or asks the API to look
   * (live, costs reads). Clears the once-only block only for a confirmed "not posted".
   */
  async function reconcile({ jobId, url = null, notPosted = false, lookup = false }, actor) {
    const f = checkFounder("publish", actor);
    if (!f.ok) return f;
    const j = jobs().find((x) => x.jobId === jobId);
    if (!j || j.status !== "unknown") return { ok: false, code: "NOTHING_TO_RECONCILE", detail: j?.status ?? jobId };
    const last = j.results.at(-1);
    if (lookup) {
      // reads cost money too: within the cap, and recorded
      const pol = policy();
      const LOOKUP_MAX_USD = 0.06;
      if (!(pol.capUsd > 0) || spentThisMonth() + LOOKUP_MAX_USD > pol.capUsd) return { ok: false, code: "SPEND_NOT_AUTHORIZED", detail: "an API lookup costs up to $0.06 and needs room under the monthly cap — check X yourself and paste the link instead" };
      if (!last.text) return { ok: false, code: "NO_TEXT", detail: "the attempted caption isn't on record: check X yourself" };
      const p = createXPublisher({ mode: "live", oauth: ctx.oauth, fetch: ctx.fetch, readMedia: () => Buffer.alloc(0) });
      const r = await p.reconcile({ text: last.text, notBefore: last.attemptedAt });
      if (r.costUsd) store.append("publish-spend", actor.id ?? "founder", { jobId, reason: "reconcile lookup", costUsd: r.costUsd });
      if (!r.ok) return r;
      if (!r.found) return { ok: true, found: false, detail: "not among the account's 10 latest posts — check X, then record what you see" };
      url = r.canonicalUrl;
    }
    if (url) {
      const x = parseXPostUrl(url);
      if (!x.ok) return { ok: false, code: "BAD_X_LINK", detail: x.detail };
      const rec = recordOf(j.decisionId);
      const receipt = { schema: "gtp.cc.publish-receipt@1", provider: "x-api", channel: "x", state: "PUBLISHED", decisionId: j.decisionId, postId: j.postId, captionId: rec.resolution.captionId, bundleDigest: rec.resolution.approvedExactDigest, canonicalUrl: x.url, handle: x.handle, providerPostId: x.statusId, publishedAt: last.attemptedAt, costUsd: last.costUsd ?? 0, warnings: ["reconciled after an unknown outcome"], verification: lookup ? "found by the X API lookup" : "link recorded by the founder", recordedBy: actor.id ?? "founder", recordedAt: clock() };
      const once = store.claim(`publish|${j.decisionId}`, { receipt });
      if (once.won) store.append("publish-receipt", "founder", receipt);
      return result(j, "PUBLISHED", { live: true, trigger: "reconcile", providerPostId: x.statusId, canonicalUrl: x.url, costUsd: 0 });
    }
    if (notPosted) return result(j, "FAILED_NOT_SENT", { live: true, trigger: "reconcile", code: "CONFIRMED_NOT_POSTED", detail: `confirmed not on X by ${actor.id ?? "founder"}`, costUsd: 0 });
    return { ok: false, code: "INVALID_REQUEST", detail: "give the X link, notPosted: true, or lookup: true" };
  }

  function acknowledge({ alertId }, actor) {
    const f = checkFounder("pause", actor);
    if (!f.ok) return f;
    store.append("publish-alert-ack", actor.id ?? "founder", { alertId });
    return { ok: true };
  }

  /**
   * Founder, from the ACTIVE host only: hand live sending to the other host (cutover, or rollback). Refused while any
   * attempt's outcome is unknown or a live send is in progress, so nothing in flight is left between two hosts.
   */
  function setPublisherHost({ to, confirmation }, actor) {
    const f = checkFounder("publishing-policy", actor);
    if (!f.ok) return f;
    if (!PUBLISHER_HOSTS.includes(to) || to === thisHost) return { ok: false, code: "INVALID_REQUEST", detail: `hand off to the other host (${PUBLISHER_HOSTS.filter((h) => h !== thisHost).join("")})` };
    if (activeHost() !== thisHost) return { ok: false, code: "NOT_ACTIVE_HOST", detail: `live sending already belongs to the ${activeHost()} publisher` };
    if (String(confirmation ?? "").trim() !== handOffText(to)) return { ok: false, code: "AUTHORIZATION_TEXT", detail: `type exactly: ${handOffText(to)}` };
    const open = jobs().filter((j) => j.status === "unknown" || j.status === "sending");
    if (open.length || running) return { ok: false, code: "SEND_IN_PROGRESS", detail: open.length ? `reconcile first: ${open.map((j) => j.jobId).join(", ")}` : "a send is running: try again in a minute" };
    store.append("publisher-host", actor.id ?? "founder", { host: to, from: thisHost, generation: (hostRecord()?.data.generation ?? 0) + 1, by: actor.id ?? "founder", authentication: actor.authentication ?? null });
    return { ok: true, activeHost: to, detail: `this ${thisHost} publisher will no longer send live; the ${to} publisher sends once the ledger sync delivers this record` };
  }

  // ── daily queue preparation ───────────────────────────────────────────────────────────────────────────────
  /**
   * The founder's setting (append-only: the latest `queue-prep` record wins; none = off). When on, the ACTIVE publisher
   * host prepares today's content queue once per Eastern day at or after timeEt, through the same command the founder
   * types, as the scheduler actor. Like sending, only the active host does it, so the two hosts never both build;
   * the inactive host does nothing and records nothing.
   */
  const queuePrepSetting = () => {
    const d = of("queue-prep").at(-1)?.data;
    return { enabled: d?.enabled === true, timeEt: d?.timeEt ?? null };
  };
  const prepClaimKey = (date) => `queue-prep|${date}`;
  /** Founder (administrator): turn daily preparation on/off and set its Eastern time. Hosted: passkey step-up (publishing-policy). */
  function setQueuePrep({ enabled, timeEt } = {}, actor) {
    const f = checkFounder("publishing-policy", actor);
    if (!f.ok) return f;
    if (typeof enabled !== "boolean") return { ok: false, code: "INVALID_REQUEST", detail: "enabled must be true or false" };
    const time = timeEt === undefined || timeEt === null || timeEt === "" ? queuePrepSetting().timeEt : String(timeEt);
    if ((enabled || time !== null) && !TIME_ET.test(time ?? "")) return { ok: false, code: "INVALID_TIME", detail: "give the time as HH:MM, 24-hour, US Eastern (e.g. 09:30)" };
    store.append("queue-prep", actor.id ?? "founder", { enabled, timeEt: time, by: actor.id ?? "founder", authentication: actor.authentication ?? null });
    const activeHere = activeHost() === thisHost;
    return { ok: true, enabled, timeEt: time, activeHere, ...(activeHere ? {} : { detail: `the ${activeHost()} publisher prepares the queue; this ${thisHost} copy only records the setting` }) };
  }
  /** A build that refused or failed: a refusal, a refused/failed task, or a failed job under its command. */
  function failureOf(commandId) {
    if (!commandId) return null;
    const e = entries().find((x) => x.data?.commandId === commandId && (x.kind === "refusal" || (x.kind === "task" && ["FAILED", "REFUSED"].includes(x.data.status)) || (x.kind === "job" && x.data.status === "failed")));
    return e ? { code: e.data.code ?? (e.kind === "job" ? "JOB_FAILED" : e.data.status), detail: e.data.detail ?? e.data.error ?? null } : null;
  }
  let preparing = false;
  /**
   * Scheduler tick (Mac: the 30 s tick; hosted: the cron). Prepares today's queue when: the setting is on, this is the
   * active publisher host, nothing is paused, the Eastern time is at or past timeEt, and today's claim
   * `queue-prep|<ET date>` is still free. The claim is taken first (first writer wins), so there is ONE automatic
   * attempt per Eastern day, however many ticks or processes run; a failure raises an alert and is not retried (the
   * founder re-runs it by typing the command).
   */
  async function prepDue() {
    const s = queuePrepSetting();
    if (!s.enabled || !TIME_ET.test(s.timeEt ?? "")) return { ok: true, skipped: "off" };
    if (activeHost() !== thisHost) return { ok: true, skipped: `the ${activeHost()} publisher prepares the queue` };
    if (paused()) return { ok: true, skipped: "paused" };
    const now = clock();
    const { date, time } = etParts(now);
    if (time < s.timeEt) return { ok: true, skipped: "not yet", next: etInstant(date, s.timeEt) };
    if (preparing || store.readClaim?.(prepClaimKey(date))) return { ok: true, skipped: "already prepared today" };
    if (typeof ctx.prepareQueue !== "function") return { ok: true, skipped: "no queue builder on this host" };
    const claim = store.claim(prepClaimKey(date), { host: thisHost, at: now });
    if (!claim.won) return { ok: true, skipped: "already prepared today" };
    preparing = true;
    try {
      let r;
      try { r = await ctx.prepareQueue(DAILY_QUEUE_COMMAND, SCHEDULER_ACTOR); } catch (err) { r = { ok: false, code: "PREP_ERROR", detail: String(err?.message ?? err).slice(0, 300) }; }
      r = r ?? { ok: false, code: "PREP_ERROR", detail: "no result" };
      const failure = r.ok ? failureOf(r.commandId) : { code: r.code ?? "PREP_ERROR", detail: r.detail ?? null };
      const ok = Boolean(r.ok) && !failure;
      const run = { date, timeEt: s.timeEt, host: thisHost, commandId: r.commandId ?? null, ok, duplicate: r.duplicate === true, code: failure?.code ?? null, detail: failure?.detail ?? null };
      store.append("queue-prep-run", SCHEDULER_ACTOR.id, run);
      if (!ok) {
        store.append("publish-alert", SCHEDULER_ACTOR.id, {
          alertId: shortId("alert", { queuePrep: date, at: clock() }), jobId: null, postId: null, source: "queue-prep", severity: "warning", code: "QUEUE_PREP_FAILED",
          detail: `today's content queue (${date}) was not prepared automatically — ${run.code}${run.detail ? `: ${run.detail}` : ""}. It is not retried today: type "${DAILY_QUEUE_COMMAND}" to run it yourself.`,
        });
      }
      return { ok, ran: true, ...run };
    } finally {
      preparing = false;
    }
  }
  function queuePrepState() {
    const s = queuePrepSetting();
    const activeHere = activeHost() === thisHost;
    const last = of("queue-prep-run").at(-1) ?? null;
    // a hosted build runs later as a job: its failure is folded in when it is recorded
    const lastRun = last ? { date: last.data.date, at: last.at, commandId: last.data.commandId ?? null, ok: Boolean(last.data.ok) && !failureOf(last.data.commandId) } : null;
    let next = null;
    if (s.enabled && activeHere && TIME_ET.test(s.timeEt ?? "")) {
      const today = etParts(clock()).date;
      next = etInstant(store.readClaim?.(prepClaimKey(today)) ? addDays(today, 1) : today, s.timeEt);
    }
    return { enabled: s.enabled, timeEt: s.timeEt, activeHere, lastRun, next };
  }

  async function state() {
    const acked = new Set(of("publish-alert-ack").map((e) => e.data.alertId));
    return {
      publisherHost: { self: thisHost, active: activeHost(), generation: hostRecord()?.data.generation ?? 0 },
      mode: policy().mode, capUsd: policy().capUsd ?? 0, authorization: policy().authorization ?? null,
      paused: paused(), publishingPaused: publishingPaused(), spentThisMonthUsd: Number(spentThisMonth().toFixed(4)),
      x: ctx.oauth ? await ctx.oauth.status() : { clientConfigured: false, connected: false },
      lastTick: lastTickAt ?? of("publish-tick").at(-1)?.at ?? null, schedulerIntervalSec: 30,
      jobs: jobs().reverse().slice(0, 100),
      alerts: of("publish-alert").filter((e) => !acked.has(e.data.alertId)).map((e) => ({ ...e.data, at: e.at })).reverse().slice(0, 50),
      queuePrep: queuePrepState(),
    };
  }

  return { setPaused, setPolicy, setPublisherHost, setQueuePrep, prepDue, schedule, cancel, cancelQueuedBy, runDue, publishNow, queueNow, dueSoon, reconcile, acknowledge, jobs, policy, state, execute };
}

/** A NOT_SENT failure after some images uploaded still spent those uploads. */
const PRICE_FOR_UPLOADS = (ids) => Number((0.015 * (ids?.length ?? 0)).toFixed(4));
