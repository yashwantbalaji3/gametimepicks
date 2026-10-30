/**
 * THE CONTENT RHYTHM (founder 2026-10-30): a proposed calendar for imported posts. Pure: it only proposes times.
 * Approving the plan schedules nothing; each post still needs its own approval and its own Schedule click.
 *
 *   the recap goes two hours before the first game of that sport's next slate, then, spaced out:
 *   1 previous-slate recap · 2 full schedule and winners roundup · 3 Top 5 · 4 featured winners · 5 player graphics ·
 *   6 live updates. Slates and days are America/New_York; instants are UTC, so DST never moves a game.
 */
import { digestOf } from "../lib/util.mjs";
import { IMPORT_TYPES, isImported } from "./imported-packages.mjs";

export const RECAP_LEAD_MS = 2 * 3600_000;
/** Not all at once: at least this long between two posts of the account, and at most this many per sport per slate. */
export const MIN_GAP_MS = 20 * 60_000;
export const MAX_PER_SLATE = 6;
/** A post goes out at least this long before its own start. */
export const BEFORE_START_MS = 15 * 60_000;
const SOON_MS = 5 * 60_000;

const anchorOf = (p) => p.package.imported?.recommendation?.firstGameUtc ?? p.package.firstStartUtc ?? p.package.tipUtc;
const ms = (t) => Date.parse(t ?? "");
const etDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** Open imported posts that could still go out: not blocked, not decided against, not already sent. */
export const plannable = (posts, now) => posts.filter((p) => isImported(p.package) && p.package.status === "READY" && !p.receipt && !p.archived
  && (p.lifecycle === "drafted" || p.lifecycle === "approved" || p.lifecycle === "scheduled") && ms(p.package.tipUtc) > ms(now));

/**
 * @returns {{ slates: object[], items: object[], unslotted: object[], digest: string }} items: { decisionId, postId, title, tier, at }
 */
export function proposePlan(posts, now, { jobs = [] } = {}) {
  const groups = new Map();
  for (const p of plannable(posts, now)) {
    const a = anchorOf(p);
    if (!Number.isFinite(ms(a))) continue;
    const key = `${p.package.sport}|${etDate(a)}`;
    if (!groups.has(key)) groups.set(key, { sport: p.package.sport, slate: etDate(a), firstStartUtc: a, posts: [] });
    const g = groups.get(key);
    if (ms(a) < ms(g.firstStartUtc)) g.firstStartUtc = a;
    g.posts.push(p);
  }
  const taken = jobs.filter((j) => j.status === "scheduled").map((j) => ms(j.dueAt));
  const free = (t) => !taken.some((x) => Math.abs(x - t) < MIN_GAP_MS);
  const items = [], unslotted = [];
  const tierOf = (p) => Object.values(IMPORT_TYPES).find((t) => t.kind === p.package.kind)?.tier ?? 9;
  // the founder's order within Top 5: points, rebounds, assists
  const boardRank = (p) => { const i = ["pts", "reb", "ast"].indexOf(String(p.package.imported?.variant ?? "").replace(/-model$/, "")); return i < 0 ? 9 : i; };
  for (const g of [...groups.values()].sort((a, b) => ms(a.firstStartUtc) - ms(b.firstStartUtc))) {
    const ordered = [...g.posts].sort((a, b) => tierOf(a) - tierOf(b) || boardRank(a) - boardRank(b) || ms(a.package.tipUtc) - ms(b.package.tipUtc) || a.postId.localeCompare(b.postId));
    let t = Math.max(ms(g.firstStartUtc) - RECAP_LEAD_MS, ms(now) + SOON_MS);
    let n = 0;
    for (const p of ordered) {
      const row = { decisionId: p.decisionId, postId: p.postId, title: p.package.title, sport: g.sport, slate: g.slate, tier: tierOf(p) };
      if (n >= MAX_PER_SLATE) { unslotted.push({ ...row, reason: `at most ${MAX_PER_SLATE} posts per slate, so the account isn't flooded` }); continue; }
      while (!free(t)) t += MIN_GAP_MS;
      if (t > ms(p.package.tipUtc) - BEFORE_START_MS) { unslotted.push({ ...row, reason: "no slot left before its start" }); continue; }
      items.push({ ...row, at: new Date(t).toISOString() });
      taken.push(t);
      t += MIN_GAP_MS;
      n += 1;
    }
  }
  const slates = [...groups.values()].map((g) => ({ sport: g.sport, slate: g.slate, firstStartUtc: g.firstStartUtc, posts: g.posts.length }));
  return { slates, items, unslotted, digest: digestOf(items.map((i) => [i.decisionId, i.at])) };
}
