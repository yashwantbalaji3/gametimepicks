/**
 * Team identity consistency (UX audit M1, M2, M3, L3; DS-001 §5, 2026-10-15).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("game-page headers use header-size crests on every sport (EPL was sm)", () => {
  const epl = src("src/app/epl/match/[slug]/page.tsx");
  assert.equal((epl.match(/<TeamLogo team=\{(home|away)\} sport="soccer" size="lg" ariaLabel="" \/>/g) ?? []).length, 2);
});

test("a crest beside a printed name is decorative — in the image AND in its fallback badge", () => {
  const badge = src("src/components/team-badge.tsx");
  assert.match(badge, /aria-label=\{decorative \? undefined :/);
  assert.match(badge, /aria-hidden=\{decorative \? true : undefined\}/);
  const logo = src("src/components/team-logo.tsx");
  assert.equal((logo.match(/decorative=\{ariaLabel === ""\}/g) ?? []).length, 2, "both fallback paths honour ariaLabel=\"\"");
  assert.match(src("src/components/sport-hub/game-summary.tsx"), /size="lg" highlight=\{favored\} ariaLabel="" \/>/);
});

test("MLB slate tiles name their real destination and never print '?'", () => {
  const mlb = src("src/app/mlb/page.tsx");
  assert.doesNotMatch(mlb, /View props for/);
  assert.match(mlb, /gameHref \? "Open game report" : "Open on the model board"/);
  assert.doesNotMatch(mlb, /AwayTeamAbbr \?\? "\?"|awayTeamAbbr \?\? "\?"/);
});

test("MLB board schedule-only grid shows crests by exact team ID, decorative, with TBD placeholders", () => {
  const b = src("src/components/mlb/mlb-board-body.tsx");
  assert.match(b, /<span aria-hidden className="inline-flex"><TeamMark name=\{g\.awayTeamAbbr\} logoUrl=\{mlbTeamLogoUrl\(g\.awayTeamId\)\}/);
  assert.match(b, /<span aria-hidden className="inline-flex"><TeamMark name=\{g\.homeTeamAbbr\} logoUrl=\{mlbTeamLogoUrl\(g\.homeTeamId\)\}/);
  assert.doesNotMatch(b, /awayTeamAbbr \?\? "\?"/);
});

test("a player/fighter avatar beside a printed name can be decorative (GTP-31); standalone avatars still name the player", () => {
  const a = src("src/components/player-avatar.tsx");
  assert.match(a, /role=\{decorative \? undefined : "img"\}/);
  assert.match(a, /aria-label=\{decorative \? undefined : playerName\}/);
  assert.match(a, /alt=\{decorative \? "" : playerName\}/);
  assert.match(a, /decorative = false,/, "default keeps the accessible name");
  assert.match(src("src/components/ufc/prediction-board.tsx"), /playerName=\{f\.name\} size="sm" flat decorative \/>/, "UFC board prints the fighter name beside the photo");
});

