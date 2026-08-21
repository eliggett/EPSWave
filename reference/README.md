# Reference Material

## MIDI implementation document:

This is the one surviving copy of the full midi implementation for the Ensoniq EPS-16+ on the internet. 

### What are the markdown files?

These files were created by `docling` which represents the latest in OCR and mardown creation by automated tools. It's not perfect but at least you can search it. Be warned that some of the tables are "off by one", so consult the original PDF when in doubt. 

One markdown file includes an attempt at inlining images, the other does not. 

[eps_16plus_full_midi_implementation_with_inline_images.md](eps_16plus_full_midi_implementation_with_inline_images.md) : has binary image data inside it. If you want to grep this file, grep against the image tag. This document has not been edited. 

[eps_16plus_full_midi_implementation.md](eps_16plus_full_midi_implementation.md) : This markdown is generally better -- but not always -- and does not contain any embedded image data. Some tables have been edited for clarity, others still need a little help (some may be off by one or completely mangled). 


## What about the original EPS ("classic")?

There is a manual for it too: Ensoniq's *Performance Sampler External Command
Specification*, June 12 1989, MKB2 — 50 pages. It is the authority for the
Classic and it answers three of the four questions this project could not settle
by reading.

[Ensoniq EPS and EPSm MIDI SysEx Specification (EPS-MKB2).md](Ensoniq%20EPS%20and%20EPSm%20MIDI%20SysEx%20Specification%20(EPS-MKB2).md)
is that document, `docling`'d from the scan like the ones above. Section 2 of it
is word for word the same as section 2 of the 16 PLUS implementation — the two
manuals share a frame — so it is the *differences* that carry the information.
Same OCR caveats apply, and its parameter tables are the ones with the ×4 page
numbering described below.

[EPS-ext_cmd_spec.md](EPS-ext_cmd_spec.md) is a third-hand markdown
transcription of that same document, from
[mikewolak/epstool](https://github.com/mikewolak/epstool/blob/main/eps_sysex.md).
Useful because you can grep it, but it has quietly changed the notation and
dropped a few things, so **check the PDF before trusting a number from it.**

[eps-classic-vs-16plus.md](eps-classic-vs-16plus.md) is the comparison: every
divergence between the two machines' parameter pages, value ranges, blocks,
value tables, commands and buttons, what remains uncertain about the Classic,
and where the transcription departs from the original. Start there. The single
most important thing in it is that the Classic's parameter pages are numbered a
quarter of ours — Ensoniq's own rule is "high byte times four followed by the
low byte".

## And the ASR-10 files? 

This software doesn't officially support the ASR-10 yet, but we are working on it. We have heard that it already works to some extent. The ASR-10 [pdf](Ensoniq%20ASR-10%20External%20Command%20Specification.pdf) and [markdown](Ensoniq%20ASR-10%20External%20Command%20Specification.md) files are here to support those efforts. 

## What are these "disks"? 

The items under [disks](disks/) really are instruments (likely from disks) which were downloaded from [here](https://web.archive.org/web/20041024235453/http://soundcentral.com/cats/keyboard/ensoniq/). They are good for testing but also are great sounds for playing! 

## What is the code directory?

The files in [code/eps2.0/](code/eps2.0/) were found [here](https://web.archive.org/web/20041024220132/http://soundcentral.com/cats/keyboard/ensoniq/info.shtml) using the wayback machine. They represent the work of  Andrew Arensburger in 1992 to manipulate his EPS over MIDI. There is probably some level of EPS-16+ compatibility here but it is unconfirmed. I wish I had found this code before working on EPSWave. Unfortunately, I started the project without it. It's preserved here for future ideas and due to it's historic value. Edit: The code was helpfull in filling in some details about the classic EPS format, which this project can now import. 

The files in [code/eps_disk_util](code/eps_disk_util/) were also found on the Internet Archive of Sound Central. They appear to be a MSDOS disk utility for Ensoniq disks. Totally untested but probably a good reference if you're working on raw disk access. 

## What is the disk format document?

[epsdiskformat.txt](epsdiskformat.txt) is a file I found [here](https://web.archive.org/web/20041024220132/http://soundcentral.com/cats/keyboard/ensoniq/info.shtml). It details the very low-level filesystem and format of the EPS synth disks. If you want to build hardware or software to read the physical disks, start here. 