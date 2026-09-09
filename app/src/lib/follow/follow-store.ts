"use client";
/**
 * FOLLOWED TEAMS (P251 · F9).
 *
 * Nothing a reader did on this site survived the visit. The parlay slip persisted; everything else
 * was stateless, so every arrival started from the same cold homepage whether the visitor was a
 * Seahawks fan who came for one game or a first-timer. This is the one persistence feature that
 * changes whether they come back, and it does not need an account to work.
 *
 * BROWSER-LOCAL, LIKE THE SLIP, AND FOR THE SAME REASONS: nothing is transmitted, so a reader's
 * interests are not a data-collection surface; and nothing here can reach a record — following a
 * club changes what is shown FIRST, never what is published, evaluated or settled. A page that
 * reordered its own numbers around a reader's preferences would be a different product.
 *
 * The identity is the club's own published name, because that is what every artifact and the
 * search index already agree on. No id space is invented for this.
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gtp.follow.v1";
/** A shortlist, not a subscription list. Past this it stops being "your teams". */
export const FOLLOW_MAX = 12;

const CHANNEL = "gtp:follow";
const publish = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANNEL)); };

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((x): x is string => typeof x === "string" && x.length > 0))].slice(0, FOLLOW_MAX);
  } catch {
    return [];
  }
}

export function useFollowedTeams() {
  /* Starts EMPTY on the server and on the first client render, then loads after mount — reading
     localStorage during render makes the two markups disagree and throws on hydration. */
  const [teams, setTeams] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTeams(read());
    setReady(true);
    const sync = () => setTeams(read());
    window.addEventListener(CHANNEL, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(CHANNEL, sync); window.removeEventListener("storage", sync); };
  }, []);

  const write = useCallback((next: string[]) => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode or quota — following is best-effort by design */ }
    setTeams(next);
    publish();
  }, []);

  const toggle = useCallback((team: string) => {
    const cur = read();
    const next = cur.includes(team) ? cur.filter((t) => t !== team) : [...cur, team].slice(0, FOLLOW_MAX);
    write(next);
  }, [write]);

  const isFollowed = useCallback((team: string) => teams.includes(team), [teams]);

  return { teams, ready, toggle, isFollowed, clear: () => write([]) };
}
