"use client";
/**
 * /nba/projections — one game's status label on the reader's clock (follow-up to PR 1163).
 *
 * Rendered only for a game the BUILD saw as upcoming: the page is a static export, so "Upcoming" would go stale at
 * tip-off. The first render is the build's answer (server and client markup agree); after mount the reader's clock may
 * advance it to "Started" once the tip-off instant passes — never back, and never to "Final" (only the finals record,
 * read at build time, may say that). A read-only label: it touches no number. Imports only React and the import-free
 * view ops (projection-board-client-imports.test.mjs).
 *
 * Props are one short code and one instant per game, so the RSC payload stays small (no per-row data).
 */
import React, { useEffect, useState } from "react";

import { GAME_STATUS_LABEL, gameStatusOnClock } from "@/lib/sports/nba/projection-board-ops.mjs";

const TICK_MS = 30_000;

export default function GameStatusOnClock({ t }: { t: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const check = () => setNow(Date.now());
    check();
    const id = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return <>{GAME_STATUS_LABEL[gameStatusOnClock("upcoming", t, now) as keyof typeof GAME_STATUS_LABEL]}</>;
}
