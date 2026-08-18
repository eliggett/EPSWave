# Testing EPSWave against an Ensoniq EPS Classic

Thank you for doing this. What follows is everything you need, in order, from
the beginning. It takes about an hour, most of which is the computer talking to
the synth while you wait.

## Why we are asking

EPSWave talks to the EPS-16 PLUS. We would like it to talk to the original EPS
as well.

Ensoniq wrote a manual describing how to control the EPS-16 PLUS over MIDI, and
it says on its first page that it does **not** apply to the original EPS. For a
long time all we had for your machine was a library a programmer wrote in 1992 —
genuinely good, because he owned a Classic and not a 16 PLUS, so the parts of
his code that deal with your machine are the parts he actually tested — and four
questions neither source could settle.

**Ensoniq's own manual for your synth has since turned up**, dated June 1989.
It answered three of the four outright, so this session is shorter and more
certain than it would have been. What it did not answer, and what we are asking
you to help with:

1. **Where your synth keeps a wavesample's pan setting, and what the number
   means.** We know which half of the word it is in. We do not know whether the
   value is what we think, and if we get it wrong then instruments converted
   from your machine to a 16 PLUS come out with their stereo image scrambled.
2. **Whether your synth accepts any sample rate, or only the ten on its front
   panel.** This one could break ordinary uploads: EPSWave sends the rate your
   audio file was recorded at, and if your machine snaps that to the nearest of
   its ten then everything plays back at the wrong speed.
3. **Whether the manual is telling the truth.** A great deal now rests on one
   thirty-six-year-old document being accurate. Several steps below simply
   confirm things it already says, which is worth five minutes each.
4. **Whether your synth quietly ignores some settings.** The 16 PLUS manual
   marks the settings that cannot be changed one at a time. Your manual has no
   such marks — Ensoniq never wrote them down — so the only way to find out is
   to try.

Your session answers all four. Everything is recorded to a file, which is the
only thing we need back from you.

## Is this safe for my synth?

Mostly yes, and here is exactly what happens.

**Steps 1 through 6 only read.** They ask the synth questions. Nothing on the
machine changes, and nothing on your disks is touched.

**Step 7 writes.** It overwrites the audio inside **one wavesample you choose**,
in the synth's memory only. Your floppy disks are never written to. Reloading
that instrument from disk puts it back exactly as it was. The only thing you can
actually lose is unsaved editing work, so load your instruments fresh from disk
before you start and you have nothing at risk.

You can stop at the end of step 6 and skip the write test if you would rather.
Say so in the notes and send what you have — it is still worth having.

## What you need

- Your EPS Classic, powered up, with its system disk available.
- A MIDI interface and two MIDI cables. Cheap interfaces are often bad at the
  kind of large messages this uses; if you have a choice, use the better one.
- **Google Chrome**, or another Chromium browser (Edge, Brave). Firefox and
  Safari cannot do what this needs. This is not negotiable, sorry.
- A floppy with a few instruments on it. Factory disks are ideal — see step 2.
- About an hour.

---

# Part 1 — Set up

## 1.1 Cable it up

- Synth **MIDI OUT** → interface **IN**
- Synth **MIDI IN** → interface **OUT**

Both cables. The synth has to be able to answer.

## 1.2 Turn on SysEx

The EPS ignores everything we send unless SysEx is switched on, and it forgets
the setting every time it is powered off.

Press **MIDI**, then use the arrow keys to scroll through the pages until the
display shows **SYS-EX**. Set it to **ON**.

(If you have used an EPS-16 PLUS, note that this is in a different place on your
machine — the 16 PLUS merged the MIDI and System pages together and the Classic
keeps them separate.)

While you are there, note down what the display says the **BASE CHANNEL** is.
You may need it later.

## 1.3 Open the app

Go to **https://eliggett.github.io/EPSWave/**

That is the Wavesample Editor page, and it is the one to use. Do not use the
Patch Librarian page for this — it does not have all the controls you will need.

## 1.4 Choose your MIDI ports

Near the top, under **Select MIDI Ports**, choose your interface in both the
**Midi Input** and **Midi Output** boxes.

The first time, Chrome will ask permission to use MIDI devices, including system
exclusive messages. Say yes. If you never see that prompt and the boxes stay
empty, you are not on Chrome.

## 1.5 Prove it works

Press **Test Connection**.

You want a green result reading something like *"Connected. Sysex is on and
working. Free memory 1234 blocks…"*.

If it comes back red, work through this before going any further:

- Are both cables in, and the right way round?
- Is SYS-EX still ON? It resets on every power cycle.
- Are the two port boxes set to your actual interface?

The test also tries every MIDI channel by itself, so if your synth is on a
different base channel it will find it and say so. Let it.

## 1.6 Tell the app what it is talking to

Top right of the page, there is a box marked **Connected model**. Set it to
**EPS Classic**.

## 1.7 Turn on Debug

Next to it is a switch marked **Debug**. Turn it on.

A new orange-edged panel called **Hardware probes** appears further down the
page, just above the Event Log. That panel is where you will spend the rest of
the session. It has six sections and you will work down them in order.

Do not worry about how much is in there. Most of it has sensible defaults you
will not need to touch, and section 6 is only for emergencies.

---

# Part 2 — Load some instruments

Load **two or three instruments** into your synth from a floppy, into
instrument slots 1, 2 and 3.

**Please use a factory disk if you have one.** Ensoniq's factory disks have been
archived online, so if you tell us which disk and which instrument you loaded,
we can obtain the identical file ourselves afterwards and compare it against
what your synth sent us. That comparison is the single most useful thing you can
give us, and it costs you nothing but writing down a disk name.

If you only have your own sounds, that is fine too — load those instead. Most of
what we learn does not depend on it.

Write down, for each one: the disk name or number, the instrument slot, and the
instrument's name.

---

# Part 3 — Say who you are

The first section of the Hardware probes panel, **1 · Session**, has four boxes.
Fill them in now, before starting the capture — this is what tells us months
later where a file came from (optional as to how much information is provided here)

| Box | What to put |
|---|---|
| Who is running this | Your name or handle, and an email if you are happy to be asked a follow-up question |
| Synth OS version | The version number your EPS shows when it boots. **Please do not skip this one** — if two people's results ever disagree, this is the first thing we will need and nothing else in the file can tell us |
| Instrument loaded, and from where | e.g. `Ensoniq factory disk EPS-04, instruments 1-3: GRAND PNO, STRINGS, BRASS` |
| Matching .EFE file name | Leave blank unless you happen to have the instrument as a file on your computer |

In the larger notes box underneath, anything you know about the machine: how
much memory is fitted, whether it has SCSI, anything it does that it should not.

---

# Part 4 — Start recording

In section **2 · Capture**, press **Start capture**.

Chrome will ask you where to save a file. Pick somewhere you will find again;
the suggested name is fine. The message underneath should change to *"Recording
to the file you chose, as it goes."*

That means the file is being written to continuously as you work. If the browser
crashes or the synth locks up, everything up to that moment is already safely on
disk. **Do not close the browser tab** until the very end.

If instead it says *"Recording in memory"*, the file picker did not work. Carry
on anyway, but press **Download capture** after each of the parts below, and
definitely before you close the tab.

There is a note box in this section with an **Add note** button. Use it whenever
anything happens: the synth displays an error, something takes far longer than
you expected, you change a knob. Your commentary goes into the file alongside
the data, timestamped. It is genuinely useful.

---

# Part 5 — Read the instruments (about 2 minutes)

Section **3 · Probe A — parameter blocks**.

1. Leave **Instruments** on **All** — that is the default and it is what you
   want. Empty slots refuse instantly and cost nothing, and the more
   instruments this reads the better the evidence.
2. Press **Dump blocks**.

Watch the green display panel further up the page. It will count through each
instrument, layer and wavesample.

When it finishes, the Event Log will say something like:

```
Block lengths: instrument 321, layer 107, wavesample 139 words (EPS-16 PLUS: 323, 107, 139)
```

**Those three numbers are one of the four answers we came for.** If they differ
from the EPS-16 PLUS figures in brackets, that is a discovery, not a fault.

The empty instrument slots will report "Invalid Instrument". That is correct and
expected — it is how the app finds out which slots are in use.

The dump walks all eight instruments, and every question the app asks afterwards
is about whichever one it is pointed at, so it deliberately goes back to
instrument 1 at the end. That keeps everything in Part 6 comparable. The last few
lines are it doing that and checking that it worked:

```
Switching to instrument number 1 using command: F0 0F 03 00 40 00 00 F7 (VIRTUAL BUTTON PRESS, button $00 = Instrument 1)
Verifying by reading the current instrument number and current instrument name
Current Edit Instr. ($38 $00) = 0 (instrument 1)
Instrument name: "GRAND-PNO"
Instrument 1 is selected on the synth.
Now addressing instrument 1, layer 1, wavesample 1
```

It presses the **Instrument 1** button for you, exactly as if you had reached
over and pressed it, then reads the selection back rather than assuming it took.
**Glance at the synth's display and check that it agrees**, and check that the
name in the log is the instrument you have in slot 1. If the last line instead
says *"Instrument 1 is NOT confirmed selected"*, press **Instrument 1** on the
front panel yourself before carrying on, and please mention it when you send the
files — that would itself be a finding.

**Do not change the instrument selection during Part 6** — the app warns you if
two sweeps were taken against different ones, because the difference looks
exactly like a control having moved.

---

# Part 6 — Find the parameter numbers (about 10 minutes)

Section **4 · Probe B — parameter numbers**. This is the part where the synth
needs you to touch it, and the app will tell you exactly what to touch.

The app is being built to do two things with your machine: read and write whole
instruments, and read and write wavesamples. Both travel as complete blocks of
data rather than as individual settings, so this part is narrower than it looks —
it covers the pages an instrument is actually made of, and leaves the sequencer,
the system settings and the effects alone. **The effects page is where an
EPS-16 PLUS has crashed, and it is not swept.**

## Press **Start guided testing**

That is the whole of it. The big green button runs everything in this section
and talks you through it.

First it sweeps — about 320 questions, a couple of minutes, while it works out
which parameter numbers your machine recognises. Then it takes a starting
reading. Then, for each control in turn, a dialog appears telling you:

- **which button to press** on the synth's front panel,
- **what to change**, and roughly how far to move it,
- **which instrument, layer and wavesample to change it on** — this matters, and
  the dialog names the exact one the app is reading, because a change made to a
  different wavesample simply will not show up,
- **why that control was chosen**, which is worth reading: some of these settle
  a real disagreement between our references, and some confirm something
  Ensoniq's 1989 manual already says. Both are worth doing, and the dialog is
  honest about which is which.

Change the control on the synth, then press **I changed it — Continue**. The app
takes a fresh reading, works out which number moved, and shows you. Then the
next dialog appears.

Each dialog also offers:

- **Skip this one** — if you cannot find the control, or your machine does not
  have it. Skipping is recorded, and a recorded skip is far more useful to us
  than a guess.
- **Stop guided testing** — ends the sequence and keeps everything gathered so
  far.

There are six controls. Getting through three is useful; all six is a good
session. Nothing is lost if you stop early.

**The first one, pan, used to be the important one, and it has been answered.**
An EPS-M set to hard left wrote 0, which told us both that the byte we were
guessing about really is pan and that its eight positions are numbered 0 to 7
rather than 1 to 8. The step now asks for hard *right* instead, which should
read 7 — a cheap confirmation of something a lot now rests on, but no longer
the thing to do at the expense of everything else.

**A note on the envelope steps.** Two of them ask for envelope levels. Your
manual numbers the five levels 1 to 5; the MIDI specification numbers the same
five 0 to 4. The dialogs use *your* numbering, the one printed on the synth and
in your manual, so just do what they say — the offset is ours to worry about.

**Each step also reads the data block** either side of your change, not just the
parameter list. That is what tells us which word of an instrument holds each
setting, and which half of that word, which is the single most useful thing this
whole session produces.

**If a step reports that nothing moved**, that is a result, not a failure. It may
mean the control is not reachable over MIDI on your machine, which is exactly
the sort of thing we are trying to find out. Carry on to the next step.

> ⚠️ **Do not change the MIDI base channel.** The messages the app sends are
> addressed by base channel, so the moment you change it the synth stops
> listening and the session ends.
>
> ⚠️ **Do not go to the Effects pages.** Nothing there is being tested, and it
> is where the machine has crashed.

## The transpose test

Underneath the guided button there is a smaller one, **Transpose test**. It is
worth running if you have a few more minutes, and it is the one open question
left on the instrument side.

Here is the puzzle. On an EPS-M, somebody changed the instrument's transpose by
three semitones. The parameter number moved by exactly three, so the synth
clearly heard him and clearly changed. But the instrument's *data block* — read
immediately before and immediately after — did not change by so much as one
byte, and the word where the EPS-16 PLUS keeps transposition sat at zero
throughout.

Two things could explain that, and they need opposite fixes:

- the original EPS keeps transpose somewhere other than the instrument block, in
  which case converting an instrument quietly loses it; or
- it does keep it there, but a front-panel edit does not reach the block until
  something else commits it — in which case nothing is wrong at all.

The test runs in two halves. First it asks you to set transpose to four known
values — zero, up one semitone, down one semitone, up one octave — reading both
transpose numbers and the whole instrument block at each stop. Four known
settings turn an odd-looking number into arithmetic; one reading on its own
told us only a difference.

Then it does the second half by itself, **writing** the transpose over MIDI with
nobody touching the synth. That is what separates the two explanations: if the
block moves when the app writes but not when you do, the answer is commitment
rather than layout.

**It changes a setting on your instrument and puts it back when it finishes.**
It reads the original value first and restores it at the end, including if you
stop it partway. As with everything else here, nothing touches your disks.

At the end it says which of the two explanations it found, in plain words.

## Doing it by hand instead

The **Sweep**, **Snapshot A** and **Snapshot B & diff** buttons underneath do
the same work one step at a time, if you would rather drive it yourself or want
to chase something the guided list does not cover. The pattern is: press
**Snapshot A** once, then for each control — change it, type what you changed
into the **Note what has been changed here** box, and press **Snapshot B & diff**.
Each comparison becomes the starting point for the next, so it is one press per
control after the first.


---

# Part 7 — Read a wavesample (about 2 minutes)

Section **5 · Probe C — wavesample data**.

**There is nothing to choose here.** Press **Read & analyse** and that is it.

It works on **instrument 1**, and it finds a suitable wavesample by itself: it
asks which layers exist, asks which wavesamples hold audio of their own, ignores
the ones that are only copies of another and the ones too short to measure, and
uses the largest of whatever is left.

The Event Log tells you what it picked:

```
Target: instrument 1, layer 1, wavesample 3 "PIANO HI", 40,000 samples
```

and then the measurement:

```
Existing data: lowest set bit 3, so about 13 significant bits; low three bits
always zero: true
```

That is the app measuring your machine's sample resolution rather than taking
anyone's word for it.

**If it says nothing usable in instrument 1**, then whatever is in slot 1 is not
a sampled sound — a synth-waveform patch, say. Either load a sampled instrument
into slot 1, or change the small **Instrument** box next to the buttons to
whichever slot holds one, and press the button again.

---

# Part 8 — The write test (about 5 minutes)

**This is the only step that changes anything. Read Part 8 fully before starting
it.**

It writes a test pattern over the audio in one wavesample, then reads it back and
compares. That tells us precisely how your machine handles sample data on the way
in, which nothing else can.

**It will overwrite a wavesample inside instrument 1** — the same one Part 7 just
read, found the same way. You do not pick it; the app does.

It affects the synth's memory only. Your floppies are not touched, and reloading
that instrument from disk restores it completely.

1. Press **Round trip (overwrites audio)**.
2. The app looks inside instrument 1 again, then shows a dialog naming exactly
   what it is about to write over — instrument, layer, wavesample number, its
   name and its length. Nothing has been written at this point. Read it, and
   press **Overwrite it** if you are happy, or Cancel if you are not.
3. Wait. The display panel shows progress.

The Event Log ends with something like:

```
Round trip: 512 of 4096 samples came back identical. What the synth stores is
quantised to 8, so it keeps 13 bits, and it masks (error 0 to 7, mean 3.48).
```

Afterwards, reload the instrument from disk and the wavesample is back to normal.

**A note on what we do with this.** We already know from your instrument files
that your machine keeps thirteen bits — every sample in every original EPS file
we have is a multiple of 8, which is what thirteen bits looks like. EPSWave now
truncates to thirteen bits before sending anything to a Classic, so that what it
sends is exactly what your synth will store. This test confirms that on your
actual hardware rather than on four files.

---

# Part 8a — Sample rates (about 2 minutes)

Section **6 · Probe D — sample rates**.

**This is the one that could break ordinary uploads, so please do not skip it.**

Your front panel offers ten sample rates, from 52 kHz down to 6.25 kHz. The MIDI
specification says the setting will take any value at all. EPSWave believes the
specification: when you load an audio file it works out that file's own rate,
sends it, and the sample plays back at the pitch it was recorded at.

If your EPS instead rounds to the nearest of its ten, every upload comes out at
the wrong speed — and it would look like a bug in the app rather than a rule in
the synth, which is exactly the kind of thing that wastes somebody a weekend.

Press **Test sample rates**. It writes a few rates to one wavesample, reads each
one back, and **puts the original rate back when it is done**. It changes nothing
else, and nothing on any disk.

You will get a table. The highlighted rows are rates your front panel does not
offer — those are the ones that decide it:

```
Code   Hz       On panel   Write       Reads back      Result
20     31,250   yes        accepted    20 (31,250 Hz)  held
21     29,762   no         accepted    21 (29,762 Hz)  held
```

**Every rate held** means the synth takes what it is given and uploads will play
at the right pitch. **Changed** on any highlighted row means it snaps to its own
ten, and we have work to do before uploads are trustworthy.

If you have a moment afterwards, look at the synth's own display and confirm the
rate reads what it did before you started. The probe says it restored it; seeing
it is better.

---

# Part 9 — Finish and send

1. Add any final thoughts with **Add note**.
2. Press **Finish capture**.
3. If the app was recording in memory rather than to a file, press **Download
   capture** now.
4. As a belt-and-braces backup, scroll to the **Event Log** card and press
   **Export…**. That saves a plain text log. It duplicates some of the capture
   and is much easier for a human to read.

Send us the **`.jsonl` capture file** — that is the important one — and the
exported log if it is easy.

If you loaded factory instruments, please repeat in your message which disk they
came from. We will find the same files ourselves and compare them against what
your synth sent.

---

# If something goes wrong

**The synth shows an error and offers to reboot.** This is known to happen, and
it is not your fault. Asking an EPS-16 PLUS about parameters on the effects page
past a certain point takes the machine down with *"Error 129 — Reboot?"* — so
the sweep now stops where the specification stops, and no longer goes there.

If it happens anyway:

1. **Write down the error number exactly** and put it in the note box.
2. The app notices the silence and stops by itself, and the log names the last
   parameter it asked for. That parameter is the most valuable single thing you
   can bring back from the session, so make sure the capture is saved.
3. Reboot the synth, reload your instruments, and carry on from Part 5.

Nothing about this damages the synth. It reboots to exactly the state it was in.

**A probe seems stuck.** Press **Stop**, top right of the Hardware probes panel.
It finishes the command in progress and stops cleanly. Everything captured so
far is kept.

**The synth stops answering part way through.** Add a note describing what it was
doing, press **Finish capture**, and send what you have. A capture that stops
half way is still evidence — including evidence about what made it stop, which
may be the most interesting thing in the file.

**"Insert System Disk" or similar on the synth's display.** The EPS loads parts
of its operating system from disk as it needs them. Put the system disk in, add
a note about when it happened, and carry on.

**Transfers keep being refused.** Find the **Block Size** box further up the page
and reduce it — try 500, then 250. Smaller blocks are slower but more reliable
on marginal interfaces. Add a note saying you changed it.

**Everything has gone strange.** Reload the page, turn Debug back on, start a
fresh capture, and send us both files. Nothing you can do from this panel can
harm the synth beyond the one wavesample in Part 8.

---

# A note about section 6

The last section of the panel, **6 · Manual**, is not part of this script. It
sends individual commands to the synth, including ones that can delete things.

It is there for the case where we are talking to you live and need to try
something specific. If you are working through this on your own, leave it alone.

---

Thank you. Genuinely — there is no way to get this information except from
someone with the machine in front of them, and there are not many of you left.
