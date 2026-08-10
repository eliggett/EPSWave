# Reference Material

## MIDI implementation document:

This is the one surviving copy of the full midi implementation for the Ensoniq EPS-16+ on the internet. 

### What are the markdown files?

These files were created by `docling` which represents the latest in OCR and mardown creation by automated tools. It's not perfect but at least you can search it. Be warned that some of the tables are "off by one", so consult the original PDF when in doubt. 

One markdown file includes an attempt at inlining images, the other does not. 

[eps_16plus_full_midi_implementation_with_inline_images.md](eps_16plus_full_midi_implementation_with_inline_images.md) : has binary image data inside it. If you want to grep this file, grep against the image tag. This document has not been edited. 

[eps_16plus_full_midi_implementation.md](eps_16plus_full_midi_implementation.md) : This markdown is generally better -- but not always -- and does not contain any embedded image data. Some tables have been edited for clarity, others still need a little help (some may be off by one or completely mangled). 


## What are these "disks"? 

The items under [disks](disks/) really are instruments (likely from disks) which were downloaded from [here](https://web.archive.org/web/20041024235453/http://soundcentral.com/cats/keyboard/ensoniq/). They are good for testing but also are great sounds for playing! 

## What is the code directory?

The files in [code/eps2.0/](code/eps2.0/) were found [here](https://web.archive.org/web/20041024220132/http://soundcentral.com/cats/keyboard/ensoniq/info.shtml) using the wayback machine. They represent the work of  Andrew Arensburger in 1992 to manipulate his EPS over MIDI. There is probably some level of EPS-16+ compatibility here but it is unconfirmed. I wish I had found this code before working on EPSWave. Unfortunately, I started the project without it. It's preserved here for future ideas and due to it's historic value. Edit: The code was helpfull in filling in some details about the classic EPS format, which this project can now import. 

The files in [code/eps_disk_util](code/eps_disk_util/) were also found on the Internet Archive of Sound Central. They appear to be a MSDOS disk utility for Ensoniq disks. Totally untested but probably a good reference if you're working on raw disk access. 

## What is the disk format document?

[epsdiskformat.txt](epsdiskformat.txt) is a file I found [here](https://web.archive.org/web/20041024220132/http://soundcentral.com/cats/keyboard/ensoniq/info.shtml). It details the very low-level filesystem and format of the EPS synth disks. If you want to build hardware or software to read the physical disks, start here. 