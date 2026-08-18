"""
Reading EPSWave probe captures.

A capture is JSON Lines: line 1 is a manifest describing the session, every
later line is one event with a `kind`. This module is deliberately dumb about
what the events mean -- it loads them, groups them by kind, and hands them
over. Interpretation lives in the report modules, so that when an
interpretation turns out to be wrong the evidence is still sitting here
unchanged.

The capture's own note says it best: anything named `decoded` or
`interpretation` is the app's reading and may be wrong; the hex is the
evidence. Several of the conclusions in this package come from disagreeing
with an `interpretation` record, so that distinction is not academic.
"""

import json
from collections import defaultdict


# The parameter pages EPS16.PARAMETER_PAGES declares, as {high byte: name}.
# Mirrored rather than parsed out of eps.js: this package has to be able to say
# "the app believes X, the hardware said Y", which means holding its own copy
# of what the app believes.
PARAMETER_PAGES = {
    0x00: "track",
    0x04: "envelope 1",
    0x08: "envelope 2",
    0x0C: "envelope 3",
    0x10: "pitch",
    0x14: "filter",
    0x18: "amp",
    0x1C: "LFO",
    0x20: "wavesample",
    0x24: "layer",
    0x28: "instrument",
    0x2C: "sequence",
    0x30: "effects (16+) / MIDI (Classic)",
    0x34: "system/MIDI",
    0x38: "edit context",
}

# Ensoniq's own rule for the Classic's manual: the page number the 1989
# document prints is the high byte divided by four. The 16 PLUS document prints
# the high byte itself. Both machines take the same byte on the wire.
def classic_page(high_byte):
    """The page number the Classic's manual prints for this high byte."""
    return high_byte // 4


class Event(dict):
    """One capture line. A dict with the key names spelled out for the reader."""

    @property
    def kind(self):
        return self.get("kind")

    @property
    def seq(self):
        return self.get("seq")


class Capture:
    """
    One probe capture file.

    `manifest` is line 1. `events` is everything after it in file order, which
    is also time order -- `seq` is assigned on write and never reordered.
    """

    def __init__(self, path):
        self.path = str(path)
        self.events = []
        self.manifest = {}

        with open(self.path, encoding="utf-8") as handle:
            for index, line in enumerate(handle):
                line = line.strip()
                if not line:
                    continue
                record = json.loads(line)
                if index == 0:
                    self.manifest = record
                    continue
                self.events.append(Event(record))

        self._by_kind = defaultdict(list)
        for event in self.events:
            self._by_kind[event.kind].append(event)

    # -- identity ---------------------------------------------------------

    @property
    def session(self):
        return self.manifest.get("session", {})

    @property
    def model(self):
        return self.session.get("model", "?")

    @property
    def operator(self):
        return self.session.get("operator", "?")

    @property
    def started(self):
        return self.manifest.get("startedAt", "?")

    @property
    def label(self):
        """Short name for report headings: the file's own basename."""
        import os
        return os.path.basename(self.path)

    # -- access -----------------------------------------------------------

    def of_kind(self, *kinds):
        out = []
        for kind in kinds:
            out.extend(self._by_kind.get(kind, []))
        out.sort(key=lambda event: event.get("seq", 0))
        return out

    def findings(self, probe=None, what=None):
        out = self.of_kind("finding")
        if probe is not None:
            out = [event for event in out if event.get("probe") == probe]
        if what is not None:
            out = [event for event in out if event.get("what") == what]
        return out

    def parameters(self, label=None):
        out = self.of_kind("parameter")
        if label is not None:
            out = [event for event in out if event.get("label") == label]
        return out

    def parameter_labels(self):
        """Sweep labels in the order they were first captured."""
        seen = []
        for event in self.of_kind("parameter"):
            label = event.get("label")
            if label not in seen:
                seen.append(label)
        return seen

    def sweep(self, label):
        """
        One sweep as {(high, low): value}, answered items only.

        A sweep may be run twice under the same label -- the `narrowed` flag
        marks the second, faster pass over only the items that answered. Later
        writes win, which is what we want: the narrowed pass is the more
        careful one.
        """
        out = {}
        for event in self.parameters(label):
            if not event.get("answered"):
                continue
            out[(event["high"], event["low"])] = event.get("value")
        return out

    def sweep_attempts(self, label):
        """Every item tried under this label, answered or not."""
        out = {}
        for event in self.parameters(label):
            key = (event["high"], event["low"])
            # An unanswered attempt should not overwrite an answered one: the
            # wide pass and the narrowed pass cover overlapping ground.
            if key in out and out[key].get("answered"):
                continue
            out[key] = event
        return out

    def counts(self):
        return {kind: len(events) for kind, events in sorted(self._by_kind.items())}


def load_all(paths):
    return [Capture(path) for path in paths]
