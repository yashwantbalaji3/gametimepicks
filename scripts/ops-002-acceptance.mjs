/**
 * OPS-002 — seven-day acceptance verdict (pure; no I/O). Used by scripts/ops-002-identity-report.mjs and
 * pinned by app/src/lib/ops/ops-002-acceptance.test.mjs.
 *
 * "Zero TEAM_ACCESS_REQUIRED" is NOT acceptance on its own: it is also what you see when no bot commit
 * deployed at all, or when Production silently stopped updating. PASS therefore requires positive
 * evidence on every axis; absence of evidence is NOT_YET or STALE, never PASS.
 *
 *   FAIL     (exit 2) a TEAM_ACCESS_REQUIRED block, or a post-cutover automated data deployment
 *                     attributed to anything other than github-actions[bot] / type bot.
 *   STALE    (exit 4) Production freshness not positively verified: the live build-info is not the newest
 *                     READY deployment, main's head has no deployment, a post-READY deployment errored or
 *                     was blocked, or one has been pending longer than `maxLagMin`.
 *   NOT_YET  (exit 3) no cutover, < `requiredDays` observed, or a 24-hour slot of the window has no READY
 *                     github-actions[bot] data deployment (nothing was actually exercised that day).
 *   PASS     (exit 0) none of the above.
 * Precedence: FAIL > STALE > NOT_YET > PASS.
 */
export const BOT_LOGIN = "github-actions[bot]";
export const BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";
export const EXIT = { PASS: 0, FAIL: 2, NOT_YET: 3, STALE: 4 };

const DAY = 86_400_000;
const PENDING = new Set(["QUEUED", "BUILDING", "INITIALIZING"]);

/** Vercel `/v6/deployments` row → the fields the verdict reads. */
export function normalize(d) {
  return {
    uid: d.uid,
    created: d.created,
    readyState: d.readyState,
    errorMessage: d.errorMessage ?? "",
    blockCode: d.seatBlock?.blockCode ?? null,
    gitLogin: d.attribution?.gitUser?.login ?? null,
    gitType: d.attribution?.gitUser?.type ?? null,
    authorEmail: d.meta?.githubCommitAuthorEmail ?? null,
    message: d.meta?.githubCommitMessage ?? "",
    sha: d.meta?.githubCommitSha ?? null,
  };
}

export const isDataCommit = (d) => /^auto[:\- ]/.test(d.message);
export const isBotIdentity = (d) => d.gitLogin === BOT_LOGIN && d.gitType === "bot" && d.authorEmail === BOT_EMAIL;
export const isIgnoredSkip = (d) => d.readyState === "CANCELED" && /Ignored Build Step/i.test(d.errorMessage);

/**
 * @param {object} a
 * @param {ReturnType<typeof normalize>[]} a.deployments production deployments, any order
 * @param {number|null} a.cutover ms — first post-merge data commit authored as github-actions[bot]
 * @param {number} a.now ms
 * @param {string|null} a.buildInfoSha commit the live site says it was built from (null = could not read)
 * @param {string|null} a.mainSha origin/main head (null = could not read)
 */
export function acceptanceVerdict({ deployments, cutover, now, buildInfoSha, mainSha, requiredDays = 7, maxLagMin = 30 }) {
  const deps = [...deployments].sort((x, y) => x.created - y.created);
  const fail = [], stale = [], notYet = [];

  // ── authorization / identity ──────────────────────────────────────────────────────────────────
  const blocks = deps.filter((d) => d.blockCode === "TEAM_ACCESS_REQUIRED" && (cutover === null || d.created >= cutover));
  for (const d of blocks) fail.push(`TEAM_ACCESS_REQUIRED ${d.uid} (${d.gitLogin}) ${d.message.slice(0, 50)}`);
  const post = cutover === null ? [] : deps.filter((d) => d.created >= cutover && isDataCommit(d));
  for (const d of post.filter((d) => !isBotIdentity(d))) fail.push(`data commit as ${d.gitLogin}/${d.gitType} <${d.authorEmail}> ${d.uid}`);

  // ── freshness (current state, positively verified) ────────────────────────────────────────────
  const ready = deps.filter((d) => d.readyState === "READY");
  const lastReady = ready.at(-1) ?? null;
  if (!lastReady) stale.push("no READY production deployment in the window");
  if (buildInfoSha === null) stale.push("could not read Production build-info");
  else if (lastReady && buildInfoSha !== lastReady.sha) stale.push(`Production serves ${buildInfoSha?.slice(0, 10)}, newest READY is ${lastReady.sha?.slice(0, 10)}`);
  if (mainSha === null) stale.push("could not read origin/main");
  else if (!deps.some((d) => d.sha === mainSha)) stale.push(`main head ${mainSha.slice(0, 10)} has no Vercel deployment`);
  if (lastReady) {
    const tail = deps.filter((d) => d.created > lastReady.created);
    for (const [i, d] of tail.entries()) {
      if (d.readyState === "ERROR" || d.readyState === "BLOCKED") stale.push(`${d.readyState} after the newest READY: ${d.uid}`);
      else if (PENDING.has(d.readyState) && now - d.created > maxLagMin * 60_000) stale.push(`${d.uid} pending ${Math.round((now - d.created) / 60_000)} min (> ${maxLagMin})`);
      else if (d.readyState === "CANCELED" && !isIgnoredSkip(d) && i === tail.length - 1) stale.push(`newest deployment ${d.uid} canceled (not an ignored-build skip) with nothing after it`);
    }
  }

  // ── sufficiency (the window actually exercised the fix) ───────────────────────────────────────
  let observedDays = 0;
  const perDay = [];
  if (cutover === null) notYet.push("no cutover recorded (first post-merge github-actions[bot] data commit)");
  else {
    observedDays = (now - cutover) / DAY;
    if (observedDays < requiredDays) notYet.push(`observed ${observedDays.toFixed(1)} of ${requiredDays} days`);
    for (let i = 0; i < Math.floor(observedDays); i++) {
      const lo = cutover + i * DAY, hi = lo + DAY;
      const n = post.filter((d) => d.created >= lo && d.created < hi && d.readyState === "READY" && isBotIdentity(d)).length;
      perDay.push(n);
      if (n === 0) notYet.push(`day ${i + 1} has no READY github-actions[bot] data deployment`);
    }
    if (post.filter((d) => d.readyState === "READY" && isBotIdentity(d)).length === 0) notYet.push("no READY github-actions[bot] data deployment since cutover");
  }

  const verdict = fail.length ? "FAIL" : stale.length ? "STALE" : notYet.length ? "NOT_YET" : "PASS";
  return {
    verdict,
    exit: EXIT[verdict],
    reasons: { fail, stale, notYet },
    evidence: {
      observedDays: Number(observedDays.toFixed(2)),
      postCutoverDataDeployments: post.length,
      postCutoverReadyAsBot: post.filter((d) => d.readyState === "READY" && isBotIdentity(d)).length,
      readyAsBotPerDay: perDay,
      lastReadySha: lastReady?.sha ?? null,
    },
  };
}
