#!/usr/bin/env node
/**
 * Results V2 · cross-sport social feed (B-5) — INTERNAL drafts, never posted, $0.
 *
 *   npx tsx scripts/results/build-results-social-feed.mjs --date 2026-09-27 [--write]
 *
 * Reads the V2 read models (the same ones /results renders) and hands their numbers to the pure builder
 * (src/lib/results/v2/social-feed.mjs). Prints the feed; --write stores it at
 * data/internal/results/social/feed-<date>.json. Deterministic: no wall clock enters the output.
 * Runs under tsx because the read models are TypeScript.
 */
import fs from "node:fs";
import path from "node:path";

import { buildResultsSocialFeed } from "../../src/lib/results/v2/social-feed.mjs";
import { resultsV2Populations } from "../../src/lib/results/v2/overview.ts";
import { topBoardsFor } from "../../src/lib/results/v2/top-boards.ts";
import { surfaceHref } from "../../src/lib/nav/date-sport-route.ts";
import { etDayLabel } from "../../src/lib/et-stamp.mjs";
import { SITE_BASE } from "../build-mlb-social-content.mjs";

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const date = arg("--date");
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error("REFUSED: --date YYYY-MM-DD required"); process.exit(1); }

const etTime = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(Date.parse(iso))) + " ET";
const records = resultsV2Populations(date).map((p) => {
  const d = p.days.find((x) => x.date === date) ?? { won: 0, lost: 0, push: 0, void: 0 };
  return { id: p.id, label: p.label, class: p.class, won: d.won, lost: d.lost, push: d.push, void: d.void };
});
const tb = topBoardsFor(date);
const boards = tb && {
  publishedAtLabel: etTime(tb.publishedAt),
  boards: tb.boards.map((b) => ({
    propFamily: b.propFamily, label: b.label,
    rows: b.rows.map((r) => ({ rank: r.rank, name: r.name, team: r.team, result: r.result,
      projectionLabel: "probability" in r.projection ? `${Math.round(r.projection.probability * 1000) / 10}%` : `${r.projection.median}` })),
  })),
};
const feed = buildResultsSocialFeed({ date, dayLabel: etDayLabel(date), siteBase: SITE_BASE, dayPath: surfaceHref("results", { date }) ?? "/results/", records, boards });
const raw = JSON.stringify(feed, null, 2) + "\n";
if (process.argv.includes("--write")) {
  const out = path.resolve(process.cwd(), "..", "data/internal/results/social", `feed-${date}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, raw);
  console.error(`wrote ${path.relative(path.resolve(process.cwd(), ".."), out)} · ${feed.posts.length} draft(s)`);
} else process.stdout.write(raw);
