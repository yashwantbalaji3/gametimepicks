import { sourceLine } from "@/lib/products/tier-board/view.mjs";

/* The notes under a board, shared by Bank Builder, Moonshot and the Parlay Lab: which leg kinds the day's cards use,
   what the engine is not yet approved or authorized to include (its own words), and where the cards came from — the
   frozen daily file, or the labelled Level A fallback (founder rule B). */
const PENDING_STATE: Record<string, string> = { NOT_APPROVED: "Not approved yet", NOT_AUTHORIZED: "Not authorized yet" };
const LEG_KIND: Record<string, string> = { "game-winner": "NBA game winners" };

export default function BoardNotes({ board, noun = "card" }: {
  board: { origin: string; productDay: string | null; legKinds?: string[]; pending?: Array<{ key: string; state: string; text: string }> } | null;
  noun?: string;
}) {
  if (!board) return null;
  return (
    <div className="tb-pending" data-tier-pending="" data-board-origin={board.origin}>
      {board.legKinds?.length ? <p className="tb-empty-text"><strong>Legs today:</strong> {board.legKinds.map((k) => LEG_KIND[k] ?? k).join(", ")} only.</p> : null}
      {board.pending?.length ? (
        <>
          <p className="tb-subhead">What today&rsquo;s {noun} can&rsquo;t include yet</p>
          <ul className="tb-bullets">
            {board.pending.map((m) => <li key={m.key}><strong>{PENDING_STATE[m.state] ?? m.state}:</strong> {m.text}</li>)}
          </ul>
        </>
      ) : null}
      <p className="tb-source" data-board-source={board.origin}>{sourceLine(board)}</p>
    </div>
  );
}
