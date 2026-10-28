/**
 * The seven-day, five-sport content calendar: facts read at a PINNED commit of the GameTimePicks data (so the test
 * never moves with new data), the opportunity grid, the independent readiness check, and the workflow end to end —
 * reusing an earlier content plan's Grok research, ChatGPT plan and Claude Code review without re-running them.
 * Skips if the pinned commit isn't in this clone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createFileStore } from "../ledger/store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { gitDataSource, dirDataSource, multiSportFacts } from "../recap/multisport-facts.mjs";
import { readPublicRegistry } from "../recap/public-registry.mjs";
import { opportunityGrid, checkCalendar, STATUS } from "../contracts/calendar.mjs";
import { teamRunEvidence } from "../orchestrator/team-evidence.mjs";
import { REPO_ROOT, sha256, stepClock } from "../lib/util.mjs";
import { FOUNDER, tempDir, TEST_SLATE } from "./helpers.mjs";

const PINNED = "02002df5f79c9d00430b903c211b94ffaa04a602";
const FROM = "2026-10-28";
const available = (() => { try { execFileSync("git", ["cat-file", "-e", `${PINNED}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; } })();
const opts = { skip: available ? false : `pinned data commit ${PINNED.slice(0, 12)} not in this clone` };
const FINDINGS = [{ topic: "TNF Packers-Panthers preview", summary: "Fans previewing CAR @ GB", sources: [{ url: "https://x.com/nflfan/status/1849000000000000001" }] }];

test("five-sport facts at a pinned commit: capability states, labelled forecasts, ledger recaps quoted as published", opts, () => {
  const f = multiSportFacts({ src: gitDataSource(REPO_ROOT, PINNED), from: FROM });
  assert.equal(f.source.commit, PINNED);
  assert.deepEqual(f.window, { from: "2026-10-28", to: "2026-11-03", tz: "America/New_York", lookbackFrom: "2026-10-25" });
  assert.deepEqual(Object.fromEntries(Object.entries(f.sports).map(([k, v]) => [k, v.capability.state])), { NFL: "EXPERIMENTAL_PUBLIC", NBA: "HISTORICAL_ONLY", MLB: "FULL_MODEL", UFC: "SCAFFOLD_ONLY", EPL: "EXPERIMENTAL_PUBLIC" });
  assert.ok(f.sports.NFL.events.every((e) => e.forecast?.class === "experimental"), "NFL forecasts are labelled experimental");
  assert.ok(f.sports.NBA.events.length > 0 && f.sports.NBA.events.every((e) => e.forecast === null), "NBA: schedule, no forecast");
  assert.ok(f.sports.UFC.events.every((e) => e.forecast === null));
  const sfAtl = f.sports.NFL.results.find((r) => r.matchup === "SF @ ATL");
  assert.equal(sfAtl.forecast.display, "pick SF (published home-win probability 26.6%)", "NFL ledger rows hold P(home win); the pick is named, the number quoted as published");
  assert.equal(sfAtl.forecast.outcome, "forecast missed");
  assert.ok(f.files.every((x) => /^[0-9a-f]{64}$/.test(x.sha256)));
});

test("a data source without GameTimePicks data fails closed instead of producing an empty calendar", () => {
  const empty = { label: "empty", commit: null, read: () => null, list: () => [] };
  assert.throws(() => multiSportFacts({ src: empty, from: FROM }), /no GameTimePicks capability registry/);
});

test("the grid: real events only, BLOCKED where the sport has no validated forecast, READY only for verified facts", opts, () => {
  const f = multiSportFacts({ src: gitDataSource(REPO_ROOT, PINNED), from: FROM });
  const g = opportunityGrid(f, { findings: FINDINGS });
  assert.ok(!g.slots.some((s) => s.date === "2026-11-03"), "no events on Nov 3, no slots");
  for (const s of g.slots) {
    for (const k of ["date", "sport", "format", "opportunity", "purpose", "publishWindow", "responsibleAgent", "evidenceRequired", "status"]) assert.ok(s[k], `${s.id}.${k}`);
    assert.ok(Object.values(STATUS).includes(s.status));
  }
  const at = (sport, format) => g.slots.filter((s) => s.sport === sport && s.format === format);
  assert.ok(at("NBA", "pregame-forecast").every((s) => s.status === STATUS.BLOCKED));
  assert.ok(at("UFC", "pregame-forecast").every((s) => s.status === STATUS.BLOCKED));
  assert.ok(at("NFL", "pregame-forecast").every((s) => s.status === STATUS.VERIFY), "pre-freeze snapshots need re-checking");
  assert.ok(at("NFL", "live-update").every((s) => s.status === STATUS.BLOCKED));
  const catchup = g.slots.find((s) => s.sport === "NFL" && s.key === "catchup");
  assert.equal(catchup.status, STATUS.READY);
  assert.ok(catchup.sourceRefs.every((r) => r.endsWith(`@${PINNED.slice(0, 12)}`)), "immutable references");
  assert.equal(g.slots.find((s) => s.sport === "NFL" && s.format === "x-conversation").status, STATUS.VERIFY);
  assert.equal(g.slots.find((s) => s.sport === "EPL" && s.format === "x-conversation").status, STATUS.BLOCKED, "no Grok research for EPL");
  assert.ok(g.slots.filter((s) => s.status === STATUS.READY).every((s) => ["postgame-recap", "educational"].includes(s.format)));
});

test("ChatGPT can choose and draft but never raise a status; drafts are checked against the slot's facts", opts, () => {
  const g = opportunityGrid(multiSportFacts({ src: gitDataSource(REPO_ROOT, PINNED), from: FROM }), { findings: FINDINGS });
  const id = (sport, format, key) => g.slots.find((s) => s.sport === sport && s.format === format && (!key || s.key === key)).id;
  const answer = {
    summary: "Recap-led week",
    picks: [
      { slotId: id("NBA", "pregame-forecast"), priority: 1, angle: "NBA picks for tonight", draft: "Tonight's NBA slate: our forecasts." },
      { slotId: id("NFL", "postgame-recap", "catchup"), priority: 1, angle: "Week 7 forecast vs final", draft: "Seattle 20, Kansas City 3: our forecast had Seattle. San Francisco lost at Atlanta 29-20; we had the 49ers." },
      { slotId: id("NFL", "pregame-forecast"), priority: 2, angle: "TNF", draft: "Experimental model projections: Packers 63.8% to win tonight." },
      { slotId: id("EPL", "educational"), priority: 3, angle: "how it works", draft: "Lock in: we're 99% sure you'll like our EPL model." },
    ],
    additions: [{ date: "2026-10-29", sport: "NFL", format: "engagement", opportunity: "made-up hype post", sourceRef: "trust me" }],
  };
  const { calendar, problems } = checkCalendar(g, answer, { checkedXUrls: [FINDINGS[0].sources[0].url], retired: readPublicRegistry(dirDataSource(REPO_ROOT)).retired });
  const get = (slotId) => calendar.slots.find((s) => s.id === slotId);
  assert.equal(get(id("NBA", "pregame-forecast")).status, STATUS.BLOCKED, "a BLOCKED slot stays blocked when picked");
  assert.equal(get(id("NFL", "postgame-recap", "catchup")).status, STATUS.READY, "every number traces to the slot's facts");
  const tnf = get(id("NFL", "pregame-forecast"));
  assert.equal(tnf.status, STATUS.VERIFY);
  assert.ok(tnf.reasons.some((r) => /RETIRED_PHRASE/.test(r)), "a phrase retired from public surfaces is caught");
  const epl = get(id("EPL", "educational"));
  assert.equal(epl.status, STATUS.BLOCKED, "forbidden wording blocks");
  assert.ok(problems.some((p) => p.code === "UNTRACEABLE_NUMBER" && /99/.test(p.detail)));
  assert.equal(calendar.slots.find((s) => s.addedBy === "ChatGPT").status, STATUS.BLOCKED, "an addition citing nothing verifiable is blocked");
  assert.match(calendar.rule, /authorizes no post/);
});

const fence = (o) => "```json\n" + JSON.stringify(o) + "\n```";
const RESEARCH = { query: "NFL", findings: FINDINGS, caveats: [] };
const PLAN = { summary: "NFL recap-first week", weekly: [{ day: "Mon", format: "card", theme: "recap", dataSource: "ledger" }, { day: "Wed", format: "thread", theme: "misses", dataSource: "ledger" }, { day: "Sun", format: "post", theme: "preview", dataSource: "forecasts" }], kpis: [], risks: [] };

test("calendar workflow: reuses the earlier run (no new Grok round, no Claude Code run), one ChatGPT paste, a digest-bound decision and a Markdown export", opts, async () => {
  const dir = tempDir("gtp-cc-calendar-");
  const clock = stepClock("2026-10-28T14:00:00.000Z");
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  const o = createOrchestrator({ store, clock, outDir: dir, slateDate: TEST_SLATE, calendarDataSource: gitDataSource(REPO_ROOT, PINNED), engineering: { claudeBin: "/nonexistent/claude" } });
  const awaiting = () => o.state().commands.at(-1).tasks.find((t) => t.status === "AWAITING_INPUT");

  // the earlier NFL plan (as in the founder's real run), revised with a note
  await o.handleCommand("Team, review GameTimePicks' current NFL social-content opportunities and propose an improved weekly X content plan.", FOUNDER);
  await o.submitManual(awaiting().taskId, fence(RESEARCH), FOUNDER);
  await o.submitManual(awaiting().taskId, fence(PLAN), FOUNDER);
  const planDecision = o.state().decisions.find((d) => d.kind === "proposal");
  await o.decide({ decisionId: planDecision.decisionId, verdict: "revise", note: "Expand to NFL, NBA, MLB, UFC and EPL." }, FOUNDER);
  const contribsBefore = o.state().history.filter((h) => h.kind === "contribution").length;

  await o.handleCommand("Team, turn the revised weekly plan into a seven-day content calendar covering NFL, NBA, MLB, UFC and EPL.", FOUNDER);
  let s = o.state();
  const c = s.commands.at(-1);
  assert.equal(c.intent, "content-calendar");
  const facts = c.contributions.find((x) => x.artifactType === "calendar-facts");
  assert.equal(facts.artifact.base.commandId, s.commands[0].commandId, "reuses the earlier run");
  assert.equal(facts.artifact.base.revisionNote, "Expand to NFL, NBA, MLB, UFC and EPL.");
  const gpt = awaiting();
  assert.equal(gpt.ownerRole, "content-strategist");
  assert.match(gpt.prompt, /Expand to NFL, NBA, MLB, UFC and EPL/);
  assert.match(gpt.prompt, /OPPORTUNITY GRID \(2026-10-28 → 2026-11-03/);
  assert.ok(gpt.prompt.length < 40_000, `prompt is ${gpt.prompt.length} chars`);
  assert.ok(!c.tasks.some((t) => t.ownerRole === "social-intelligence" || t.seat === "cli:claude-code"), "no new Grok round, no Claude Code run");

  const ids = facts.artifact.grid.slots;
  const catchup = ids.find((x) => x.sport === "NFL" && x.key === "catchup");
  const bad = { summary: "x", picks: [{ slotId: "nope", priority: 1, angle: "a" }] };
  assert.equal((await o.submitManual(gpt.taskId, fence(bad), FOUNDER)).ok, false, "a pick that isn't in the grid is refused; the step keeps waiting");
  const answer = { summary: "Recap-led week across five sports", weeklyThemes: ["forecast vs final"], picks: [
    { slotId: catchup.id, priority: 1, angle: "Week 7 forecast vs final", draft: "Seattle 20, Kansas City 3: our forecast had Seattle." },
    { slotId: ids.find((x) => x.sport === "NBA" && x.format === "educational").id, priority: 2, angle: "why no NBA forecast yet" },
  ] };
  assert.equal((await o.submitManual(gpt.taskId, fence(answer), FOUNDER)).ok, true);

  s = o.state();
  const d = s.decisions.find((x) => x.subjectType === "content-calendar");
  assert.ok(d, "the calendar is up for decision");
  assert.equal(d.subject.dataCommit, PINNED);
  assert.ok(d.subject.calendar.slots.length > 20);
  assert.ok(d.subject.calendar.slots.find((x) => x.id === catchup.id).chosen);
  assert.ok(d.subject.backlog.length > 0);
  const exp = s.commands.at(-1).deliverables.find((x) => x.kind === "calendar-export");
  const md = fs.readFileSync(path.join(dir, exp.file), "utf8");
  assert.equal(exp.sha256, sha256(fs.readFileSync(path.join(dir, exp.file))), "the recorded hash is the file's own sha256");
  assert.match(md, /seven-day content calendar · 2026-10-28 → 2026-11-03/);
  assert.match(md, /Approving this calendar authorizes no post/);
  assert.match(md, new RegExp(PINNED));

  assert.equal((await o.decide({ decisionId: d.decisionId, verdict: "approve", digest: "wrong" }, FOUNDER)).code, "APPROVAL_DIGEST_MISMATCH");
  const ok = await o.decide({ decisionId: d.decisionId, verdict: "approve", digest: d.subjectDigest }, FOUNDER);
  assert.equal(ok.ok, true);
  assert.equal(o.state().history.filter((h) => h.kind === "publish-receipt").length, 0, "nothing published");
  assert.equal(o.state().history.filter((h) => h.kind === "contribution").length - contribsBefore, 4, "facts, ChatGPT, check, consolidation — nothing else ran");

  const ev = teamRunEvidence(store.list(), s.commands.at(-1).commandId);
  assert.equal(ev.verdict.simulated, 0);
  assert.equal(ev.steps.find((x) => x.step === "calendar").execution, "MANUAL PROVIDER HANDOFF");
});
