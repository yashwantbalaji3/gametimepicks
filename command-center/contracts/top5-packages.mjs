/**
 * TOP 5 POST PACKAGES — an official Top Board model (recap/top5-boards.mjs) → ONE consolidated post per sport per daily
 * slate (`top5-daily`) or per NFL week (`top5-weekly`). Pure: no clock, no network (the caller passes `now`).
 *
 * Identity (stable, never time-based):
 *   weekly  top5-week|NFL|<season>-W<WW>|v<n>      e.g. top5-week|NFL|2026-W08|v1
 *   daily   top5-day|<SPORT>|<YYYY-MM-DD>|v<n>     e.g. top5-day|NBA|2026-11-02|v1
 * The base (without |v<n>) is the post: de-duplication, supersession, "already decided", the one live approval and
 * the publisher's once-only send claim (`xlive|<base>|<attempt>`) all key on it, so a week is sent at most once
 * whatever its version. The version is derived from the ledger: the same shown content (contentKey + template) keeps
 * its version on every rebuild and on every ledger copy; different content gets the next number. Never a clock.
 *
 * Format (founder decision pending, see docs/top5-social-boards-2026-10-29.md): one X post with up to 4 images, one
 * market per image, in a fixed priority order. More published markets than images are recorded as not shown and the
 * caption says "N of M boards" — nothing is dropped silently.
 */
import { POST_STATUS } from "./post-queue.mjs";
import { baseIdOf } from "./social-packages.mjs";
import { publishAtFor, etShort } from "../recap/top5-boards.mjs";
import { MAX_IMAGES } from "../publishers/x-api.mjs";

export const TOP5_KINDS = Object.freeze(["top5-daily", "top5-weekly"]);
export const isTop5 = (pkg) => TOP5_KINDS.includes(pkg?.kind);
/**
 * X allows at most 4 images on one post (X API v2 Create Post: `media.media_ids`, 1–4 items —
 * https://docs.x.com/x-api/posts/create-post; our publisher enforces it as publishers/x-api.mjs MAX_IMAGES).
 */
export const X_MAX_IMAGES = MAX_IMAGES;
const EMOJI = { NFL: "🏈", NBA: "🏀", MLB: "⚾", UFC: "🥊", EPL: "⚽", LIGUE1: "⚽" };
export const BRAND_LINE = "Know More Before Game Time.";

export const top5BaseId = (model) => (model.scope === "week" ? `top5-week|${model.sport}|${model.period}` : `top5-day|${model.sport}|${model.date}`);
export const top5PostId = (base, version) => `${base}|v${version}`;
export const versionOf = (postId) => Number(String(postId).match(/\|v(\d+)$/)?.[1] ?? 0);

/**
 * The version for this content: the version an earlier package of the same base with the same content key and template
 * already has, else one more than the highest. `priors` are packages from the ledger (any order).
 */
export function assignVersion(base, { contentKey, template }, priors) {
  const mine = priors.filter((p) => baseIdOf(p.postId) === base);
  const same = mine.find((p) => p.contentKey === contentKey && p.template === template);
  if (same) return versionOf(same.postId);
  return Math.max(0, ...mine.map((p) => versionOf(p.postId))) + 1;
}

/**
 * Markets → images: deterministic (priority, then market id), one market per image, at most `maxImages` images.
 * Markets beyond the limit are returned as notShown and must be stated (caption + coverage), never dropped silently.
 */
export function groupMarkets(markets, maxImages = X_MAX_IMAGES) {
  const ordered = [...markets].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || String(a.market).localeCompare(String(b.market)));
  return { groups: ordered.slice(0, maxImages).map((m) => [m]), shown: ordered.slice(0, maxImages), notShown: ordered.slice(maxImages) };
}

const claim = (key, display, evidenceRef) => ({ key, display: String(display), evidenceRef });
const lower1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Captions: the period, the markets shown, the #1 of each (grounded), a question, the brand line. No odds, no bet words. */
export function top5Captions(model, shown, totalPublished) {
  const e = EMOJI[model.sport] ?? "📊";
  const when = model.scope === "week" ? `${model.sport} ${model.weekLabel}` : `${model.sportName ?? model.sport} ${model.slateLine}`;
  const scope = model.scope === "week" && model.coverage?.complete ? ` across all ${model.coverage.eventsInWeek} games` : "";
  const partial = shown.length < totalPublished ? ` (${shown.length} of ${totalPublished} boards shown)` : "";
  const tops = shown.map((m) => `${lower1(m.short)}: ${m.rows[0].name} ${m.rows[0].display}`);
  const names = shown.map((m) => m.short);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  const q = model.scope === "week" ? "Who climbs the board this week?" : "Who's on your radar tonight?";
  const a = [`${e} ${when} Top 5 boards: our model's projections${scope}${partial}.`, "", ...tops.map((t) => `#1 ${t}`), "", `${q} ${BRAND_LINE}`].join("\n");
  const b = `Our ${when} Top 5 projections are in: ${list}${partial}. Which name surprises you most? ${BRAND_LINE}`;
  return [{ id: "A", tone: "highlights", source: "template", text: a }, { id: "B", tone: "short", source: "template", text: b }];
}

/**
 * The package (without media, without version): kind, schedule, claims, captions, evidence, coverage, status.
 * @param {{ model: object, leadMin: number, now: string, extra: { template, assetManifest, dataCommit, label } }} a
 */
export function top5Draft({ model, leadMin, now, extra }) {
  const weekly = model.scope === "week";
  const base = top5BaseId(model);
  const { groups, shown, notShown } = groupMarkets(model.markets);
  const totalPublished = model.markets.length;
  const ev = model.evidence.map((x) => ({ label: x.label, ref: `${x.path}@${x.commit ? x.commit.slice(0, 12) : "working tree"}`, sha256: x.sha256, path: x.path, commit: x.commit }));
  const boardRef = ev.at(-1)?.ref ?? null;
  const claims = [
    claim("format", "Top 5", "contracts/top5-packages.mjs"),
    claim("period", weekly ? model.weekLabel : model.slateLine, boardRef),
    ...(weekly ? [claim("games", `${model.coverage.eventsInWeek} games`, ev[0]?.ref ?? null)] : []),
    claim("boards", `${shown.length} of ${totalPublished} boards`, boardRef),
    ...shown.flatMap((m) => m.rows.map((r) => claim(`${m.market}.${r.rank}`, `${r.rank}. ${r.name} ${r.team} ${r.display}`, boardRef))),
  ];
  const suggestedPublishAt = model.firstStartUtc ? publishAtFor(model.firstStartUtc, leadMin) : null;
  const reasons = [...model.reasons];
  let status = model.status;
  if (!model.firstStartUtc) { status = POST_STATUS.BLOCKED; reasons.push("no first start time: the schedule can't be computed"); }
  else if (Date.parse(now) >= Date.parse(model.firstStartUtc)) { status = POST_STATUS.BLOCKED; reasons.push(`the first game (${model.firstGame?.name ?? model.firstGame?.eventId ?? ""} ${model.firstStartUtc}) has started: no pregame board after the start`); }
  if (notShown.length) reasons.push(`image limit: ${notShown.map((m) => m.title).join(", ")} not shown (X allows ${X_MAX_IMAGES} images); the caption says ${shown.length} of ${totalPublished}`);
  const coverage = { ...model.coverage, marketsShown: shown.map((m) => m.market), marketsNotShown: notShown.map((m) => m.market), unavailable: model.unavailable };
  return {
    kind: weekly ? "top5-weekly" : "top5-daily", format: weekly ? "top5-weekly" : "top5-daily", baseId: base, sport: model.sport, date: model.date ?? null,
    title: weekly ? `${model.sport} ${model.weekLabel} · Weekly Top 5 (${shown.length} boards, whole week)` : `${model.sportName ?? model.sport} ${model.slateLine} · Daily Top 5 (${shown.length} boards)`,
    queueLabel: weekly ? `WEEKLY TOP 5 · ${model.sport} ${model.weekLabel}` : `DAILY TOP 5 · ${model.sport} ${model.date}`,
    priority: 0, slotId: weekly ? "standing:top5-weekly" : `standing:top5-daily-${model.sport.toLowerCase()}`,
    template: extra.template, assetManifest: extra.assetManifest, dataCommit: extra.dataCommit, label: extra.label,
    period: model.period, season: model.season ?? null, weekLabel: model.weekLabel ?? null,
    firstStartUtc: model.firstStartUtc, firstKickoffUtc: model.firstStartUtc, firstGame: model.firstGame, events: model.events,
    suggestedPublishAt,
    schedule: { rule: weekly ? "lead before the first game of the NFL week" : "lead before the earliest eligible game of the sport's daily slate", leadMin, firstStartUtc: model.firstStartUtc, firstStartEt: model.firstStartUtc ? etShort(model.firstStartUtc) : null, publishAt: suggestedPublishAt, publishAtEt: suggestedPublishAt ? etShort(suggestedPublishAt) : null },
    markets: shown.map(({ source, questionable, ...m }) => m), groups: groups.map((g) => g.map((m) => m.market)), coverage,
    contentKey: model.contentKey, boardSha256: model.evidence.at(-1)?.sha256 ?? null, boardPath: model.evidence.at(-1)?.path ?? null,
    evidence: ev, status, reasons, claims, captions: top5Captions(model, shown, totalPublished),
    // the immutable record of what appears: every row of every shown market, as published
    appeared: shown.map((m) => ({ market: m.market, method: m.methodId, qualification: m.qualification ?? null, publishedTopN: m.publishedTopN, rows: m.rows.map((r) => ({ rank: r.rank, playerId: r.playerId, name: r.name, team: r.team, eventId: r.eventId, display: r.display })) })),
  };
}

/** Finish a draft: its stable id (version from the ledger) and its images (in order; ≤ X_MAX_IMAGES). */
export function top5Finish(draft, { version, media = null }) {
  if (media && (media.length < 1 || media.length > X_MAX_IMAGES)) throw new Error(`${media.length} images: an X post carries 1–${X_MAX_IMAGES}`);
  const postId = top5PostId(draft.baseId, version);
  return { ...draft, postId, packageId: postId, version, media: media?.[0] ? { ...media[0], kind: "graphic" } : null, mediaSet: media ?? null };
}
