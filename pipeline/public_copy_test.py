#!/usr/bin/env python3
"""
public_copy_test — guard against internal / leaky language in public UI.

Scans every .tsx / .ts file under app/src for forbidden strings that
should never reach a public user. Comments (// line and /* */ block,
including JSDoc) are stripped before scanning so JSDoc / type-doc
references to internal names are not false positives.

Run:
    python3 pipeline/public_copy_test.py

Exits 0 if clean, non-zero (with violation list) if any forbidden
string survives in rendered code.

Self-contained — no pandas / numpy / nba_api / app build tooling.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
APP_SRC = REPO_ROOT / "app" / "src"

# Strings forbidden in rendered public copy. Matching is case-sensitive —
# the all-caps tokens below need to match exactly.
#
# Not on this list: "operator only". That phrase appears in
# data-source-badge.tsx, but the surrounding render is gated behind
# `process.env.NEXT_PUBLIC_SHOW_DIAGNOSTICS === "true"`, which is
# tree-shaken from production builds. Adding it here would require a
# per-file whitelist; keeping the list focused on truly public copy
# avoids that complexity.
FORBIDDEN_STRINGS = [
    "provider error",
    "provider failed",
    "odds provider",
    "schedule provider",
    "PROJECTION UNAVAILABLE",
    "INSUFFICIENT DATA",
    "trends_pending:",
    "manual verified",
]


def strip_comments(src: str) -> str:
    """Remove /* ... */ block comments and // line comments while leaving
    quoted string contents intact. Conservative: tracks single/double/
    backtick string state so `// ` inside a URL literal is preserved."""
    # Block comments first — non-greedy across newlines.
    src = re.sub(r"/\*[\s\S]*?\*/", "", src)

    out_lines: list[str] = []
    for line in src.split("\n"):
        in_single = False
        in_double = False
        in_back = False
        cut = len(line)
        i = 0
        while i < len(line):
            c = line[i]
            if not (in_single or in_double or in_back):
                if c == "/" and i + 1 < len(line) and line[i + 1] == "/":
                    cut = i
                    break
                if c == "'":
                    in_single = True
                elif c == '"':
                    in_double = True
                elif c == "`":
                    in_back = True
            elif in_single:
                if c == "\\":
                    i += 1
                elif c == "'":
                    in_single = False
            elif in_double:
                if c == "\\":
                    i += 1
                elif c == '"':
                    in_double = False
            elif in_back:
                if c == "\\":
                    i += 1
                elif c == "`":
                    in_back = False
            i += 1
        out_lines.append(line[:cut])
    return "\n".join(out_lines)


def find_violations() -> list[tuple[Path, int, str, str]]:
    failures: list[tuple[Path, int, str, str]] = []
    for path in sorted(APP_SRC.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix not in (".tsx", ".ts"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        stripped = strip_comments(text)
        for line_no, line in enumerate(stripped.split("\n"), start=1):
            for forbidden in FORBIDDEN_STRINGS:
                if forbidden in line:
                    failures.append((path, line_no, forbidden, line.strip()))
    return failures


def main() -> int:
    if not APP_SRC.is_dir():
        print(f"public_copy_test: app/src not found at {APP_SRC}", file=sys.stderr)
        return 2

    failures = find_violations()
    if not failures:
        print(
            "public_copy_test: PASS — no forbidden strings found in "
            "app/src/**/*.{tsx,ts}"
        )
        return 0

    print(f"public_copy_test: FAIL — {len(failures)} violation(s) found:")
    for path, line_no, forbidden, line in failures:
        rel = path.relative_to(REPO_ROOT)
        snippet = line if len(line) <= 120 else line[:117] + "..."
        print(f"  {rel}:{line_no}  [{forbidden!r}]")
        print(f"      {snippet}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
