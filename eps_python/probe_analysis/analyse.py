"""
Turning probe captures into answers.

Each function here answers one question and returns plain data; `report.py`
prints it. The split matters because most of these questions get asked again
when the next tester sends a capture in, and a function that returns a table is
reusable where a function that prints one is not.

The interesting analysis is `correlate`: a guided step produces both a
block-diff (which word of the block moved) and a parameter-diff (which
page/item moved) for the same single edit on the front panel. Lining those two
up gives a word <-> parameter mapping that neither document states, measured
rather than inferred.
"""

from collections import defaultdict

from capture import PARAMETER_PAGES, classic_page


def identity(captures):
    """Who ran what, and on which machine."""
    rows = []
    for capture in captures:
        session = capture.session
        rows.append({
            "file": capture.label,
            "model": capture.model,
            "modelLabel": session.get("modelLabel"),
            "operator": capture.operator,
            "osVersion": session.get("osVersion"),
            "started": capture.started,
            "baseChannel": session.get("baseChannel"),
            "midiIn": session.get("midiIn"),
            "events": len(capture.events),
        })
    return rows


def block_lengths(captures):
    """What the machine said its three block types are, in words."""
    out = []
    for capture in captures:
        for finding in capture.findings("blocks", "block lengths in words"):
            out.append({
                "file": capture.label,
                "lengths": finding.get("lengths", {}),
                "expected": finding.get("expected16Plus", {}),
            })
    return out


def parameter_coverage(captures, label=None):
    """
    Which parameters the machine answered, page by page.

    A GET PARAMETER the machine ignores produces no `parameter` record at all
    -- only the sweep's summary `finding` counts it. So the silent set has to
    be reconstructed: the wide sweep walked `pages` x a fixed item range, and
    whatever is not in the answered set was met with silence. `tried` divided
    by the number of pages gives that range, which is how the sweep describes
    its own extent without us having to assume one.

    Returns {high: {"answered": set, "silent": set, "tried": set}}, merged
    across captures -- the two runs cover the same ground and agreeing is
    itself evidence.
    """
    answered = defaultdict(set)
    extent = {}

    for capture in captures:
        labels = [label] if label else capture.parameter_labels()
        for one in labels:
            for event in capture.parameters(one):
                if event.get("answered"):
                    answered[event["high"]].add(event["low"])

        # The wide (un-narrowed) sweep is the one that establishes what was
        # asked. A narrowed sweep only revisits what already answered, so it
        # says nothing about silence.
        for finding in capture.findings("parameters"):
            if finding.get("narrowed"):
                continue
            pages = finding.get("pages") or []
            tried = finding.get("tried") or 0
            if not pages or not tried:
                continue
            per_page = tried // len(pages)
            for high in pages:
                extent[high] = max(extent.get(high, 0), per_page)

    out = {}
    for high in sorted(set(answered) | set(extent)):
        asked = set(range(extent.get(high, 0))) | answered.get(high, set())
        out[high] = {
            "answered": answered.get(high, set()),
            "silent": asked - answered.get(high, set()),
            "tried": asked,
        }
    return out


def guided_steps(captures):
    """
    Every guided step across every capture, with its two diffs lined up.

    A step that ran produces a parameter-diff naming it. A step that was
    skipped produces a `note` with outcome "skip". Both are worth reporting:
    a skipped step is an open question, not an absence.
    """
    steps = []
    skipped = []

    for capture in captures:
        # block-diffs and parameter-diffs alternate, and a parameter-diff names
        # the step. Walking in sequence order pairs each parameter-diff with
        # the block-diff that came just before it.
        pending_block = None
        for event in capture.of_kind("finding", "note"):
            if event.kind == "note" and event.get("outcome") == "skip":
                skipped.append({
                    "file": capture.label,
                    "step": event.get("step"),
                    "text": event.get("text"),
                })
                continue
            if event.get("probe") == "block-diff":
                pending_block = event
                continue
            if event.get("probe") == "parameter-diff":
                steps.append({
                    "file": capture.label,
                    "changed": event.get("changed"),
                    "before": event.get("before"),
                    "after": event.get("after"),
                    "addressing": event.get("addressing", {}),
                    "parameters": event.get("changes", []),
                    "block": (pending_block or {}).get("block"),
                    "words": (pending_block or {}).get("changes", []),
                })
                pending_block = None

    return steps, skipped


def correlate(steps):
    """
    The word <-> parameter mapping the guided steps measured.

    One front-panel edit moves exactly one setting. If that edit moved one
    parameter and one word-half, those two are the same thing, and we can say
    so. If it moved several of either, we can only narrow it -- and the
    honest thing is to report the ambiguity rather than pick the prettiest
    pairing.

    `confidence` is "measured" when the pairing is forced (one parameter, one
    word-half) and "ambiguous" otherwise.
    """
    out = []
    for step in steps:
        params = step["parameters"]
        words = [w for w in step["words"] if w.get("half") in ("high", "low")]

        # Word 0 and word 1 of a wavesample are its name, and the name changes
        # whenever the front panel touches the wavesample -- the machine marks
        # it edited. Real signal, but not the setting under test.
        name_words = [w for w in words if w["word"] in (0, 1)]
        payload = [w for w in words if w["word"] not in (0, 1)]

        forced = len(params) == 1 and len(payload) == 1
        out.append({
            "step": step["changed"],
            "file": step["file"],
            "block": step["block"],
            "parameters": params,
            "payload_words": payload,
            "name_words": name_words,
            "confidence": "measured" if forced else "ambiguous",
            "pairing": (params[0], payload[0]) if forced else None,
        })
    return out


def pan(captures):
    """
    Everything the captures say about wavesample pan.

    This was the open question the whole hardware session existed to settle,
    so it gets its own function rather than being one row of a table.
    """
    out = {
        "interpretations": [],
        "step": None,
        "observed_values": set(),
    }

    for capture in captures:
        for event in capture.of_kind("interpretation"):
            if event.get("of") != "wavesample":
                continue
            value = event.get("value", {})
            out["interpretations"].append({
                "file": capture.label,
                "wavesample": event.get("number"),
                "name": value.get("name"),
                "pan": value.get("pan"),
                "originalPan": value.get("originalPan"),
            })
            if value.get("originalPan") is not None:
                out["observed_values"].add(value["originalPan"])

    steps, _ = guided_steps(captures)
    for step in steps:
        if step["changed"] and "pan" in step["changed"].lower():
            out["step"] = step
            for change in step["parameters"]:
                out["observed_values"].add(change["from"])
                out["observed_values"].add(change["to"])

    return out


def sample_rates(captures):
    """Which sample-rate codes the machine took, and whether they stuck."""
    rows = []
    for capture in captures:
        for finding in capture.findings("sample-rate"):
            if finding.get("what") == "starting value":
                rows.append({
                    "file": capture.label,
                    "kind": "start",
                    "code": finding.get("code"),
                })
            elif finding.get("what") == "attempt":
                rows.append({
                    "file": capture.label,
                    "kind": "attempt",
                    "code": finding.get("code"),
                    "accepted": finding.get("accepted"),
                    "readBack": finding.get("readBack"),
                    "onPanel": finding.get("onPanel"),
                    "held": finding.get("held"),
                    "hz": finding.get("hz"),
                })
    return rows


def wavedata(captures):
    """Bit depth as measured on the way in, and as measured through a round trip."""
    existing = []
    roundtrip = []
    for capture in captures:
        for finding in capture.findings("wavedata", "existing data"):
            existing.append({"file": capture.label, **finding.get("analysis", {})})
        for finding in capture.findings("wavedata", "round trip"):
            comparison = finding.get("comparison", {})
            roundtrip.append({
                "file": capture.label,
                "compared": comparison.get("compared"),
                "identical": comparison.get("identical"),
                "differing": comparison.get("differing"),
                "quantum": comparison.get("quantum"),
                "effectiveBits": comparison.get("effectiveBits"),
                "behaviour": comparison.get("behaviour"),
                "error": comparison.get("error", {}),
                "bits": comparison.get("bits", []),
            })
    return existing, roundtrip


def sweep_agreement(captures):
    """
    Where two captures of the same parameter disagree.

    Both runs swept the same 139 items on the same wavesample. Items that read
    the same in both are stable; items that differ either were changed by the
    guided edits in between or are not stable storage at all. Distinguishing
    those two is the point.
    """
    baselines = []
    for capture in captures:
        if "guided-start" in capture.parameter_labels():
            baselines.append((capture.label, capture.sweep("guided-start")))

    if len(baselines) < 2:
        return None

    (name_a, sweep_a), (name_b, sweep_b) = baselines[0], baselines[1]
    keys = sorted(set(sweep_a) | set(sweep_b))
    same, differ, only = [], [], []
    for key in keys:
        if key not in sweep_a or key not in sweep_b:
            only.append(key)
        elif sweep_a[key] == sweep_b[key]:
            same.append(key)
        else:
            differ.append((key, sweep_a[key], sweep_b[key]))

    return {
        "a": name_a, "b": name_b,
        "same": same, "differ": differ, "only_one": only,
    }


def page_name(high):
    return PARAMETER_PAGES.get(high, "?")


def page_label(high):
    """How to name a page so both manuals can be looked up from it."""
    return "$%02X (16+ page $%02X / Classic page %d) %s" % (
        high, high, classic_page(high), page_name(high))


# --------------------------------------------------------------------------
# Deriving the parameter <-> block-word map from the capture as a whole.
#
# The capture already emits `block-diff` and `parameter-diff` findings, but
# they are computed over different windows: a block-diff spans one guided
# edit, while a parameter-diff spans everything since the previous sweep,
# skipped steps included. When a step is skipped the blocks are still read but
# no diff is computed, so a parameter that moved during a skipped step looks
# unexplained -- it has no block change to pair with.
#
# Working from the raw records instead recovers those. Every sweep is a
# snapshot of the machine's parameters; every block read is a snapshot of its
# memory. Line the two up in time and a parameter is identified by the word
# whose value moved the same way at the same moments.
# --------------------------------------------------------------------------


def _sweep_runs(capture):
    """
    Each sweep as (label, first seq, last seq, {(high, low): value}).

    Sweeps are the sampling points, and a narrowed sweep repeats the label of
    the wide one before it, so runs are split on a change of (label, narrowed)
    rather than on the label alone.
    """
    runs = []
    current = None
    for event in capture.parameters():
        key = (event.get("label"), bool(event.get("narrowed")))
        if current is None or current[0] != key:
            current = [key, event["seq"], event["seq"], {}]
            runs.append(current)
        current[2] = event["seq"]
        if event.get("answered"):
            current[3][(event["high"], event["low"])] = event.get("value")
    return [(key[0], first, last, values) for key, first, last, values in runs]


def _halves(words):
    """{(word index, 'high'|'low'): byte} for one block."""
    out = {}
    for index, word in enumerate(words):
        out[(index, "high")] = (word >> 8) & 0xFF
        out[(index, "low")] = word & 0xFF
    return out


def _reads_in(capture, low_seq, high_seq):
    """Raw block reads in a seq window, grouped by block type, in order."""
    grouped = defaultdict(list)
    for event in capture.of_kind("block"):
        words = event.get("words")
        if not words or not (low_seq <= event["seq"] <= high_seq):
            continue
        grouped[event.get("block")].append((event["seq"], _halves(words)))
    return grouped


def derive_map(captures):
    """
    Match every parameter that moved to the block half that moved with it.

    Rather than trusting the capture's own diffs -- which are computed over
    windows that do not line up, and are not computed at all for a step the
    operator skipped -- this works from the raw records.

    Between one sweep and the next, some parameters changed from A to B. In
    that same stretch of the capture the blocks were read several times. A word
    half that reads A at the first of those reads and B at the last one changed
    when the parameter did, and if exactly one half did that, it is where the
    parameter lives. Where several halves moved together the pairing cannot be
    told apart, and where none did the parameter is not in any block that was
    read -- both worth saying out loud rather than resolving by preference.

    Returns (matches, unmatched, ambiguous).
    """
    matches, unmatched, ambiguous = [], [], []

    for capture in captures:
        runs = _sweep_runs(capture)
        for before, after in zip(runs, runs[1:]):
            label_a, first_a, _, values_a = before
            label_b, first_b, _, values_b = after
            grouped = _reads_in(capture, first_a, first_b)

            for key in sorted(set(values_a) & set(values_b)):
                start, end = values_a[key], values_b[key]
                if start == end:
                    continue

                found = []
                for block_type, reads in grouped.items():
                    if len(reads) < 2:
                        continue
                    opening, closing = reads[0][1], reads[-1][1]
                    for half in opening:
                        if opening.get(half) == start and closing.get(half) == end:
                            found.append((block_type, half))

                entry = {
                    "file": capture.label,
                    "parameter": key,
                    "from": start,
                    "to": end,
                    "between": (label_a, label_b),
                    "reads": {name: len(reads) for name, reads in grouped.items()},
                    "candidates": found,
                }
                if len(found) == 1:
                    entry["block"], entry["word_half"] = found[0]
                    matches.append(entry)
                elif found:
                    ambiguous.append(entry)
                else:
                    unmatched.append(entry)

    return matches, unmatched, ambiguous
