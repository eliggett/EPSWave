# Probe capture analysis

Reads the `.jsonl` files EPSWave's debug panel writes and prints what they say
about the machine that produced them.

```
python3 report.py ~/Downloads/EPS-testing/Test1/*.jsonl \
                  ~/Downloads/EPS-testing/Test2/*.jsonl
```

Pass **every capture from a session at once**. Testers skip steps, run out of
time, and come back for a second pass; several sections only produce an answer
when the runs are read together, and two independent sweeps agreeing is itself
a result.

`--only=census,map,pan` limits the output to named sections.

## Sections

| name | what it answers |
|------|-----------------|
| `identity` | who ran it, on what machine, when |
| `blocks` | block lengths as the machine reports them |
| `coverage` | which parameters answered and which met silence |
| `census` | answered items against what each manual lists |
| `guided` | one front-panel edit at a time, and what moved |
| `map` | parameter ↔ block word, derived from the capture as a whole |
| `pan` | the Table 5 question, on its own |
| `rates` | which sample-rate codes the machine took and kept |
| `wave` | bit depth, measured on the way in and through a round trip |
| `agreement` | whether two sweeps read the same machine the same way |
| `edits` | what the synth reported without being asked, and the limits that fall out |

## Why `map` does not use the capture's own diffs

The capture emits `block-diff` and `parameter-diff` findings, and they are
computed over windows that do not line up. A block-diff spans one guided edit.
A parameter-diff spans everything since the previous sweep — including any
steps the operator skipped, during which the blocks are still read but no diff
is computed at all.

So a parameter that moved while somebody was hunting through menus for a step
they then skipped shows up in a parameter-diff with nothing to pair it with,
and looks like a machine doing something inexplicable. In the EPS-M captures
that happened twice, and both turned out to be ordinary parameters in ordinary
places.

`map` works from the raw records instead. Between one sweep and the next, some
parameters changed from A to B; over that same stretch the blocks were read
several times. A word half reading A at the first of those reads and B at the
last changed when the parameter did. One such half is a measurement, several
is an ambiguity worth reporting as one, and none means the value is not in any
block that was read.

## audit.py — checking the app against the hardware

```
python3 audit.py ~/Downloads/EPS-testing/Test*/*.jsonl
```

The sweeps are a census: on this hardware an item that does not answer does not
exist. That makes them something to check the *app* against. `audit.py` pulls
every `getParameter`/`setParameter` call out of `eps.js`, resolves the constants,
and reports any that a Classic would ignore.

This matters because a `PUT PARAMETER` that lands nowhere returns no error. A
call on a page the Classic does not have works perfectly on the developer's
16 PLUS and silently does nothing on a Classic. Run it after changing anything
that sets a parameter; it exits non-zero on a finding.

## Files

- `capture.py` — loads the JSON Lines, groups by kind, knows nothing about meaning.
- `spec.py` — both manuals' parameter tables as data, plus the corrected Table 5.
- `analyse.py` — one function per question, each returning data rather than text.
- `report.py` — printing, and only printing.
- `audit.py` — the one that checks `eps.js` rather than the capture.

The split is so that the next capture can be checked without rewriting
anything. When a conclusion here turns out to be wrong, the evidence is still
in the capture unchanged — as its own manifest says, anything named `decoded`
or `interpretation` is the app's reading and may be wrong; the hex is the
evidence.
