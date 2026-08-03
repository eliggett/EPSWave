# Methods and algorithms used

This file will detail various methods and algorithms used by the program

## The two word formats

Everything below rests on section 2.3, so it is worth stating once. Sysex data
bytes carry seven bits and the EPS uses six of them, so every value is split:

- **12 bit format**, two bytes of six bits, high byte first. Used for command
  parameters. Four bytes carry a 20 bit WaveData offset or a 24 bit parameter
  value.
- **16 bit format**, three bytes of six bits, of which only four bits of the
  first are used. Used for sample data and for whole parameter blocks.

`convertTo16BitMidi` and `convertFrom16BitMidi` are exact inverses of each
other, which is what makes the read, modify, write in *Naming* below safe.

## Reading a wavesample

Implemented in `EPS16.getWavesampleDataChunked()`, `getWavesampleData()` and
`getWavesampleParams()`.

### Finding out how long it is

A download starts with `GET WAVESAMPLE PARAMETERS` (command `05`). Section 4.2
and the worked example in section 8 describe the exchange: the EPS answers with
an ACK and the matching PUT header, and the block itself only follows once we
ACK that in turn. The block comes back in the 16 bit format, one word per
parameter.

The length is at words 119 to 122, the Sample End Offset, a 32 bit field left
justified across the high bytes of the four words and shifted right by 9 to give
a word offset. That is `getEndOffset()`.

Four other things are pulled from the same dump while it is in hand, at no extra
cost in traffic:

| words | value |
|-------|-------|
| 00-11 | name, 12 ASCII bytes in the high bytes |
| 80 | root key in the high byte (the low byte is the crossfade fadecurve) |
| 86 | fine tune, "signed 7 bit fraction in hi byte" |
| 131 | sample rate code |

### Fetching the audio

The samples then come in blocks, each one a `GET WAVESAMPLE DATA` (command `06`)
carrying a start and an end offset as four bytes each. The EPS ACKs, we ACK
back, and the block arrives in the 16 bit format, three bytes per sample.
Anything above 32767 is a negative number in two's complement and is corrected
on the way in.

Two details that were wrong at one point and are easy to get wrong again:

- **The loop walks to the end offset rather than running a fixed number of
  times.** Looping `ceil(length / blockSize)` times asks for one block past the
  end whenever the length is an exact multiple of the block size, and advancing
  by the requested size rather than by what actually came back loses alignment
  the moment the EPS returns a short block.
- **The wait for the data message is the command timer plus the wire time of the
  block**, not a fixed timeout, or a large block times out on a slow interface
  purely because it is large.

## Writing a wavesample

Implemented in `EPS16.uploadWavToEPS()`, `putWavesampleDataInChunks()` and
`putWavesampleData()`.

### Order of operations

1. Five single PUT PARAMETERs on page `20` to put the wavesample in a known
   state: loop mode forward (`00`), loop position (`19`), loop start (`17`),
   sample start (`15`), sample end (`16`).
2. `TRUNCATE WAVESAMPLE` (command `1E`).
3. The audio, in blocks, described below.
4. Loop end (page `20` item `18`) set to the length just written.
5. Sample rate, root key, fine tune.
6. The name, last of all.

The order matters at both ends. The data goes in before the tuning parameters so
that a rate the EPS dislikes cannot disturb the transfer itself, and the name
goes last because naming reads the whole parameter block back and returns it, so
everything else has to be in place first.

### Blocks and the two second command timer

This is the single most important number in the program. Section 3.1 gives the
EPS a **two second command timer**: having ACKed the header of a
`PUT WAVESAMPLE DATA`, it waits two seconds for the block itself and NAKs if it
has not arrived.

MIDI runs at 31250 baud, 8N1, so ten bits per byte: **3125 bytes per second**,
0.32 ms per byte. A block of *n* samples is `3n + 5` bytes on the wire.

The default block is 1000 samples, 3005 bytes, **0.96 s** at the full MIDI rate.
`MIN` is 32 and `MAX` is 2048 samples, and the interface exposes the setting
because the right value depends on the adapter, not on the sample.

**This default assumes an interface that keeps up.** It clears the timer with
room to spare at the full rate and does not clear it at all at the 1353 bytes
per second measured below, where 1000 samples takes 2.2 s. It is set in
`DEFAULT_CHUNK_SAMPLES`, and the loopback test exists to find the right value
for a particular adapter rather than to guess at one.

This is what the original fault was. The old code sent anything under 5000
samples as a single message. On the interface it was tested with, the measured
throughput was about **1353 bytes per second**, 43% of nominal, at which
**900 samples is 2705 bytes and takes exactly 2.00 seconds** — which is why
uploads were fine below about 900 samples and corrupt above it.

The loopback test under *Transfer settings and diagnostics* measures the real
throughput and suggests a block size from it.

### When a block is refused

Each block gets up to `MAX_CHUNK_ATTEMPTS` (4) tries, and what happens between
them depends on why it failed:

| outcome | meaning | response |
|---------|---------|----------|
| status `14` | Disk Access in Progress, section 5: "current disk activity prevented the execution of the command" | wait 2.5 s, offer **the same block again** |
| any other refusal | the block itself was not accepted | wait 1.5 s, **halve** the block size, floor 32 |
| silence | nothing came back | **failure** |

The distinction matters: `14` says nothing about the block, so shrinking it only
makes the transfer longer. Treating silence as failure matters more. It used to
count as success, which is exactly how a transfer could report a clean finish
and still play back corrupted.

### Sample rate

The encoding is given in one line of section 7.3: *sample period = rate × 1.6
microseconds*. So

```
rate in Hz = 625000 / code
```

with codes 2 to 100, which is 312.5 kHz down to 6.25 kHz — matching the range
found on the instrument. The seven front panel rates are codes 14, 21, 28, 35,
42, 49 and 56.

Two consequences for imported files:

- **No code gives exactly 44100 Hz.** The nearest is code 14 at 44643 Hz, which
  is **+21.2 cents** sharp. The EPS calls this one "44.1" on its own display.
- Code 13 is 48077 Hz, **+2.8 cents** from 48 kHz.

An imported WAV is therefore quantised to the nearest code, and the leftover
pitch error is cancelled with fine tune rather than left for the user to notice.

The rate is written with a single PUT PARAMETER to page `20` item `0D`. Section
9.5 marks it "receive only", which per NOTE 1 means the EPS will not announce a
front panel change, not that it cannot be written; NOTE 3 marks the parameters
that genuinely refuse a single PUT, and this is not one of them.

### Root key and fine tune

Both live on the pitch page, `10` item `01` and item `0A`, and neither carries a
`*` or `**` marker, so both take a single PUT PARAMETER. Fine tune runs −99 to
+99 cents.

Negative values go as **24 bit two's complement**, per the "right justified
within a 24 bit binary word" rule in section 9. This needed fixing when fine
tune arrived: `convertTo12BitMidi` builds its bit string with `toString(2)`,
which writes a minus sign rather than a sign bit, and a negative value came out
as an invalid MIDI byte. Nothing before fine tune had ever sent one.

### Naming

Implemented in `EPS16.setBlockName()` and `putParamBlock()`, shared by
instruments, layers and wavesamples.

All three names are 12 ASCII bytes at words 00 to 11 of the object's own
parameter block, in the high byte of each word: section 7.1 for the instrument,
7.2 for the layer, 7.3 for the wavesample. **None of them can be set with a
single PUT PARAMETER.** Instrument Name (page `28` item `08`) and Layer Name
(page `24` item `05`) are both marked `**`, and the wavesample name is not in
section 9.5 at all. NOTE 3 gives the only route, so naming is a read, modify,
write of the whole block:

| | GET | PUT |
|---|-----|-----|
| instrument | `03` | `0C` |
| layer | `04` | `0D` |
| wavesample | `05` | `0E` |

The block is always fetched immediately before it is written, never assumed, so
a rename cannot disturb the settings around it. Only the twelve name words
change, and the low byte of each is preserved, since section 7 describes only
the high byte as ASCII and says nothing about the other.

**The character set is A-Z, 0-9, space, `*`, `+` and `-`.** This is not in the
specification, which says only "12 ASCII bytes", and the EPS will not tell you:
it accepts any byte without complaint and hands the same byte straight back on a
GET, so a name looks perfectly correct from the computer. Walk over to the front
panel and everything outside that set is simply not there — send "Bass Sweep"
and the display reads "B S", the lower case having been dropped rather than
folded. The set above was established by renaming on the instrument itself.

`EPS16.sanitizeName()` therefore folds to upper case and reduces to that set,
and the name fields filter as you type so the screen matches what the synth will
show. `#` becomes `+`, the nearest character the set offers, so a generated
"PWM C#3" arrives as "PWM C+3" rather than losing the sharp and naming a
different note.

Names default to something useful rather than nothing: the WAV file name for an
import, the waveform and pitch for a generated wave ("PWM C3"), and
`UNNAMED INST` / `UNNAMED LAYR` / `UNNAMED WS` for the create buttons. "UNNAMED
LAYER" is thirteen characters and does not fit.

## Finding a free instrument

Implemented in `EPS16.createNextFreeInstrument()`, shared by the transwave, the
morphing soundscape and the one-sample-per-instrument upload.

**There is no way to ask whether an instrument slot is occupied.** Nothing in
section 9 reports it and there is no "instrument exists" query, so the only
test is to try: `CREATE INSTRUMENT` (`15`) refuses when the slot is taken. A
refusal during this search is therefore an ordinary answer rather than an
error, which is why the probe is quiet — the search used to put a failure in
the event log for every occupied slot it walked past on its way to a working
one.

The search starts at the instrument currently selected and works upwards to 8.
It does not wrap, so the selector is a "start here" rather than a "use this",
and none of the three macros can be pointed at an existing instrument: they
always create their own.

Two bugs lived in the three hand written copies of this loop that it replaced.
The instrument number was set **after** each attempt rather than before, so
every attempt used the previous loop index: a search from slot 1 tried 1, 1, 2,
3, 4, 5, 6, 7 — the first attempt twice, and **instrument 8 never at all**. A
synth with the first seven loaded reported that it could not create an
instrument while the eighth sat empty. Separately, in
`uploadToDifferentInstruments`, exhausting the search ended the inner loop
quietly and carried on around the outer one, so once the instruments ran out
the remaining samples went nowhere and the run still reported that it had
completed. Both now fail loudly and say how far they got.

## Transwave

Implemented in `EPS16.uploadAsTranswave()`.

### The idea

A transwave is one wavesample containing several wavetables end to end, with a
short loop that the mod wheel slides through it. The wheel therefore scans
across the wavetables, and the sound morphs under your hand. This is the
counterpart to the *Morphing Soundscape* below, which does the same kind of walk
but drives it from an LFO instead of the wheel, and spreads it over eight layers
instead of packing it into one wavesample.

### Building it

1. Claim a free instrument as in *Finding a free instrument* above, then
   `CREATE LAYER` and `CREATE WAVESAMPLE`.
2. Concatenate every wavetable into one buffer and upload it as a single
   wavesample, exactly as in *Writing a wavesample*.
3. Write four parameters on the wavesample page `20`:

| item | parameter | value |
|------|-----------|-------|
| `18` | Loop End | length of the **first** wavetable |
| `06` | Loop Mod Type | `07`, TRANSWAV in Table 5 |
| `07` | Loop Mod Source | `0A`, the wheel in Table 2 |
| `08` | Loop Mod Amount | number of wavetables **+ 1** |

The loop end is what makes the loop one wavetable wide; the mod type tells the
EPS to move the loop rather than anything else; the amount sets how far the
wheel drags it.

### Things to know

- **All the wavetables should be the same length.** The loop width comes from
  the first one alone, so mixed lengths leave the loop straddling a boundary for
  part of the sweep.
- **The `+ 1` in the modulation amount is not documented**, and was arrived at
  empirically. It is presumably what makes the last wavetable reachable at the
  top of the wheel's travel.
- **Table 2 is damaged by OCR in the reference copy.** Entry `0A` prints as
  "WHERE", which is almost certainly "WHEEL", and hardware testing confirms the
  wheel is what ends up controlling it. See the same note under *Morphing
  Soundscape*.
- This mode reported failure for a long time even when it worked. The test was
  `if(messages.length = 0)`, an assignment rather than a comparison, which
  emptied the array, evaluated to `0` and took the failure branch every single
  time. The four parameter writes now each return a boolean and the outcome is
  their conjunction.


## Morphing Soundscape

Implemented in `EPS16.createMorphingWaveTable()` and `EPS16.getCrossFadeBreakPoints()`.

### The idea

Nothing crossfades the audio itself. What is crossfaded is the **volume of each
layer**, against a single shared modulator, and that modulator is driven by a
free running LFO. As the LFO sweeps, each layer fades up while the previous one
fades down, so the instrument walks through the wavesamples in order on its own.

This is the difference between this mode and the Transwave mode: a transwave is
steered by the mod wheel, a soundscape moves by itself.

One instrument holds the whole thing, one layer per wavesample. The EPS allows
eight layers per instrument, which is the origin of the "limited to 8 samples"
note in the interface.

### Building it

1. Claim a free instrument as in *Finding a free instrument* above.
2. Set the instrument's Patch to `0xFF` (page `28`, item `00`), so all eight
   layer bits are active in the current patch. Each bit is one layer; a set bit
   means that layer sounds.
3. For each wavesample, in order: select the layer, `CREATE LAYER`,
   `CREATE WAVESAMPLE`, upload the audio (which also sets sample rate, root key
   and fine tune, see *Writing a wavesample*), then write the crossfade and LFO
   parameters below.

### Crossfade breakpoints

Four points describe where a layer is heard across the modulator's `0..127`
range:

| point | parameter | meaning |
|-------|-----------|---------|
| A | page `18`, item `03` | fade in starts |
| B | page `18`, item `0B` | fade in complete, layer at full |
| C | page `18`, item `04` | fade out starts |
| D | page `18`, item `0C` | fade out complete, layer silent |

`getCrossFadeBreakPoints(count, step, overlap)` places the layers at evenly
spaced centres across the range, `spacing = 127 / (count - 1)` apart, and makes
each one a trapezoid: silent, ramping up over `ramp`, flat across `plateau`,
ramping down over `ramp`, silent again.

```
ramp    = overlap * spacing
plateau = max(0, spacing - ramp)
centre  = step * spacing

A = centre - plateau/2 - ramp        C = centre + plateau/2
B = centre - plateau/2               D = centre + plateau/2 + ramp
```

**Only the ramp is chosen. The plateau is whatever is left of a spacing**, and
that is the whole trick. Substituting `plateau = spacing - ramp` into the two
expressions gives `A(n+1) = C(n)` and `B(n+1) = D(n)` identically, so a layer
begins fading in at the exact instant the one before it begins fading out — at
every overlap setting, without the chained recursion the first version of this
function used to guarantee it.

The two ends need no special case either. The first layer's A and B fall below
0 and the last layer's C and D above 127, and clamping to the range turns that
into "full volume from the start of the sweep" and "full volume to the end",
which is what the old version spelled out by hand.

### The overlap control

`overlap` is the ramp width **in layer spacings**, and it is the one number
that decides how much of the sound is a blend and how much is a single
waveform. The interface exposes it as a 0-100% slider that runs between
`MORPH_OVERLAP_MIN` and `MORPH_OVERLAP_MAX`.

| overlap | slider | geometry | layers sounding at once |
|---------|--------|----------|-------------------------|
| 0.5 | 0% | ramp and plateau equal | 1 or 2 |
| 1.0 | 33% | plateau gone, layers are triangles | always 2 |
| 1.25 | 50%, the default | | 2 or 3 |
| 2.0 | 100% | | 3 or 4 |

0.5 is where the mode started, and it is the floor rather than the default
because it is the setting that prompted the control: at half a spacing each
wave spends half its turn alone, and the handover is brief enough that the
morph reads as one wave stopping and the next starting.

Four wavesamples, for comparison against the table this replaces:

| slider | L0 | L1 | L2 | L3 |
|--------|----|----|----|----|
| 0% | `0/0/11/32` | `11/32/53/74` | `53/74/95/116` | `95/116/127/127` |
| 33% | `0/0/0/42` | `0/42/42/85` | `42/85/85/127` | `85/127/127/127` |
| 100% | `0/0/0/85` | `0/42/42/127` | `0/85/85/127` | `42/127/127/127` |

Above 1.0 there is no plateau left to give back, so the ramps simply keep
widening and layers more than one spacing apart start to sound together. The
ceiling of 2.0 is a judgement rather than a limit — the formula keeps working
up to `count - 1`, at which every layer is audible everywhere and only its
position in the sweep differs, which is mush.

**Resolution is the real constraint at eight layers.** A spacing is then only
18 of the modulator's 128 steps, so the whole slider moves the ramp across a
range of 9 to 36 steps. Below the bottom of the slider the fade would be short
enough to click, which is the other reason 0.5 is the floor.

### Parameters written per layer

Page `10` is PITCH, page `18` is AMP (VOLUME), page `1C` is LFO, per section 9
of the External Command Specification.

**Pitch LFO Amount has to be zeroed on every layer**, and this was not obvious.
There is one LFO, and the mode uses it to sweep the crossfade — but a wavesample
arrives with that same LFO already routed to pitch by a non-zero amount, so
every layer wobbles in pitch as it fades and eight of them at once is chaos.
Setting page `10` item `02` to zero is the front panel's Pitch / LFO AMOUNT,
which is where this was first found by hand.

Note that the four breakpoints and the fadecurve belong
to the **wavesample**, not to the layer: section 7.3 puts them at words 101 to
104 and in the low byte of word 80. Since this mode gives every layer exactly
one wavesample the distinction never bites, but it is why the parameters are
written after the upload, while the wavesample number still points at the one
just created.

| page/item | parameter | value written | documented range |
|-----------|-----------|---------------|------------------|
| `10` / `02` | Pitch LFO Amount | `0` | -15.7 to +15.7 |
| `18` / `05` | Vol Mod Crossfade Fadecurve | `0` (CROSSFADE) | 0-1 `*` |
| `18` / `03` | Crossfade-In Point A | breakpoint | 0-127 |
| `18` / `0B` | Crossfade-In Point B | breakpoint | 0-127 |
| `18` / `04` | Crossfade-Out Point C | breakpoint | 0-127 |
| `18` / `0C` | Crossfade-Out Point D | breakpoint | 0-127 |
| `18` / `07` | Volume Modulation Source | `0` (LFO) | 0-15 `*` |
| `18` / `0A` | Volume Modulation Amount | `127` | **0-99** |
| `1C` / `02` | LFO Speed | `15` | 0-99 |
| `1C` / `03` | LFO Depth | `127` | **0-99** |
| `1C` / `04` | LFO Delay | `0` | 0-99 |
| `1C` / `05` | LFO Mode | `1` (Reset On) | 0-2 `**` |
| `1C` / `08` | LFO Rate Modulation Source | `0F` | 0-15 `**` |
| `1C` / `07` | LFO Depth Modulation Source | `0F` | 0-15 `**` |

### Known discrepancies with the specification

These are recorded as found, not fixed. The mode works on hardware, and the
markers in section 9 are not always enforced, but they are worth knowing about
when something misbehaves.

- **Two values exceed their documented range.** Volume Modulation Amount and LFO
  Depth are both written as `127` where section 9 gives the range as 0-99. The
  EPS answers a PUT PARAMETER only when it dislikes the number or the value, so
  a refusal here now appears in the event log as `Invalid Param Value`.

- **Six parameters are marked `*` or `**` in section 9.** NOTE 3 of that section
  says `*` parameters "do not receive single PUT PARAMETER commands" and `**`
  parameters "are not available for use with single GET and PUT PARAMETER
  commands", the whole block having to be sent instead. The four crossfade
  breakpoints are unmarked and are accepted normally; the fadecurve, the volume
  modulation source, the LFO mode and both LFO modulation sources all carry a
  marker. Running a soundscape with the event log open will show which of them
  this particular machine actually refuses.

- **The fade curve was the wrong one of the two.** Section 9.9 gives the
  fadecurve as `0-1 (CROSSFADE-LINEAR)`, and section 9 lists enumerated values
  in order elsewhere — `0-1 (OFF-ON)`, `0-2 (Reset Off-Reset On-Human)` — so
  `0` is CROSSFADE and `1` is LINEAR. The mode sent `1`. LINEAR is a straight
  ramp on the volume, and two unrelated waveforms passing each other on straight
  ramps lose level in the middle of the handover; CROSSFADE is the curve that
  exists to hold the level up through exactly that region. This is the more
  likely explanation for a soundscape that sounds like one wave stopping before
  the next arrives, and it was fixed at the same time as the overlap control was
  added, so the two changes have not been heard separately. `MORPH_FADECURVE`
  is a constant for that reason: set it back to `1` to compare. The parameter
  carries a `*`, so the EPS may refuse to set it from a single PUT PARAMETER at
  all, in which case the refusal shows up in the event log and the curve stays
  at whatever the front panel last chose.

- **Above eight wavesamples the top of the sweep used to fall silent.** The
  layer loop stops at eight, but the breakpoints were computed for the full
  count, so the remaining span of the modulator had no layer assigned to it —
  with nine wavesamples the last uploaded layer finished fading out at 124 of
  127, with ten at 108. The count is now clamped to `MAX_MORPH_LAYERS` before
  the geometry is computed, so the layers that do get uploaded spread over the
  whole range. The extra wavesamples are still silently dropped.

- **Table 2, the modulation source list, is damaged by OCR in the reference
  copy** in `reference/`. Entry `00` is used here as the LFO, which agrees with
  the comment in the source and with the way the table's header cell has been
  mangled, but it cannot be confirmed from the document as it stands.

## Pitch detection

Implemented in `pitchDetect.js`. Runs on every WAV import and sets the root key
and fine tune from what it finds.

### Why not an FFT

The obvious approach is to take the spectrum and call the lowest peak the
fundamental. It fails on a large fraction of real samples, because plenty of
them have little or no energy at the fundamental at all — the pitch you hear
comes from the *spacing* of the harmonics. Peak picking reports twice the
frequency on those and lands an octave out.

YIN (de Cheveigné and Kawahara, 2002) is a time domain periodicity detector. It
asks how well the waveform repeats at each candidate lag, which the missing
fundamental does not affect: the waveform still repeats at its period whether or
not that frequency is present.

The result is a **period in samples**, not a frequency, which is the right thing
to carry around here. It is independent of sample rate, so the pitch the EPS
will actually sound is `epsRate / period`, and the rate quantisation described
above is folded in for free rather than having to be corrected afterwards.

### The four steps, per window

1. **Difference function.** For each lag `tau`, the sum of squared differences
   between the window and itself shifted by `tau`.
2. **Cumulative mean normalisation.** Divide each value by the running mean of
   everything below it. Without this the trivial dip at zero lag dominates.
3. **Absolute threshold.** Take the *first* dip below `THRESHOLD` (0.15), then
   walk to the bottom of that dip. Taking the deepest dip instead would prefer
   the one at twice the period, which is the classic octave error.
4. **Parabolic interpolation** around the minimum. Without it a period of 170
   samples can only be measured to about 10 cents.

The lowest fundamental searched is 32.7 Hz (C1), which sets the cost: the search
runs to `sampleRate / 32.7` samples and each window is twice that plus 256. At
44.1 kHz that is a **2952 sample** window, so shorter files are rejected as
having too little repetition to measure. A single cycle waveform lands here, and
for that the period is the buffer length rather than something to detect.

### Getting a trustworthy answer out of it

One window is not enough — a single window can lock onto a subharmonic — so
twelve are spread across the file and the disagreement between them becomes half
the confidence measure.

- **A one pole high pass at 60 Hz, run twice, before anything else.** This was
  the worst failure found in testing: DC offset or mains hum combines with the
  note to make a longer common period, and the detector confidently reports a
  pitch one or two octaves too low.
- **Windows quieter than 25% of the loudest are discarded**, so a fade out tail
  cannot outvote the note.
- **Window start positions are deduplicated.** On a buffer barely longer than
  one window every start would land on the same samples, and the agreement
  between windows would read as perfect because it was measuring one window
  twelve times. Falling below three distinct windows is the honest outcome.
- **Octave disagreements are folded onto the most periodic window** before the
  spread is measured, so one window an octave out does not throw away an
  otherwise good detection.

A detection is accepted only if median aperiodicity is under 0.30 and the spread
between windows is under 100 cents. On the test material every correct detection
came in at aperiodicity ≤ 0.19 and spread ≤ 48 cents, while every wrong one —
noise, unpitched effects — was at ≥ 0.49 and ≥ 1200 cents. The thresholds sit in
the middle of that gap rather than at the edge of it.

`tuningFor()` then rounds the sounding frequency to the nearest MIDI note for
the root key and cancels the remainder with fine tune. Rounding to the nearest
note leaves at most 50 cents, comfortably inside the ±99 the synth accepts.

### How it was validated

There is no ground truth for a sample pack, so two independent checks were used
instead of one.

Over a 500 file synth pack, 222 files were accepted. Of those, **90% land on C
or F** — chance would be about 8% per pitch class — which is what a pack of
single notes played at a couple of reference pitches should look like. The
median distance from 12-TET is **−1.6 cents** and 81% are within ±20 cents.

Separately, the shipped JavaScript was transcribed back to Python with the
constants parsed out of the JS file, and the two run over the same files:
**125/125 identical accept and reject decisions, 0.0000 cents difference** in
the periods. That check also caught a genuine bug in the first prototype, whose
FFT autocorrelation summed over the whole buffer rather than the first window
and produced *negative* aperiodicity; fixing it took the accept rate from 27% to
41%.

## Instrument "ping" test

Implemented in `EPS16.ping()` and `findBaseChannel()`.

### What to ask a synth that has nothing on it

The EPS powers up with no instrument, no layer and no wavesample, so a test has
to avoid all three. The note at the head of section 9.1 is what makes this
possible: for a System·MIDI parameter "the instrument, layer, and WaveSample
values are irrelevant, but still must be included in the message".

The target is **Free System Blocks, page `34` item `00`**, range 0-10000, read
only. It exists on a bare machine, it cannot disturb anything, and the answer is
a genuinely useful number. Section 7.1 gives one block as 256 words, so the
reply converts straight into samples and kilobytes.

Unlike a data transfer, a `GET PARAMETER` (command `08`) is answered by a
`PUT PARAMETER` (command `11`) carrying the value inline, with no second
exchange to complete. The value is four bytes of six bits, right justified in 24
bits and signed.

### What a reply proves

Any reply at all, **including a refusal**, proves the entire path: the message
reached the synth, sysex is switched on, the header was parsed, and the return
cable works. So the three outcomes are reported separately — a value, an error
status, and silence — rather than being collapsed into pass or fail.

### Why silence triggers a channel scan

The sysex header carries the base channel. A synth set to a different one
**ignores every message without complaint**, which is indistinguishable from a
dead cable, a wrong port, or sysex being switched off. Since that is both common
and invisible, silence is followed by trying all sixteen base channels at 700 ms
each; if one answers it is reported and left selected.

Only when nothing answers on any channel does the test conclude that something
is actually wrong, and it then names the three things worth checking: cable
direction, port selection, and Edit / System·MIDI / Sysex-MIDI.

## Whole instrument backup and restore (preliminary)

**Nothing below is implemented.** This is a design study written against the
specification and the code that already exists, recorded so the next person does
not have to re-derive it. Every figure quoted is either from the specification or
computed from the measured transfer rate in *Blocks and the two second command
timer* above.

The goal: copy an entire instrument — its parameters, every layer, every
wavesample and all of the audio — to a file on the computer, and put it back.

### The inventory comes free

The question that decides whether any of this is practical is how to find out
what is *inside* an instrument. It turns out not to be a problem. Most of the
instrument parameter block of section 7.1 is a directory:

| Words     | Contents                                    |
|-----------|---------------------------------------------|
| 29-44     | 8 pitch table offsets, two words each       |
| 45-60     | 8 layer offsets                             |
| 61-316    | **128 wavesample offsets**                  |
| 317-318   | effect offset                               |

Appendix B confirms this against the RAM structure it documents:
`inst_ptable_ptrs ds 8*2`, `inst_layer_ptrs ds 8*2`, `inst_ws_ptrs ds 128*2`,
`inst_effect_ptr ds.l 1`. A zero pointer means the object does not exist, so a
single `GET INSTRUMENT` (command `03`) yields the complete inventory before
anything is transferred. Section 7.2 word 19-106, the layer map of 88 keys, then
says which wavesamples belong to which layer.

This is the same command that would answer the separate "query the instrument"
idea in `TODO.md`, and it is worth building on its own first.

### Backing up

1. `GET INSTRUMENT` (`03`) for the inventory and the instrument parameters.
2. Per existing layer: `GET LAYER` (`04`), and `GET PITCH TABLE` (`07`) when
   layer word 17 names a custom table.
3. Per existing wavesample: `GET WAVESAMPLE PARAMETERS` (`05`), then the audio
   through `getWavesampleDataChunked`, which already walks to the end offset and
   retries failed chunks.

Wavesample words 12 and 13 are *Copy Number* and *Copy Layer*. When they are
non-zero the wavesample shares its data with another one and has none of its
own; asking for it returns status `11`, "Wavesample is a copy". Backup has to
notice this and skip the fetch, or a multi-zone instrument transfers the same
audio several times over. Restore recreates those with `COPY WAVESAMPLE` (`1B`).

### Restoring, and the one sharp edge

**The instrument block cannot be written back as it was read.** Of its 323
words, roughly 291 are RAM pointers belonging to the EPS's own allocator; the
addresses that were valid when the backup was taken mean nothing afterwards.
Only about 17 words are actual parameters — name, MIDI out channel and program,
pressure mode, MIDI status, the four patch bitmaps, key-down and key-up layers,
key range and transposition. Layers are worse, or better: 7 parameter words and
a name, with words 19-106 being the layer map.

So restore is structural, and it ends with the read, modify, write that
`setBlockName` already performs:

1. `CREATE INSTRUMENT` (`15`).
2. `CREATE LAYER` (`16`) and `CREATE WAVESAMPLE` (`19`) for each object.
   Both commands take an **explicit number**, so the original numbering can be
   reproduced exactly.
3. Upload the audio per wavesample, which is mechanically what `uploadWavToEPS`
   already does: sample end to 1, truncate, then chunked `PUT WAVESAMPLE DATA`.
4. Per block, `GET` the **freshly created** block, overlay the saved parameter
   words onto the pointer words the EPS just wrote itself, and `PUT` it back.

Preserving the numbering in step 2 is what makes step 4 safe: the layer maps and
the copy references restore verbatim, so there is never any need to resolve the
disagreement between section 7.2, which calls a layer map entry a wavesample
number in the high byte, and Appendix B, which calls it a 12 bit offset into the
instrument's wavesample pointer table.

Two orderings matter. Wavesample words 132 and 133, the key range, and the layer
map are two views of the same thing on this machine, and setting either
regenerates the other; restore the key ranges and then check the map rather than
writing both and hoping. And the data offsets in words 115-130 only mean
anything once the audio is in, so the wavesample parameter block goes last.

Pre-flight is cheap. Instrument word 15 is *Total Instrument Size in Blocks*, and
Free System Blocks is already read by `ping()`, so whether the instrument fits
can be settled before spending twenty minutes finding out that it does not.

### What cannot be captured: effects

There is **no** `GET EFFECT` or `PUT EFFECT` command. The instrument block holds
an effect offset and there is nothing to read through it. Effects are reachable
only as individual parameters on page `30`, section 9.12, and that route has two
problems:

- NOTE 2 states that functions on the Effect Select·Bypass page "neither
  transmit nor receive PUT or GET PARAMETER commands". **The effect algorithm
  cannot be selected over MIDI**, and cannot reliably be read back either.
- Section 9.12 is the most OCR-damaged part of the document. A dozen distinct
  parameters are all printed with low byte `00`.

So the effect parameters can be saved for the algorithm that happens to be
loaded, but not the choice of algorithm. Either prompt the user to select it by
hand before restoring, or drive the front panel with `VIRTUAL BUTTON PRESS`
(`40`) — button `11` is Effect·Select·Bypass and `18` is Effects — which works
but depends on what is already on the display.

### Time is the real constraint

Wavedata costs three MIDI bytes per 16 bit sample. At 31250 baud that is a
ceiling of 1042 samples per second, and the measured end-to-end figure of 1353
bytes per second puts the practical rate at **about 451 samples per second**.

| Instrument size | At the 3125 B/s ceiling | At the measured rate |
|-----------------|-------------------------|----------------------|
| 128 KB          | 1.0 min                 | 2.4 min              |
| 512 KB          | 4.2 min                 | 9.7 min              |
| 1 MB            | 8.4 min                 | 19.4 min             |
| 2 MB            | 16.8 min                | 39 min               |

A backup and a restore of a large instrument is therefore over an hour of
unattended MIDI, and a verify pass would double it. That changes what the
feature is: not a button, but a long running job. It needs per-wavesample
checkpointing so that a dropout at minute thirty does not discard the run, a
manifest it can resume from, and a clear indication that the synth should be
left alone — the sequencer in particular has to be stopped, or commands come
back with status `13`. The existing chunk retry was written for a thirty second
transfer, not a thirty minute one.

### What to store

Keep the **raw 16 bit blocks verbatim**, pointer words and all, alongside the
decoded parameters and the audio. Restore ignores the pointers, so this looks
redundant, and it is worth it anyway: Appendix B documents the complete
instrument layout, including the offset packing, the `$120` byte wavesample
header and the 16 byte chunking, which means a backup taken this way already
contains everything needed to emit a real `.EFE` instrument file later. That
would be loadable by the existing Ensoniq disk tools, which is a far larger
payoff than a private format — but it means reimplementing the EPS's memory
allocator and verifying against genuine files, so it is a project of its own.
Capturing the raw blocks now is what avoids having to re-run every backup then.