#!/usr/bin/env python3
"""
One-time fix for corrupted player YAMLs from the 2026-04-17 fetch-qlrace.cjs
--force run. That script's regex chopped 'bronze: 0' into 'ze: 0' when
replacing existing qlrace blocks, and left fragments of the old block
behind, producing YAML parse errors and failing every GitHub Pages build
since commit 79d2e7e.

Fix: strip from the orphan 'ze: 0' line through any indented remnant lines
that follow, up to (not including) the next real top-level key.

Line endings are preserved (CRLF stays CRLF, LF stays LF per file) to keep
git diffs minimal on Windows.

Usage (from the repo root):
    python scripts/fix-qlrace-corruption.py              # apply fix
    python scripts/fix-qlrace-corruption.py --dry-run    # preview only
"""

import re
import sys
from pathlib import Path

try:
    import yaml  # requires pyyaml; pip install pyyaml --break-system-packages
except ImportError:
    print("ERROR: pyyaml not installed. Run: pip install pyyaml")
    sys.exit(1)

PLAYERS_DIR = Path(__file__).resolve().parent.parent / "src" / "content" / "players"
DRY_RUN = "--dry-run" in sys.argv


def fix_content(text: str) -> tuple[str, bool]:
    """Return (fixed_text, changed). Uses \\n as internal separator."""
    lines = text.split("\n")
    out = []
    i = 0
    changed = False
    while i < len(lines):
        line = lines[i]
        if line == "ze: 0" or re.match(r"^ze:\s", line):
            changed = True
            i += 1  # skip orphan
            while i < len(lines):
                nxt = lines[i]
                if not nxt:
                    i += 1
                    continue
                if re.match(r"^[A-Za-z_]", nxt):  # real top-level key — stop
                    break
                i += 1  # indented remnant — strip
            continue
        out.append(line)
        i += 1
    return "\n".join(out), changed


def detect_eol(raw: bytes) -> bytes:
    """Return the dominant line ending as bytes: b'\\r\\n' or b'\\n'."""
    return b"\r\n" if raw.count(b"\r\n") > raw.count(b"\n") / 2 else b"\n"


def main():
    if not PLAYERS_DIR.exists():
        print(f"ERROR: can't find {PLAYERS_DIR}")
        sys.exit(1)

    fixed = 0
    still_broken = []

    for f in sorted(PLAYERS_DIR.glob("*.yaml")):
        raw = f.read_bytes()
        eol = detect_eol(raw)
        text = raw.decode("utf-8").replace("\r\n", "\n")
        if "ze: 0" not in text and not re.search(r"^ze:\s", text, re.M):
            continue
        new_text, changed = fix_content(text)
        if not changed:
            continue
        try:
            yaml.safe_load(new_text)
        except yaml.YAMLError as e:
            still_broken.append((f.name, str(e).split("\n")[0]))
            continue
        if DRY_RUN:
            print(f"  [WOULD FIX] {f.name}")
        else:
            out_bytes = new_text.replace("\n", eol.decode()).encode("utf-8")
            f.write_bytes(out_bytes)
            print(f"  [FIXED] {f.name}")
        fixed += 1

    print(f"\n{'Would fix' if DRY_RUN else 'Fixed'}: {fixed} files")
    if still_broken:
        print(f"Still broken: {len(still_broken)} files")
        for name, err in still_broken[:10]:
            print(f"  - {name}: {err}")


if __name__ == "__main__":
    main()
