/** D1 test fixtures: a small approved calendar and the pinned data commit the queue reads. */
import { execFileSync } from "node:child_process";
import { REPO_ROOT, digestOf } from "../lib/util.mjs";

/** origin/main on 2026-10-28 13:00Z: receipts for CAR @ GB (Oct 29), finals Oct 25–27, EPL results. */
export const QUEUE_PINNED = "fe6b9212b879eb09c485e2cee946fbaa6c36bd22";
export const hasPinned = (() => {
  try { execFileSync("git", ["cat-file", "-e", `${QUEUE_PINNED}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; }
})();
/** 31 minutes after the pinned commit, US Eastern 2026-10-28. */
export const QUEUE_NOW = "2026-10-28T13:30:00.000Z";
export const X_URL = "https://x.com/GameTimePicks/status/2115300000000000001";

const slot = (date, sport, format, key, extra = {}) => ({
  id: `${date}:${sport}:${format}:${key}`, key, date, sport, format, status: "READY", reasons: [], chosen: true, priority: 1,
  opportunity: `${sport} ${format}`, angle: null, draft: null, facts: [], sourceRefs: [], events: [], ...extra,
});

export function calendarFixture() {
  return {
    window: { from: "2026-10-28", to: "2026-11-03", tz: "America/New_York", lookbackFrom: "2026-10-25" },
    source: { label: `git origin/main @ ${QUEUE_PINNED.slice(0, 12)}`, commit: QUEUE_PINNED },
    summary: "D1 fixture", weeklyThemes: [],
    slots: [
      slot("2026-10-28", "NFL", "postgame-recap", "catchup"),
      slot("2026-10-28", "NBA", "postgame-recap", "catchup"),
      slot("2026-10-28", "MLB", "postgame-recap", "catchup"),
      slot("2026-10-28", "EPL", "postgame-recap", "catchup"),
      slot("2026-10-28", "NFL", "educational", "explainer", { draft: "How should you read a GameTimePicks NFL forecast? As a probability, frozen before kickoff and graded in public." }),
      slot("2026-10-28", "NFL", "x-conversation", "x0", {
        status: "NEEDS_VERIFICATION", opportunity: "Join: trade deadline talk", facts: ["Fans debate trade-deadline moves"],
        sourceRefs: ["https://x.com/someone/status/2115281502590349529"], draft: "Roster news can change how we read a matchup. Which move are you watching?",
      }),
      slot("2026-10-28", "NBA", "engagement", "tonight", { status: "NEEDS_VERIFICATION", draft: "NBA fans: which matchup tonight has the best storyline?" }),
      slot("2026-10-28", "NFL", "live-update", "live", { status: "BLOCKED", reasons: ["no live-update publishing path is authorized"] }),
      slot("2026-10-28", "NBA", "player-analysis", "players", { chosen: false }),
      slot("2026-10-29", "NFL", "pregame-forecast", "slate", { status: "NEEDS_VERIFICATION" }),
      slot("2026-10-28", "NBA", "postgame-recap", "recap", { status: "BLOCKED" }), // game day: built in the Oct 29 queue
      slot("2026-10-29", "NFL", "x-conversation", "x1", { status: "NEEDS_VERIFICATION", opportunity: "Join: no link", facts: ["a finding"], sourceRefs: ["Grok said so"], draft: "Which game are you watching?" }),
    ],
    rule: "Approving this calendar authorizes no post. Each publication needs its own verified content and the founder's explicit approval.",
  };
}

/** Put an approved calendar in the ledger the way the content-calendar workflow does (request + founder decision). */
export function seedApprovedCalendar(store, calendar = calendarFixture(), { tamper = false } = {}) {
  const subject = { calendar, backlog: [], dataCommit: QUEUE_PINNED, base: null };
  const subjectDigest = digestOf({ subjectType: "content-calendar", subject });
  store.append("decision-request", "chief-of-staff", {
    decisionId: "prop-d1fixture", commandId: "cmd-d1calendar", kind: "proposal", subjectType: "content-calendar",
    subject: tamper ? { ...subject, calendar: { ...calendar, summary: "edited after approval" } } : subject, subjectDigest, question: "fixture", options: [],
  });
  store.append("decision", "founder", { decisionId: "prop-d1fixture", commandId: "cmd-d1calendar", verdict: "approve", note: null, approvedExactDigest: subjectDigest, approvedBy: "founder", approvedAt: "2026-10-28T05:10:00.000Z" });
  return subjectDigest;
}
