/**
 * <EtTime> — one way to print an artifact stamp on a public page (2026-10-15, P246 house rule).
 *
 * Visible text is the reader's time zone convention, "Oct 14, 7:43 PM ET" (formatUpdatedEt). The exact
 * ISO value is kept in the `dateTime` attribute and the hover title, so provenance loses no precision
 * and a check that looks for the artifact's own stamp in the page still finds it. A value that does not
 * parse is printed as given — never a fabricated time.
 */
import { formatUpdatedEt } from "@/lib/format";

export default function EtTime({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <>—</>;
  const ok = Number.isFinite(Date.parse(iso));
  return ok ? <time dateTime={iso} title={iso}>{formatUpdatedEt(iso)}</time> : <>{iso}</>;
}
