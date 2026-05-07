import { getMeta } from "@/lib/data";
import { formatTimestamp } from "@/lib/format";

export default function Footer() {
  const meta = getMeta();
  return (
    <footer className="relative z-10 mt-24 border-t border-[var(--border)]">
      <div className="mx-auto max-w-[1280px] px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-[13px] text-[var(--text-mute)]">
          <div>
            <div className="eyebrow mb-3">About</div>
            <p className="leading-relaxed">
              GametimePicks is an educational sports prop analytics project.
              It compares model projections against market lines for NBA player
              props using real player data and compliant odds sources.
            </p>
            <p className="mt-3 text-[var(--text-faint)] text-[12px]">
              Not betting advice. No guarantees. Educational and research use only.
            </p>
          </div>

          <div>
            <div className="eyebrow mb-3">Data sources</div>
            <ul className="space-y-1.5">
              {meta.dataSources.map((src) => (
                <li key={src.name}>
                  {src.url ? (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener"
                      className="hover:text-[var(--vault-gold)] transition-colors"
                    >
                      {src.name} <span className="text-[var(--text-faint)]">↗</span>
                    </a>
                  ) : (
                    <span className="text-[var(--text-faint)]">{src.name}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="eyebrow mb-3">Status</div>
            <div className="font-mono text-[12px] space-y-1">
              <div>
                <span className="text-[var(--text-faint)]">version</span>{" "}
                <span>{meta.version}</span>
              </div>
              <div>
                <span className="text-[var(--text-faint)]">last refresh</span>{" "}
                <span>{formatTimestamp(meta.lastPipelineRun)}</span>
              </div>
              <div>
                <span className="text-[var(--text-faint)]">mode</span>{" "}
                <span className={meta.isDemo ? "text-[var(--vault-warn)]" : "text-[var(--vault-success)]"}>
                  {meta.isDemo ? "demo data" : "live data"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--border)] flex flex-wrap justify-between gap-3 text-[11px] font-mono uppercase tracking-wider text-[var(--text-faint)]">
          <span>© 2026 Yashwant Balaji</span>
          <span>
            built as a portfolio analytics project ·{" "}
            <a
              href="https://yashwantbalaji.com"
              target="_blank"
              rel="noopener"
              className="hover:text-[var(--vault-gold)] transition-colors"
            >
              yashwantbalaji.com
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
