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

The value is not a byte copy. The Classic's high byte is a Table 5 enum where 0–7
are stereo positions and 8–15 are Solo Out 1–8; the 16 PLUS's low byte is signed,
with routing held elsewhere. The eight positions are a coarser rendering of the
same continuum, so the two convert by **scaling**, in both directions —
`adaptWavesampleToEps16Plus()` and `adaptWavesampleToClassic()`.

Full scale is **±127, not the ±99 of §9.9**. That range governs `PUT PARAMETER`
and the front panel; the block holds more. Of the 73 EPS-16 PLUS wavesamples
here, eleven sit at exactly +127 and eleven at exactly −127 — hard-panned pairs
written by a 16 PLUS into its own file — with a ±48 pair besides. The symmetry
also settles the encoding as two's complement.

### The positions start at 0, and hardware said so

**Measured on an EPS-M** (rack Classic, RAM 2.49 / ROM 2.21, 18 August 2026).
Asked to set one wavesample's pan hard left, the machine moved word 105's high
byte from 3 to 0, and page 6 item 2 from 3 to 0 with it. So the byte is pan, and
hard left is **0**.

That contradicts Table 5 as our OCR produced it, which lists nineteen entries
beginning `0 = WAVESAMPLE`. §9.9 of the same document gives the range as **0–17**
— eighteen values. Nineteen entries cannot be a range of eighteen, and the
hardware says which side was wrong. Dropping the spurious first line gives:

| Value | Meaning |
|---|---|
| 0–7 | the eight display positions |
| 8–15 | Solo Out 1–8 |
| 16 | Random Pan |
| 17 | Keyboard |

Exactly the 0–17 §9.9 claims. `reference/README.md` warns that docling's tables
come out off by one; this was one of them.

This also explains the 3 that every file shows — all 13 original EPS wavesamples
*and* all 73 EPS-16 PLUS ones. Under the corrected table 3 is `---*----`, the
cell immediately left of a centre eight cells cannot express: the value an
untouched wavesample is born with, not a constant nobody writes.

### The mapping

| Classic | | 16 PLUS |
|---|---|---|
| 0 `*-------` | ↔ | −127 |
| 1 `-*------` | ↔ | −91 |
| 2 `--*-----` | ↔ | −54 |
| 3 `---*----` | ↔ | −18 |
| 4 `----*---` | ↔ | +18 |
| 5 `-----*--` | ↔ | +54 |
| 6 `------*-` | ↔ | +91 |
| 7 `-------*` | ↔ | +127 |

All eight round-trip exactly, so converting a library twice does not degrade it.
The other way is lossy by definition — 255 values into 8 — but stable: a second
pass never moves it again.

**Dead centre picks 3 or 4 at random**, per wavesample. Eight cells have no
middle and pan 0 falls exactly between them, so there is no correct answer, only
a choice. Rounding the same way every time would push every centred wavesample in
an instrument the same half-cell off centre — a drum kit with sixteen centred
wavesamples would come out audibly hanging to one side. Scattering them leaves
the instrument centred on average. Nothing else is randomised; every other pan
value has an exact nearest cell.

Table 5's non-positional values (Solo Out 1–8, Random Pan, Keyboard) have no
16 PLUS pan at all; those centre, and the log names what was lost rather than
dropping it silently.

Arensburger's `putws.c` sends `(pan_pos << 8) | pan_pos`, the same value in both
halves, which would be right only if the scales matched — they do not.

**What the correction was worth.** Under the old 1–8 reading, the ubiquitous 3
converted to −54, about 43% left, and hard left — value 0 — was mistaken for
Table 5's "wavesample", skipped entirely, and silently centred. Going the other
way was worse: a hard-right 16 PLUS wavesample became Classic 8, which under the
corrected table is Solo Out 1, routing it out of the stereo pair altogether.

**Hard left confirmed a second way.** The synth announces front-panel edits, and
the 18 August captures contain the operator walking pan down with the arrow key:
`13, 12, 11 … 2, 1, 0, 0, 0, 0 …`. It **stopped at 0 while the key was still
going**, twice in one session and twice again in the other. 0 is the floor of the
scale, not a value we happened to observe.

**This question is closed.** Hard right has never been wound to and does not need
to be: the scale has a measured floor at 0, eighteen documented values and eight
positions, so 7 follows. The guided step that used to ask about pan has been
removed rather than left asking testers for a confirmation nothing depends on.

---

## 5. What is still uncertain about the Classic

The four questions in the header of [../epsProbe.js](../epsProbe.js), plus what
the official specification opened and closed.

| # | Question | Status |
|---|----------|--------|
| 1 | The Classic's parameter numbers | **Closed.** Full page and item map, official, cross-checking exactly against `eps.h` where they overlap. It settles the `$010E` collision in `eps.h`: Level 4 Hard is item 14, Level 1 Soft is item 15. |
| 2 | Block lengths | **Closed.** 323 / 107 / 139 / 107 words, the same as the 16 PLUS. The 968-vs-969-byte discrepancy in `eps.h` is an allocation quirk. |
| 3 | Which fields the 16 PLUS added in low bytes | **Closed.** All of them (§3.5). Every Classic block value is in the high byte, stated in all four table headings. |
| 4 | Truncate or round when the Classic discards the low three bits of every sample | **Closed by hardware.** It *masks*. An EPS-M round trip of 16-bit data came back with quantum 8, error 0 to 7 and never negative, bits 0–2 lost and never gained. `quantiseForModel()` already truncates without dither, which is exactly this. |

Genuinely open, in rough order of how much they matter:

1. **Where the Classic keeps instrument transpose.** Three sessions in, the
   answer for a *rack* is "nowhere useful", and the keyboard is still untested.

   The 18 August capture showed page 10 item 13 moving by exactly the amount the
   operator dialled while the instrument block, read either side of the edit,
   stayed identical in all 323 words — word 28 at 0 throughout.

   **The 19 August transpose test explains why, and the explanation is a rack
   firmware defect rather than a format difference.** TRNS OCT/SEMI is the
   keyboard EPS's *Transpose Instrument* page, reached by pressing *Set Keyboard
   Range* twice. The EPS-M has no such button and no menu path to the page at
   all; it appears only when this app reads one of the two transpose parameters,
   and the Right Arrow leaves the page rather than moving between its fields. On
   that page the EPS-M showed:

   - `TRANS OCT=-112 SEMI=2` on one run — item 12 read 144, which is exactly
     −112 as a signed byte, so the display and the parameter agree and the field
     really is signed.
   - **A different starting value on the next run, with nobody having changed
     anything.** Item 12 read 144 on 18 August and 16 on 19 August.
   - Values far outside any documented range in both fields: −112 and −12 against
     a documented 0–5 and 0–12 here, −4…+4 and −11…+11 on the 16 PLUS.
   - **Item 13 returning NAK (`$17`) to every single read** on 19 August, having
     answered every read on 18 August.
   - Nothing whatsoever reaching instrument block word 28 — not the operator's
     edits, and not the app's own `PUT PARAMETER`.

   A page with no button path, uninitialised-looking values that differ between
   runs, an item that answers one day and refuses the next, and no connection to
   the instrument: **on an EPS-M this page is vestigial and is not instrument
   transpose in any usable sense.** Ensoniq removed the button — a rack has no
   keyboard to transpose — and left the page code behind it.

   **What EPSWave should do:** nothing, for now. Word 28 is the only sane source,
   it reads 0, and 0 is almost certainly correct for these instruments. Do not
   read or write `$28 $0C`/`$0D` on a Classic. The remaining question is whether
   a *keyboard* EPS, where the page is properly reachable, writes to word 28 —
   and since the 16 PLUS does and the block layouts have matched everywhere else
   measured, that is now a low-stakes loose end rather than a conversion risk.

2. **Whether a *keyboard* EPS keeps transpose in word 28.** A rack cannot answer
   it — its transpose page is vestigial, see above. Low stakes: the 16 PLUS does,
   the block layouts have matched everywhere else measured, and word 28 reads 0
   on every Classic instrument seen, which is almost certainly right for them.
   The `inst-transpose` guided step stays in place for whoever turns up with a
   keyboard.

**Closed, and not worth asking about again:**

- **Pan.** §4. Floor measured twice, mapping settled, guided step retired.
- **Whether the Classic silently refuses a single `PUT PARAMETER`.** The 16 PLUS
  marks such parameters `*` and `**`; the 1989 specification has no marker system
  at all, so Ensoniq never wrote it down for the Classic. It looked worth chasing
  because the upload path really does use `PUT PARAMETER` — sample start and end,
  loop start, end and position, loop mode, root key, fine tune, sample rate. But
  the 18 August session exercised exactly those: the wavedata round trip wrote
  4096 samples and read them back matching, and six sample-rate codes were
  written and verified held. The parameters that carry real work demonstrably
  work on a Classic, and anything still unexercised is a parameter nothing uses.
- **Whether `$0E00` Edit Instrument accepts a PUT.** The app selects instruments
  with `VIRTUAL BUTTON PRESS`, which §4.3 and §6 document identically for both
  machines and which has worked in every session. Nothing depends on the answer.

### Undocumented: the synth talks back

Two behaviours neither manual describes, both found by testing, and both worth
more than the questions they turned up in.

**Reading a parameter appears to move the synth's display.** Reading `$28 $0C`/
`$0D` puts an EPS-M on the TRNS OCT/SEMI page — a page that machine has no button
path to whatsoever. Recorded because it explains how a rack reached that page at
all, and because it means the display is not a reliable guide to where an
operator thinks they are during a sweep. Nobody has set out to confirm the
mechanism and nothing depends on it.

**The synth announces every front-panel edit, unasked.** Change a parameter on
the panel and the EPS transmits a `PUT PARAMETER` for it. These are addressed to
**wavesample 0**, where a reply to our own `GET` carries the wavesample we asked
about, so the two are trivial to tell apart. The 16 PLUS manual implies this in
passing — its NOTE 1 says parameters marked "receive only" *do not* transmit when
edited from the front panel — but neither manual states the general behaviour or
the addressing.

This is a better witness than any sweep:

- It **names the parameter the operator touched**, with no diffing, no baseline
  and no ambiguity — including on a machine where the operator cannot see or
  reach what they are editing.
- Holding an arrow key sends **the whole ramp**, one message per step, so a
  parameter that stops moving while the key is still going has **measured its own
  limit**. Modulation source's 0–15 and pan's floor at 0 were both established
  this way, out of edits made for entirely unrelated reasons.
- It costs nothing and needs no cooperation: the messages are already in every
  capture ever taken. `report.py --only=edits` reads them.

**The guided steps should listen rather than sweep.** Every step currently costs
a 139-parameter sweep to work out what moved, takes a minute or two, and produces
an ambiguity whenever more than one thing changed. Listening would identify the
parameter instantly, survive an operator who wanders, and hand back the range for
free. This has not been built yet, and it is the single biggest improvement
available to the probe.

### Closed by the EPS-M captures, 18 August 2026

- **Block lengths**, measured: 323 / 107 / 139, the 16 PLUS's numbers exactly.
- **The parameter census.** All 139 documented items answered and **not one
  silence** where the manual promised an answer — 132 confirmed across ten pages,
  with envelope, pitch, filter, amp and LFO matching their tables item for item.
- **Seven items the Classic answers that its own manual omits**, all of them
  documented by the 16 PLUS: `$20` items 1–5, `$24` item 5 (layer name, returned
  `U`), `$28` item 8 (instrument name, returned `M` for `MOTOR DRUMS1`). The
  Classic's manual is incomplete rather than the Classic being smaller. Note that
  `$20` items 1–5 return **absolute** offsets on the Classic, identical to items
  21–25, where the 16 PLUS documents them as percentages.
- **The `eps.h` envelope collision.** The panel's Level 2 Soft moved item 15 and
  the panel's Level 5 Hard moved item 14, landing on different words (62 and 72).
  Ensoniq's 1989 numbering is right; the 1992 library has the typo.
- **Seven parameter-to-word mappings measured**, every one landing where 16 PLUS
  §7.3 puts it: wavesample words 62, 71, 72, 80, 100 and 105, and layer word 15.
  Layer word 15 also confirms the packing — the Classic's fields in the high
  bytes, the 16 PLUS's additions in the low bytes of words 12–13, nothing
  colliding.
- **Arbitrary sample rates are honoured.** Codes 20, 21, 26, 33, 40 and 100 were
  all accepted, read back unchanged and still there afterwards — including three
  the front panel does not offer.
- **Modulation source is 0–15, measured.** Both manuals' Table 2 lists sixteen
  entries ending `15 = OFF`, and the Classic's scan prints it twice, both copies
  ending there. The five `0-18` annotations and one `0-17` in the Classic manual
  match neither its own table nor each other, and are wrong.

  **Confirmed on hardware, by accident.** While hunting for a control during the
  18 August session the operator wound `$18 $07` all the way up and all the way
  down. The synth announced every step, and the ramp **stopped dead at 15 going
  up and at 0 going down** while the key was still being pressed. Both stops
  measured; the annotations claiming 18 are simply wrong.
  `EPSBlocks.checkModulationSources()` still reports anything above 15 to the
  debug log and changes nothing, because a surprise here would now be very
  interesting indeed.

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
   `eps.h` agrees. **Resolved in favour of the table**: the Classic's own scan
   prints Table 2 twice — a two-column layout read once as a table and once as
   loose lines — and both copies end at `15 = OFF`, while the six range
   annotations match neither the table nor each other. The EPS-M only ever showed
   13 and 15, consistent without proving it, so nothing is clamped:
   `EPSBlocks.checkModulationSources()` writes an out-of-range source through
   unchanged and notes it in the debug log, because a value above 15 is evidence
   either way and is only evidence if it survives.
2. **§9.9 gives Pan as 0–17 while Table 5 lists 0–18**, ending in KEYBOARD.
   **Resolved in favour of the range line, by hardware** — which is a reversal:
   the app used to follow the table on the argument that a definition beats a
   summary. An EPS-M set to hard left wrote 0, so the positions start at 0, and
   dropping Table 5's spurious leading `0 = WAVESAMPLE` yields exactly the
   eighteen values §9.9 states. Nothing in the app clamps pan — a value outside
   0–17 in a real instrument is evidence that the byte is not what we think, and
   it is only evidence if it survives to somewhere a person can see it. See
   `EPSBlocks.WS_PAN_CLASSIC` and §4.

   The general lesson, since this cut both ways within one document: believe
   whichever side is internally coherent and corroborated, not whichever kind of
   thing it is. Table 5 lost because nineteen entries cannot be a range of
   eighteen; Table 2 won because it is printed twice and agrees with the 16 PLUS.
3. **§4.3 says VIRTUAL BUTTON PRESS takes button numbers `[00..35]`** while §6
   lists valid buttons up to 57. Instrument 1–8 are 0–7, so this does not affect
   us.
4. Page footers alternate between "June 12, 1989" and "June 13, 1989".
