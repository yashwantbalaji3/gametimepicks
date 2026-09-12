"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { accountsClient } from "@/lib/accounts/client.mjs";
import { useReaderPrefs, type RiskTolerance } from "@/lib/prefs/reader-prefs";
import { decideStyleSync, describeStyle, styleColumns, normaliseStyle } from "@/lib/accounts/style-sync.mjs";

/* The pure module hands back a plain string; the prefs store accepts only the four it knows. Narrowing
   here rather than casting keeps a bad value out of localStorage instead of trusting the row. */
const asRisk = (r: string | null): RiskTolerance | null =>
  r === "low" || r === "medium" || r === "high" || r === "longshot" ? r : null;

/**
 * YOUR STYLE, IN ONE PLACE (P267).
 *
 * The style control itself stays where it has always been — in the Parlay Center, beside the cards it
 * filters. This panel does one job: reconcile the browser's copy with the account's, and never
 * silently pick a winner. See lib/accounts/style-sync.mjs for why.
 */
export default function StyleSyncPanel({ userId }: { userId: string }) {
  const { prefs, ready, update } = useReaderPrefs();
  const [row, setRow] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /* The adopt-from-account write may happen at most once per mount: prefs change, the decision
     re-runs, and without this it would keep firing. */
  const adopted = useRef(false);

  useEffect(() => {
    const client = accountsClient();
    if (!client) { setRow(null); return; }
    let alive = true;
    void client.from("profiles").select("risk, bankroll, unit_pct").eq("id", userId).maybeSingle()
      .then(({ data }: { data: Record<string, unknown> | null }) => { if (alive) setRow(data ?? null); });
    return () => { alive = false; };
  }, [userId]);

  const decision = row === undefined || !ready ? null : decideStyleSync(row, prefs);

  useEffect(() => {
    if (!decision || !decision.autoAdopt || adopted.current) return;
    adopted.current = true;
    update({ risk: asRisk(decision.account.risk), bankroll: decision.account.bankroll, unitPct: decision.account.unitPct });
  }, [decision, update]);

  const saveToAccount = useCallback(async (style: ReturnType<typeof normaliseStyle>) => {
    const client = accountsClient();
    if (!client) return;
    setBusy(true); setNote(null);
    const { error } = await client.from("profiles").upsert({ id: userId, ...styleColumns(style) });
    setBusy(false);
    if (error) { setNote(`Could not save: ${error.message}`); return; }
    setRow({ risk: style.risk, bankroll: style.bankroll, unit_pct: style.unitPct });
    setNote("Saved to your account.");
  }, [userId]);

  if (!decision) return null;

  const label = { fontSize: 10, letterSpacing: "0.12em", color: "var(--vault-text-faint)" } as const;
  const button = {
    minHeight: 40, border: "1px solid var(--vault-border)", background: "transparent",
    color: "var(--vault-text)", fontSize: 12.5,
  } as const;

  return (
    <section aria-label="Your stated style" className="flex flex-col gap-2.5 rounded-[12px] p-3.5"
      style={{ border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 40%, transparent)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono uppercase" style={label}>Your style</span>
        <Link href="/build#lab-entry" style={{ color: "var(--gtp-bank-cta)", fontSize: 12, fontWeight: 600 }}>
          Change it in the Parlay Center
        </Link>
      </div>

      <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6, maxWidth: "68ch" }}>
        {decision.text}
      </p>

      {decision.state === "DIFFER" ? (
        <div className="flex flex-col gap-2">
          <dl className="m-0 grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: "auto 1fr", fontSize: 12.5 }}>
            <dt className="m-0 font-mono uppercase" style={label}>Account</dt>
            <dd className="m-0" style={{ color: "var(--vault-text)" }}>{describeStyle(decision.account)}</dd>
            <dt className="m-0 font-mono uppercase" style={label}>This browser</dt>
            <dd className="m-0" style={{ color: "var(--vault-text)" }}>{describeStyle(decision.device)}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className="vault-press rounded-full px-3.5" style={button}
              onClick={() => { update({ risk: asRisk(decision.account.risk), bankroll: decision.account.bankroll, unitPct: decision.account.unitPct }); setNote("This browser now uses your saved style."); }}>
              Use my account&rsquo;s style here
            </button>
            <button type="button" disabled={busy} className="vault-press rounded-full px-3.5" style={button}
              onClick={() => { void saveToAccount(decision.device); }}>
              Save this browser&rsquo;s style instead
            </button>
          </div>
        </div>
      ) : null}

      {decision.state === "DEVICE_ONLY" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{describeStyle(decision.device)}</span>
          <button type="button" disabled={busy} className="vault-press rounded-full px-3.5" style={button}
            onClick={() => { void saveToAccount(decision.device); }}>
            {busy ? "Saving…" : "Save it to my account"}
          </button>
        </div>
      ) : null}

      {decision.state === "MATCH" || decision.state === "ACCOUNT_ONLY" ? (
        <span style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{describeStyle(decision.account)}</span>
      ) : null}

      {note ? <p className="m-0" role="status" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{note}</p> : null}

      {/* The line this feature stays on, said out loud where a bankroll is on screen. */}
      <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.6, maxWidth: "68ch" }}>
        A style decides which published cards you see first and what your own numbers work out to. It is never a
        prompt to place anything, and no stake is ever filled in for you.
      </p>
    </section>
  );
}
