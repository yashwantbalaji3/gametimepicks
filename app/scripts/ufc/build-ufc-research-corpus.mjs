/**
 * UFC research corpus builder (Program 153 · Release A) — PRIVATE RESEARCH ARTIFACT.
 *
 * The BOUT is the unit; the CARD is its parent, linked by provider ids — a card title is never a
 * bout identity. Fighter identity is the provider ATHLETE ID first (names are display, ids are
 * identity); a bout missing either athlete id quarantines rather than joining by name.
 *
 * Outcome semantics, explicit: exactly one winner flag → decisive (result R/B by corner order as
 * listed); zero winner flags on a FINAL → DRAW_OR_NC bucket (kept, never evaluated as decisive,
 * never guessed apart); two winner flags → REFUSE (source defect). Self-matchups REFUSE.
 * Duplicate bout ids REFUSE on conflict, dedupe when byte-equal.
 *
 * Run: node scripts/ufc/build-ufc-research-corpus.mjs --now <ISO>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "ufc");
const RAW = path.join(ROOT, "raw");

const argNow = process.argv.indexOf("--now");
if (argNow === -1 || !Number.isFinite(Date.parse(process.argv[argNow + 1] ?? ""))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const NOW = process.argv[argNow + 1];

const cards = new Map();
const bouts = new Map();
const quarantined = [];

for (const file of fs.readdirSync(RAW).filter((f) => f.startsWith("espn-") && f.endsWith(".json")).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(RAW, file), "utf8"));
  for (const e of d.events ?? []) {
    const cardId = String(e.id ?? "");
    if (!cardId || !e.date || !e.name) continue;
    if (!cards.has(cardId)) cards.set(cardId, { providerCardId: cardId, name: e.name, dateUtc: e.date, venue: e.competitions?.[0]?.venue?.fullName ?? null, boutCount: e.competitions?.length ?? 0, sourceFile: file });
    for (const c of e.competitions ?? []) {
      const boutId = String(c.id ?? "");
      const [k1, k2] = c.competitors ?? [];
      const rec = {
        providerBoutId: boutId,
        providerCardId: cardId,
        cardName: e.name,
        dateUtc: c.date ?? e.date,
        weightClass: c.type?.abbreviation ?? c.type?.text ?? null,
        // Historical shape: the fighter id lives at COMPETITOR level (athlete{} has only names);
        // forward shape put it under athlete.id — accept either, in that order of specificity.
        red: { id: k1?.athlete?.id != null ? String(k1.athlete.id) : k1?.id != null ? String(k1.id) : null, name: k1?.athlete?.displayName ?? null, winner: k1?.winner === true },
        blue: { id: k2?.athlete?.id != null ? String(k2.athlete.id) : k2?.id != null ? String(k2.id) : null, name: k2?.athlete?.displayName ?? null, winner: k2?.winner === true },
        statusRaw: c.status?.type?.name ?? null,
        sourceFile: file,
      };
      if (!boutId) { quarantined.push({ file, reason: "bout without provider id" }); continue; }
      if (bouts.has(boutId)) {
        const prev = bouts.get(boutId);
        if (JSON.stringify({ ...prev, sourceFile: null }) !== JSON.stringify({ ...rec, sourceFile: null })) { console.error(`REFUSED: conflicting duplicate bout id ${boutId}`); process.exit(1); }
        continue;
      }
      bouts.set(boutId, rec);
      if (!rec.red.id || !rec.blue.id || !rec.red.name || !rec.blue.name) { quarantined.push({ boutId, file, reason: "missing athlete id/name — identity joins by id, never by name alone" }); bouts.delete(boutId); continue; }
      if (rec.red.id === rec.blue.id) { console.error(`REFUSED: self-matchup ${boutId} (${rec.red.name})`); process.exit(1); }
      if (!/^STATUS_FINAL/.test(rec.statusRaw ?? "")) { quarantined.push({ boutId, file, reason: `status ${rec.statusRaw} is not FINAL` }); bouts.delete(boutId); continue; }
      if (rec.red.winner && rec.blue.winner) { console.error(`REFUSED: two winners in bout ${boutId}`); process.exit(1); }
      rec.outcome = rec.red.winner ? "R" : rec.blue.winner ? "B" : "DRAW_OR_NC";
    }
  }
}

const rows = [...bouts.values()].filter((b) => b.outcome).sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.providerBoutId.localeCompare(b.providerBoutId));
const fighters = new Set(rows.flatMap((b) => [b.red.id, b.blue.id]));
const decisive = rows.filter((b) => b.outcome !== "DRAW_OR_NC").length;
if (rows.length < 800) { console.error(`REFUSED: only ${rows.length} final bouts — the retrieval window looks incomplete; run the fetcher to completion first`); process.exit(1); }

const corpus = {
  schemaVersion: 1,
  artifact: "ufc-research-corpus",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  sourceManifest: "raw/CAPTURE_MANIFEST.json",
  cards: cards.size,
  totalFinalBouts: rows.length,
  decisive,
  drawOrNc: rows.length - decisive,
  distinctFighters: fighters.size,
  weightClasses: [...new Set(rows.map((b) => b.weightClass).filter(Boolean))].sort(),
  quarantinedCount: quarantined.length,
  quarantined: quarantined.slice(0, 200),
  cardIndex: [...cards.values()].sort((a, b) => a.dateUtc.localeCompare(b.dateUtc)),
  rows,
};
fs.writeFileSync(path.join(ROOT, "corpus-v1.json"), JSON.stringify(corpus, null, 1));
console.log(`corpus-v1.json: ${rows.length} final bouts on ${cards.size} cards; decisive ${decisive}, draw/NC ${corpus.drawOrNc}; fighters ${fighters.size}; classes ${corpus.weightClasses.length}; quarantined ${quarantined.length}`);
