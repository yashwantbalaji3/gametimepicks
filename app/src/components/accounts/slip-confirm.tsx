"use client";
import { useState } from "react";
import { accountsClient } from "@/lib/accounts/client.mjs";
import { toBetSlipRow } from "@/lib/accounts/slip-reading.mjs";
import SlipReadPanel from "./slip-read-panel";

/**
 * CONFIRM WHAT WE READ (P266) — the step that turns a claim about a picture into your record.
 *
 * Every field is editable, because the reader is allowed to be wrong and you are the one who knows.
 * The doubts it computed are listed above the fields rather than buried: an unreadable stake, a
 * decimal price it converted, a ticket price that disagrees with its legs. Nothing is written until
 * you press save, and the row carries the moment YOU confirmed it.
 */
interface Leg { player: string | null; market: string | null; side: string | null; line: number | null; odds: number | null; event?: string | null; startsAt?: string | null }
interface Reading {
  book: string | null; placedAt: string | null; stake: number | null; priceAmerican: number | null;
  legs: Leg[]; statedPayout?: number | null; computedPayout?: number | null; confirmationRequired?: boolean;
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));

export default function SlipConfirm({
  userId, reading, review, imagePath, bandByTier, onSaved, onCancel,
}: {
  userId: string;
  reading: Reading;
  review: string[];
  imagePath: string | null;
  /** The lab's settled record by price band, so your slip can be read against something real. */
  bandByTier: Readonly<Record<string, { wins: number; losses: number; roi?: number | null }>> | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [book, setBook] = useState(reading.book ?? "");
  const [placedAt, setPlacedAt] = useState((reading.placedAt ?? "").slice(0, 10));
  const [stake, setStake] = useState(reading.stake == null ? "" : String(reading.stake));
  const [legs, setLegs] = useState<Leg[]>(reading.legs ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLeg = (i: number, patch: Partial<Leg>) => setLegs((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const missingOdds = legs.some((l) => l.odds == null);
  const stakeMissing = num(stake) == null;

  async function save() {
    setError(null);
    const client = accountsClient();
    if (!client) { setError("Accounts are not connected yet."); return; }
    setSaving(true);
    try {
      const row = toBetSlipRow(
        { ...reading, book: book.trim() || null, placedAt: placedAt ? new Date(`${placedAt}T12:00:00Z`).toISOString() : null, stake: num(stake), legs },
        { userId, source: "screenshot", imagePath, confirmedAt: new Date().toISOString() },
      );
      const { error: err } = await client.from("bet_slips").insert(row);
      if (err) { setError(`It did not save: ${err.message}`); return; }
      onSaved();
    } catch (e) {
      setError(String((e as Error)?.message ?? e).slice(0, 160));
    } finally {
      setSaving(false);
    }
  }

  const field = { minHeight: 40, background: "var(--vault-wash-faint)", border: "1px solid var(--vault-rule)", color: "var(--vault-text)", fontSize: 14 } as const;

  return (
    <section aria-label="Check the slip before saving" className="flex flex-col gap-3 rounded-[14px] p-4"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border-strong)" }}>
      <div className="flex flex-col gap-1">
        <h3 className="m-0" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>Check this against your slip</h3>
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.55 }}>
          Nothing is saved yet. Fix anything the reader got wrong — an empty field means it could not read that value,
          never that the value was zero.
        </p>
      </div>

      {review.length > 0 ? (
        <ul className="flex flex-col gap-1 list-none m-0 p-0">
          {review.map((r, i) => (
            <li key={i} className="rounded-[8px] px-2.5 py-1.5" style={{ background: "var(--vault-warn-dim)", border: "1px solid var(--vault-warn)", color: "var(--vault-text-mute)", fontSize: 12 }}>{r}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="flex flex-col gap-1" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>
          Sportsbook
          <input value={book} onChange={(e) => setBook(e.target.value)} className="rounded-[8px] px-2.5" style={field} placeholder="not read" />
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>
          Placed
          <input type="date" value={placedAt} onChange={(e) => setPlacedAt(e.target.value)} className="rounded-[8px] px-2.5" style={field} />
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 11.5, color: stakeMissing ? "var(--vault-warn)" : "var(--vault-text-faint)" }}>
          Stake {stakeMissing ? "· not read" : ""}
          <input inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} className="rounded-[8px] px-2.5 font-mono tabular-nums" style={field} placeholder="0.00" />
        </label>
      </div>

      <SlipReadPanel legs={legs} byTier={bandByTier} />

      <ul className="flex flex-col gap-2 list-none m-0 p-0">
        {legs.map((l, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_84px] gap-2 items-end">
            <label className="flex flex-col gap-1" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
              Selection
              <input value={l.player ?? ""} onChange={(e) => setLeg(i, { player: e.target.value || null })} className="rounded-[8px] px-2.5" style={field} placeholder="not read" />
            </label>
            <label className="flex flex-col gap-1" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
              Market
              <input value={l.market ?? ""} onChange={(e) => setLeg(i, { market: e.target.value || null })} className="rounded-[8px] px-2.5" style={field} placeholder="not read" />
            </label>
            <label className="flex flex-col gap-1" style={{ fontSize: 11, color: l.odds == null ? "var(--vault-warn)" : "var(--vault-text-faint)" }}>
              Odds
              <input inputMode="numeric" value={l.odds == null ? "" : String(l.odds)} onChange={(e) => setLeg(i, { odds: num(e.target.value) })} className="rounded-[8px] px-2 font-mono tabular-nums" style={field} placeholder="—" />
            </label>
          </li>
        ))}
      </ul>

      {error ? <p className="m-0" role="alert" style={{ color: "var(--vault-danger)", fontSize: 12.5 }}>{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} disabled={saving || stakeMissing || missingOdds}
          className="vault-press rounded-full px-5"
          style={{ minHeight: 44, background: "var(--gtp-bank-lava-cta)", color: "var(--vault-ink-on-mint)", fontSize: 13.5, fontWeight: 800, opacity: saving || stakeMissing || missingOdds ? 0.55 : 1 }}>
          {saving ? "Saving…" : "This is right — save it"}
        </button>
        <button type="button" onClick={onCancel} className="vault-press rounded-full px-4"
          style={{ minHeight: 44, border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)", background: "transparent", fontSize: 12.5 }}>
          Discard
        </button>
        {stakeMissing || missingOdds ? (
          <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>
            {stakeMissing ? "Enter the stake" : "Fill the missing odds"} to save — a blank is not a zero.
          </span>
        ) : null}
      </div>
    </section>
  );
}
