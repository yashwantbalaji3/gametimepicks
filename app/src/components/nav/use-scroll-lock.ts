"use client";
/**
 * useScrollLock — while a full-screen sheet or dialog is open, the page behind it does not scroll (overnight
 * 2026-10-28, W3). Before it, a finger dragging the phone Menu sheet past its end scrolled the page underneath, and the
 * reader came back to a different place than they left.
 *
 * Counted, so two stacked overlays (the tablet Menu sheet opening search) release the page only when the last closes,
 * and the page's own overflow value is restored rather than assumed.
 */
import { useEffect } from "react";

let holders = 0;
let saved: { html: string; body: string } | null = null;

export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const body = document.body;
    if (holders === 0) {
      saved = { html: html.style.overflow, body: body.style.overflow };
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
    }
    holders += 1;
    return () => {
      holders -= 1;
      if (holders === 0 && saved) {
        html.style.overflow = saved.html;
        body.style.overflow = saved.body;
        saved = null;
      }
    };
  }, [active]);
}
