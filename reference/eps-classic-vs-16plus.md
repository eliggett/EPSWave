# The original EPS against the EPS-16 PLUS

What the two machines' specifications disagree about, and which one to believe
where.

## Sources

- **Ensoniq, *EPS External Command Specification*, June 12 1989, MKB2.** The
  official specification for the original EPS. Scanned and OCR'd as
  `Ensoniq EPS and EPSm MIDI SysEx Specification (EPS-MKB2).pdf`, 50 pages,
  currently outside this repo in `epstool/references/`. **This is the
  authority for the Classic** and everything below is checked against it.
- **[eps_16plus_full_midi_implementation.md](eps_16plus_full_midi_implementation.md)**
  — Ensoniq's *EPS-16 PLUS External Command Specification*. Its first page says
  it "applies specifically to the EPS-16 PLUS only (not the Original EPS)".
- **[EPS-ext_cmd_spec.md](EPS-ext_cmd_spec.md)** — a third-hand markdown
  transcription of the 1989 document, from
  [mikewolak/epstool](https://github.com/mikewolak/epstool/blob/main/eps_sysex.md).
  Its header claims to cover both machines; it does not. Convenient because it
  is searchable, but it has silently changed notation and dropped material —
  see §6. **Where it and the PDF disagree, the PDF wins.**
- **[code/eps2.0/include/eps.h](code/eps2.0/include/eps.h)** — Andrew
  Arensburger's 1992 library, which carries both machines' constants side by
  side: `PSC_`/`PMC_` for the Classic, `PS16_`/`PM16_` for the 16 PLUS, with a
  `(16+)` comment on individual fields. He owned a Classic, so his Classic paths
  are the tested ones.

---

## 1. READ THIS BEFORE USING A NUMBER

**Ensoniq numbers parameter pages in decimal, and the wire wants that number
times four.** Section 9 of the 1989 specification says so outright:

> An easy way to remember parameter numbers in a MIDI data dump is high byte
> times four followed by the low byte. For example, Free System Blocks is
> transmitted via MIDI bytes `$34 $00` not `$0D $00`.

A parameter number is twelve bits sent as two six-bit halves (§2.3), so the wire
high byte is `number >> 6` and the page number is `number >> 8`. This project
and §9 of the 16 PLUS manual index pages by the **wire** byte, `$00`–`$38`.
The 1989 document indexes them by page number, in decimal, 0–14.

| `getParameter()` / 16 PLUS §9 | 1989 spec | Number | Classic | 16 PLUS |
|-------|------|--------|---------|---------|
| `$00` | 0 | `$0000` | — | track |
| `$04` | 1 | `$0100` | envelope 1 | envelope 1 |
| `$08` | 2 | `$0200` | envelope 2 | envelope 2 |
| `$0C` | 3 | `$0300` | envelope 3 | envelope 3 |
| `$10` | 4 | `$0400` | pitch | pitch |
| `$14` | 5 | `$0500` | filter | filter |
| `$18` | 6 | `$0600` | volume | amp (volume) |
| `$1C` | 7 | `$0700` | LFO | LFO |
| `$20` | 8 | `$0800` | wavesample | wavesample |
| `$24` | 9 | `$0900` | layer | layer |
| `$28` | 10 | `$0A00` | instrument | instrument |
| `$2C` | 11 | `$0B00` | — | sequence·song |
| `$30` | 12 | `$0C00` | **MIDI** | **effects** |
| `$34` | 13 | `$0D00` | system | system·MIDI |
| `$38` | 14 | `$0E00` | edit | edit context |

`EPS16.parameterNumber(page, item)` takes the page-number convention.
`EPS16.getParameter(a, b)` takes the wire bytes. Confusing the two produces a
different, perfectly valid parameter number and no error at all — see the
comment on `parameterNumber` in [../eps.js](../eps.js).

**Item numbers are decimal too**, throughout. The 1989 spec's wavesample
"Wavedata Start 21" is `$15`; its layer "Velocity High 10" is `$0A`. Ensoniq is
consistent about this; the transcription is not (§6).

---

## 2. Why EPS-ext_cmd_spec.md is the Classic

Now moot — the PDF settles it, and the transcription's parameter tables match it
item for item. Recorded because it was worked out before the PDF turned up and
the reasoning still holds for any other document of unknown provenance:

- Its system page matches `PSC_` nine items out of nine and `PS16_` one out of
  nine, that one being free system blocks, the only item Ensoniq left in place.
- It puts MIDI on page 12, which on a 16 PLUS is effects.
- Every field `eps.h` marks `(16+)` is absent from it, and nothing else is.
- No sequence page, no track page, no transwaves.
- Pan values 9–16 are Solo Out 1–8.
- Its instrument block marks words 23, 25 and 317 unused; on a 16 PLUS those are
  Current Patch Select Mode, the Instrument ID Field (`$FFFF` = EPS-16 PLUS),
  and Effect Offset.
- *Performance Sampler* is the Classic's own name, and June 1989 predates the
  16 PLUS by about a year.

---

## 3. What differs

### 3.1 The page that changed meaning

`$30` is **MIDI on the Classic and effects on the 16 PLUS**. This is the only
page whose contents are unrelated between the two machines, and it is the one
that matters most: sweeping effects items past `$09` has taken a 16 PLUS down
with "Error 129 — Reboot?" on hardware, twice. On a Classic the same wire byte
is nine harmless MIDI settings.

The Classic's MIDI page (page 12, wire `$30`), and where the 16 PLUS moved each
item onto its merged system page:

| Item | Classic | 16 PLUS |
|------|---------|---------|
| 0 | Base Channel 0–15 | `$0D05` |
| 1 | Midi Transmit Mode 0–1 | `$0D06` |
| 2 | Base Channel Pressure Mode 0–2 | `$0D0A` |
| 3 | Midi In Mode 0–4 (Omni-Poly-Multi-Mono A-Mono B) | `$0D07` |
| 4 | Midi Controllers Enable 0–1 | `$0D0B` |
| 5 | Midi SYSEX Enable 0–1 | `$0D0C` |
| 6 | Midi Program Change Enable 0–1 | `$0D08` |
| 7 | Midi Song Position Enable 0–1 | `$0D0D` |
| 8 | Midi XCTRL Value 0–127 | `$0D09` |

`eps.h` names `PMC_XCTLENBL` "XCTRL enable"; both specifications give it a range
of 0–127, so the constant's name is wrong and its number is right.

The Classic's system page (page 13, wire `$34`) against the 16 PLUS's:

| Item | Classic | 16 PLUS |
|------|---------|---------|
| 0 | Free System Blocks 0–10000, read only | same |
| 1 | Free Disk Blocks 0–10000, read only | `$0D0A` |
| 2 | Master Tune −127…+127 | `$0D01`, −99…+99 |
| 3 | Global Bend Range 0–12 | `$0D0B` |
| 4 | Touch Sensitivity 0–15 (Table 1) | `$0D0C` |
| 5 | Mod Pedal Mode 0–1 | `$0D02` |
| 6 | Sustain Pedal Mode 0–1 | `$0D0D` |
| 7 | Aux Pedal Mode 0–1 | `$0D0E`, 0–2 |
| 8 | Autoloop Switch 0–1 | `$0D03` |

Free System Blocks at `$0D00` is the one item that did not move, which is why
`EPS16.PING_PAGE`/`PING_ITEM` need no model switch.

The 16 PLUS's merged page has **five colliding low bytes** in its own §9.1 —
`$0D0A`, `$0D0B`, `$0D0C`, `$0D0D`, `$0D0E` each name both a system item and a
MIDI item — and `eps.h` reproduces all five. The Classic's numbering has no
collisions, because the two pages are separate.

### 3.2 Items the 16 PLUS added

Same page numbers; the Classic simply has nothing at these items.

| Page | Item | 16 PLUS only |
|------|------|--------------|
| instrument `$28` | 8 | Instrument Name |
| | 9 | Current Patch Select Mode |
| layer `$24` | 5 | Layer Name |
| | 6 | Delay Time |
| | 7 | Delay Mod by Velocity Amount |
| | 8 | Restrike Decay Time |
| wavesample `$20` | 1–5 | Sample Start/End, Loop Start/End/Position as percentages |
| volume `$18` | 5 | Vol Mod Crossfade Fadecurve |
| | 6 | Boost |
| | 8 | Pan Modulation Source |
| | 9 | Output Bus (BUS1-BUS2-BUS3-AUX1) |
| | 13 | Pan Modulation Amount |
| LFO `$1C` | 8 | LFO Rate Modulation Source |
| | 10 | LFO Depth Modulation Amount |
| | 11 | LFO Rate Modulation Amount |
| sequence `$2C` | all | whole page |
| track `$00` | all | whole page |

### 3.3 Same address, different meaning

A write succeeds and means something else.

| Number | Classic | 16 PLUS |
|--------|---------|---------|
| `$0602` Pan | 0–18 (Table 5): 0=WAVESAMPLE, 1–8 stereo position `*-------`…`-------*`, 9–16 **SOLO OUT 1–8**, 17 RANDOM PAN, 18 KEYBOARD | −99…+99, output routing split off into `$0609` Output Bus |
| `$0806` Loop Mod Type | 0–3 (Off-Loop-Start-Both) | 0–7 (Table 5), `07` = TRANSWAV |
| `$0107` Soft Velocity On/Off | 0–1 (Off-On) | 0–3 (OFF-VEL-VEL1-VEL2) |
| `$0900` Glide Mode | 0–2 (Off-Mono-Pedal) | 0–4 (Table 10) |
| `$0A06` Send Keys To | 0–2 (Both-Local-Midi) | 0–3, adds EXT |
| Envelope preset 13 | WIND DRIVEN | WIND PITCH |

### 3.4 Value ranges — the Classic is a 0–127 machine

**This is confirmed from the official specification, not inferred.** The 16 PLUS
moved most levels and amounts to a 0–99 display scale; the Classic used 0–127.
Times did not change.

| Parameter | Classic | 16 PLUS |
|-----------|---------|---------|
| Envelope levels 0–4, hard and soft | 0–127 | 0–99 |
| Envelope 2nd Release Level | −127…+127 | −99…+99 |
| Envelope 2nd Release Time | 0–127 | 0–99 |
| Envelope Keyboard Scaling | 0–127 | 0–99 |
| Envelope Times 1–5, Attack Time Velocity | 0–99 | 0–99 |
| Wavesample Volume | 0–127 | 0–99 |
| Volume Modulation A/B/C/D, Amount | 0–127 | 0–127 (A–D), 0–99 (amount) |
| Layer Glide Time | 0–127 | 0–99 |
| Filter 1 and 2 Cutoff | 0–127 | 0–150 |
| Filter envelope, keyboard and mod amounts | −127…+127 | −99…+99 |
| Pitch LFO Amount | 0–127 | −15.7…+15.7 in 0.1 steps |
| Pitch Envelope 1 Amount | −127…+127 | −15.7…+15.7 in 0.1 steps |
| Pitch Fine Tune, Modulation Amount, Random Amount | −127…+127 | −99…+99 |
| Master Tune | −127…+127 | −99…+99 |
| LFO Depth | 0–127 | 0–127 |
| LFO Speed, LFO Delay | 0–99 | 0–99 |
| Instrument Midi Program | 1–127 | 0–127 |
| Instrument Transpose Octave | 0–5 | −4…+4 |
| Instrument Transpose Semitone | 0–12 | −11…+11 |

Anything this app *writes* to a Classic needs to respect these, and the two
transpose fields look like an unsigned encoding of the signed 16 PLUS field
rather than a different range.

### 3.5 Parameter blocks

**The block sizes are the same on both machines**: instrument 323 words, layer
107, wavesample 139, pitch table 107. Every 16 PLUS addition went into a low
byte or a previously unused word — nothing was inserted, moved or resized. This
is what lets one decoder read both.

**And every value in every Classic block is in the high byte.** All four of the
1989 document's block tables are headed "Data Word Description (all values in hi
byte of word)", with no "unless otherwise specified" escape and no split-word
entry anywhere in them. The 16 PLUS added that escape clause because it started
using the low bytes.

Instrument block:

| Word | Classic | 16 PLUS |
|------|---------|---------|
| 16 | Key Destination (LOCAL, MIDI or BOTH) | MIDI Status 0–3, adds EXT |
| 23 | unused | Current Patch Select Mode |
| 25 | unused | **Instrument ID Field — `$FFFF` indicates EPS-16 PLUS** |
| 317 | unused | Effect Offset |

Layer block:

| Word | Classic | 16 PLUS |
|------|---------|---------|
| 12 low byte | unused | Delay Modulation by Velocity Amount |
| 13 low byte | unused | Restrike Decay Time |
| 18 | unused | Delay Time |

Wavesample block:

| Word | Classic | 16 PLUS |
|------|---------|---------|
| 80 low byte | unused | Vol Mod Crossfade Fadecurve |
| 99 low byte | unused | Output Bus |
| 100 low byte | unused | Pan Modulation Source |
| **105** | **high byte** = "Pan Position — including separate out assignment", Table 5 | high byte unused, **low byte** = Pan Position, −99…+99 |
| 106 low byte | unused | Pan Modulation Amount |
| 107 low byte | unused | Boost Switch |
| 108 low byte | unused | LFO Rate Modulation |
| 110 low byte | unused | LFO Depth Modulation Amount |
| 111 | LFO Modulation Source | high = Depth Mod Source, low = Rate Mod Source |

Word 105 has its own section below.

### 3.6 Value tables

Identical: Table 1 touch sensitivity (0–15), Table 2 modulation sources (0–15),
Table 4 filter modes (0–3), Table 6 LFO waveforms (0–6), Table 8 loop modes
(0–4), and Table 3 envelope presets except for entry 13 (§3.3).

Classic only: **Table 5**, pan and output, 0–18 (§3.3). **Table 7**, modulation
range, 0–21, running `2MG, 1MG, 512K, 256K, 128K, 64K, 32K, 16K, 8K, 4K, 2K, 1K,
512B, 256B, 128B, 64B, 32B, 16B, 8B, 4B, 2B, 1B` — sample-size windows, used by
Loop Mod Amount 2.

### 3.7 Commands and buttons

Identical, with one real difference and one apparent one:

- **`$14` SAVE INSTRUMENT does not exist on the Classic.** The word "SAVE"
  appears nowhere in the 1989 specification outside envelope preset 15, and
  `eps.h` marks `CMD_SAVE_INST` `(16+)`.
- **`$12` COPY INSTRUMENT does exist on the Classic**, documented in §4.3 on
  page 13. The transcription dropped it (§6).

Buttons are identical, including Instrument 1–8 as 0–7. `VIRTUAL BUTTON PRESS`
takes a two-byte button number — "Button number hi byte (always 0)" then the low
byte — so the whole packet is `F0 0F 03 0n 40 00 <button> F7`, eight bytes, which
is exactly what `EPS16.buttonMessage()` builds. The one difference is that button
18 is Key Range on the Classic and Effect·Select·Bypass on the 16 PLUS; `eps.h`
defines `BUT_KEY_RANGE` and `BUT_EFFECT` at the same value for that reason.

---

## 4. Word 105, the wavesample pan

`EPSBlocks.adaptWavesampleToEps16Plus()` exists to translate this one field. All
three sources now agree on where it lives:

- **1989 §7.3**: word 105 is "Pan Position — including separate out assignment",
  under a table heading that says all values are in the **high byte**.
- **16 PLUS §7.3**: "high byte = unused; low byte = Pan Position", pan being
  −99…+99, with output routing moved to word 99's low byte.
- **16 PLUS Appendix B**: `ws_pan` in the high byte, commented "old m2 pan", and
  `wsp_pan` in the low byte.

So **the byte position is settled**: Classic pan is the high byte, 16 PLUS pan is
the low byte.

The value is not a byte copy. The Classic's high byte is a Table 5 enum where 1–8
are stereo positions and 9–16 are Solo Out 1–8; the 16 PLUS's low byte is signed,
with routing held elsewhere. The eight positions are a coarser rendering of the
same continuum, so the two now convert by **scaling**, in both directions —
`adaptWavesampleToEps16Plus()` and `adaptWavesampleToClassic()`.

Full scale is **±127, not the ±99 of §9.9**. That range governs `PUT PARAMETER`
and the front panel; the block holds more. Of the 73 EPS-16 PLUS wavesamples
here, eleven sit at exactly +127 and eleven at exactly −127 — hard-panned pairs
written by a 16 PLUS into its own file — with a ±48 pair besides. The symmetry
also settles the encoding as two's complement.

| Classic | | 16 PLUS |
|---|---|---|
| 1 `*-------` | ↔ | −127 |
| 2 `-*------` | ↔ | −91 |
| 3 `--*-----` | ↔ | −54 |
| 4 `---*----` | ↔ | −18 |
| 5 `----*---` | ↔ | +18 |
| 6 `-----*--` | ↔ | +54 |
| 7 `------*-` | ↔ | +91 |
| 8 `-------*` | ↔ | +127 |

All eight round-trip exactly, so converting a library twice does not degrade it.
The other way is lossy by definition — 255 values into 8 — but stable: a second
pass never moves it again. There is no true centre in eight positions, so 0 goes
to 5. Table 5's non-positional values (Solo Out 1–8, Random Pan, Keyboard) have no
16 PLUS pan at all; those centre, and the log names what was lost rather than
dropping it silently.

Arensburger's `putws.c` sends `(pan_pos << 8) | pan_pos`, the same value in both
halves, which would be right only if the scales matched — they do not.

**One empirical doubt remains.** In every file examined here the high byte is 3:
all 13 original EPS wavesamples *and* all 73 EPS-16 PLUS ones, where the 16 PLUS
documents that byte as unused. Table 5 value 3 is `--*-----`, so either these
instruments really are panned left of centre, or 3 is a constant neither machine
writes as pan. Under the old byte copy that 3 became 16 PLUS pan 3, near enough
centre to be harmless by accident; under the scale it becomes −54, about 43% left.
If the high-byte reading is wrong, this is an audible regression rather than a
silent one.

**The measurement that settles it**: on a Classic, set one wavesample's pan hard
left and another hard right, dump both, and read word 105's high byte. Table 5
predicts 1 and 8. That is the `ws-pan` guided step, and it should be run before
anyone converts a library. If word 105 does not move, revert to the byte copy —
it is one line at the call site in [../eps.js](../eps.js).

---

## 5. What is still uncertain about the Classic

The four questions in the header of [../epsProbe.js](../epsProbe.js), plus what
the official specification opened and closed.

| # | Question | Status |
|---|----------|--------|
| 1 | The Classic's parameter numbers | **Closed.** Full page and item map, official, cross-checking exactly against `eps.h` where they overlap. It settles the `$010E` collision in `eps.h`: Level 4 Hard is item 14, Level 1 Soft is item 15. |
| 2 | Block lengths | **Closed.** 323 / 107 / 139 / 107 words, the same as the 16 PLUS. The 968-vs-969-byte discrepancy in `eps.h` is an allocation quirk. |
| 3 | Which fields the 16 PLUS added in low bytes | **Closed.** All of them (§3.5). Every Classic block value is in the high byte, stated in all four table headings. |
| 4 | Truncate or round when the Classic discards the low three bits of every sample | **Open.** The specification does not mention it. Needs hardware. |

Genuinely open, in rough order of how much they matter:

1. **Word 105's value mapping**, §4. The byte is settled, the scale is not.
   Needs one Classic dump with a known non-centre pan.
2. **Sample truncation versus rounding**, question 4. Needs hardware.
3. **Which parameters refuse a single PUT PARAMETER.** The 16 PLUS marks these
   `*` and `**` and lists three notes about them. **The 1989 specification has no
   such marker system at all** — the only restriction it records anywhere is
   "Read Only" on Free System Blocks, Free Disk Blocks and Instrument Size. So
   this is not something the transcription lost; Ensoniq never wrote it down for
   the Classic. Whether the machine has silent refusals anyway is unknown, and a
   silent refusal is the worst failure mode there is.
4. **Whether `$0E00` Edit Instrument accepts a PUT.** The 16 PLUS marks it
   "receive only", which per its NOTE 1 means only that it does not transmit on a
   front-panel edit. The Classic's §9.11 lists it with a plain range and no
   marker — but since that document has no marker system, the absence proves
   nothing either way. This is why the app selects instruments with
   `VIRTUAL BUTTON PRESS`, which §4.3 and §6 document identically for both
   machines.
5. **Ensoniq's own internal inconsistencies**, §6.2. Chiefly whether modulation
   source really tops out at 15, as Table 2 says, or at 17 or 18, as four
   parameter tables say.

---

## 6. Defects

### 6.1 In the transcription, EPS-ext_cmd_spec.md

Checked against the PDF. These are its own, not Ensoniq's:

1. **It hex-ifies the page number but leaves the item number decimal**, with no
   note. Ensoniq writes both in decimal — "SYSEX HIGH BYTE: 13", item 10 — and
   the transcription renders that as high byte `0x0D`, item 10. Numerically the
   conversion is right; the mixed presentation is a trap.
2. **COPY INSTRUMENT (`$12`) is missing** from its command table. It is in the
   1989 specification, §4.3.
3. **Table 7 is missing.** Its wavesample page cites "0-21 (see Mod Ranges)" and
   no such table appears anywhere in it. It is Table 7 in the original (§3.6).
4. **It drops the "all values in hi byte of word" heading** from all four block
   tables — the single line that answers the word 105 question.
5. Its header claims it covers both machines. It does not.

Its parameter numbers, ranges and value tables are otherwise faithful, including
the things that look like errors and turn out to be Ensoniq's (below).

### 6.2 In Ensoniq's 1989 specification

Reproduced faithfully by the transcription, so do not "fix" them:

1. **Modulation source ranges do not match Table 2.** Table 2 lists sixteen
   entries, 0–15, ending in OFF. But §9.5 Loop Mod Source says 0–17, and §9.7,
   §9.8, §9.9 and §9.10 all say 0–18. The 16 PLUS says 0–15 everywhere and
   `eps.h` agrees, so 0–15 is the safe assumption, but the Classic may have two
   or three more sources that Table 2 omits.
2. **§9.9 gives Pan as 0–17 while Table 5 lists 0–18**, ending in KEYBOARD.
   **Resolved in favour of the table**, and the app now follows it: the table is
   the definition and the range line is a summary of it, so a summary that
   disagrees with its own table is a typo in the summary. Nothing in the app
   clamps pan to 17, or clamps it at all — a value outside 0–18 in a real
   instrument is evidence that the byte is not what we think, and it is only
   evidence if it survives to somewhere a person can see it. See
   `EPSBlocks.WS_PAN_CLASSIC`.
3. **§4.3 says VIRTUAL BUTTON PRESS takes button numbers `[00..35]`** while §6
   lists valid buttons up to 57. Instrument 1–8 are 0–7, so this does not affect
   us.
4. Page footers alternate between "June 12, 1989" and "June 13, 1989".
