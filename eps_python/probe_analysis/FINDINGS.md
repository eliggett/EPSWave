# What David's EPS-M captures settle, and what to change

Two captures, 18 August 2026, from an **EPS-M** — the rack Classic — running
RAM 2.49 / ROM 2.21. Instrument `MOTOR DRUMS1`, wavesample 1 of layer 1, and
every sweep addressed to that same wavesample throughout.

The second run exists because the first skipped three guided steps: the
operator could not find Soft Level and Hard Level on the EPS-M's panel, and
left the transpose step by pressing the wrong arrow. Between them all six
steps are covered.

Reproduce with:

```
python3 report.py ~/Downloads/EPS-testing/Test1/*.jsonl \
                  ~/Downloads/EPS-testing/Test2/*.jsonl
```

---

## 1. Settled, and already right

### The two machines lay their blocks out identically

The EPS-M reports **instrument 323, layer 107, wavesample 139** words — the
16 PLUS's numbers exactly. That was assumed; it is now measured.

Better, seven parameters were pinned to specific words by watching the front
panel move them. Every one lands where the 16 PLUS's own section 7.3 puts it:

| Parameter | Classic page/item | Block word | 16 PLUS §7.3 calls it |
|---|---|---|---|
| Pan | 6 / 2 (`$18 $02`) | wavesample **105 high** | word 105 |
| Root key | 4 / 1 (`$10 $01`) | wavesample **80 high** | Root Key |
| Env 3 soft level 1 | 3 / 15 (`$0C $0F`) | wavesample **62 high** | env3 base 58 + 4 |
| Env 3 soft level 4 | 3 / 18 (`$0C $12`) | wavesample **71 high** | env3 base 58 + 13 |
| Env 3 hard level 4 | 3 / 14 (`$0C $0E`) | wavesample **72 high** | env3 base 58 + 14 |
| Volume mod source | 6 / 7 (`$18 $07`) | wavesample **100 high** | Volume Mod Source |
| Velocity low | 9 / 3 (`$24 $03`) | layer **15 high** | Velocity Lo |

Layer word 15 is the one that mattered most after pan. The guided step's worry
was that the 16 PLUS packs layer settings two to a word and the Classic might
not. It packs them the same way: the Classic's fields sit in the high bytes,
the 16 PLUS's additions (Delay Mod by Velocity, Restrike Decay) in the low
bytes of words 12 and 13, and nothing collides.

### The Classic's parameter set is a superset of its own manual

Every documented item answered. **132 of 132, and not one silence** where the
manual said there should be an answer.

Seven items answered that the 1989 manual does not list — and all seven are
things the 16 PLUS manual does list:

- `$20` items 1–5 — the 16 PLUS calls these Sample Start/End, Loop Start/End
  and Loop Position **as percentages**. The Classic answers them with the
  *absolute* values, identical to items 21–25. Not percentages. See §3.
- `$24` item 5 — layer name. Returned `85` = `U`, the first letter of the
  layer's name.
- `$28` item 8 — instrument name. Returned `77` = `M`, the first letter of
  `MOTOR DRUMS1`.

So the Classic's manual is incomplete rather than the Classic being smaller.

### The envelope typo is a typo

`reference/code/eps2.0/include/eps.h` gives Level 1 Soft and Level 4 Hard the
same number. Ensoniq's 1989 specification says they are items 15 and 14. The
hardware agrees with Ensoniq: the panel's *Level 2 Soft* moved item **15**, the
panel's *Level 5 Hard* moved item **14**, and they landed on different words
(62 and 72). The library has the typo, and the specification can be trusted on
the strength of it.

This also confirms the level numbering offset — the panel counts levels 1–5,
the specification counts the same five 0–4.

### Thirteen bits, by masking

Sending 16-bit data and reading it back: **quantum 8, error 0 to 7, never
negative, bits 0–2 lost and never gained**. The machine clears the low three
bits. It does not round.

`quantiseForModel` already uses `ROUND_TRUNCATE` with no dither, which is
exactly this. No change. The comment in [eps.js](../../eps.js) reasoning that
truncation makes the round trip exact is now confirmed on hardware rather than
inferred from files.

### Arbitrary sample rates are honoured

Codes 20, 21, 26, 33, 40 and 100 were all accepted, read back unchanged, and
still there afterwards. Three of them (21, 26, 33) are **not offered on the
front panel** and the machine took them anyway.

That closes the open question. The Classic is not restricted to its panel's
rates.

---

## 2. The one thing to change: pan is off by one

**This is the whole of the compatibility fix, and it is currently wrong in
both directions.**

### What the hardware said

Asked to set pan hard left, the EPS-M wrote **0** into wavesample word 105's
high byte, and page 6 item 2 read 0 to match. Before the edit both read 3 —
the value every wavesample in every file examined has always held.

So word 105's high byte **is** pan. That question is closed.

### Why Table 5 as printed cannot be right

Section 9.9 of the 1989 manual gives pan the range **0–17**. That is eighteen
values. The Table 5 our OCR produced lists **nineteen**, 0 to 18, starting
with a stray `0 = WAVESAMPLE`.

Drop that first line and everything agrees at once:

| Value | Meaning |
|---|---|
| 0–7 | the eight display positions, `*-------` to `-------*` |
| 8–15 | solo out 1–8 |
| 16 | random pan |
| 17 | keyboard |

Eighteen values, 0 to 17, hard left at 0 where the machine put it.
`reference/README.md` already warns that docling's tables come out off by one.
This is one of them.

[epsBlocks.js](../../epsBlocks.js) currently chooses the table over the range
line, in a comment that says so explicitly:

> *NINETEEN ENTRIES, 0 TO 18, and section 9.9 of the same document says the
> range is 0-17. Ensoniq is wrong in one of those two places and the table is
> the one to believe.*

The hardware says the range line was the one to believe.

### What that costs today

`WS_PAN_CLASSIC`, `PAN_CLASSIC_LEFT = 1` and `PAN_CLASSIC_RIGHT = 8` are all
shifted by one, and the damage is not subtle.

**Classic → 16 PLUS.** Every wavesample carrying the ubiquitous 3 is read as
position 3 of 1–8 and converted to **−54**, about 43% left, when 3 is really
the fourth of eight cells and should be **−18**. And a genuinely hard-left
wavesample holds 0, which `adaptWavesampleToEps16Plus` treats as Table 5's
"wavesample" and skips entirely — so **hard left silently becomes dead
centre**.

**16 PLUS → Classic.** Worse. `panPositionFromEps16Plus(127)` returns 8, and
8 is not hard right — under the corrected table it is **solo out 1**. A hard
right wavesample sent to a Classic gets routed out of the stereo pair
altogether.

### The change

In [epsBlocks.js](../../epsBlocks.js):

- `PAN_CLASSIC_LEFT = 0`, `PAN_CLASSIC_RIGHT = 7`.
- `WS_PAN_CLASSIC` loses the leading `"wavesample"` entry, so the eight
  positions sit at 0–7, solo outs at 8–15, random pan 16, keyboard 17.
- `adaptWavesampleToEps16Plus` drops its `original == 0` early return — 0 is
  now the most meaningful value there is, not the absence of one. The
  `(block[at] & 0xFF) != 0` guard stays; that one is still right.
- `classicPanName`'s out-of-range message becomes "outside 0-17".

Nothing else in the two conversion functions needs touching. The arithmetic
already works off `PAN_CLASSIC_LEFT`/`RIGHT`, and with 0 and 7 it round-trips
exactly for all eight positions:

| Classic | → 16 PLUS | back |
|---|---|---|
| 0 `*-------` | −127 | 0 |
| 1 | −91 | 1 |
| 2 | −54 | 2 |
| 3 `---*----` | −18 | 3 |
| 4 `----*---` | +18 | 4 |
| 5 | +54 | 5 |
| 6 | +91 | 6 |
| 7 `-------*` | +127 | 7 |

### One judgement call worth making deliberately

Eight cells have no centre, so a 16 PLUS pan of 0 has to land on 3 or 4.
Round-half-up gives **4**. But the value the EPS itself writes into an
untouched wavesample is **3**, on every wavesample in every file we have.

Matching the machine argues for 3; the arithmetic argues for 4. Either
round-trips. Worth choosing on purpose rather than inheriting from
`Math.round`, and worth a comment saying which and why.

---

## 3. Two things that need one more probe

### Instrument transpose does not appear in the instrument block

The operator changed transpose by a few semitones. Page 10 item 13 moved
**244 → 247**, which is +3 and matches what he did.

But the instrument block was read immediately before and immediately after
that edit and **the two are byte-for-byte identical**. Word 28 — where the
16 PLUS keeps Transposition — held 0 both times, and neither 244 nor 247
appears anywhere in the block's 323 words.

The companion item 12 (transpose octave) reads a constant **144**, against a
documented range of 0–5 on the Classic and −4 to +4 on the 16 PLUS. 144 does
not fit either under any signed or unsigned reading we tried.

What this means in practice: `decodeWavesample`'s sibling for instruments will
report `transpose: 0` for a Classic instrument whatever the panel says, and
transpose will not survive a block-level conversion.

**Do not change anything here yet.** The reading is odd enough that it could
be an artefact of when the block was read. The probe that settles it: set
transpose to 0, then +1 semitone, then −1 semitone, then +1 octave, reading
items 12 and 13 *and* the instrument block at each stop. Four readings turn
this into arithmetic.

### Modulation source range

Only 13 and 15 were ever observed. The Classic manual says 0–18 for the amp
page's mod source, the 16 PLUS says 0–15 for the loop mod source. Neither
bound was approached, so the question of where it tops out is still open.

---

## 4. Small, low impact

`$20` items 1–5 return **absolute** offsets on the Classic, identical to items
21–25, where the 16 PLUS documents them as percentages 0–99. Observed:
items 1–5 gave `0, 44844, 32, 44844, 32`, and so did 21–25.

Nothing in EPSWave reads items 1–5 today. Worth writing down before something
does.

---

## 5. What to ask David for next

One capture, in this order, would close everything still open:

1. **Pan, one click at a time.** From hard left to hard right, pausing at every
   position. Eight readings enumerate the scale outright and confirm that
   hard right is 7 rather than 8 — the only part of the pan fix that is still
   inference rather than measurement.
2. **Transpose, four stops.** 0, +1 semitone, −1 semitone, +1 octave, reading
   the instrument block at each.
3. **Modulation source, wound to its maximum**, to see whether it stops at 15
   or 18.

Worth saying to him: the pan result is the one that mattered, he got it, and
the two "wrong" parameters that moved during the steps he skipped turned out to
be a gift — they pinned down two more words for free.
