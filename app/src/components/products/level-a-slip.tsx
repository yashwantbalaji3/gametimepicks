"use client";

import { useEffect, useId, useRef, useState } from "react";
import { registerSlipCatalog, useModelSlip } from "@/lib/products/level-a/slip-store";
import { MODEL_SLIP_LABEL, modelSlipText, modelSlipView, slipButtonText } from "@/lib/products/level-a/slip.mjs";
import { etStamp } from "@/lib/et-stamp.mjs";

/* LEVEL A · THE MODEL-ONLY SLIP (client island). Buttons add the public slip legs the server prepared
   (level-a/slip-legs.mjs); the bar and panel show the slip with its flags and, only when every leg has a published
   estimate from distinct games, the combined model estimate (lib/products/level-a/slip.mjs). Model-only: no price,
   no payout, no sportsbook link. 44px targets; every control has a label a screen reader announces. */

type SlipLeg = { sport: string; eventId: string; eventLabel: string; teams: string[]; market: string; outcome: { code: string; label: string }; startUtc: string | null; frozenAt: string | null; estimate: { value: number; text: string; source: string } | null; source: string; key?: string };

type SlipRow = { leg: SlipLeg & { key: string }; flags: string[]; flagText: string[] };
type Combined = { available: true; joint: number; tier: string | null; tierLabel: string | null; shown: string; note: string | null; disclosure: string } | { available: false; reason: string };
type SlipView = { rows: SlipRow[]; combined: Combined; label: string };

const BTN: React.CSSProperties = { minHeight: 44, minWidth: 44, whiteSpace: "nowrap", border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600, background: "transparent", borderRadius: 9999, padding: "0 14px" };
const SPORT: Record<string, string> = { mlb: "MLB", nba: "NBA", epl: "Premier League", "ligue-1": "Ligue 1" };

/** "Add to slip" for one leg, or "Add card to slip" for a card's legs (by key: the bar carries the page's legs once).
 *  Once every leg is in: "In slip · remove" for a leg, "Remove card (n legs)" for a card (slipButtonText). */
export function AddToSlip({ keys, label = "Add to slip", name }: { keys: string[]; label?: string; name: string }) {
  const { slip, add, remove } = useModelSlip();
  const inSlip = keys.length > 0 && keys.every((k) => slip.legs.some((x: { key: string }) => x.key === k));
  const words = slipButtonText({ inSlip, count: keys.length, label, name });
  return (
    <button type="button" className="vault-press inline-flex items-center" style={BTN} aria-pressed={inSlip}
      aria-label={words.aria}
      onClick={() => (inSlip ? keys.forEach(remove) : add(keys))}>
      {words.text}
    </button>
  );
}

/** The "Model slip (n)" bar and its panel, and the page's slip legs (`catalog`, sent once). Renders nothing while the
 *  slip is empty. */
export function ModelSlipBar({ catalog }: { catalog: SlipLeg[] }) {
  registerSlipCatalog(catalog as Array<{ key: string }>);
  const { slip, remove, move, clear } = useModelSlip();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<"" | "copied" | "failed">("");
  const panelId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (open) heading.current?.focus(); }, [open]);
  if (slip.legs.length === 0) return null;
  const view = modelSlipView(slip, { nowMs: now }) as unknown as SlipView;
  const c = view.combined;
  const copy = async () => { try { await navigator.clipboard.writeText(modelSlipText(view)); setCopied("copied"); } catch { setCopied("failed"); } };
  return (
    /* Fixed like the selected-slips tray (the page shell's overflow-x:hidden defeats position:sticky), clearing the
       mobile bottom navigation (fixed, md:hidden) by 64px + the safe area; centred and capped on wide screens. */
    <div className="fixed inset-x-0 z-30 mx-auto w-full max-w-[640px] px-3 bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] md:bottom-4" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      {(
        <section id={panelId} hidden={!open} aria-labelledby={`${panelId}-h`} className="flex flex-col gap-2 rounded-t-xl px-4 py-3" style={{ border: "1px solid var(--vault-border-strong)", background: "var(--gtp-card)", boxShadow: "0 10px 30px color-mix(in srgb, var(--vault-ink-black) 40%, transparent)", maxHeight: "60vh", overflowY: "auto" }}>
          <h2 id={`${panelId}-h`} ref={heading} tabIndex={-1} className="m-0 font-semibold" style={{ color: "var(--vault-text)", fontSize: 15 }}>Model slip</h2>
          <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{MODEL_SLIP_LABEL}.</p>
          <ol className="m-0 flex flex-col gap-2 p-0" style={{ listStyle: "none" }}>
            {view.rows.map((r, i) => (
              <li key={r.leg.key} className="flex flex-col gap-1 text-[12.5px]" style={{ borderTop: "1px solid var(--vault-border)", paddingTop: 6 }}>
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span style={{ color: "var(--vault-text)", fontWeight: 600, overflowWrap: "anywhere" }}>{r.leg.outcome.label}</span>
                  <span style={{ color: "var(--vault-text-mute)", overflowWrap: "anywhere" }}>{r.leg.estimate ? r.leg.estimate.text : "no published estimate"}</span>
                </span>
                <span style={{ color: "var(--vault-text-mute)", overflowWrap: "anywhere" }}>{SPORT[r.leg.sport] ?? r.leg.sport} · {r.leg.eventLabel} · {r.leg.market} · starts {r.leg.startUtc ? etStamp(r.leg.startUtc) ?? r.leg.startUtc : "time unknown"}{r.leg.frozenAt ? ` · frozen ${etStamp(r.leg.frozenAt) ?? r.leg.frozenAt}` : ""}</span>
                {r.flagText.length ? <span role="note" style={{ color: "var(--vault-text)", fontSize: 12 }}>⚠ {r.flagText.join(" · ")}</span> : null}
                <span className="flex flex-wrap gap-2">
                  <button type="button" style={BTN} aria-label={`Move ${r.leg.outcome.label} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                  <button type="button" style={BTN} aria-label={`Move ${r.leg.outcome.label} down`} disabled={i === view.rows.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                  <button type="button" style={BTN} aria-label={`Remove ${r.leg.outcome.label} from the model slip`} onClick={() => remove(r.leg.key)}>Remove</button>
                </span>
              </li>
            ))}
          </ol>
          <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text)" }} data-level-a-slip-combined={c.available ? c.shown : "none"}>
            {c.available ? <>Combined model estimate {c.shown}{c.tierLabel ? ` · ${c.tierLabel}` : ` · ${c.note}`}. <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>{c.disclosure}</span></> : <>No combined estimate: {c.reason}.</>}
          </p>
          <span className="flex flex-wrap items-center gap-2">
            <button type="button" style={BTN} onClick={copy}>Copy summary</button>
            <button type="button" style={BTN} onClick={() => { clear(); setOpen(false); }}>Clear all</button>
            <span aria-live="polite" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{copied === "copied" ? "Copied — plain text, no links. Nothing was placed." : copied === "failed" ? "Copy is not available in this browser." : ""}</span>
          </span>
        </section>
      )}
      <button type="button" className="vault-press flex w-full items-center justify-between" aria-expanded={open} aria-controls={panelId}
        aria-label={`Model slip, ${slip.legs.length} leg${slip.legs.length === 1 ? "" : "s"}, ${c.available ? `combined model estimate ${c.shown}` : "no combined estimate"}. ${open ? "Close" : "Open"} the slip`}
        onClick={() => setOpen((o) => !o)}
        style={{ ...BTN, borderRadius: open ? "0 0 12px 12px" : 12, background: "var(--gtp-card)", boxShadow: "0 10px 30px color-mix(in srgb, var(--vault-ink-black) 40%, transparent)", padding: "0 16px" }}>
        <span>Model slip ({slip.legs.length})</span>
        <span style={{ color: "var(--vault-text-mute)", fontWeight: 400 }}>{c.available ? c.shown : "no combined estimate"} · {open ? "Close" : "Open"}</span>
      </button>
    </div>
  );
}
