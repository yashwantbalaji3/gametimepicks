"use client";
/**
 * ScrollRegionA11y — two keyboard/colour fixes the page components cannot each be trusted to make.
 *
 * 🔴 WHY IT EXISTS. The 2026-10-05 QA pass (axe, WCAG 2.2 AA) found two failures spread across ~10
 * department-owned pages, none of them from one shared component:
 *
 *   1. `scrollable-region-focusable` — 23 sideways-scrolling table boxes on 11 routes at 390px. Each
 *      is an inline `overflow-x: auto` div with no tabindex, so a keyboard user cannot scroll it.
 *      The authored pattern already exists (`data-scroll-x role="region" tabIndex={0}` in Lab,
 *      Compare and Research); this is the safety net for every box that did not adopt it.
 *   2. `link-in-text-block` — links inside running text distinguished by colour alone (WCAG 1.4.1).
 *      A CSS selector cannot tell "a link inside a sentence" from a card or CTA that happens to sit
 *      in a <p> or <li> (measured: every candidate selector hit ~100 non-prose links), so the test
 *      runs here on used style and marks matches with `data-prose-link`; globals.css underlines them.
 *
 * WHAT IT DOES, after mount and again (debounced) when <main>'s subtree or the viewport changes:
 *   - a box that scrolls sideways, has no tabindex and whose own controls cannot scroll it to its
 *     last column (or that has no controls at all) gets
 *     `tabindex=0`, `role=region` and a name (section label → heading → caption → fallback). If it
 *     stops overflowing it is restored, so it never adds a dead Tab stop on a wide screen;
 *   - an inline link with no underline whose block also holds other text gets `data-prose-link`.
 *
 * It only adds attributes React does not render, so it cannot cause hydration mismatches, and an
 * underline changes no layout. It renders nothing.
 */
import { useEffect } from "react";

const MARK = "data-scroll-a11y";
const FOCUSABLE = "a[href], button, input, select, textarea, summary, [tabindex]";

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

const MAX_NAME = 80;

/** Columns a Tab through the box's own links and buttons can never scroll into view. */
const REACH_SLACK = 24;

/**
 * True when focusing the box's own controls scrolls it far enough to show every column. A
 * focused child is scrolled into view, so the box scrolls only as far as its rightmost control:
 * a table whose links sit in the first column (Results by-week and game-by-game tables, QA
 * Production check 2026-10-05) hid 132–458px of columns from the keyboard.
 */
function focusReachesEnd(box: HTMLElement): boolean {
  const controls = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (!controls.length) return false;
  const left = box.getBoundingClientRect().left - box.scrollLeft;
  const rightmost = Math.max(...controls.map((c) => c.getBoundingClientRect().right - left));
  return box.scrollWidth - Math.max(rightmost, box.clientWidth) <= REACH_SLACK;
}

function nearestHeading(box: HTMLElement): string {
  const headings = Array.from(document.querySelectorAll("main h1, main h2, main h3, main h4"));
  for (let i = headings.length - 1; i >= 0; i--) {
    if (headings[i].compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) return textOf(headings[i]);
  }
  return "";
}

/** A short name: caption → section label → nearest heading. A label that is really a whole panel's text is skipped. */
function regionName(box: HTMLElement): string {
  const section = box.closest("[aria-label], [aria-labelledby]");
  const ids = (section?.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const candidates = [
    textOf(box.querySelector("caption")),
    section?.getAttribute("aria-label") ?? "",
    ids.map((id) => textOf(document.getElementById(id))).filter(Boolean).join(" "),
    nearestHeading(box),
  ];
  for (const c of candidates) if (c && c.length <= MAX_NAME) return c;
  const long = candidates.find(Boolean);
  return long ? long.slice(0, MAX_NAME).replace(/\s+\S*$/, "") + "…" : "Scrollable table";
}

function fixScrollRegions(main: HTMLElement) {
  for (const el of Array.from(main.querySelectorAll<HTMLElement>("*"))) {
    const ours = el.hasAttribute(MARK);
    if (!ours && el.scrollWidth <= el.clientWidth + 1) continue; // cheap check first; most elements stop here
    const overflowX = getComputedStyle(el).overflowX;
    const scrolls = (overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1;
    if (scrolls && !ours && !el.hasAttribute("tabindex") && !focusReachesEnd(el)) {
      el.setAttribute(MARK, "");
      el.tabIndex = 0;
      if (!el.hasAttribute("role")) el.setAttribute("role", "region");
      if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) el.setAttribute("aria-label", regionName(el));
    } else if (ours && !scrolls) {
      el.removeAttribute(MARK);
      el.removeAttribute("tabindex");
      if (el.getAttribute("role") === "region") el.removeAttribute("role");
      el.removeAttribute("aria-label");
    }
  }
}

function blockAncestor(el: Element): Element | null {
  let a = el.parentElement;
  while (a && getComputedStyle(a).display.startsWith("inline")) a = a.parentElement;
  return a;
}

/** Text on the block's own lines: text nodes and inline descendants, not nested blocks (a date row under a title). */
function inlineText(node: Node): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? "";
    else if (child instanceof Element && getComputedStyle(child).display.startsWith("inline")) out += inlineText(child);
  }
  return out;
}

function markProseLinks(main: HTMLElement) {
  for (const a of Array.from(main.querySelectorAll<HTMLAnchorElement>("a[href]:not([data-prose-link])"))) {
    const cs = getComputedStyle(a);
    if (cs.display !== "inline" || cs.textDecorationLine.includes("underline")) continue;
    if (a.closest("nav, [role=navigation], [role=button]")) continue;
    const block = blockAncestor(a);
    if (!block) continue;
    const rest = inlineText(block).replace(a.textContent ?? "", "");
    if (/[a-z0-9]{2,}/i.test(rest)) a.setAttribute("data-prose-link", "");
  }
}

export default function ScrollRegionA11y() {
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fixScrollRegions(main);
        markProseLinks(main);
      }, 150);
    };
    run();
    const mo = new MutationObserver(run);
    mo.observe(main, { childList: true, subtree: true });
    window.addEventListener("resize", run);
    return () => {
      clearTimeout(timer);
      mo.disconnect();
      window.removeEventListener("resize", run);
    };
  }, []);
  return null;
}
