/* NBA social feed, BUILD LOADER (Batch 1 fix #9, 2026-10-29): the additive isLatest / slateState / today fields on the
   committed lanes. Slate-independent: asserts relations (only the newest shipped day is latest; latest.json and
   index.json carry the same `today`, dated with the same ET date `stale` uses), never a particular day's values.
   Run (from app/): npx tsx --test src/lib/social/nba-social-data.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";

const { nbaSocialDates, nbaSocialDay, nbaSocialIndex, nbaSocialLatest, nbaSocialTodayStatus } = await import("./nba-social-data.ts");
const { NBA_SOCIAL_SLATE_STATES, NBA_SOCIAL_TODAY_STATUSES } = await import("./nba-social.mjs");
const { currentEtDate } = await import("../freshness.ts");

const KEYS_V1 = ["schemaVersion", "date", "publication", "builtForEtDate", "stale", "contract", "playerFamilies", "events", "record", "usageRules"];

test("day files: only the newest shipped date is isLatest; archived days stay stale: true with isLatest: false; slateState from the file", (t) => {
  const dates = nbaSocialDates();
  if (!dates.length) { t.skip("no NBA lane committed"); return; }
  for (const d of dates) {
    const day = nbaSocialDay(d);
    assert.deepEqual(Object.keys(day), [...KEYS_V1, "isLatest", "slateState"], `${d}: additive keys appended, existing order kept`);
    assert.equal(day.schemaVersion, "gtp-social-nba@1");
    assert.equal(day.isLatest, d === dates.at(-1), d);
    if (d < day.builtForEtDate) assert.equal(day.stale, true, `${d}: an archived day keeps stale: true`);
    const finals = day.events.filter((e) => e.result.final).length;
    if (!day.events.length) assert.equal(day.slateState, null);
    else if (finals === day.events.length) assert.equal(day.slateState, "SETTLED", d);
    else assert.ok(NBA_SOCIAL_SLATE_STATES.includes(day.slateState), d);
  }
});

test("latest.json = the newest day file + today; index.json carries the same today, on the date stale uses", () => {
  const latest = nbaSocialLatest();
  const index = nbaSocialIndex();
  assert.deepEqual(latest.today, index.today);
  assert.equal(latest.today.etDate, currentEtDate());
  assert.ok(NBA_SOCIAL_TODAY_STATUSES.includes(latest.today.status), latest.today.status);
  assert.deepEqual(nbaSocialTodayStatus(), latest.today);
  assert.deepEqual(Object.keys(index), ["schemaVersion", "latest", "days", "latestHref", "contractDoc", "today"], "index: additive key appended");
  const d = nbaSocialDates().at(-1);
  if (d) {
    const { today, ...rest } = latest;
    assert.deepEqual(rest, nbaSocialDay(d), "latest.json's other fields are the newest day file's, unchanged");
    assert.equal(latest.isLatest, true);
    assert.equal(latest.builtForEtDate, today.etDate, "one ET date for stale and today");
    // PUBLISHED iff the newest file IS today's slate with games (then stale is false)
    if (today.status === "PUBLISHED") { assert.equal(latest.date, today.etDate); assert.equal(latest.stale, false); }
    if (today.status === "NOT_YET_PUBLISHED") assert.ok(latest.date < today.etDate && latest.stale === true, "an earlier slate, marked stale");
  }
});
