"use client";
/**
 * Simulation Theater V2 · bottom sheet (spec §2.2): role=dialog, aria-modal, a drag handle that closes it on a downward
 * swipe, a 44 px Close button, max 85vh with internal scroll. The keyboard contract (focus in, Tab contained, Escape
 * closes, focus returned to the opener) is the product's shared useDialogFocus hook, not a local copy.
 * The caller pauses playback when it opens (playback resumes only on a user action).
 * `variant="modal"` (the projected box score on wide screens): the same dialog and keyboard contract, centred as a modal
 * above 720 px; at ≤720 px it is the bottom sheet again (theater.css `.st-sheet.is-modal`).
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useDialogFocus } from "@/components/a11y/use-dialog-focus";

export default function BottomSheet({ open, title, onClose, children, variant = "sheet" }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; variant?: "sheet" | "modal";
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
  );
}
