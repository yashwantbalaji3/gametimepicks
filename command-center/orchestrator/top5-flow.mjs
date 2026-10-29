/**
 * TOP 5 IN THE DAILY QUEUE — called by queueBuild (team-flow "daily-queue" → queue-flow build) and by the publish
 * gate's re-check. Builds ONE consolidated Top 5 package per daily sport that has an official published Top Board for
 * the queue's date (NBA, MLB, UFC, EPL, Ligue 1), and ONE weekly package for the NFL week the date belongs to.
 * Everything that isn't built is recorded with its reason (UNAVAILABLE / held), never invented.
 *
 * Re-check (approval, "Check before posting", and the publish gate right before sending): the post is held when the
 * first game has started, when the official board's shown content (rows, values, order, market set, coverage) is no
 * longer what was approved, when the first start (and so the schedule) moved, or when a shown row became ineligible.
 */
import fs from "node:fs";
import path from "node:path";
import { POST_STATUS } from "../contracts/post-queue.mjs";
import { top5Draft, top5Finish, assignVersion, isTop5 } from "../contracts/top5-packages.mjs";
import { nflWeekTop5, dailyTop5, leadMinutes, DAILY_SPORTS, publishAtFor } from "../recap/top5-boards.mjs";
import { renderTop5Set, TOP5_TEMPLATE, TOP5_ASSET_MANIFEST } from "../render/social-top5.mjs";

const fileSafe = (id) => String(id).replace(/[^A-Za-z0-9._-]+/g, "-");

/** The model a package was built from, read again from `src` (same scope, same period). */
export function top5ModelFor(pkg, src) {
  if (pkg.kind === "top5-weekly") {
    // the week is found by its own first game's ET date, so a later queue date can't pick a different week
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(pkg.firstStartUtc));
    const m = nflWeekTop5({ src, date });
    return m.period === pkg.period ? m : { ok: false, reason: m.ok ? `the schedule now puts ${m.period} first, not ${pkg.period}` : m.reason };
  }
  return dailyTop5({ src, sport: pkg.sport, date: pkg.date });
}

/** Re-check against the current data: READY, or held with reasons. */
export function recheckTop5(pkg, { src, now, env = {} }) {
  if (!isTop5(pkg)) return null;
  if (!Number.isFinite(Date.parse(pkg.firstStartUtc)) || Date.parse(now) >= Date.parse(pkg.firstStartUtc)) return { status: POST_STATUS.BLOCKED, reasons: ["the first game has started (or its start is unknown): no pregame board after the start"] };
  const m = top5ModelFor(pkg, src);
  if (!m.ok) return { status: POST_STATUS.BLOCKED, reasons: [`the official board is not available any more: ${m.reason}`] };
  const reasons = [];
  if (m.status === POST_STATUS.BLOCKED) reasons.push(...m.reasons);
  if (m.contentKey !== pkg.contentKey) reasons.push("the official published board changed since this draft (rows, values, order, markets or coverage)");
  if (m.firstStartUtc !== pkg.firstStartUtc) reasons.push(`the first game moved (${pkg.firstStartUtc} → ${m.firstStartUtc}): the schedule changed`);
  else if (publishAtFor(m.firstStartUtc, pkg.schedule.leadMin) !== pkg.suggestedPublishAt) reasons.push("the scheduled publishing time no longer matches its rule");
  if (reasons.length) return { status: POST_STATUS.BLOCKED, reasons: [...reasons, "rebuild the queue and approve the new version"] };
  return { status: m.status, reasons: m.status === POST_STATUS.READY ? [] : m.reasons, boardSha256: m.evidence.at(-1)?.sha256 ?? null };
}

/**
 * @param {{ src, date, now, env, priors: object[], render: boolean, mediaDir: string, labelOf: (sport) => object, sports?: string[] }} a
 * @returns {{ packages: object[], skips: object[] }}
 */
export async function buildTop5({ src, date, now, env = {}, priors, render, mediaDir, labelOf, sports = Object.keys(DAILY_SPORTS) }) {
  const lead = leadMinutes(env);
  const packages = [];
  const skips = [];
  const skip = (sport, what, reason, status = POST_STATUS.BLOCKED) => skips.push({ slotId: `standing:top5-${sport.toLowerCase()}`, sport, format: what, opportunity: what, status, reason });
  const labelFor = (sport) => { try { return labelOf(sport); } catch { return null; } };
  const finish = async (model, leadMin) => {
    const extra = { template: TOP5_TEMPLATE, assetManifest: TOP5_ASSET_MANIFEST, dataCommit: src.commit ?? null, label: labelFor(model.sport) ?? { sport: model.sport, retiredPhrases: labelFor("NFL")?.retiredPhrases ?? [] } };
    const draft = top5Draft({ model, leadMin, now, extra });
    const version = assignVersion(draft.baseId, { contentKey: draft.contentKey, template: draft.template }, priors);
    let media = null;
    if (render && draft.status !== POST_STATUS.BLOCKED) {
      media = await renderTop5Set(model, draft.groups.map((g) => g.map((id) => model.markets.find((m) => m.market === id))), { outDir: mediaDir, fileBase: fileSafe(`${draft.baseId}-v${version}`) });
    }
    const pkg = top5Finish(draft, { version, media });
    return media ? { ...pkg, media: { ...pkg.media, altText: media[0].altText } } : pkg;
  };

  // NFL: one weekly post
  const w = nflWeekTop5({ src, date });
  if (!w.ok) skip("NFL", "Weekly Top 5", `${w.notReady ? "held (boards not ready)" : "none"}: ${w.reason}`, w.notReady ? POST_STATUS.VERIFY : POST_STATUS.BLOCKED);
  else {
    for (const u of w.unavailable) skip("NFL", `Weekly Top 5 · ${u.market}`, `UNAVAILABLE: ${u.reason}`, POST_STATUS.BLOCKED);
    if (!w.markets.length) skip("NFL", "Weekly Top 5", `held: ${w.reasons.join("; ")}`);
    else {
      try { packages.push(await finish(w, lead.weekly)); } catch (err) { skip("NFL", "Weekly Top 5", `could not build — ${String(err.message ?? err).slice(0, 200)}`); }
    }
  }
  // Daily sports: one post each, only from an official board
  for (const sport of sports) {
    const d = dailyTop5({ src, sport, date });
    if (!d.ok) { skip(sport, `Daily Top 5 (${sport})`, `UNAVAILABLE: ${d.reason}`, POST_STATUS.BLOCKED); continue; }
    for (const u of d.unavailable) skip(sport, `Daily Top 5 · ${u.market}`, `UNAVAILABLE: ${u.reason}`);
    if (!d.markets.length) { skip(sport, `Daily Top 5 (${sport})`, `held: ${d.reasons.join("; ")}`); continue; }
    try { packages.push(await finish(d, lead.daily)); } catch (err) { skip(sport, `Daily Top 5 (${sport})`, `could not build — ${String(err.message ?? err).slice(0, 200)}`); }
  }
  return { packages, skips };
}

/** The media directory must hold every image a package names (used by tests and the gate). */
export const top5MediaPresent = (pkg, mediaDir) => (pkg.mediaSet ?? []).every((m) => fs.existsSync(path.join(mediaDir, path.basename(m.file))));
