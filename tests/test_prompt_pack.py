#!/usr/bin/env python3
"""Validate the prompt pack as a sellable product.

Checks the CSV structure, the bracket discipline every prompt promises, and that
batch_runner.py actually runs. Run directly or via tests/run_tests.sh.

    python3 tests/test_prompt_pack.py
"""

import csv
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACK = ROOT / "prompt-pack"
CSV_PATH = PACK / "prompts.csv"
EXPECTED_COLUMNS = ["Category", "Prompt", "Variables to Fill", "When To Use It", "Expected Output"]
BRACKET = re.compile(r"\[([A-Z][A-Z0-9 /:_\-]+)\]")

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))


def main() -> int:
    if not CSV_PATH.exists():
        print(f"FATAL: {CSV_PATH} is missing")
        return 1

    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = [r for r in reader if any(cell.strip() for cell in r)]

    check("CSV header matches the documented columns", header == EXPECTED_COLUMNS, f"{header}")
    check("pack contains 120 prompts", len(rows) == 120, f"got {len(rows)}")
    check("every row has all five fields", all(len(r) == 5 for r in rows),
          f"bad rows: {[i for i, r in enumerate(rows, 2) if len(r) != 5][:5]}")
    check("no duplicate prompts", len({r[1] for r in rows}) == len(rows))

    cats = Counter(r[0] for r in rows)
    check("8 categories present", len(cats) == 8, str(dict(cats)))
    check("each category has 15 prompts", set(cats.values()) == {15}, str(dict(cats)))
    check("no stray whitespace in category names", all(c == c.strip() for c in cats))

    # The product promise: every prompt is parameterised, not a bare instruction.
    no_brackets = [r[1][:60] for r in rows if not BRACKET.search(r[1])]
    check("every prompt has at least one [VARIABLE] to fill", not no_brackets, str(no_brackets[:3]))

    empty_when = [r[1][:50] for r in rows if not r[3].strip()]
    empty_out = [r[1][:50] for r in rows if not r[4].strip()]
    check("every prompt says when to use it", not empty_when, str(empty_when[:3]))
    check("every prompt states the expected output", not empty_out, str(empty_out[:3]))

    # The "Variables to Fill" column must list the brackets the prompt actually uses.
    mismatches = []
    for r in rows:
        used = set(BRACKET.findall(r[1]))
        declared = {v.strip() for v in r[2].split(",") if v.strip()}
        undeclared = used - declared
        # A declared-but-unused variable is fine (alternatives), but using an
        # undeclared one means the buyer hits a bracket with no instructions.
        if undeclared:
            mismatches.append((r[1][:45], sorted(undeclared)))
    check("no prompt uses a bracket missing from its Variables column",
          not mismatches, str(mismatches[:3]))

    # Prompts must be concrete enough to be worth paying for.
    thin = [(r[1][:50], len(r[1])) for r in rows if len(r[1]) < 120]
    check("no prompt is a vague one-liner", not thin, str(thin[:3]))

    banned = [(r[1][:50], w) for r in rows for w in
              ("unlock", "elevate your", "seamless", "game-changer", "cutting-edge")
              if w in r[1].lower() and "banned" not in r[1].lower()]
    check("prompts avoid the clichés they tell you to avoid", not banned, str(banned[:3]))

    # Supporting files ship too.
    for name in ("README.md", "system-prompts.md", "batch_runner.py"):
        check(f"{name} is present", (PACK / name).exists())

    personas = (PACK / "system-prompts.md").read_text(encoding="utf-8") if (PACK / "system-prompts.md").exists() else ""
    n_personas = len(re.findall(r"^## \d+\.", personas, re.M))
    check("all 6 personas are documented", n_personas == 6, f"found {n_personas}")
    check("personas have copy-paste blocks", personas.count("```") >= 12)

    # README must not over-promise files that are not in the pack.
    readme = (PACK / "README.md").read_text(encoding="utf-8") if (PACK / "README.md").exists() else ""
    claims = [c for c in re.findall(r"`([\w.\-]+\.(?:csv|md|py|txt))`", readme)]
    missing_claims = [c for c in set(claims) if not (PACK / c).exists()]
    check("README only references files that ship", not missing_claims, str(missing_claims))
    check("README states the real prompt count", "120" in readme)

    # The bundled script must actually execute in its no-cost mode.
    proc = subprocess.run(
        [sys.executable, str(PACK / "batch_runner.py"), "--category", "Email", "--dry-run"],
        capture_output=True, text=True, timeout=60,
    )
    out = proc.stdout or ""
    check("batch_runner dry-run exits cleanly", proc.returncode == 0, proc.stderr[-300:])
    check("dry-run emits all 15 Email prompts", out.count("## ") == 15, f"got {out.count('## ')}")
    check("dry-run makes no API call without a key", "OPENAI" not in out or "dry run" in out.lower())

    proc2 = subprocess.run(
        [sys.executable, str(PACK / "batch_runner.py"), "--all", "--dry-run"],
        capture_output=True, text=True, timeout=120,
    )
    check("batch_runner --all processes the whole pack",
          proc2.returncode == 0 and proc2.stdout.count("## ") == 120,
          f"rc={proc2.returncode} blocks={proc2.stdout.count('## ')}")

    # Substitution must replace declared variables and report the rest.
    ctx = PACK / "_tmp_ctx.txt"
    ctx.write_text("TYPE: follow-up\nAUDIENCE: past clients\nSUBJECT: winter pricing\n", encoding="utf-8")
    try:
        proc3 = subprocess.run(
            [sys.executable, str(PACK / "batch_runner.py"), "--category", "Email",
             "--context", str(ctx), "--dry-run"],
            capture_output=True, text=True, timeout=60,
        )
        check("context file substitution runs", proc3.returncode == 0, proc3.stderr[-300:])
        check("placeholders are replaced in the output",
              "[TYPE]" not in proc3.stdout.split("## 1.")[1][:1500], "TYPE still present")
        check("unfilled brackets are surfaced to the user",
              "Still needs your input" in proc3.stdout)
    finally:
        ctx.unlink(missing_ok=True)

    # Unknown category should fail loudly rather than silently emit nothing.
    proc4 = subprocess.run([sys.executable, str(PACK / "batch_runner.py"), "--category", "Nope", "--dry-run"],
                           capture_output=True, text=True, timeout=60)
    check("unknown category is rejected", proc4.returncode != 0 and "unknown category" in proc4.stderr.lower(),
          f"rc={proc4.returncode}")

    passed = sum(1 for _, ok, _ in results if ok)
    for name, ok, detail in results:
        print(("  ok   " if ok else "  FAIL ") + name + ("" if ok else f"\n        {detail}"))
    print(f"\nPASS {passed}   FAIL {len(results) - passed}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
