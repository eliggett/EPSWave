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

## Reading an instrument's contents

`getInstrumentInventory` in `eps.js` reports what an instrument contains: its
parameters, every layer, every wavesample, and which wavesamples each layer
plays on which keys. No wavedata moves, so it costs one GET per object rather
than the tens of minutes a backup of the same instrument would.

The decoding lives in `epsBlocks.js`, which takes an array of 16 bit words and
returns plain objects. It talks to nothing — no MIDI, no DOM — because the same
blocks arrive by two routes and both need the same parser.

### The MIDI block and the disk format are the same layout

An Ensoniq `.EFE` file is a 512 byte header followed by the EPS's own memory
image. Each object in that image opens with five words of allocator bookkeeping
that Appendix B calls block size, self pointer and the list links, and those five
words are not transmitted over MIDI. **Skip them and the rest of the object is
byte for byte the block described in sections 7.1 to 7.3.**

That was established against a real EPS-16 PLUS instrument file rather than
assumed. Slicing each object at its offset plus five words puts `$FFFF` exactly
on word 25, which section 7.1 names as the field identifying an EPS-16 PLUS;
puts a sensible key range on words 26 and 27; puts the pointer tables at word 29;
and puts a wavesample's Copy Number on word 12 naming a wavesample that does hold
the audio. The physical distance between wavesample objects also matches the
sample count each block declares, to within the 16 byte chunking.

So EFE import is not a second implementation of anything. It is the same decoder
pointed at a file, and `epsEfe.js` — the whole of it — only opens the envelope:
check the signature, read the name and the block count, hand the image over as
words. `EPSEfe.readInstrument` and `getInstrumentInventory` return the same
shape, so the librarian page renders either without knowing which it has.

Reading an EFE needs no synth and no Web MIDI, so it works in any browser and on
a page opened straight from disk. It is also the only part of this that can be
tested without hardware, which is why it was built early.

### Where this lives

The librarian is a second page, `librarian.html`. A transfer of a large
instrument runs for tens of minutes and dies the moment someone navigates away,
so it has to own the whole job rather than share a page with the editor.

That split is what pushed the theme out of `index.html` into `epswave.css`, and
the event log, the MIDI port pickers, the connection test and the About box into
`epswave.js`. Two pages each carrying their own copy of a hand written dark theme
drift apart within about a week. The shared functions are markup driven: each one
looks for a set of element ids and does nothing if they are absent, so a page
opts into the log by having a `#log` and opts out by not having one, with no
flags to keep in step.

### The inventory comes free

Most of the instrument block is a directory. Section 7.1 words 29 to 317 hold the
offsets of the eight pitch tables, the eight layers, the 128 wavesamples and the
effect, packed two words each, and **a zero offset means the object does not
exist**. One `GET INSTRUMENT` therefore settles the entire inventory before
anything else is asked for.

The offset values themselves are RAM addresses valid only at the moment of the
dump, so only the zero test survives the trip. Appendix B's packing is verified
against its own worked example: `$00123450` packs as `$2300 $4510`.

Section 7.2 word 19-106 then gives each layer's key map, one wavesample number
per key. A wavesample is addressed through the layer that owns it, so the maps
are read first and used to select the right layer before each
`GET WAVESAMPLE PARAMETERS`.

### Two things the specification does not say

**Where the layer map starts.** Section 7.2 gives 88 entries and never says which
key the first one is. Measured against the instrument files in `reference/disks`:
**the map starts at MIDI key 21**, which is what an 88 entry map should start at,
21 to 108 being the 88 keys of a piano.

Across all 42 files, both machines, **5398 map entries name a wavesample whose
own declared key range contains the key that entry stands for**. Every wavesample
begins exactly where the map says it does, including one that covers the full 21
to 108. Three of them end elsewhere; that is described next, and it is not a
problem with the base key.

**The layer map outranks the declared key range.** Wavesample words 132 and 133
give a key range, and the layer map gives one key per wavesample. They are two
views of the same thing, and in real instruments they do not always agree:

| File           | WS | Map gives | Block declares |
|----------------|----|-----------|----------------|
| `DIGIPIAN.EFE` | 1  | 36-53     | 36-**55**      |
| `DIGIPIAN.EFE` | 2  | 54-66     | 54-**67**      |
| `GRAND-PN.EFE` | 2  | 52-63     | 52-**64**      |

In each case the declared range runs one or two keys past where the next
wavesample's declared range begins, and the map hands those overlapping keys to
the higher numbered wavesample. Every low end agrees; only the overlaps differ.
So the ranges are what the editor was last told, and **the map is what actually
sounds**.

This decides a question for restore. Writing the key ranges and letting the EPS
regenerate the map from them would come back with different splits than the
original for any instrument like these three. The map has to be written, or the
ranges written and then the map checked and corrected.

**Total Instrument Size in Blocks is a whole word, and the EPS-16 PLUS does not
maintain it.** Section 7.1 word 15 is the obvious pre-flight test for whether an
instrument will fit in free memory, and it was misread twice.

It is not a high byte. Appendix B's group header says "use high byte" and word 15
sits under it, so it was read that way and gave 1 for a 517 block instrument.
Arensburger's library reads it as a full 16 bit word, and the original EPS files
settle it: four of them hold 264, 296, 288 and 304 against file sizes of 268,
301, 295 and 307 blocks, the few blocks of difference being the object headers
the field does not count. Read as high bytes those four would all be 1.

Even read correctly it cannot be trusted from an EPS-16 PLUS file. There it is
right in some — 227 against 224 — and `0x0100` in others whose real size is 133
or 517. The original EPS maintains the field and the EPS-16 PLUS does not. For a
file, count the image.

## Original EPS instruments

Instrument files written by the original EPS turn up in the same file picker as
EPS-16 PLUS ones, and they restore to an EPS-16 PLUS through the same code.
Almost nothing has to be translated, which was not the expectation.

### The two machines lay their blocks out identically

The fear was that the block layouts differ, in which case reading an original EPS
file with these decoders would produce nonsense that happens to parse. Three
independent things say otherwise.

**Appendix B names every EPS-16 PLUS addition.** They follow a convention the
specification never explains: an older field is `ws_something`, and the field the
EPS-16 PLUS added beside it is `wsp_something` — `ws_volume` and `wsp_bus_select`
in word 99, `ws_pan` and `wsp_pan` in word 105, `ws_lfo_wave` and `wsp_boost` in
word 107. The layer's is spelt out in words: `layer_delay`, "This is a WORD in
EPS-16 PLUS ONLY". **Every addition went into a low byte the original EPS left
empty. Nothing was inserted, moved or resized.**

**Arensburger's library agrees.** Written for an original EPS in 1992, it reads
and writes 323, 107 and 139 word blocks for both machines from one code path,
differing only in which halves of a handful of words it looks at.

**The files agree with themselves.** Across all 42 instrument files here, both
families, **5398 layer map entries name a wavesample whose own declared key range
contains the key that map entry stands for** — with the map at word 19 and the
first entry at MIDI key 21, exactly as on the EPS-16 PLUS. A layout that had
shifted by one word could not do that once, let alone 5398 times.

And in all 13 original EPS wavesamples here, **every low byte of every word is
zero**. So the EPS-16 PLUS reads its own additions as 0, which is "off", "none"
or "centre" for each of them — the right answer in every case.

### The one field that means two things

Section 7.3 word 105 is "high byte = unused; low byte = Pan Position". Appendix B
says what the unused half used to be: `ws_pan`, commented "old m2 pan". **The
original EPS keeps its pan in the high byte and the EPS-16 PLUS ignores it.**

Sent unchanged, an original EPS block would arrive with a pan of 0, which is
centre — section 9 gives the range as -99 to +99 — so nothing would be broken.
It is carried across anyway, into the low byte, because that is what Arensburger
does: `putws.c` sends `(pan_pos << 8) | pan_pos`, the same value in both halves,
from the one person here with the hardware to check on.

Worth knowing: the high byte is 3 in all 13 original EPS wavesamples **and in all
62 EPS-16 PLUS ones**. So it is equally possible that it is a constant neither
machine writes and the whole question is moot.

### The audio needs nothing

Appendix B describes the original EPS as 13 bit. Its samples are stored left
justified in 16 bit words with the low three bits zero — in every original EPS
wavesample checked, **not one sample in 20,000 has a low bit set** — which is
exactly the form the EPS-16 PLUS wants. Send it unchanged and it plays as a
quieter 13 bits of a 16 bit machine. No scaling, no dithering, no conversion.

### What does have to change

One word. Section 7.1 word 25 is the Instrument ID Field, `$FFFF` for an EPS-16
PLUS. A restore builds an EPS-16 PLUS instrument in an EPS-16 PLUS whatever wrote
the file, so **the synth's own answer is kept and the file's is dropped**. Every
other one of the 29 parameter words is overlaid from the file as before.

What is lost is what the original EPS never had: no effect, and no values for the
mixer and pan modulators, the boost switch, the LFO rate modulation or the layer
delay. All of that is also true of loading the instrument on the synth from a
disk.

### The header string does not identify the machine

`reference/disks` is split into `EPS-16/` and `EPS-original/` by word 25, which
is the field section 7.1 defines for the purpose. The printable string in the
`.EFE` header sorts them the other way round: the original EPS files all say
`EPS-16 File:` padded with underscores, and the EPS-16 PLUS files all say
`Eps File:` padded with spaces.

These files came off the Internet Archive, so the likeliest reading is that the
header string is the signature of whichever PC utility extracted the disk image
rather than anything the synth wrote. Either way it is not evidence about the
machine. **Word 25 is.**

## Whole instrument backup and restore

**Both directions are implemented and work on hardware.** `uploadInstrument` in
`eps.js` sends an instrument to the synth — its layers, its wavesamples, all of
the audio and every parameter block. `downloadAudio` reads the audio back off
it. `epsWaveFile.js` writes the result to a file and reads it in again.

The goal: copy an entire instrument — its parameters, every layer, every
wavesample and all of the audio — to a file on the computer, and put it back.

### The thing that cost a week: you do not choose wavesample numbers

Section 4.3 documents `CREATE WAVESAMPLE` (`19`) as taking a "New WaveSample
number, # = [1..127]", and `CREATE LAYER` (`16`) and `COPY WAVESAMPLE` (`1B`)
likewise. **The number is ignored.** The EPS assigns the next free slot, counting
from 1, and acknowledges the command as though it had done what was asked.

Asked for wavesample 17 in a layer already holding wavesample 1, a real EPS-16
PLUS created wavesample **2** and returned ACK. Every later command addressed to
17 was then refused, and the refusals were the confusing part: `PUT WAVESAMPLE
DATA` said "Invalid Wavesample" — accurate — while a parameter write to the same
place said **"Insert System Disk"**, which sent the investigation chasing OS
overlays and memory pressure for two days. The proof is the instrument's own
pointer table read straight back after the create: slots 1 and 2 occupied, and
slot 2 holding the 128 sample single-cycle square wave that `CREATE WAVESAMPLE`
supplies.

So an instrument's original wavesample numbering **cannot be reproduced**, and
any restore that tries will work by luck whenever the file happens to number its
wavesamples 1, 2, 3 … and fail whenever it does not. Of the 42 instruments in
`reference/disks`, exactly one — `CS-80STR.EFE`, numbered 1, 2, 17, 18 — does
not, which is why this stayed hidden for so long.

**The numbers are learned instead.** Each object is created, the instrument's
pointer table is read before and after, and whatever slot appeared is what the
EPS decided to call it. That builds a map from the file's numbering onto the
synth's, and everything that refers to a wavesample goes through it:

- which wavesample the audio is sent to
- which wavesample a copy is taken from
- wavesample block word 12, the *Copy Number*
- layer block words 19-106, the key map, translated key by key

One extra `GET INSTRUMENT` per created object, about a second each against a
transfer measured in minutes. Unlike inferring the rule, it cannot be wrong — and
it stays correct if the rule turns out to be different on another machine or
another OS version.

### A wavesample belongs to a layer, not to an instrument

`prepareTarget` creates whatever an upload needs — instrument, layer, first
wavesample — so that pressing Upload works on an empty slot without knowing that
the EPS wants them in that order.

Deciding whether the wavesample already exists looks like a job for the
instrument's pointer table, and it is not. **That table is instrument-wide.**
Wavesample 1 appearing in it says only that *some* layer has a wavesample 1.
Upload into a freshly created second layer and the check sails past on the
strength of a wavesample belonging to the first, then fails addressing one the
new layer has never heard of.

The question is instead put the way the upload will put it: `GET WAVESAMPLE
PARAMETERS` for this layer and this number. An answer means it is there and
addressable, which is the whole of what has to be true. One round trip, no
inference.

The number that comes back may not be the one asked for, because `CREATE
WAVESAMPLE` assigns its own — see above. Asking for wavesample 5 in an empty
layer gets wavesample 1, so the assigned number is read back, selected, and the
page's selector corrected to match.

### Two more things creates do that the specification does not mention

**`CREATE LAYER` does not reliably produce the wavesample it promises.** Section
4.3 says it defines "a new layer with one WaveSample". On hardware a restore of a
one-layer, one-wavesample instrument was acknowledged and then answered "Invalid
Wavesample" to the very next command addressing it. So every wavesample is
created explicitly, and whatever `CREATE LAYER` may or may not have left behind
is discovered by the same before-and-after read rather than assumed. A layer of
nothing but copies sometimes ends up with a spare wavesample it has no use for;
that gets deleted, because a created wavesample is handed a key range across the
whole layer and would otherwise sound.

**Creating a wavesample seizes the layer's key map.** Immediately after creating
a second wavesample, the layer map read back as naming only the new one across
all 88 keys. This is why the layer parameter blocks are written *after* every
create, not before: anything written earlier is thrown away.

### The inventory comes free

The question that decides whether any of this is practical is how to find out
what is *inside* an instrument, and it turned out not to be a problem. See
*Reading an instrument's contents* above, which is implemented: one
`GET INSTRUMENT` yields the complete inventory before anything is transferred.

The pointer tables it walks are these, section 7.1, two words per entry:

| Words     | Contents                                    |
|-----------|---------------------------------------------|
| 29-44     | 8 pitch table offsets                       |
| 45-60     | 8 layer offsets                             |
| 61-316    | **128 wavesample offsets**                  |
| 317-318   | effect offset                               |

Appendix B confirms this against the RAM structure it documents:
`inst_ptable_ptrs ds 8*2`, `inst_layer_ptrs ds 8*2`, `inst_ws_ptrs ds 128*2`,
`inst_effect_ptr ds.l 1`.

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

Two things about `downloadAudio` that only matter once it is running for
twenty minutes at a time:

**The retry belongs at the chunk, not below it.** A large wavesample is
thousands of chunks. Without a retry a single `14 DISK ACCESS IN PROGRESS`
nineteen minutes in throws all of it away — and unlike a restore there is
nothing left on the synth to inspect afterwards to see how far it got. A chunk
is the right unit to repeat because it names its own start and end, so asking
again is exactly the same request.

**A partial read is kept.** Nineteen wavesamples out of twenty is most of an
instrument. What is missing is named in the log and in the saved file rather
than silently rounded up to a failure.

### What a backup is written to

`.epswave`, which is JSON. It holds the **raw parameter blocks, word for word,
and the audio, sample for sample** — nothing else, and nothing interpreted.

Those two are exactly what a restore puts on the wire. Everything else in an
`.EFE` — the offsets, the block sizes, the list links — describes where the EPS
happened to put things in RAM at the moment of the dump, and is regenerated by
the synth on the way back in.

Storing the blocks whole means a backup keeps the words this program does not
decode: the envelopes, the modulation routings, the words the specification
calls unused. The decoded fields written alongside them are for reading by eye,
and on the way back in they are recomputed from the blocks rather than trusted,
so a hand-edited file cannot disagree with itself.

The round trip is verified offline against all 42 instruments here: every block
comes back identical, every sample comes back identical, and a restore driven
from a `.epswave` puts **byte-for-byte the same traffic on the wire** as one
driven from the `.EFE` it was made from. A `.epswave` runs about 1.34× the size
of the equivalent `.EFE`, which is base64.

## Writing .EFE

Writing one means reproducing the EPS's allocator, which reading does not: each
object carries five words of bookkeeping ahead of the block in section 7, and
those five words have to be produced rather than copied. All of it was measured
against the 42 files here.

**`EPSEfe.write` is implemented and confirmed on hardware.** A file written here
loads on an EPS-16 PLUS and plays, including after a full round trip: EFE in,
read the instrument back off the synth, write a new EFE, load that.

### Byte-for-byte reproduction is the wrong test

This was tried first and it was a mistake worth recording. A real file's object
order, and the gaps between its objects, are a record of how the instrument was
edited on the synth — wavesample 2 sitting 400 bytes after wavesample 1 in one
file and immediately after it in another says nothing about the format. Laying
objects out contiguously shifts every following byte, so a byte diff reports the
whole file as wrong and hides whether any field is actually wrong.

The test that means something is: write a file, read it back with the same
decoder that reads Ensoniq's own files, and require that it says exactly what
the original said. **All 42 pass** — every parameter block identical, every
sample identical, every pointer resolving to the right object.

### The five header words

**Words 0-1, the allocated size in bytes**, are a 24 bit value split across two
words with each half shifted left 4 — the same "low three bits of every word are
unusable" habit as the packed offsets, with the halves in the opposite order:

```
value = (word1 << 8) | (word0 >> 4)
```

That reads correctly for **all 181 objects in all 42 files**: every result is a
multiple of 16, none overlaps the next object, a copy reads 288 (the `$120`
header with no audio after it), a layer reads 224, and the instrument's own
figure is exactly the length of the image.

**Word 2** is the byte offset, times 16, of the pointer that points at this
object: 100 + 4·layer for a layer, 132 + 4·n for a wavesample, counted from the
start of the instrument object.

**Words 3 and 4 are a doubly linked list of the wavesamples in each layer**, in
the high bytes — on a layer, the first and last wavesample it plays; on a
wavesample, the next and previous. Walking that chain from every layer's head
reproduces exactly the set of wavesamples that layer's key map plays, with the
back links agreeing, in **all 63 layers**.

### The header

473 of its 512 bytes are identical in every file. What varies is the signature,
the name, the block count at `$34` — repeated at `$36`, which is the only reason
to notice it — and byte `$38`, which is **0 in all 38 EPS-16 PLUS files and 2 in
all 4 original EPS ones**.

### What is still guessed, and does not matter

Three things. The synth loads the file regardless, so **none of them is a field
the EPS depends on** — which is itself the answer to the question they raised.

| Field | Written as | Why |
|-------|-----------|-----|
| `inst_self_ptr`, instrument word 2 | `0` | Holds a RAM address between `$C900` and `$CCC0`, different in every file. Appendix B calls it "used for relocation", and a pointer for relocation cannot survive being loaded at a different address. |
| Low bytes of the two list words | `0` | They vary, their meaning is unknown, and they are zero throughout `CS-80STR.EFE`. |
| The padding after a wavesample's audio | `0` | Real files have stale RAM there — one ends with the bytes of a name fragment. |

Reproducing the two closest files leaves **21 and 22 differing bytes**, and every
one of them is in that table. Nothing else in either file differs. That the EPS
then loads such a file says the relocation pointer really is rebuilt on load,
which is what Appendix B implied and what could not be checked from files alone.

### What a written file drops

Pitch tables and the effect. Neither is captured by a backup — there is no PUT
for an effect and nothing yet reads a pitch table — so their pointer tables are
written empty rather than pointing at nothing, and the caller is told. It is why
`JUCOSMOP.EFE` comes back 2048 bytes shorter: that is its effect block.

Instrument word 15 is written with the true block count rather than copied. On
an original EPS file that reproduces what was there; on an EPS-16 PLUS file it
differs, because the EPS-16 PLUS leaves `0x0100` in a field it does not maintain.

### Restoring, and the one sharp edge

**The instrument block cannot be written back as it was read.** Of its 323
words, roughly 291 are RAM pointers belonging to the EPS's own allocator; the
addresses that were valid when the backup was taken mean nothing afterwards.
Only about 17 words are actual parameters — name, MIDI out channel and program,
pressure mode, MIDI status, the four patch bitmaps, key-down and key-up layers,
key range and transposition. Layers are worse, or better: 7 parameter words and
a name, with words 19-106 being the layer map.

So restore is structural, and it ends with a read, modify, write of the
instrument block:

1. `CREATE INSTRUMENT` (`15`), searching upward from the selected slot.
2. Per layer: `CREATE LAYER` (`16`), then `CREATE WAVESAMPLE` (`19`) for each
   wavesample holding audio, learning the assigned number for each.
3. Upload the audio per wavesample, addressed by the assigned number.
4. `COPY WAVESAMPLE` (`1B`) per copy, learning its assigned number too.
5. Write the wavesample blocks, then the layer blocks, with every wavesample
   number inside them translated.
6. `GET` the freshly created instrument block, overlay the 29 parameter words
   onto the pointer words the EPS wrote itself, and `PUT` it back.

The order is forced at four points. Audio precedes the wavesample block, because
words 115-130 are offsets into wavedata that does not exist yet. Copies follow
the audio they share. Layer blocks follow every create, because a create rewrites
the key map. And the instrument block is last because it is the only one that
must be merged rather than written.

Section 7.2 and Appendix B used to disagree about what a layer map entry is — a
wavesample number in the high byte, or a 12 bit offset into the instrument's
wavesample pointer table. A real instrument settles it in favour of section 7.2.
Its maps hold `01` and `11` in one layer and `02` and `12` in the other, and the
occupied slots of the pointer table are exactly 1, 2, 17 and 18. Appendix B's
comment is the misleading one.

Pre-flight is cheap. Free System Blocks is already read by `ping()`, and an
`.EFE` header gives the instrument's true size, so whether it fits is settled
before spending twenty minutes finding out that it does not. Instrument word 15,
*Total Instrument Size in Blocks*, is **not** usable for this from a file — see
*Two things the specification does not say* above.

### Instruments in internal flash cannot be read at all

An instrument sitting in the machine's internal flash is not reachable over
MIDI, and cannot be edited on the synth either. It has to be copied to floppy or
SCSI and loaded from there first. Switching the storage selector back to floppy
does not help; the instrument has to physically come from somewhere else.

Asking for one produces a response the specification does not allow:

```
-> F0 0F 03 00 03 00 03 00 00 00 01 F7      GET INSTRUMENT
<- F0 0F 03 00 01 36 16 F7                  hi byte 36, lo byte 16
```

Section 4.1 gives a response as `01` followed by "Status Code hi byte, (always
0)" and the lo byte. **That hi byte is not always 0.** Reading only the lo byte
turns this into `16`, "Loop is too long" — a real code, and a completely
misleading one for a GET INSTRUMENT with no loop involved. It cost an evening.

`responseStatus` now keeps a non-zero hi byte, folded in above any documented
code so that every `status != 0` test treats it as the failure it is, and
`statusText` names it as undocumented and suggests the flash as the likely
cause. `isAck` requires the hi byte to be zero too, without which a response of
`36 00` counted as an acknowledgement.

Whether `36 16` means "in flash" specifically or something broader is unknown —
it is the only undocumented status seen — so the advice is offered as a likely
cause rather than as the meaning of the code.

### "Not now" is not "no"

Four status codes mean the EPS is busy rather than refusing, and every one of
them cost a debugging session before it was recognised:

| Code | Name | Why it appears mid-restore |
|------|------|----------------------------|
| `01` | WAIT | Section 3.2: acknowledge it and allow 30 seconds. Treating it as success meant firing commands into a machine that had asked for time. |
| `14` | DISK ACCESS IN PROGRESS | The synth is still working after a large upload. |
| `02` | INSERT SYSTEM DISK | Also seen when the addressed wavesample does not exist, so not always transient — see above. |
| `17` | NAK | Section 5 calls this a bad data transfer, but section 3.1 also has the receiver send it "if another message is received during processing". A `CREATE` carries no data, so for those only the second meaning is possible: too soon. |

All four are retried, five attempts three seconds apart, for any command that
carries no data block. Genuine refusals — "Instrument in Use", "Invalid
Parameter Value" — fail on the first attempt as they should.

This matters beyond the librarian. `createLayer`, `createSqrWave` and
`deleteInstrument` are the editor page's transwave and multi-sample upload path,
and all three used to report a bare "Unable to create layer" with no status code
and no retry.

### One thing not to acknowledge

`GET PARAMETER` returns an ACK followed by a `PUT PARAMETER` carrying the value.
Section 8's worked example ends with "if the data was successfully received, the
ACK status code should be sent", and following that here is wrong: send an ACK
and the EPS answers **"Invalid Instrument"**. That example is a WaveData
transfer, a multi-message exchange where the ACK keeps the next part coming. A
parameter value arrives complete in one message and there is nothing left to ask
for.

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
loaded, but not the choice of algorithm.

Driving the front panel with `VIRTUAL BUTTON PRESS` (`40`) does not help either,
because **no command in section 4 reads the display back**. The button could be
pressed; there is no way to see what it selected. The algorithm has to be read
off the synth by a human.

What is reachable is item `00` of page `30`, which is *Variation* in all
thirteen algorithm tables and so has a known meaning without knowing the
algorithm, plus items `01` to `09`, which carry no `*` or `**` marker. Those are
reported as raw numbers rather than labelled: item `03` is Decay Time in a reverb
and something else entirely in a delay, and naming them without knowing which
algorithm is loaded would be inventing information.

### Off MIDI it is all readable, and this was wrong for a while

None of the above applies to a file. **An `.EFE` carries the effect as an object
like any other, and its name is simply there** — word 5 onwards, one character
per high byte, the same encoding as every instrument, layer and wavesample name.
`EPSEfe.readEffect` reads it.

This section previously said no file here contained an effect block. That was
true of the files here at the time and is no longer: `JUCOSMOP.EFE` carries one,
and every field lands where Appendix B's `effect definition` says it should.

```
HALL REVERB        the object's name, at byte 10
1654 bytes         effect_size at byte 34, "total size in bytes, incl. ucode"
JUST REVERB        effect_fx1_name at byte 60, 13 bytes, plain NUL terminated ASCII
MORE REVERB        effect_fx2_name
ALSO REVERB        effect_fx3_name
0                  effect_current_var at byte 99
```

Those three inner names read exactly like a list of variations, and they are
still not labelled as such: section 9 gives the Variation parameter as "0-3
(Variations 1-4)" and there are three of them, so either the algorithm's own name
is the fourth or they are something else. **One file with an effect is one
specimen.** The name is shown because it is the object's name field and that
convention is not in doubt; the rest is shown verbatim and left to the reader.

So the algorithm a patch was built with *can* be recovered — from the disk file,
never from the synth. Which is enough, because it is only needed to reselect the
effect by hand after a restore.

Whether an instrument on the synth even has an effect to read is still untested,
and 41 of the 42 files here having none still suggests the effect usually belongs
to the bank rather than the instrument.

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