# Founder Odds-API Authorization — Program 171 (NFL only)

**Provenance:** delivered by the founder inside the Program 171 charter
(`Program_171_NFL_End_to_End_Live_Activation_Prompt_Aug13_2026.docx`, prepared 2026-08-13),
committed here verbatim so the repository carries the receipt every credit-guard contract
requires before a paid call. Recorded at repo tip `9be3ef190`.

## Authorization (verbatim from the charter, §D2)

> I authorize NFL-only Odds API acquisition during Program 171 up to a cumulative maximum of
> 3,000 credits. There is no minimum remaining-balance floor. Use the budget for preflight,
> supported-market discovery, current team markets, available NFL player props,
> anytime-touchdown markets, and evidence-driven pre-start refreshes. Do not query another
> sport, do not place bets, do not change the subscription, redact all receipts, do not retry
> blindly, and stop before any call that would exceed the cumulative ceiling.

## Operative terms

| Term | Value |
|---|---|
| Scope | NFL only (`americanfootball_nfl`) — every other sport key out of scope |
| Cumulative ceiling | **3,000 credits for Program 171** (circuit breaker, not scarcity) |
| Remaining-balance floor | **NONE — the former 19,950 floor is obsolete and removed** (founder-reported ~15,829 remaining; verify via provider usage headers on the first authorized call, never from the screenshot) |
| Permitted purposes | preflight · supported-market discovery · current team ML/spread/total · supported pass/rush/receive props · anytime-TD markets · evidence-driven pre-start refreshes |
| Bookmakers | prioritize the supported US comparison set (DraftKings, FanDuel, BetMGM, Caesars, already-approved books) — never every global book by default |
| Expiry | Program 171 close OR the 3,000-credit cumulative ceiling, whichever first |
| Discipline | cumulative private credit ledger per response; failed charged calls count; no blind retries; stop before any call whose worst-case cost breaches the ceiling; redact + self-scan every receipt |

## Consumption ledger

Maintained privately per run (request purpose, events, market keys, regions/books, status,
credits used, provider-reported remaining). **Cumulative Program 171 spend at this commit: 0.**

Note for tooling: the legacy canary (`odds-canary.mjs`) still enforces its own historical
`--max-credits`/floor defaults — Program 171 execution extends the guard to read THIS receipt's
ceiling rather than bypassing anything.
