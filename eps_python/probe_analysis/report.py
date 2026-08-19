#!/usr/bin/env python3
"""
Print a readable report from one or more EPSWave probe captures.

    python3 report.py ~/Downloads/EPS-testing/Test1/*.jsonl ~/Downloads/EPS-testing/Test2/*.jsonl

Pass every capture from a session at once. Several of the sections only work
across captures -- a tester who skips steps in one run and completes them in
another produces a complete picture only when both are read together, and
agreement between two independent sweeps is itself a result.

Sections can be selected with --only, which takes the comma-separated section
names printed in the headings (identity, blocks, coverage, guided, pan, rates,
wave, agreement).
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import analyse
import spec
from capture import Capture, classic_page


def rule(title):
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def section_identity(captures):
    rule("IDENTITY  what was captured, and on what")
    for row in analyse.identity(captures):
        print("  %s" % row["file"])
        print("      model      %s (%s)" % (row["modelLabel"], row["model"]))
        print("      operator   %s" % row["operator"])
        print("      OS         %s" % row["osVersion"])
        print("      started    %s" % row["started"])
        print("      base chan  %s   port %s" % (row["baseChannel"], row["midiIn"]))
        print("      events     %d" % row["events"])


def section_blocks(captures):
    rule("BLOCKS  block lengths as the machine reports them")
    for row in block_rows(captures):
        print(row)


def block_rows(captures):
    rows = []
    for entry in analyse.block_lengths(captures):
        lengths, expected = entry["lengths"], entry["expected"]
        rows.append("  %s" % entry["file"])
        for name in ("instrument", "layer", "wavesample"):
            got, want = lengths.get(name), expected.get(name)
            mark = "same as 16 PLUS" if got == want else "DIFFERS, 16 PLUS is %s" % want
            rows.append("      %-11s %4s words   %s" % (name, got, mark))
    if not rows:
        rows.append("  (no block-length finding in these captures)")
    return rows


def section_coverage(captures):
    rule("COVERAGE  which parameters the machine answered")
    coverage = analyse.parameter_coverage(captures)
    total_answered = total_tried = 0

    for high in sorted(coverage):
        entry = coverage[high]
        answered = sorted(entry["answered"])
        silent = sorted(entry["silent"])
        total_answered += len(answered)
        total_tried += len(entry["tried"])

        print("  page $%02X  (Classic manual page %d)  %s"
              % (high, classic_page(high), analyse.page_name(high)))
        print("      answered %2d of %2d: %s"
              % (len(answered), len(entry["tried"]), compress(answered)))
        if silent:
            print("      silent           : %s" % compress(silent))

    print()
    print("  total answered %d of %d tried" % (total_answered, total_tried))
    print("  Silence is a GET PARAMETER the machine did not reply to at all.")
    print("  On this hardware that means the item does not exist, which makes")
    print("  the answered set an exact census of the Classic's parameters.")


def compress(numbers):
    """[0,1,2,5,6] -> '0-2, 5-6'. Long item lists are unreadable otherwise."""
    if not numbers:
        return "(none)"
    runs = []
    start = previous = numbers[0]
    for value in numbers[1:]:
        if value == previous + 1:
            previous = value
            continue
        runs.append((start, previous))
        start = previous = value
    runs.append((start, previous))
    return ", ".join(str(a) if a == b else "%d-%d" % (a, b) for a, b in runs)


def section_guided(captures):
    rule("GUIDED  one front-panel edit at a time, and what moved")
    steps, skipped = analyse.guided_steps(captures)
    pairs = analyse.correlate(steps)

    for entry in pairs:
        print("  %s   [%s]" % (entry["step"], entry["confidence"]))
        print("      capture  %s" % entry["file"])
        for change in entry["parameters"]:
            print("      param    page $%02X item %2d  (Classic page %d item %d)"
                  "   %s -> %s"
                  % (change["high"], change["low"],
                     change["page"], change["item"],
                     change["from"], change["to"]))
        for word in entry["payload_words"]:
            print("      word     %s word %3d %s half   %s -> %s"
                  % (entry["block"], word["word"], word["half"],
                     word["fromHi"] if word["half"] == "high" else word["fromLo"],
                     word["toHi"] if word["half"] == "high" else word["toLo"]))
        for word in entry["name_words"]:
            print("      (name)   word %d changed too -- the machine stamps a"
                  " wavesample as edited)" % word["word"])
        if entry["pairing"]:
            param, word = entry["pairing"]
            print("      => page $%02X item %d IS %s word %d, %s half"
                  % (param["high"], param["low"], entry["block"],
                     word["word"], word["half"]))
        print()

    if skipped:
        print("  Skipped steps (still open questions):")
        for entry in skipped:
            print("      %-16s %s" % (entry["step"], entry["file"]))


def section_pan(captures):
    rule("PAN  the question the session existed to settle")
    result = analyse.pan(captures)

    print("  As read from wavesample blocks before any edit:")
    seen = set()
    for row in result["interpretations"]:
        key = (row["wavesample"], row["pan"], row["originalPan"])
        if key in seen:
            continue
        seen.add(key)
        print("      ws %s %-12s  app reads pan=%s  raw high byte=%s"
              % (row["wavesample"], row["name"], row["pan"], row["originalPan"]))

    step = result["step"]
    if not step:
        print("\n  The pan step was not completed. The question stays open.")
        return

    print()
    print("  The guided edit:")
    for change in step["parameters"]:
        print("      page $%02X item %d (Classic page %d item %d): %s -> %s"
              % (change["high"], change["low"], change["page"], change["item"],
                 change["from"], change["to"]))
    for word in step["words"]:
        if word["word"] in (0, 1):
            continue
        print("      wavesample word %d %s half: %s -> %s"
              % (word["word"], word["half"],
                 word["fromHi"] if word["half"] == "high" else word["fromLo"],
                 word["toHi"] if word["half"] == "high" else word["toLo"]))

    print()
    print("  values ever observed: %s" % sorted(result["observed_values"]))


def section_rates(captures):
    rule("SAMPLE RATE  which codes the machine took and kept")
    for row in analyse.sample_rates(captures):
        if row["kind"] == "start":
            print("  %s  starting code %s" % (row["file"], row["code"]))
            continue
        print("      code %3d  %-9s read back %-4s  held %-5s  on panel %-5s  %s Hz"
              % (row["code"],
                 "accepted" if row["accepted"] else "REFUSED",
                 row["readBack"], row["held"], row["onPanel"], row["hz"]))


def section_wave(captures):
    rule("WAVE DATA  bit depth, measured two ways")
    existing, roundtrip = analyse.wavedata(captures)

    print("  What already sat in the machine:")
    seen = set()
    for row in existing:
        key = (row.get("effectiveBits"), row.get("lowestSetBit"), row.get("min"), row.get("max"))
        if key in seen:
            continue
        seen.add(key)
        print("      %d samples, bits %d-15 used, effective %d bits,"
              " low 3 bits always zero: %s"
              % (row.get("samples"), row.get("lowestSetBit"),
                 row.get("effectiveBits"), row.get("lowThreeBitsAlwaysZero")))
        print("      range %s .. %s" % (row.get("min"), row.get("max")))

    print()
    print("  What came back after sending 16-bit data in:")
    for row in roundtrip:
        error = row["error"]
        print("      compared %d, identical %d, differing %d"
              % (row["compared"], row["identical"], row["differing"]))
        print("      quantum %s, effective %d bits, behaviour '%s'"
              % (row["quantum"], row["effectiveBits"], row["behaviour"]))
        print("      error min %s max %s mean %.3f, negative rate %s"
              % (error.get("min"), error.get("max"),
                 error.get("mean", 0), error.get("negativeRate")))
        lost = [bit for bit in row["bits"] if bit.get("lost") and not bit.get("gained")]
        if lost:
            print("      bits only ever lost, never gained: %s"
                  % ", ".join(str(bit["bit"]) for bit in lost))


def section_agreement(captures):
    rule("AGREEMENT  do two independent sweeps read the same machine the same way")
    result = analyse.sweep_agreement(captures)
    if not result:
        print("  Needs two captures each containing a 'guided-start' sweep.")
        return

    print("  %s" % result["a"])
    print("  %s" % result["b"])
    print()
    print("  identical in both : %d items" % len(result["same"]))
    print("  differ            : %d items" % len(result["differ"]))
    print("  in only one       : %d items" % len(result["only_one"]))
    if result["differ"]:
        print()
        print("  The items that differ -- expected where a guided edit in the")
        print("  first session was never undone before the second:")
        for (high, low), a, b in result["differ"]:
            print("      page $%02X item %2d (Classic page %d item %d): %s vs %s"
                  % (high, low, classic_page(high), low, a, b))



# Word offsets from section 7.3 / 7.3.1 of the 16 PLUS implementation, used
# only to name what a derived match landed on. Naming is a convenience; the
# match itself is measured and stands whether or not we have a name for it.
ENVELOPE_BASES = {14: "envelope 1 (pitch)", 36: "envelope 2 (filter)",
                  58: "envelope 3 (amp)"}
ENVELOPE_FIELDS = [
    "type", "soft level 0", "hard level 0", "time 1", "soft level 1",
    "hard level 1", "time 2", "soft level 2", "hard level 2", "time 3",
    "soft level 3", "hard level 3", "time 4", "soft level 4", "hard level 4",
    "time 5", "soft velocity mode", "level 5 breakpoint", "time 6",
    "time 1 velocity", "keyboard time scaling", "envelope mode"]
WAVESAMPLE_WORDS = {
    80: "root key / fadecurve", 81: "pitch envelope amount", 82: "LFO amount",
    86: "fine tune", 99: "volume / output bus",
    100: "volume mod source / pan mod source", 105: "PAN",
    114: "loop mode", 131: "sample rate", 132: "key range lo",
    133: "key range hi"}


def name_word(block, word, half):
    if block != "wavesample":
        return ""
    for base, label in ENVELOPE_BASES.items():
        if base <= word < base + 22:
            return "%s, %s" % (label, ENVELOPE_FIELDS[word - base])
    return WAVESAMPLE_WORDS.get(word, "")


def section_map(captures):
    rule("MAP  parameter <-> block word, derived from the capture as a whole")
    print("  Every parameter that changed during a session, matched against the")
    print("  block half that changed with it at the same moments. This does not")
    print("  use the capture's own diffs: those are computed over windows that")
    print("  do not line up, and a parameter moved during a SKIPPED step has no")
    print("  diff at all. Sampling both at every sweep recovers those.")
    print()

    matches, unmatched, ambiguous = analyse.derive_map(captures)

    for entry in matches:
        high, low = entry["parameter"]
        word, half = entry["word_half"]
        name = name_word(entry["block"], word, half)
        print("  page $%02X item %2d (Classic page %d item %d)   %s -> %s"
              % (high, low, classic_page(high), low, entry["from"], entry["to"]))
        print("      IS %s word %d, %s half%s"
              % (entry["block"], word, half, "   [%s]" % name if name else ""))
        print("      between sweeps '%s' and '%s'" % entry["between"])
        print()

    if ambiguous:
        print("  Moved, but more than one word moved the same way -- cannot be")
        print("  told apart from this session alone:")
        for entry in ambiguous:
            high, low = entry["parameter"]
            print("      page $%02X item %2d  %s -> %s   candidates: %s"
                  % (high, low, entry["from"], entry["to"],
                     ", ".join("%s w%d %s" % (b, w, h)
                               for b, (w, h) in entry["candidates"])))
        print()

    if unmatched:
        print("  Moved, but NO block half moved with it. Either the block was")
        print("  not read across that stretch, or it is not stored in a block:")
        for entry in unmatched:
            high, low = entry["parameter"]
            print("      page $%02X item %2d (Classic page %d item %d)   %s -> %s"
                  % (high, low, classic_page(high), low,
                     entry["from"], entry["to"]))
            print("          between '%s' and '%s'; blocks read in that window: %s"
                  % (entry["between"][0], entry["between"][1],
                     entry["reads"] or "none"))



def section_census(captures):
    rule("CENSUS  answered items against what the two manuals list")
    print("  Three outcomes matter. An item both manuals list and the machine")
    print("  answers is confirmation. An item the Classic's manual omits but")
    print("  the machine answers is a gap in that manual, not a gap in the")
    print("  machine. An item a manual lists and the machine ignores is the")
    print("  only case where the Classic really is the smaller instrument.")
    print()

    coverage = analyse.parameter_coverage(captures)
    confirmed = undocumented = missing = 0

    for high in sorted(coverage):
        answered = coverage[high]["answered"]
        silent = coverage[high]["silent"]
        listed = set(spec.CLASSIC.get(high, {}))
        extra = set(spec.SIXTEEN_PLUS_EXTRA.get(high, {}))

        both = sorted(answered & listed)
        beyond = sorted(answered - listed)
        absent = sorted(listed & silent)
        confirmed += len(both)
        undocumented += len(beyond)
        missing += len(absent)

        status = "exact" if not beyond and not absent else "differs"
        print("  page $%02X  Classic page %-2d  %-32s %s"
              % (high, classic_page(high), analyse.page_name(high), status))
        print("      confirmed          %2d of %2d listed" % (len(both), len(listed)))
        if beyond:
            for item in beyond:
                where, name = spec.documented(high, item)
                print("      answers item %2d    not in the Classic manual"
                      "%s" % (item, "  -- 16 PLUS calls it '%s'" % name if name else ""))
        if absent:
            for item in absent:
                print("      SILENT on item %2d  manual lists it as '%s'"
                      % (item, spec.CLASSIC[high][item]))

    print()
    print("  %d confirmed, %d answered but undocumented for the Classic,"
          " %d listed but silent" % (confirmed, undocumented, missing))



def section_edits(captures):
    rule("EDITS  what the synth reported without being asked")
    print("  The EPS sends a PUT PARAMETER whenever a parameter is changed on")
    print("  its front panel. These are addressed to wavesample 0, where a reply")
    print("  to our own GET carries the wavesample we asked about -- which is")
    print("  what tells them apart.")
    print()
    print("  This is a better witness than the sweeps. It names the parameter")
    print("  the operator touched with no diffing and no ambiguity, and holding")
    print("  an arrow key sends the whole ramp, one message per step.")
    print()

    found = analyse.limits(captures)
    if not found:
        print("  Nothing announced in these captures.")
        return

    for (high, low), record in found.items():
        where, name = spec.documented(high, low)
        print("  page $%02X item %2d (Classic page %d item %d)%s"
              % (high, low, classic_page(high), low,
                 "  %s" % name if name else ""))
        print("      range seen  %d .. %d   (%d distinct values)"
              % (record["low"], record["high"], len(record["values"])))
        if record["stuck"]:
            for value in sorted(record["stuck"]):
                edge = ("a FLOOR" if value == record["low"]
                        else "a CEILING" if value == record["high"]
                        else "a repeat")
                print("      stopped at %-4d -- %s: the key was still going and"
                      " the number was not" % (value, edge))
        else:
            print("      no limit reached")


SECTIONS = {
    "identity": section_identity,
    "blocks": section_blocks,
    "coverage": section_coverage,
    "census": section_census,
    "guided": section_guided,
    "map": section_map,
    "edits": section_edits,
    "pan": section_pan,
    "rates": section_rates,
    "wave": section_wave,
    "agreement": section_agreement,
}


def main(argv):
    paths = [arg for arg in argv if not arg.startswith("--")]
    only = None
    for arg in argv:
        if arg.startswith("--only="):
            only = [name.strip() for name in arg.split("=", 1)[1].split(",")]

    if not paths:
        print(__doc__)
        return 1

    captures = [Capture(path) for path in paths]
    for name, function in SECTIONS.items():
        if only and name not in only:
            continue
        function(captures)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
