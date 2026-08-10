# Testing EPSWave against an Ensoniq EPS Classic

Thank you for doing this. What follows is everything you need, in order, from
the beginning. It takes about an hour, most of which is the computer talking to
the synth while you wait.

## Why we are asking

EPSWave talks to the EPS-16 PLUS. We would like it to talk to the original EPS
as well, and we are stuck on four questions that no document can answer.

Ensoniq wrote a manual describing how to control the EPS-16 PLUS over MIDI, and
it says on its first page that it does **not** apply to the original EPS. The
only description of the original we have is a library a programmer wrote in
1992 — which is genuinely good, because he owned a Classic and not a 16 PLUS,
so the parts of his code that deal with your machine are the parts he actually
tested. Between the two sources we can account for nearly everything.

Nearly. Four things are left over, and all four need a real machine:

1. What your synth's parameter numbers are. The 16 PLUS renumbered them all.
2. Exactly how long its instrument and layer data blocks are.
3. Which settings the 16 PLUS added into space the Classic left empty.
4. How many bits of each sample your machine really keeps, and what it does
   with the rest.

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

1. Change the **Instruments** box from `current` to `all`.
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

---

# Part 6 — Find the parameter numbers (about 15 minutes)

Section **4 · Probe B — parameter numbers**. This is the most valuable part of
the session and the only part where the synth needs you to touch it.

## 6.1 The first sweep

Press **Sweep**. Leave all the other boxes alone.

This asks your synth 512 questions and notes which ones it recognises. Give it a
couple of minutes; the display panel counts through.

This is the slow one, and it only happens once. It also tells the app which
numbers are worth asking about again, so every step after it takes seconds
rather than minutes.

When it finishes you will see a table of which parameter pages answered. **That
table is the answer to question 1** — it is the only place the app shows you the
whole map it just found. The steps below narrow down what the individual numbers
in it mean.

If it says *nothing answered*, stop and check SYS-EX is still on.

## 6.2 Now the useful part

We now know which parameter numbers exist, but not what any of them control.
That is what this does: change one thing, and see which number moved.

**Press Snapshot A once, now.** Wait for it to finish. That is the starting
point, and you will not need that button again.

Then, for each control in the list below, three presses:

1. Change that one control on the synth. Move it a good distance — turn it up by
   ten, not by one.
2. Type what you changed into the box marked **Note what has been changed here**,
   just under the sweep controls. For example: `master tune from 0 to +25`.
   There is no button to press; it is filed with the comparison automatically.
3. Press **Snapshot B & diff**. Wait for it to finish. A table appears showing
   what moved, with your note above it.

Then change the next control (see the list below) and press **Snapshot B & diff** after eachg control is changed. 

The app keeps each sweep as the starting point for the next one, so after the
first control you are paying one sweep per control instead of two. It reminds
you in the log every time: *"Snapshot B is now the baseline — change the next
thing and press B again."*

Snapshots are quick — seconds, not minutes — because they only re-read the
numbers the first sweep found to be real, rather than asking all 512 again.
That is the checkbox under the buttons, and it is why five controls is a
comfortable minimum rather than an ambitious target. If you have the patience,
keep going past five; the list below is a starting point, not a limit.

(If you lose track of where you are, press **Snapshot A** to start a fresh
comparison from wherever the synth is now, then carry on as above.)

**The controls, in this order:**

1. **Master tune** — press **System**, scroll to the tuning page
2. **A filter cutoff** — press **5 · Filter**, change FC1 cutoff
3. **Wavesample volume** — press **6 · Amp**
4. **Pan** — also on the Amp page
5. **An envelope level** — press **1 · Env 1**, change one of the levels

Five is plenty. Three is useful. If you tire of it, stop wherever you are.

> ⚠️ **Do not change the MIDI base channel.** The messages the app sends are
> addressed by base channel, so the moment you change it the synth stops
> listening and the session ends.

Some numbers will appear in every single table — free memory changes on its own,
for instance. Ignore those. The one we want is the one that moved by about the
amount you moved the control.

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

That is the fourth answer.

Afterwards, reload the instrument from disk and the wavesample is back to normal.

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
