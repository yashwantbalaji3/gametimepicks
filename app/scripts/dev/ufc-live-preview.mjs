#!/usr/bin/env node
/**
 * LOCAL-ONLY PREVIEW of the hidden /live UFC tab, replayed from the REAL recorded feed (UFC-001).
 *
 *   cd app && npx tsx scripts/dev/ufc-live-preview.mjs --out <dir> [--css out/_next/static/css] [--shots]
 *
 * WHAT IT RENDERS. The real `UfcLiveBoard` (the exact board `UfcLiveHub` mounts on /live), fed with the
 * real roster (`card-latest.json` + `graded-picks.json` via `buildUfcRosterFrom`) and the gateway's own
 * envelopes (`normalizeMmaEnvelopes`) for five recorded moments of 2026-10-10, taken from the sanitized
 * real timeline fixture. Feed state is derived the way `useLiveSlate` derives it, with the reader 20 s
 * after the capture. The surrounding page header and tab bar are a minimal copy of /live's shell; the
 * board inside is the production component, unmodified.
 *
 * WHY A SCRIPT AND NOT A ROUTE. Nothing here is part of the Next build: no page, no chunk, no data file
 * reaches `out/`. It reads committed files, writes only to `--out`, and makes no network request of its
 * own (the browser loads ESPN's portrait CDN images when screenshotting, exactly as a reader would).
 * Every page carries a banner saying it is a replay, not a live or public page.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("--out");
if (!OUT) { console.error("REFUSED: --out <dir> is required"); process.exit(2); }
const CSS_DIR = path.resolve(APP, arg("--css", "out/_next/static/css"));

const { UfcLiveBoard } = await import("../../src/components/live/ufc-live-hub.tsx");
const { buildUfcRosterFrom } = await import("../../src/lib/live/ufc-hub-data.ts");
const { normalizeMmaEnvelopes } = await import("../../src/lib/live/adapters/espn-mma.mjs");
const { freshnessOf } = await import("../../src/lib/live/freshness.mjs");
const { scopeSlate } = await import("../../src/lib/live/slate-scope.mjs");
const { isTerminal } = await import("../../src/lib/live/contract.mjs");

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(APP, rel), "utf8"));
const card = readJson("public/data/ufc/card-latest.json");
const graded = readJson("public/data/ufc/graded-picks.json");
const timeline = readJson("src/lib/live/fixtures/mma-live-20261010-timeline.json");
if (card?.event?.providerEventId !== "600061541") {
  console.error("REFUSED: card-latest.json is no longer the 2026-10-10 card this replay was recorded for");
  process.exit(2);
}
const roster = buildUfcRosterFrom({ card, graded, etDate: card.event.slateDate });

/* Rebuild full payloads from the delta-encoded fixture. */
const bouts = new Map();
const snaps = timeline.snapshots.map((s) => {
  for (const c of s.changed) bouts.set(c.id, c);
  return { capturedAt: s.capturedAt, payload: { events: [{ ...s.event, competitions: s.order.map((id) => structuredClone(bouts.get(id))) }] } };
});
const at = (iso) => {
  const s = snaps.find((x) => x.capturedAt === iso);
  if (!s) throw new Error(`no recorded snapshot at ${iso}`);
  return s;
};

export const MOMENTS = [
  { key: "a-precard", iso: "2026-10-10T18:40:20Z", title: "Pre-card", note: "Every bout scheduled; frozen picks and win chances only." },
  { key: "b-prelims-r2", iso: "2026-10-10T23:47:33Z", title: "Prelims in progress", note: "Meerschaert–Walker in R2 with the countdown clock; six earlier bouts final (five provider winners awaiting the official result, one provider-reported draw). (In the real feed the next bout's walkouts only begin after this one ends.)" },
  { key: "b2-walkouts", iso: "2026-10-10T23:33:56Z", title: "Walkouts", note: "Meerschaert–Walker walking out: upcoming, no round." },
  { key: "c-end-of-round", iso: "2026-10-11T02:41:12Z", title: "End of a round", note: "Main event between R4 and R5: round shown, no clock." },
  { key: "d-after-draw", iso: "2026-10-10T21:46:35Z", title: "After the Gatto–Kareckaite draw", note: "Both provider draw signals present; Pereira's bout in R1." },
  { key: "e-card-complete", iso: "2026-10-11T03:02:21Z", title: "Card complete", note: "11 provider winners awaiting the official result; 1 provider-reported draw; nothing graded." },
];

/** The slate hook's derivation, for a reader `readerLagMs` after the capture. */
function feedStateAt(iso, readerLagMs = 20_000) {
  const s = at(iso);
  const envs = normalizeMmaEnvelopes(s.payload, s.capturedAt);
  const scoped = scopeSlate(envs, roster.bouts.map((b) => b.boutId));
  const nowMs = Date.parse(s.capturedAt) + readerLagMs;
  const settled = scoped.states.length >= roster.bouts.length && scoped.states.every(isTerminal);
  return {
    byGamePk: scoped.byGamePk,
    unavailable: null,
    loading: false,
    freshness: settled ? { level: "NOT_APPLICABLE", ageMs: null } : freshnessOf({ state: "LIVE", fetchedAt: s.capturedAt }, nowMs),
    matched: scoped.matched,
    settled,
    rosterIsToday: true,
    lastObservedAt: s.capturedAt,
    enabled: true,
    nowMs,
  };
}

const MONO = "var(--font-mono)";
function Page({ moment }) {
  const h = React.createElement;
  return h("div", { className: "mx-auto px-4 py-8 sm:py-10", style: { maxWidth: 1040 } },
    h("p", { role: "note", style: { fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-warn)", border: "1px dashed var(--vault-warn)", borderRadius: 4, padding: "6px 10px", margin: "0 0 18px" } },
      `Local preview · replay of the recorded ESPN feed at ${moment.iso.slice(11, 19)}Z · ${moment.title} · not a public page`),
    h("h1", { style: { fontFamily: "var(--font-display)", fontSize: "clamp(26px,5vw,36px)", color: "var(--vault-text)", margin: "0 0 8px", letterSpacing: "-0.02em" } }, "Live"),
    h("p", { style: { fontSize: 13.5, color: "var(--vault-text-mute)", lineHeight: 1.6, maxWidth: 680, margin: "0 0 4px" } },
      "Follow GameTimePicks forecasts as the games happen. Every forecast below was made before kickoff and is frozen — it does not change while a game is played, and nothing here is recalculated during the game."),
    h("p", { style: { fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "0 0 18px" } }, "Live beta · Sat, Oct 10"),
    h("div", { role: "tablist", "aria-label": "Sport", style: { display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 18px" } },
      ...[["All", false], ["UFC", true]].map(([label, on]) => h("button", {
        key: label, role: "tab", "aria-selected": on, type: "button",
        style: { fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", minHeight: 44, padding: "0 14px", borderRadius: 4,
          color: on ? "var(--vault-bg)" : "var(--vault-text-mute)", background: on ? "var(--vault-text)" : "transparent", border: `1px solid ${on ? "var(--vault-text)" : "var(--vault-border)"}` },
      }, label))),
    h("section", { "aria-label": "UFC" }, h(UfcLiveBoard, { roster, feedState: feedStateAt(moment.iso) })),
    h("p", { style: { fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", marginTop: 28, textTransform: "uppercase", letterSpacing: "0.12em" } }, "Paper-only · educational · not betting advice"),
  );
}

const css = fs.existsSync(CSS_DIR) ? fs.readdirSync(CSS_DIR).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(path.join(CSS_DIR, f), "utf8")).join("\n") : "";
if (!css) console.warn(`warning: no built CSS under ${CSS_DIR}; run the build first for the real styling`);
fs.mkdirSync(OUT, { recursive: true });
const pages = [];
for (const m of MOMENTS) {
  const body = renderToStaticMarkup(React.createElement(Page, { moment: m }));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Local preview · UFC live · ${m.title}</title><style>${css}</style></head><body class="vault-shell">${body}</body></html>`;
  const file = path.join(OUT, `live-${m.key}.html`);
  fs.writeFileSync(file, html);
  pages.push({ m, file });
  console.log(`wrote ${file}`);
}

if (process.argv.includes("--shots")) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 375]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width === 375 ? 2 : 1, colorScheme: "dark" });
      const page = await ctx.newPage();
      for (const { m, file } of pages) {
        await page.goto(`file://${file}`, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
        const shot = path.join(OUT, `live-${m.key}-${width}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        console.log(`shot ${shot}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}
