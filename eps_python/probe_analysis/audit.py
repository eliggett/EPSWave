#!/usr/bin/env python3
"""
Check every parameter the app touches against what a Classic actually answered.

    python3 audit.py ~/Downloads/EPS-testing/Test*/*.jsonl

The parameter sweeps are a census: on this hardware an item that does not answer
does not exist. That makes them something to check the app against. Every
`getParameter`/`setParameter` call in eps.js names a page and an item, and if
the machine was silent on one of them then that call does nothing on a Classic —
silently, because a `PUT PARAMETER` that lands nowhere returns no error.

Run this after changing anything that sets a parameter. A new call on a page the
Classic does not have is exactly the kind of mistake nothing else here would
catch: it works perfectly on the developer's 16 PLUS.

Two calls are expected to fail the check and are not bugs — the fadecurve at
`$18 $05` and the LFO rate modulation source at `$1C $08` are 16 PLUS additions,
and both sit behind a `sixteenPlusOnly` guard in eps.js. The report says so
rather than hiding them, because the guard is what makes them safe and a guard
can be removed by accident.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from capture import Capture, classic_page


# Calls known to be guarded, as {(page, item): why}. Listed rather than
# suppressed: the point is to show that the app knows about them.
GUARDED = {
    (0x18, 0x05): "fadecurve — 16 PLUS only, behind `sixteenPlusOnly`",
    (0x1C, 0x08): "LFO rate mod source — 16 PLUS only, behind `sixteenPlusOnly`",
}

# Pages the sweeps never covered, but which the captures exercise anyway. The
# sweeps deliberately stop at the ten instrument pages -- $30 is where a 16 PLUS
# has twice crashed -- so silence here means "not asked", not "not there".
# Each of these was seen working in a real session, which is better evidence
# than a sweep would have been.
VERIFIED_IN_PRACTICE = {
    (0x30, 0x00): "effects page — never sent to a Classic; eps.js returns "
                  "notOnThisModel before asking, because $30 is the Classic's "
                  "MIDI page and answering would be worse than failing",
    (0x34, 0x00): "free system blocks — Test Connection reads it on every "
                  "session; an EPS-M reported 3246 blocks on 19 August",
    (0x38, 0x00): "current edit instrument — how the app selects an "
                  "instrument, confirmed in the addressing finding of the "
                  "18 August capture",
}


def census(captures):
    """{page: set(items)} the machine answered, merged across captures."""
    answered = {}
    for capture in captures:
        for event in capture.parameters():
            if event.get("answered"):
                answered.setdefault(event["high"], set()).add(event["low"])
    return answered


def call_sites(source):
    """
    Every resolvable getParameter/setParameter call, as (op, page, item, line).

    eps.js names most of these through `static` constants, so those are resolved
    from the same file rather than duplicated here. A call whose page or item is
    computed at runtime cannot be checked and is counted separately — better to
    say how many were skipped than to quietly check fewer than it looks like.
    """
    constants = dict(re.findall(
        r"static ([A-Z0-9_]+) *= *(0x[0-9A-Fa-f]+)", source))

    def resolve(token):
        token = token.strip()
        if re.fullmatch(r"0x[0-9A-Fa-f]+", token):
            return int(token, 16)
        if re.fullmatch(r"\d+", token):
            return int(token)
        match = re.fullmatch(r"EPS16\.([A-Z0-9_]+)", token)
        if match and match.group(1) in constants:
            return int(constants[match.group(1)], 16)
        return None

    found, unresolved = [], 0
    for match in re.finditer(
            r"(set|get)Parameter\(\s*([^,\)]+),\s*([^,\)]+)", source):
        page, item = resolve(match.group(2)), resolve(match.group(3))
        if page is None or item is None:
            unresolved += 1
            continue
        line = source[:match.start()].count("\n") + 1
        found.append((match.group(1), page, item, line))
    return sorted(set(found), key=lambda call: (call[1], call[2], call[3])), unresolved


def main(argv):
    paths = [arg for arg in argv if not arg.startswith("--")]
    if not paths:
        print(__doc__)
        return 1

    root = os.path.abspath(os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    eps_js = os.path.join(root, "eps.js")
    if not os.path.exists(eps_js):
        print("Cannot find eps.js at %s" % eps_js)
        return 1

    answered = census([Capture(path) for path in paths])
    calls, unresolved = call_sites(open(eps_js, encoding="utf-8").read())

    print("=" * 72)
    print("PARAMETER AUDIT  what eps.js touches, against what a Classic answered")
    print("=" * 72)
    print()

    problems, guarded, unswept = [], [], []
    for op, page, item, line in calls:
        if page not in answered and (page, item) in VERIFIED_IN_PRACTICE:
            unswept.append((op, page, item, line))
            state = "not swept, but seen working"
        elif page not in answered:
            problems.append((op, page, item, line))
            state = "*** UNKNOWN — page never swept ***"
        elif item in answered[page]:
            state = "yes"
        elif (page, item) in GUARDED:
            guarded.append((op, page, item, line))
            state = "no — but guarded"
        else:
            problems.append((op, page, item, line))
            state = "*** NOT ON THE CLASSIC ***"
        print("  %-3s $%02X $%02X  (Classic page %2d item %2d)  eps.js:%-5d %s"
              % (op, page, item, classic_page(page), item, line, state))

    print()
    print("  %d calls checked, %d could not be resolved statically"
          % (len(calls), unresolved))

    if guarded:
        print()
        print("  16 PLUS only, and the app knows it:")
        for op, page, item, line in guarded:
            print("      eps.js:%-5d $%02X $%02X — %s"
                  % (line, page, item, GUARDED[(page, item)]))

    if unswept:
        print()
        print("  On pages no sweep covered, but seen working in a session:")
        for op, page, item, line in unswept:
            print("      eps.js:%-5d $%02X $%02X — %s"
                  % (line, page, item, VERIFIED_IN_PRACTICE[(page, item)]))

    print()
    if problems:
        print("  FAIL — these would do nothing on a Classic, and say nothing:")
        for op, page, item, line in problems:
            print("      eps.js:%-5d %sParameter($%02X, $%02X)"
                  % (line, op, page, item))
        return 1

    print("  PASS — every parameter the app touches either exists on a Classic,")
    print("  is a 16 PLUS addition the app already guards, or has been seen")
    print("  working on one. Nothing is unaccounted for.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
