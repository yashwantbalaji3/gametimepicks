"use client";
/**
 * AnalystMore — the one line a Simple reader sees where Analyst detail was left out.
 *
 * Progressive disclosure has to be discoverable: a section that silently disappears in Simple reads as
 * missing, not as optional. So a page that wraps detail in <AnalystOnly> names WHAT is there, once, and
 * offers the switch in place (on a phone the toggle lives in the Menu sheet, three taps away).
 *
 * The inverse of AnalystOnly, and hydration-safe the same way: the server and the first client render
 * are Simple, so both render this line; an Analyst device drops it after its preference loads, at the
 * same moment the AnalystOnly detail appears.
 *
 * `what` names detail only — never a value, line, result or warning (those are never hidden).
 */
import { useViewMode } from "@/lib/prefs/view-mode";

/** `flush` drops the top margin when the line sits inside a panel that already spaces its children. */
export default function AnalystMore({ what, flush = false }: { what: string; flush?: boolean }) {
  const { mode, setMode } = useViewMode();
  if (mode === "analyst") return null;
  return (
    <p className="gtp-analyst-more" style={{ margin: flush ? 0 : "18px 0 0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", fontSize: 12.5, lineHeight: 1.55, color: "var(--vault-text-mute)", maxWidth: 760 }}>
      <span>More model detail — {what} — is in the Analyst view.</span>
      <button
        type="button"
        onClick={() => setMode("analyst")}
        style={{ minHeight: 44, padding: "0 4px", border: 0, background: "transparent", color: "var(--vault-accent)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
      >
        Show Analyst detail
      </button>
    </p>
  );
}
