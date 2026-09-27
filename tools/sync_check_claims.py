#!/usr/bin/env python3
"""Rewrite the "N automated checks" figures in the storefront to match what the
suites actually asserted on this run.

Why a script and not a hand-typed number: tests/storefront.test.js reads the
shipped HTML as text, so the claim has to be literal markup rather than something
JavaScript fills in at view time. That is also what makes it rot — the number goes
stale the day a suite is added or a test is renamed, and nobody notices on a
marketing page. So the integer belongs to the build, not to the copywriter.

Pages mark the spot with data-checks="<product>" (or "all" for the catalogue-wide
claim). run_tests.sh calls this after every suite; storefront.test.js then asserts
the literal number in the file equals the measurement, which catches both a stale
claim and a hand-edit that oversells the build.

Usage: python3 tools/sync_check_claims.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
MARKER = re.compile(r'(data-checks="([a-z]+)"[^>]*>)\s*([\d,\u2014]+)\s*(<)')


def script_var(name):
    """Read a `window.X` literal out of products.js.

    products.js is JavaScript with unquoted keys and comments, so it is evaluated
    in a sandboxed context rather than parsed as JSON.
    """
    js = ("const vm=require('fs'),m=require('vm');const w={};"
          "m.runInContext(vm.readFileSync('site/products.js','utf8'),"
          "m.createContext({window:w}));console.log(JSON.stringify(w." + name + "));")
    out = subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(f"could not read window.{name} from products.js:\n{out.stderr}")
    return json.loads(out.stdout)


def figures(suites, by_product, all_suites):
    """Product id -> the count its page may claim."""
    out = {pid: sum(suites[s] for s in ids) for pid, ids in by_product.items()}
    out["all"] = sum(suites[s] for s in all_suites)
    return out


def main():
    count_file = ROOT / "tests" / "check-count.json"
    if not count_file.exists():
        raise SystemExit("tests/check-count.json is missing — run ./tests/run_tests.sh, "
                         "which writes it from the suites' own output")
    measured = json.loads(count_file.read_text(encoding="utf-8"))
    suites = measured["suites"]
    by_product, all_suites = script_var("CHECK_SUITES"), script_var("CHECK_ALL")
    missing = sorted({s for group in list(by_product.values()) + [all_suites]
                      for s in group if s not in suites})
    if missing:
        raise SystemExit("suites named in products.js were not measured this run: "
                         + ", ".join(missing))
    figs = figures(suites, by_product, all_suites)

    fixed, problems = 0, []
    for page in sorted(SITE.glob("*.html")):
        html = page.read_text(encoding="utf-8")

        def sub(m):
            nonlocal fixed
            pid = m.group(2)
            if pid not in figs:
                problems.append(f"{page.name}: no count configured for '{pid}'")
                return m.group(0)
            want = f"{figs[pid]:,}" if "," in m.group(3) else str(figs[pid])
            if m.group(3) != want:
                fixed += 1
                print(f"  {page.name}: [{pid}] {m.group(3)} -> {want}")
            return m.group(1) + want + m.group(4)

        new = MARKER.sub(sub, html)
        if new != html:
            page.write_text(new, encoding="utf-8")

    if problems:
        for p in problems:
            print("ERROR " + p, file=sys.stderr)
        return 1
    print(f"synced {fixed} check-count claim(s) from {sum(suites.values())} measured checks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
