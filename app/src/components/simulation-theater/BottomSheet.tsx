"use client";
/**
 * Simulation Theater V2 · bottom sheet (spec §2.2): role=dialog, aria-modal, a drag handle that closes it on a downward
 * swipe, a 44 px Close button, max 85vh with internal scroll. The keyboard contract (focus in, Tab contained, Escape
 * closes, focus returned to the opener) is the product's shared useDialogFocus hook, not a local copy.
 * The caller pauses playback when it opens (playback resumes only on a user action).
 * `variant="modal"` (the projected box score on wide screens): the same dialog and keyboard contract, centred as a modal
 * above 720 px; at ≤720 px it is the bottom sheet again (theater.css `.st-sheet.is-modal`).
 *
 * PORTALLED to <body> (2026-10-20). The site's <main> is `relative z-10`, a stacking context below the mobile bottom
 * navigation (`fixed z-40`), so a sheet rendered in place, whatever its own z-index, was drawn UNDER the nav: the
 * bottom 56 px of every theater sheet (and of the box score) was covered, and the nav stayed clickable behind an
 * aria-modal dialog. In <body> its z-index 1000 is above the nav. The portal's wrapper carries the theater's `.st-root`
 * class and theme variables (`vars`, default THEATER_VARS), so the sheet keeps its look and every `.st-root`-scoped
 * check still covers it. React events still bubble through the island (its onRegionKey skips dialogs).
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/a11y/use-dialog-focus";
import { THEATER_VARS } from "./theater-css";

/**
 * Renders theater overlay UI into <body>, inside a `.st-root` wrapper carrying the theme variables. With no document
 * (a server render: the app never opens a sheet there, but the unit tests render open dialogs) it renders in place.
 */
export function TheaterLayer({ children, vars = THEATER_VARS, className = "" }: { children: ReactNode; vars?: Record<string, string>; className?: string }) {
  const layer = <div className={`st-root st-layer${className ? ` ${className}` : ""}`} style={vars as CSSProperties} data-st-layer="">{children}</div>;
  return typeof document === "undefined" ? layer : createPortal(layer, document.body);
}

export default function BottomSheet({ open, title, onClose, children, variant = "sheet", vars }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; variant?: "sheet" | "modal";
  /** theme variables for the portalled wrapper (the NBA theater passes its own superset) */
  vars?: Record<string, string>;
}) {
  const mod = variant === "modal" ? " is-modal" : "";
  const ref = useRef<HTMLDivElement>(null);
  const initial = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const drag = useRef<{ y: number; dy: number } | null>(null);
  // a stable close for the hook (callers pass inline closures; a new one each render would re-run its effect)
  const latest = useRef(onClose);
  latest.current = onClose;
  const close = useCallback(() => latest.current(), []);

  useLayoutEffect(() => {
    initial.current = open ? ref.current?.querySelector<HTMLElement>("[data-sheet-initial]") ?? null : null;
  }, [open]);
  useDialogFocus(ref, { onClose: close, active: open, initialFocus: initial as React.RefObject<HTMLElement> });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;
  return (
    <TheaterLayer vars={vars}>
    <div className={`st-sheet-backdrop${mod}`} onClick={close}>
      <div ref={ref} className={`st-sheet${mod}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div
          className="st-sheet-handle"
          aria-hidden="true"
          onPointerDown={(e) => { drag.current = { y: e.clientY, dy: 0 }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => {
            if (!drag.current || !ref.current) return;
            drag.current.dy = Math.max(0, e.clientY - drag.current.y);
            ref.current.style.transform = `translateY(${drag.current.dy}px)`;
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (ref.current) ref.current.style.transform = "";
            if (d && d.dy > 80) close();
          }}
        ><span /></div>
        <div className="st-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="st-btn" onClick={close}>Close</button>
        </div>
        <div className="st-sheet-body">{children}</div>
      </div>
    </div>
    </TheaterLayer>
  );
}
