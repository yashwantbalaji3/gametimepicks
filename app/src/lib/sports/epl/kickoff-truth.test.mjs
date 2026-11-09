/**
 * EPL KICKOFF TRUTH (founder Option A, 2026-11-09) — kickoffs come from ESPN's scheduled events; a provisional
 * fixture-list slot is never published as confirmed. Run: npx tsx --test src/lib/sports/epl/kickoff-truth.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildEplClubIndex } from "../../soccer/epl-clubs.ts";
import { identityFromFixture } from "../../soccer/epl-identity.ts";
import { confirmFixtureKickoffs, unplayedConfirmed, espnScheduleRows, normalizeUtc, scheduleMonths, KICKOFF_UNVERIFIED, KICKOFF_UNVERIFIED_REASON } from "./kickoff-truth.mjs";

const APP = process.cwd();
const index = buildEplClubIndex();
const NOW = "2026-11-05T12:00:00Z";
const ctx = (nowIso = NOW) => ({
  resolve: (n) => index.resolve(n),
  rebuildId: (f, k) => { const o = identityFromFixture({ homeClub: f.homeClub, awayClub: f.awayClub, kickoffIso: k, status: "SCHEDULED" }, nowIso, index); return "identity" in o ? o.identity.eventId : null; },
  nowIso,
});
const PROVISIONAL = "2026-11-07T15:00:00Z";
/* Matchweek 10 as the capture held it: every fixture on the provisional Saturday 15:00 block. */
const fx = (homeClub, awayClub) => ({ eventId: ctx().rebuildId({ homeClub, awayClub }, PROVISIONAL), homeClub, awayClub, kickoffIso: PROVISIONAL, matchweek: 10 });
const CAPTURE = [fx("Everton", "Coventry City"), fx("Leeds United", "Tottenham Hotspur"), fx("Arsenal", "Hull City"), fx("Nottingham Forest", "Manchester City"), fx("Ipswich Town", "Bournemouth"), fx("Manchester United", "Aston Villa")];
/* ESPN's scheduled events for the same round (its own spellings and minute-precision UTC). */
const ESPN = { capturedAt: "2026-11-05T06:00:00Z", rows: [
  { providerEventId: "401879389", kickoffUtc: "2026-11-06T20:00Z", home: "Everton", away: "Coventry City", statusRaw: "STATUS_SCHEDULED" },
  { providerEventId: "401879390", kickoffUtc: "2026-11-07T12:30Z", home: "Leeds United", away: "Tottenham Hotspur", statusRaw: "STATUS_SCHEDULED" },
  { providerEventId: "401879391", kickoffUtc: "2026-11-07T15:00Z", home: "Arsenal", away: "Hull City", statusRaw: "STATUS_SCHEDULED" },
  { providerEventId: "401879392", kickoffUtc: "2026-11-07T17:30Z", home: "Nottingham Forest", away: "Manchester City", statusRaw: "STATUS_SCHEDULED" },
  { providerEventId: "401879393", kickoffUtc: "2026-11-08T14:00Z", home: "Ipswich Town", away: "AFC Bournemouth", statusRaw: "STATUS_SCHEDULED" },
  { providerEventId: "401879394", kickoffUtc: "2026-11-08T16:30Z", home: "Manchester United", away: "Aston Villa", statusRaw: "STATUS_SCHEDULED" },
] };

test("Friday night, Saturday early / 15:00 / late and Sunday kickoffs are ESPN's, not the provisional Saturday 15:00 block", () => {
  const { confirmed, unverified, scheduleState } = confirmFixtureKickoffs(CAPTURE, ESPN, ctx());
  assert.equal(scheduleState, "FRESH");
  assert.deepEqual(unverified, []);
  assert.deepEqual(confirmed.map((f) => [f.homeClub, f.kickoffIso]), [
    ["Everton", "2026-11-06T20:00:00Z"], ["Leeds United", "2026-11-07T12:30:00Z"], ["Arsenal", "2026-11-07T15:00:00Z"],
    ["Nottingham Forest", "2026-11-07T17:30:00Z"], ["Ipswich Town", "2026-11-08T14:00:00Z"], ["Manchester United", "2026-11-08T16:30:00Z"],
  ]);
  for (const f of confirmed) {
    assert.equal(f.kickoffSource, "ESPN");
    assert.equal(f.kickoffState, "CONFIRMED");
    /* The canonical id encodes the kickoff minute: rebuilt at the confirmed one, the provisional kept beside it. */
    assert.equal(f.eventId, ctx().rebuildId(f, f.kickoffIso));
    if (f.kickoffIso !== PROVISIONAL) { assert.equal(f.provisionalKickoffIso, PROVISIONAL); assert.notEqual(f.eventId, f.provisionalEventId); }
    else assert.equal(f.provisionalKickoffIso, undefined, "an unchanged 15:00 is not a correction");
  }
  /* ESPN spells "AFC Bournemouth"; the alias table resolves both to one club. */
  assert.equal(confirmed.find((f) => f.homeClub === "Ipswich Town").espnEventId, "401879393");
});

test("Everton v Coventry: the forecast joins ESPN's event 401879389 (Fri 6 Nov) — the date lookup on the provisional Sat 7 Nov missed it", () => {
  const { confirmed } = confirmFixtureKickoffs(CAPTURE, ESPN, ctx());
  const evc = confirmed.find((f) => f.homeClub === "Everton");
  assert.equal(evc.espnEventId, "401879389");
  assert.equal(evc.kickoffIso.slice(0, 10), "2026-11-06");
  /* The player lane uses the forecast's own ESPN id rather than a date-window guess. */
  const src = fs.readFileSync(path.join(APP, "scripts/epl/build-epl-player-projections.mjs"), "utf8");
  assert.match(src, /if \(row\.espnEventId\) return \{ id: String\(row\.espnEventId\)/);
});

test("no forecast is treated as pregame after its REAL kickoff (Friday 21:00Z: Everton v Coventry has started though its provisional slot has not)", () => {
  const { confirmed } = confirmFixtureKickoffs(CAPTURE, ESPN, ctx());
  const fridayNight = "2026-11-06T21:00:00Z";
  const open = unplayedConfirmed(confirmed, fridayNight).map((f) => f.homeClub);
  assert.ok(!open.includes("Everton"), "started at 20:00Z — no longer pregame");
  assert.ok(open.includes("Leeds United") && open.includes("Manchester United"));
  assert.deepEqual(unplayedConfirmed(confirmed, "2026-11-08T16:31:00Z"), []);
  /* The forecast builder selects its population through this, never through the capture's provisional times. */
  assert.match(fs.readFileSync(path.join(APP, "scripts/epl/build-epl-forecasts.mjs"), "utf8"), /const unplayed = unplayedConfirmed\(kickoffs\.confirmed, NOW\);/);
});

test("timezone and DST: ESPN's UTC instant is kept exactly across the BST→GMT change (25 Oct 2026); minute-precision ISO is normalised", () => {
  assert.equal(normalizeUtc("2026-10-24T11:30Z"), "2026-10-24T11:30:00Z"); // 12:30 BST (UTC+1), the day before the change
  assert.equal(normalizeUtc("2026-10-25T14:00Z"), "2026-10-25T14:00:00Z"); // 14:00 GMT, the day of the change
  assert.equal(normalizeUtc("2026-03-29T13:30Z"), "2026-03-29T13:30:00Z"); // 14:30 BST, the spring change
  const autumn = [{ ...fx("Brentford", "Everton"), kickoffIso: "2026-10-24T14:00:00Z", matchweek: 9 }]; // provisional 15:00 BST
  const espn = { capturedAt: "2026-10-23T06:00:00Z", rows: [{ providerEventId: "1", kickoffUtc: "2026-10-24T11:30Z", home: "Brentford", away: "Everton", statusRaw: "STATUS_SCHEDULED" }] };
  assert.equal(confirmFixtureKickoffs(autumn, espn, ctx("2026-10-23T08:00:00Z")).confirmed[0].kickoffIso, "2026-10-24T11:30:00Z");
});

test("UNVERIFIED, never a provisional time: no schedule, a stale schedule, no ESPN event, or two candidates", () => {
  const one = [fx("Everton", "Coventry City")];
  const missing = confirmFixtureKickoffs(one, null, ctx());
  assert.equal(missing.scheduleState, "MISSING");
  assert.deepEqual(missing.confirmed, []);
  assert.equal(missing.unverified[0].kickoffState, KICKOFF_UNVERIFIED);
  assert.match(missing.unverified[0].reason, new RegExp(`^${KICKOFF_UNVERIFIED_REASON}`));
  const stale = confirmFixtureKickoffs(one, { ...ESPN, capturedAt: "2026-11-03T00:00:00Z" }, ctx());
  assert.equal(stale.scheduleState, "STALE");
  assert.equal(stale.confirmed.length, 0);
  const none = confirmFixtureKickoffs([fx("Chelsea", "Leeds United")], ESPN, ctx());
  assert.match(none.unverified[0].reason, /no ESPN event for this pairing/);
  const twice = confirmFixtureKickoffs(one, { ...ESPN, rows: [...ESPN.rows, { ...ESPN.rows[0], providerEventId: "999", kickoffUtc: "2026-11-07T15:00Z" }] }, ctx());
  assert.match(twice.unverified[0].reason, /several ESPN events/);
  /* The builder withholds them with the reason instead of forecasting on the provisional slot. */
  const builder = fs.readFileSync(path.join(APP, "scripts/epl/build-epl-forecasts.mjs"), "utf8");
  assert.match(builder, /unverifiedKickoffs,/);
  assert.doesNotMatch(builder, /const unplayed = \(season\.rows/, "the capture's own times never select the forecast population");
});

test("the schedule capture reads ESPN rows and asks month by month around now (the date-range form is refused upstream)", () => {
  assert.deepEqual(scheduleMonths("2026-11-09T20:00:00Z"), ["202610", "202611", "202612", "202701"]);
  const rows = espnScheduleRows([{ id: 7, date: "2026-11-21T12:30Z", status: { type: { name: "STATUS_SCHEDULED" } }, competitions: [{ competitors: [{ homeAway: "home", team: { displayName: "Manchester City" } }, { homeAway: "away", team: { displayName: "Fulham" } }] }] }, { id: 8, date: "x" }]);
  assert.deepEqual(rows, [{ providerEventId: "7", kickoffUtc: "2026-11-21T12:30Z", home: "Manchester City", away: "Fulham", statusRaw: "STATUS_SCHEDULED" }]);
  const wf = fs.readFileSync(path.join(APP, "..", ".github/workflows/epl-matchweek.yml"), "utf8");
  assert.match(wf, /node scripts\/epl\/capture-epl-espn-schedule\.mjs --now/);
  assert.doesNotMatch(wf, /the previous capture stands"\n/, "the fallback never presents a provisional capture as a schedule");
});

test("kickoff disclosure: SHOWN on a provisional-slot page whose kickoff differs from or lacks ESPN confirmation; NOT shown on current, confirmed or past pages", async () => {
  const { loadEplForecasts, eplKickoffDisclosure } = await import("./forecast-view.ts");
  const live = loadEplForecasts();
  const dated = (d) => JSON.parse(fs.readFileSync(path.join(APP, `public/data/soccer/epl/forecasts/${d}.json`), "utf8")).rows;
  /* SHOWN · differs: the frozen MW11 row keeps its provisional slot (unedited); the live set has it at Mon 20:00Z. */
  const frozen = dated("2026-11-09").find((r) => r.homeClub === "Brentford" && r.awayClub === "Everton");
  assert.equal(frozen.slug, "brentford-v-everton-2026-11-21");
  const d = eplKickoffDisclosure(frozen, live);
  assert.equal(d?.state, "CORRECTED");
  assert.equal(d.current.slug, "brentford-v-everton-2026-11-23");
  assert.equal(d.current.kickoffUtc, "2026-11-23T20:00:00Z");
  /* SHOWN · not confirmed: the pairing is in the live set's unverified list. */
  const withUnverified = { ...live, rows: live.rows.filter((r) => r.homeClub !== "Brentford"), unverifiedKickoffs: [{ matchup: "Brentford v Everton", reason: "kickoff not confirmed — no ESPN event for this pairing" }] };
  assert.equal(eplKickoffDisclosure(frozen, withUnverified)?.state, "UNCONFIRMED");
  /* NOT shown · a frozen row whose provisional time IS the confirmed one (same slug as the live row). */
  const same = dated("2026-11-09").find((r) => r.homeClub === "Chelsea" && r.awayClub === "Leeds United");
  assert.equal(eplKickoffDisclosure(same, live), null);
  /* NOT shown · every current row. */
  for (const r of live.rows) assert.equal(eplKickoffDisclosure(r, live), null, `${r.slug}: current rows are not flagged`);
  /* NOT shown · settled/past matches (MW10 frozen rows): absent from the live set, their pages keep their text. */
  for (const r of dated("2026-11-06")) assert.equal(eplKickoffDisclosure(r, live), null, `${r.slug}: a past match keeps its existing text`);
  const page = fs.readFileSync(path.join(APP, "src/app/epl/match/[slug]/page.tsx"), "utf8");
  assert.match(page, /data-epl-kickoff-corrected=\{kickoffNote\.state\}/);
});
