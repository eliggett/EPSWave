"""
What the two manuals say, as data.

Transcribed from reference/ -- the 1989 Performance Sampler External Command
Specification (MKB2) for the Classic, and the EPS-16 PLUS full MIDI
implementation for the 16 PLUS. Held here so a capture can be checked against
both at once, which is the only way to tell "the Classic does not have this"
apart from "the Classic's manual forgot to list it".

Item numbers are decimal, as both manuals print them for these tables. Page
keys are the high byte on the wire; the Classic's manual prints that divided
by four.

The OCR caveat in reference/README.md applies to every table in here, and one
of them is demonstrably wrong: see PAN_TABLE_5 below.
"""

# {high byte: {item: name}}. Absent item = the manual does not list it.
CLASSIC = {
    0x04: {},   # envelope 1  \
    0x08: {},   # envelope 2   > filled from ENVELOPE below
    0x0C: {},   # envelope 3  /
    0x10: {  # 9.7 pitch
        1: "root key", 2: "LFO amount", 3: "envelope 1 amount",
        5: "random frequency", 6: "bend range", 7: "modulation source",
        10: "fine tune", 11: "modulation amount", 12: "random amount",
    },
    0x14: {  # 9.8 filter
        0: "filter mode", 1: "filter 1 cutoff", 2: "filter 1 env 2 amount",
        3: "filter 1 keyboard amount", 7: "filter 1 mod source",
        8: "filter 2 mod source", 11: "filter 2 cutoff",
        12: "filter 2 env 2 amount", 13: "filter 2 keyboard amount",
        14: "filter 1 mod amount", 15: "filter 2 mod amount",
    },
    0x18: {  # 9.9 volume/amp
        1: "wavesample volume", 2: "pan", 3: "modulation A",
        4: "modulation C", 7: "modulation source", 10: "modulation amount",
        11: "modulation B", 12: "modulation D",
    },
    0x1C: {  # 9.10 LFO
        1: "LFO wave", 2: "LFO speed", 3: "LFO depth", 4: "LFO delay",
        5: "LFO mode", 7: "LFO modulation source",
    },
    0x20: {  # 9.5 wavesample
        0: "loop mode", 6: "loop mod type", 7: "loop mod source",
        8: "loop mod amount 1", 9: "loop mod amount 2",
        10: "loop end fractional", 11: "key range low", 12: "key range high",
        13: "sample rate", 21: "wavedata start", 22: "wavedata end",
        23: "loop start", 24: "loop end", 25: "loop position",
    },
    0x24: {  # 9.4 layer
        0: "glide mode", 1: "glide time", 2: "legato layer",
        3: "velocity low", 4: "pitch table", 10: "velocity high",
    },
    0x28: {  # 9.3 instrument
        0: "patch", 1: "key down layers", 2: "key up layers",
        3: "MIDI channel", 4: "MIDI program", 5: "pressure mode",
        6: "send keys to", 7: "instrument size", 10: "range low key",
        11: "range high key", 12: "transpose octave", 13: "transpose semitone",
    },
}

# 9.6, shared by all three envelope pages on both machines.
ENVELOPE = {
    0: "envelope type", 1: "level 0 hard", 2: "level 0 soft", 3: "time 1",
    4: "2nd release time", 5: "attack time velocity", 6: "keyboard scaling",
    7: "soft velocity on/off", 8: "envelope mode", 11: "level 1 hard",
    12: "level 2 hard", 13: "level 3 hard", 14: "level 4 hard",
    15: "level 1 soft", 16: "level 2 soft", 17: "level 3 soft",
    18: "level 4 soft", 19: "time 2", 20: "time 3", 21: "time 4",
    22: "time 5", 23: "2nd release level",
}
for _page in (0x04, 0x08, 0x0C):
    CLASSIC[_page] = dict(ENVELOPE)

# Only where the 16 PLUS lists something the Classic's manual does not. The
# rest is identical and repeating it would invite the two copies to drift.
SIXTEEN_PLUS_EXTRA = {
    0x20: {
        1: "sample start (%)", 2: "sample end (%)", 3: "loop start (%)",
        4: "loop end (%)", 5: "loop position (%)",
    },
    0x24: {
        5: "layer name", 6: "delay time", 7: "delay mod by velocity",
        8: "restrike decay time",
    },
    0x28: {
        8: "instrument name", 9: "current patch select mode",
    },
}


# --------------------------------------------------------------------------
# Table 5, and why this file does not simply copy it.
#
# The 1989 manual's section 9.9 gives pan the range 0-17. Its Table 5 then
# lists NINETEEN entries, 0 to 18, beginning "0 = WAVESAMPLE". Nineteen
# entries cannot be a range of eighteen values, so one of the two is wrong,
# and the hardware says which: asked for hard left, an EPS-M wrote 0.
#
# Drop the spurious first line and everything agrees at once. Eight display
# positions at 0-7, eight solo outputs at 8-15, random pan at 16, keyboard pan
# at 17 -- exactly the 0-17 the same page claims, with hard left at 0 where
# the machine puts it. reference/README.md warns that docling's tables come
# out off by one; this is one of them.
# --------------------------------------------------------------------------
PAN_TABLE_5 = (
    ["*-------", "-*------", "--*-----", "---*----",
     "----*---", "-----*--", "------*-", "-------*"]
    + ["solo out %d" % n for n in range(1, 9)]
    + ["random pan", "keyboard"]
)

PAN_LEFT = 0
PAN_RIGHT = 7


def pan_name(value):
    if 0 <= value < len(PAN_TABLE_5):
        return PAN_TABLE_5[value]
    return "unknown (%d, outside 0-17)" % value


def documented(high, item):
    """Which manual lists this item, as a short string for a report."""
    in_classic = item in CLASSIC.get(high, {})
    in_plus = item in SIXTEEN_PLUS_EXTRA.get(high, {})
    if in_classic:
        return "both", CLASSIC[high][item]
    if in_plus:
        return "16 PLUS only", SIXTEEN_PLUS_EXTRA[high][item]
    return "neither", None
