# List of ideas for improvement and/or new functionality

## UI:

### Appearance:
- Add progress bar(s) instead of just text percentage
- Add favicons to the html head section (add all present)
- Add links to Librarian and Wavesample Editor at top near About


### Flow

Make it more clear to the user where to start for various tasks and/or declutter the UI

### Wave editing

Allow for a larger wave editing area

Show the Discrete Fourier Transform while the wave is being edited

## Functionality:

### Instrument / Layer / Wavesample names: 

Done for all three. A name field sits above each Upload button and under each
Create button, with Rename buttons for existing instruments, layers and
wavesamples. Wavesample names default to the WAV file name or to the generated
waveform and pitch; Get Wavesample reads the current name back.

Still to do: read the instrument and layer names when the selectors change, so
the rename fields start from the current name the way the wavesample one does
after a download. Costs a GET INSTRUMENT or GET LAYER per change, which needs
handling for a freshly powered synth that has neither.

### Query the Instrument / Layer / Wavesamples

Some sounds are multi-layered with several wavesamples. Let's find a way to query this information and let the user decide which wavesample to load, perhaps listing the sizes for each found. [OBSOLETE]

### Patch librarian

Copy a whole instrument to a file on the computer and put it back: instrument
parameters, every layer, every wavesample and all of the audio. Analysed and
found workable; see *Whole instrument backup and restore (preliminary)* in
METHODS.md for the design. One `GET INSTRUMENT` returns the full inventory of
layers and wavesamples, so nothing has to be guessed at, and restore rebuilds
the structure with the create commands before writing the saved parameters over
the freshly allocated blocks. Two caveats: the effect algorithm cannot be
selected over MIDI at all, so effects are only partly recoverable, and at the
measured transfer rate a 1 MB instrument takes about 20 minutes each way, which
makes this a resumable background job rather than a button. [DONE]

### Working with EPS (legacy, not EPS-16+) patches (instruments)

We've almost got this working but it is disabled right now. Figure out the missing pieces and enable it. See the reference code as our documentation for the legacy EPS [here](reference/code/eps2.0/). [DONE]

### Bank load/restore

Add the ability to load and also receive a set of instruments. 

### Patch Editor

Present a graphical view of the patch and allow parameter editing. Not a trivial amount of adjustments and UI elements... 

## Documentation

1. Complete re-write of the readme [DONE]
2. Get a github.io site, host the app [DONE]
3. Post a video
4. Add a CREDITS.md file: original author and font author [DONE]
5. Fix broken tables in the markdown midi doc. [PARTIAL]

## Explain to human
- What are the external javascripts used, and, is it a good idea to download them locally? 


## Useful links:

- Emulator of the entire system: https://github.com/mardlib/Ensoniq-EPS-16-Plus/tree/vst3-prototype
- Mirage editor electron app: https://github.com/mogrifier/wavsyn
- EPS Classic Musician's Manual: https://github.com/vartemyev88/ensoniq-eps-classic-remaster
- Lots of neat patches: https://drive.google.com/drive/folders/1Wg9P_FzRsMSM-31mNvo0DmFuBnZMETVY
- More patches: https://drive.google.com/drive/folders/1hOqfLA17xXGFn_FNqS-AYfob5QcCx8U0
- Patches and Info on Ensoniq soundcentral: https://web.archive.org/web/20041024235453/http://soundcentral.com/cats/keyboard/ensoniq/
  - Latest: https://web.archive.org/web/20130701045740/http://www.soundcentral.com/cats/keyboard/ensoniq/
- Mirage documentation: https://github.com/ZAPPPP/Mirage/tree/main/Manuals
- EPS Classic manual online: https://sites.google.com/site/yalaorg/1-synthesizers-music-audio/ensoniq-eps-manuals
  - Also here: https://sites.google.com/view/yala-music1/manual-ensoniq-eps

## libeps author:

- https://gitlab.com/arensb
- https://www.reddit.com/user/arensb/

