/**
 * THE SEVEN-DAY CONTENT CALENDAR — built from real events only, checked independently.
 *
 *   1. opportunityGrid(facts, base)   deterministic: one slot per real opportunity (a sport-day's games, a finished
 *                                     result, a checked X conversation, one explainer per sport). No events, no
 *                                     slot. Each slot carries its purpose, format, publishing window, responsible
 *                                     agent, required evidence, immutable source references and a readiness status.
 *   2. ChatGPT                        chooses, prioritises and drafts copy for slots (it may add slots only by
 *                                     citing a fact id or a checked X post). It cannot set a status.
 *   3. checkCalendar(grid, answer)    deterministic: the final status of every slot is the grid's status, lowered —
 *                                     never raised — by the draft check (wording, length, links, number provenance,
 *                                     retired public phrases — recap/public-registry.mjs).
 *
 * Status, by the founder's definitions:
 *   READY               every fact the slot needs is verified at the pinned commit (finished results with settled
 *                       canonical forecasts, schedule facts, the site's own capability statements)
 *   NEEDS_VERIFICATION  something must be confirmed first: a forecast that is not the forecast of record until frozen
 *                       at start, a schedule that can change, an X claim that is cited but not independently fetched
 *   BLOCKED             essential evidence, canonical data or authorization is unavailable (no validated forecast for
 *                       the sport, a result that doesn't exist yet, no live publishing path)
 * READY means ready to produce for review. Every publication still needs its own verified content and the
 * founder's explicit approval; approving the calendar authorizes no post.
 */
import { REASON } from "./index.mjs";

export const STATUS = Object.freeze({ READY: "READY", VERIFY: "NEEDS_VERIFICATION", BLOCKED: "BLOCKED" });
const RANK = { READY: 0, NEEDS_VERIFICATION: 1, BLOCKED: 2 };
const worst = (a, b) => (RANK[a] >= RANK[b] ? a : b);
export const FORMATS = Object.freeze(["pregame-forecast", "player-analysis", "live-update", "postgame-recap", "educational", "engagement", "x-conversation"]);
const SPORTS = ["NFL", "NBA", "MLB", "UFC", "EPL"];
const FORECAST_STATES = new Set(["FULL_MODEL", "EXPERIMENTAL_PUBLIC"]);
const LIVE_SOURCE = new Set(["NFL", "MLB"]);
const PLAYER_DATA = { NFL: "weekly player boards (experimental; only cleared families — nfl/family-eligibility.json)", MLB: "player props / projections (official snapshot)", EPL: "player projections (experimental scorer head)" };
const RECAP_GRAPHIC = { NFL: "the existing NFL recap card (render/render-png.mjs)" };
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const startEt = (iso) => `${ET_TIME.format(new Date(iso))} ET`;
const short = (s, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * @param {object} facts   recap/multisport-facts.mjs output
 * @param {{ findings?: object[], baseCommandId?: string|null }} base  checked Grok findings reused from the earlier run
 */
export function opportunityGrid(facts, base = {}) {
  const { from } = facts.window;
  const commit = facts.source.commit ? facts.source.commit.slice(0, 12) : "working-tree";
  const ref = (r) => (r ? `${r}@${commit}` : null);
  const slots = [];
  const add = (s) => slots.push({ priority: null, angle: null, draft: null, chosen: false, ...s, id: `${s.date}:${s.sport}:${s.format}:${s.key}` });

  for (const sport of SPORTS) {
    const sp = facts.sports[sport];
    const cap = sp.capability;
    const forecastOk = FORECAST_STATES.has(cap.state);
    const byDay = new Map();
    for (const e of sp.events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

    for (const [date, events] of [...byDay.entries()].sort()) {
      const list = events.map((e) => `${e.matchup} (${startEt(e.startUtc)})`);
      const first = events.map((e) => e.startUtc).sort()[0];
      // pregame forecasts
      {
        const withFc = events.filter((e) => e.forecast);
        const reasons = [];
        let status;
        if (!forecastOk) {
          status = STATUS.BLOCKED;
          reasons.push(`${sport} capability is ${cap.state}: ${short(sp.forecastNote ?? cap.reason, 220)}`);
        } else if (!withFc.length) {
          status = STATUS.VERIFY;
          reasons.push("no forecast in the pinned snapshot yet; the official snapshot publishes before start — re-read it in the publishing window");
        } else {
          status = STATUS.VERIFY;
          reasons.push("a pre-start snapshot is not the forecast of record until it is frozen at start: re-read and match it in the publishing window");
          if (cap.state === "EXPERIMENTAL_PUBLIC") reasons.push("quote it as the Official Forecast, exactly as frozen; capability EXPERIMENTAL_PUBLIC means not product-eligible, so never a pick (public registry)");
          for (const e of withFc.filter((x) => x.forecast.status && x.forecast.status !== "ok")) reasons.push(`${e.matchup}: prediction status "${e.forecast.status}"`);
        }
        if (facts.stale.some((p) => events.some((e) => e.scheduleRef.startsWith(p)))) reasons.push("schedule capture is more than 3 days old: confirm the game is still on");
        add({
          key: "slate", date, sport, format: "pregame-forecast", status, reasons,
          opportunity: `${sport} ${events.length === 1 ? events[0].matchup : `${events.length} games`}: ${forecastOk ? "our forecast before start" : "no forecast — schedule only"}`,
          purpose: forecastOk ? "show the model's frozen pre-start read so it can be graded honestly afterwards" : "not offered: no validated forecast for this sport",
          publishWindow: `${date}, before ${startEt(first)}`,
          responsibleAgent: forecastOk ? "ChatGPT drafts · Command Center re-checks the forecast of record · founder approves each post" : "—",
          evidenceRequired: forecastOk ? "the forecast of record frozen at start, quoted verbatim as the Official Forecast (freeze-time verifier, daily queue)" : "a validated, product-eligible forecast (none exists)",
          sourceRefs: [...withFc.map((e) => ref(e.forecast.ref)), ...events.filter((e) => !e.forecast).map((e) => ref(e.scheduleRef))].slice(0, 16),
          facts: withFc.map((e) => `${e.matchup}: ${e.forecast.display} [${e.forecast.class}]`).concat(events.filter((e) => !e.forecast).map((e) => `${e.matchup} (${startEt(e.startUtc)})`)).slice(0, 16),
          events: list,
        });
      }
      // player analysis
      if (sport !== "UFC") {
        const ok = forecastOk && PLAYER_DATA[sport];
        add({
          key: "players", date, sport, format: "player-analysis",
          status: ok ? STATUS.VERIFY : STATUS.BLOCKED,
          reasons: ok ? [`player numbers come from ${PLAYER_DATA[sport]}; confirm the family is cleared and the projection is the published one`] : [`no validated ${sport} player forecast publishes (capability ${cap.state})`],
          opportunity: `${sport} player angle for ${events.length} game(s)`, purpose: "a player-level storyline backed by a published projection",
          publishWindow: `${date}, before ${startEt(first)}`, responsibleAgent: ok ? "ChatGPT drafts · founder approves each post" : "—",
          evidenceRequired: "a published, cleared player projection for that game", sourceRefs: [], facts: [], events: list,
        });
      }
      // live updates
      if (LIVE_SOURCE.has(sport)) {
        add({
          key: "live", date, sport, format: "live-update", status: STATUS.BLOCKED,
          reasons: ["no live-update publishing path is authorized (CP2), and every post needs its own approval — live posts can't wait for that yet"],
          opportunity: `${sport} in-game moments`, purpose: "real-time engagement", publishWindow: `${date}, during games`,
          responsibleAgent: "—", evidenceRequired: "live score feed + an authorized publisher + per-post approval", sourceRefs: [], facts: [], events: list,
        });
      }
      // engagement: schedule-led
      add({
        key: "tonight", date, sport, format: "engagement", status: STATUS.VERIFY,
        reasons: ["schedule facts only, captured before the day: confirm the games are on before posting"],
        opportunity: sport === "UFC" ? `${events[0].matchup} — card preview` : `${sport} today: ${events.length} game(s)`,
        purpose: "start the day's conversation without any forecast claim",
        publishWindow: `${date}, morning ET`, responsibleAgent: "ChatGPT drafts · founder approves each post",
        evidenceRequired: "the day's schedule, re-confirmed", sourceRefs: events.slice(0, 16).map((e) => ref(e.scheduleRef)),
        facts: events.map((e) => e.detail ? `${e.matchup}: ${e.detail}` : `${e.matchup} (${startEt(e.startUtc)})`).slice(0, 16), events: list,
      });
      // postgame recaps of the window's own games: no result yet
      add({
        key: "recap", date, sport, format: "postgame-recap", status: STATUS.BLOCKED,
        reasons: ["the result doesn't exist yet"], unblocksWhen: "the final is recorded and (where we published one) the forecast is settled",
        opportunity: `${sport} results${forecastOk ? " vs our forecasts" : ""}`, purpose: "report what happened, including misses",
        publishWindow: "after the final, next morning ET", responsibleAgent: `ChatGPT drafts${RECAP_GRAPHIC[sport] ? " · deterministic renderer" : ""} · founder approves each post`,
        evidenceRequired: "the final result + the settled forecast of record", sourceRefs: [], facts: [], events: list,
      });
    }

    // catch-up recaps of results just before the window: these exist now
    if (sp.results.length) {
      const withFc = sp.results.filter((r) => r.forecast);
      const reasons = [];
      let status = STATUS.READY;
      if (withFc.some((r) => !r.forecast.settled)) { status = STATUS.VERIFY; reasons.push("a forecast is not settled yet"); }
      if (sp.results.some((r) => !r.final)) { status = STATUS.VERIFY; reasons.push("a final score is missing"); }
      if (!withFc.length && forecastOk) reasons.push("results only: no published forecast matched these games");
      add({
        key: "catchup", date: from, sport, format: "postgame-recap", status, reasons,
        opportunity: `${sport} catch-up: ${sp.results.length} result(s) from ${facts.window.lookbackFrom}–${sp.results.map((r) => r.date).sort().at(-1)}${withFc.length ? `, ${withFc.length} with our forecast` : ""}`,
        purpose: withFc.length ? "forecast vs final, misses stated plainly" : "verified results (no forecast claim)",
        publishWindow: `${from}, morning ET`,
        responsibleAgent: `ChatGPT drafts${RECAP_GRAPHIC[sport] ? ` · ${RECAP_GRAPHIC[sport]}` : " · text post (no graphic template yet)"} · founder approves each post`,
        evidenceRequired: "final scores + settled canonical forecasts (Forecast Ledger)",
        sourceRefs: sp.results.slice(0, 16).map((r) => ref(r.forecast?.ref ?? r.ref)),
        facts: sp.results.map((r) => `${r.matchup}: final ${r.final ?? "?"}${r.forecast ? ` · our forecast: ${r.forecast.display} → ${r.forecast.outcome}` : ""}`).slice(0, 16),
        events: [],
      });
    }

    // one explainer per sport, from the site's own capability statement
    add({
      key: "explainer", date: explainerDay(facts, sport), sport, format: "educational", status: STATUS.READY,
      reasons: ["quotes the site's own capability statement; no numbers"],
      opportunity: forecastOk ? `How GameTimePicks ${sport} forecasts work (Official Forecast${cap.state === "EXPERIMENTAL_PUBLIC" ? ", not product-eligible" : ""})` : `Why GameTimePicks publishes no ${sport} forecast yet`,
      purpose: "trust: explain what we do and don't claim", publishWindow: "midday ET",
      responsibleAgent: "ChatGPT drafts · Claude Code/renderer for an explainer graphic later · founder approves each post",
      evidenceRequired: "the capability registry statement", sourceRefs: [ref("app/src/lib/sport-capability-registry.ts")], facts: [`${sport}: ${cap.state} — ${cap.reason}`], events: [],
    });

    // X conversations: only where Grok research exists
    const findings = sport === "NFL" ? base.findings ?? [] : [];
    if (findings.length) {
      findings.forEach((f, i) => add({
        key: `x${i}`, date: from, sport, format: "x-conversation", status: STATUS.VERIFY,
        reasons: ["Grok cited these posts; the Command Center has not fetched them — open and confirm before replying"],
        opportunity: `Join: ${f.topic}`, purpose: "add a verified GameTimePicks angle to a live public conversation",
        publishWindow: `${from}–${addDay(from, 1)}, while the conversation is active`,
        responsibleAgent: "Grok research (reused) · ChatGPT drafts the reply · founder approves each post",
        evidenceRequired: "the cited X post(s), opened and confirmed + any GTP numbers from the facts",
        sourceRefs: (f.sources ?? []).map((s) => s.url).slice(0, 4), facts: [f.summary], events: [],
      }));
    } else {
      add({
        key: "xresearch", date: from, sport, format: "x-conversation", status: STATUS.BLOCKED,
        reasons: [`no Grok research for ${sport} yet (the reused run covered NFL only) — a manual Grok round is $0`],
        opportunity: `${sport} conversations on X`, purpose: "find conversations worth joining", publishWindow: "—",
        responsibleAgent: "Grok research → ChatGPT drafts → founder approves", evidenceRequired: "source-linked Grok findings", sourceRefs: [], facts: [], events: [],
      });
    }
  }
  slots.sort((a, b) => a.date.localeCompare(b.date) || SPORTS.indexOf(a.sport) - SPORTS.indexOf(b.sport) || FORMATS.indexOf(a.format) - FORMATS.indexOf(b.format));
  return { window: facts.window, source: facts.source, slots };
}

const addDay = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
/** The explainer goes on the day before the sport's first event in the window (or day one). */
function explainerDay(facts, sport) {
  const first = facts.sports[sport].events.map((e) => e.date).sort()[0];
  const d = first ? addDay(first, -1) : facts.window.from;
  return d < facts.window.from ? facts.window.from : d;
}

/** What ChatGPT returns. */
export const CALENDAR_ANSWER_SCHEMA = {
  type: "object",
  required: ["summary", "picks"],
  properties: {
    summary: { type: "string", maxLength: 1200 },
    weeklyThemes: { type: "array", maxItems: 7, items: { type: "string", maxLength: 200 } },
    picks: {
      type: "array", maxItems: 40,
      items: { type: "object", required: ["slotId", "priority", "angle"], properties: { slotId: { type: "string" }, priority: { type: "integer", minimum: 1, maximum: 3 }, angle: { type: "string", maxLength: 300 }, draft: { type: "string", maxLength: 600 } } },
    },
    additions: {
      type: "array", maxItems: 10,
      items: { type: "object", required: ["date", "sport", "format", "opportunity", "sourceRef"], properties: { date: { type: "string" }, sport: { type: "string" }, format: { type: "string" }, opportunity: { type: "string", maxLength: 300 }, sourceRef: { type: "string", maxLength: 300 }, draft: { type: "string", maxLength: 600 } } },
    },
  },
};

export function validateCalendarAnswer(a, grid) {
  const e = [];
  const ids = new Set(grid.slots.map((s) => s.id));
  if (typeof a?.summary !== "string" || !a.summary.trim()) e.push("summary");
  if (!Array.isArray(a?.picks) || !a.picks.length) e.push("picks (at least one)");
  (a?.picks ?? []).forEach((p, i) => {
    if (!ids.has(p?.slotId)) e.push(`picks[${i}].slotId "${String(p?.slotId).slice(0, 60)}" is not a slot in the grid`);
    if (![1, 2, 3].includes(p?.priority)) e.push(`picks[${i}].priority (1–3)`);
    if (typeof p?.angle !== "string" || !p.angle.trim()) e.push(`picks[${i}].angle`);
  });
  (a?.additions ?? []).forEach((x, i) => {
    if (!SPORTS.includes(x?.sport)) e.push(`additions[${i}].sport`);
    if (!FORMATS.includes(x?.format)) e.push(`additions[${i}].format`);
    if (typeof x?.sourceRef !== "string") e.push(`additions[${i}].sourceRef`);
  });
  return { ok: e.length === 0, errors: e };
}

/** Numbers a draft states (team names that contain digits — 49ers, 76ers — are names, not numbers). */
const numbersIn = (s) => String(s ?? "").replace(/\b(49ers|76ers)\b/gi, "").match(/\d+(?:\.\d+)?/g) ?? [];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FORBIDDEN = ["odds", "bet", "bets", "betting", "parlay", "lock", "guaranteed", "sure thing", "can't lose", "pick", "picks", "free money"];

/** Check one draft against its slot's facts. Returns problems; never upgrades a status. */
export function checkDraft(draft, slot, { forbidden = [], retired = [] } = {}) {
  const out = [];
  if (!draft) return out;
  const allowed = new Set([...numbersIn(slot.facts.join(" ")), ...numbersIn(slot.date), ...numbersIn(slot.publishWindow)]);
  for (const n of numbersIn(draft)) if (!allowed.has(n)) out.push({ code: REASON.UNTRACEABLE_NUMBER, status: STATUS.VERIFY, detail: `"${n}" is not in this slot's facts` });
  for (const t of [...forbidden, ...FORBIDDEN]) if (new RegExp(`\\b${escapeRe(t)}\\b`, "i").test(draft)) out.push({ code: REASON.FORBIDDEN_TERM, status: STATUS.BLOCKED, detail: `"${t}"` });
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co)\b/i.test(draft)) out.push({ code: REASON.URL_IN_CAPTION, status: STATUS.VERIFY, detail: "no links in post text" });
  if (draft.length > 280) out.push({ code: REASON.TOO_LONG, status: STATUS.VERIFY, detail: `${draft.length} > 280 characters` });
  // Terminology is the public registry's (founder resolution 2026-10-28): no per-post "experimental" hedge, and none of
  // the phrases retired from public surfaces.
  const lower = draft.toLowerCase();
  const phrase = retired.find((p) => lower.includes(p.toLowerCase()));
  if (phrase) out.push({ code: REASON.RETIRED_PHRASE, status: STATUS.VERIFY, detail: `"${phrase}" was retired from public surfaces` });
  return out;
}

/**
 * The final calendar: grid ∪ ChatGPT's picks and additions, every status re-derived here.
 * @returns {{ calendar: object, problems: object[] }}
 */
export function checkCalendar(grid, answer, { checkedXUrls = [], forbidden = [], retired = [] } = {}) {
  const slots = grid.slots.map((s) => ({ ...s, reasons: [...s.reasons] }));
  const byId = new Map(slots.map((s) => [s.id, s]));
  const problems = [];
  for (const p of answer.picks ?? []) {
    const s = byId.get(p.slotId);
    if (!s) continue;
    Object.assign(s, { chosen: true, priority: p.priority, angle: p.angle, draft: p.draft ?? null });
    for (const pr of checkDraft(p.draft, s, { forbidden, retired })) {
      s.status = worst(s.status, pr.status);
      s.reasons.push(`draft: ${pr.code} ${pr.detail}`);
      problems.push({ slotId: s.id, ...pr });
    }
  }
  const factIds = new Map(grid.slots.flatMap((s) => s.sourceRefs.filter(Boolean).map((r) => [r, s])));
  for (const [i, x] of (answer.additions ?? []).entries()) {
    const date = String(x.date);
    const inWindow = date >= grid.window.from && date <= grid.window.to;
    const viaFact = factIds.get(x.sourceRef);
    const viaX = checkedXUrls.includes(x.sourceRef);
    let status = !inWindow || !SPORTS.includes(x.sport) ? STATUS.BLOCKED : viaFact ? viaFact.status : viaX ? STATUS.VERIFY : STATUS.BLOCKED;
    const reasons = [!inWindow ? "outside the seven-day window" : viaFact ? `rests on ${viaFact.id}` : viaX ? "rests on a cited X post (not independently fetched)" : "cites nothing the Command Center can verify"];
    const s = {
      id: `${date}:${x.sport}:${x.format}:add${i}`, key: `add${i}`, date, sport: x.sport, format: x.format, status, reasons, opportunity: x.opportunity,
      purpose: "added by ChatGPT", publishWindow: viaFact?.publishWindow ?? "—", responsibleAgent: "ChatGPT drafts · founder approves each post",
      evidenceRequired: "as cited", sourceRefs: [x.sourceRef], facts: viaFact?.facts ?? [], events: [], chosen: true, priority: 3, angle: x.opportunity, draft: x.draft ?? null, addedBy: "ChatGPT",
    };
    for (const pr of checkDraft(x.draft, s, { forbidden, retired })) { s.status = worst(s.status, pr.status); s.reasons.push(`draft: ${pr.code} ${pr.detail}`); problems.push({ slotId: s.id, ...pr }); }
    slots.push(s);
  }
  slots.sort((a, b) => a.date.localeCompare(b.date) || SPORTS.indexOf(a.sport) - SPORTS.indexOf(b.sport) || FORMATS.indexOf(a.format) - FORMATS.indexOf(b.format));
  const count = (st) => slots.filter((s) => s.status === st).length;
  return {
    calendar: {
      window: grid.window, source: grid.source, summary: answer.summary, weeklyThemes: answer.weeklyThemes ?? [], slots,
      totals: { slots: slots.length, chosen: slots.filter((s) => s.chosen).length, READY: count(STATUS.READY), NEEDS_VERIFICATION: count(STATUS.VERIFY), BLOCKED: count(STATUS.BLOCKED) },
      rule: "Approving this calendar authorizes no post. Each publication needs its own verified content and the founder's explicit approval.",
    },
    problems,
  };
}

/** A prioritised backlog from what blocked the week, plus the reused Claude Code review. */
export function calendarBacklog(calendar, review) {
  const has = (pred) => calendar.slots.some(pred);
  const items = [];
  if (has((s) => s.format === "x-conversation" && s.status === "BLOCKED")) items.push({ item: "Grok research rounds for NBA, MLB, UFC and EPL", owner: "Grok (manual, $0) → founder pastes", dependsOn: "your time; automated later at CP-X1", acceptance: "each sport has source-linked findings passing the evidence check" });
  if (has((s) => s.format === "postgame-recap" && s.sport !== "NFL")) items.push({ item: "Result graphics for NBA, MLB and EPL (NFL card exists)", owner: "Claude Code (engineering, in an isolated working copy)", dependsOn: "approval of a G1 spec", acceptance: "1080×1350 render from verified facts, byte-stable, validator-checked captions" });
  if (has((s) => s.format === "pregame-forecast" && s.status !== "BLOCKED")) items.push({ item: "Re-check the forecast of record at publish time (freeze-time verifier)", owner: "Claude Code", dependsOn: "none", acceptance: "a pregame slot turns READY only when its number matches the frozen record" });
  if (calendar.source && calendar.slots.some((s) => s.reasons.some((r) => /more than 3 days old/.test(r)))) items.push({ item: "Fresh MLB schedule capture before the World Series games", owner: "GameTimePicks data jobs (not the Command Center)", dependsOn: "platform workstream", acceptance: "statsapi-schedule captured within 24 h of each game" });
  if (has((s) => s.format === "live-update")) items.push({ item: "Live updates", owner: "founder decision", dependsOn: "CP2 publisher choice + a per-post approval flow fast enough for live", acceptance: "an authorized, tested publisher; no unattended posting" });
  if (has((s) => s.status === "BLOCKED" && s.format === "pregame-forecast")) items.push({ item: "NBA and UFC forecasts", owner: "GameTimePicks model roadmap (not the Command Center)", dependsOn: "models clearing their preregistered bars", acceptance: "capability registry no longer HISTORICAL_ONLY / SCAFFOLD_ONLY" });
  for (const s of review?.automationSteps ?? []) items.push({ item: s.step, owner: "from Claude Code's earlier review (reused, not re-run)", dependsOn: s.reuses, acceptance: s.risk ? `risk: ${s.risk}` : "" });
  return items;
}

/** Readable export. */
export function calendarMarkdown(calendar, { backlog = [], commandId, base } = {}) {
  const L = [];
  L.push(`# GameTimePicks seven-day content calendar · ${calendar.window.from} → ${calendar.window.to}`, "");
  L.push(`Command \`${commandId}\` · data: ${calendar.source.label}${calendar.source.commit ? ` (commit \`${calendar.source.commit}\`)` : ""}${base?.commandId ? ` · reuses Grok research, ChatGPT plan and Claude Code review from \`${base.commandId}\`` : ""}`, "");
  L.push(`**${calendar.totals.slots} opportunities** · ${calendar.totals.READY} ready · ${calendar.totals.NEEDS_VERIFICATION} need verification · ${calendar.totals.BLOCKED} blocked · ${calendar.totals.chosen} chosen by ChatGPT`, "");
  L.push(`> ${calendar.rule}`, "", `**ChatGPT's summary.** ${calendar.summary}`, "");
  if (calendar.weeklyThemes.length) L.push(`**Themes:** ${calendar.weeklyThemes.join(" · ")}`, "");
  const dates = [...new Set(calendar.slots.map((s) => s.date))];
  for (const d of dates) {
    L.push(`## ${new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}`, "");
    L.push("| Sport | Opportunity | Format | Window | Status | Agent | Evidence required | Source |", "|---|---|---|---|---|---|---|---|");
    for (const s of calendar.slots.filter((x) => x.date === d)) {
      const cell = (t) => String(t ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
      L.push(`| ${s.sport} | ${s.chosen ? `**P${s.priority}** ` : ""}${cell(s.opportunity)}${s.angle && s.angle !== s.opportunity ? ` — ${cell(s.angle)}` : ""}${s.draft ? `<br>Draft: “${cell(s.draft)}”` : ""} | ${s.format} | ${cell(s.publishWindow)} | **${s.status}**${s.reasons.length ? `: ${cell(s.reasons.join("; "))}` : ""}${s.unblocksWhen ? ` (unblocks when ${cell(s.unblocksWhen)})` : ""} | ${cell(s.responsibleAgent)} | ${cell(s.evidenceRequired)} | ${cell(s.sourceRefs.slice(0, 3).join(", "))}${s.sourceRefs.length > 3 ? ` +${s.sourceRefs.length - 3}` : ""} |`);
    }
    L.push("");
  }
  if (backlog.length) {
    L.push("## Implementation backlog (prioritised)", "", "| # | Item | Owner | Depends on | Acceptance |", "|---|---|---|---|---|");
    backlog.forEach((b, i) => L.push(`| ${i + 1} | ${b.item} | ${b.owner} | ${b.dependsOn} | ${b.acceptance} |`));
  }
  return L.join("\n");
}

/** The grid as ChatGPT sees it: one line per slot, facts trimmed. Blocked slots are listed so they aren't re-invented. */
export function gridForPrompt(grid) {
  const lines = [];
  for (const s of grid.slots) {
    if (s.status === STATUS.BLOCKED) { lines.push(`${s.id} | BLOCKED | ${s.opportunity} | ${short(s.reasons[0] ?? "", 110)}`); continue; }
    lines.push(`${s.id} | ${s.status} | ${s.opportunity} | window ${s.publishWindow} | facts: ${s.facts.slice(0, 4).map((f) => short(f, 120)).join(" ; ")}${s.facts.length > 4 ? ` ; +${s.facts.length - 4} more` : ""}`);
  }
  return lines.join("\n");
}
