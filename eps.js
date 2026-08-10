class EPS16 {
    /***
     * Most samples accepted from a WAV file, matching the EPS16+'s standard
     * memory. Longer files are truncated to this on import.
     */
    static MAX_IMPORT_SAMPLES = 512900

    /***
     * MIDI runs at 31250 baud, 8N1, so ten bits per byte: 3.125 bytes per
     * millisecond. Every sysex packet occupies the wire for its own length,
     * which matters because of COMMAND_TIMER_MS below.
     */
    static MIDI_BYTES_PER_MS = 3.125

    /***
     * Section 3.1 of the External Command Specification: the transmitter starts
     * a two second command timer when it sends a message, and the receiver does
     * the same while it waits for the second part of a PUT WAVESAMPLE DATA
     * exchange. A block of samples that takes longer than this to arrive is
     * NAKed even though nothing was actually wrong with it, so every block has
     * to fit comfortably inside the window.
     */
    static COMMAND_TIMER_MS = 2000

    /***
     * Samples per PUT/GET WAVESAMPLE DATA block, and the value the Block Size
     * field starts at. Change it here.
     *
     * 1000 samples is 3005 bytes on the wire, 0.96 s at the full MIDI rate, so
     * it clears the two second command timer with room to spare on an interface
     * that keeps up. It does not clear it on one that does not: the throughput
     * measured while this program was being written was 1353 bytes per second,
     * 43% of nominal, at which 1000 samples takes 2.2 s and every block is
     * NAKed. That is the whole of the original fault described in METHODS.md.
     *
     * So this is a default for a good interface rather than a safe one for any
     * interface. Run the loopback test under Transfer settings, which measures
     * the real rate and suggests a size from it, and lower this if blocks are
     * being refused. The setting is remembered per browser once changed.
     */
    static DEFAULT_CHUNK_SAMPLES = 800
    static MIN_CHUNK_SAMPLES = 32
    static MAX_CHUNK_SAMPLES = 2048

    /***
     * How many times a single block is offered before the upload gives up. Each
     * failure halves the block size, so the last attempt is a quarter the size
     * of the first.
     */
    static MAX_CHUNK_ATTEMPTS = 4

    /***
     * Status codes that mean "not now" rather than "not this", so the answer is
     * to wait and send the same thing again.
     *
     * $14, DISK ACCESS IN PROGRESS: "Current disk activity prevented the
     * execution of the command". Says nothing about what was offered. Halving
     * the block, which is the remedy for a block the EPS could not receive in
     * time, would only make the transfer longer.
     *
     * $02, INSERT SYSTEM DISK, is here for a less obvious reason. Section 5
     * says "The system disk must be inserted into the EPS-16 PLUS disk drive
     * before the command is executed. The transmitter should prompt the user to
     * insert the disk, and after the user is done, re-transmit the command."
     * The EPS-16 PLUS keeps parts of its operating system out of RAM and pulls
     * them in on demand, and a large sample upload can evict one.
     *
     * On a machine whose OS lives in onboard flash rather than on a floppy —
     * which is how this was found — there is no disk to insert and nothing for
     * the user to do. The synth fetches the overlay itself. What the spec asks
     * for reduces to its second half: wait a moment, then re-transmit. So that
     * is what happens, and if the overlay genuinely cannot be loaded the retries
     * run out and the original error is reported unchanged.
     */
    static TRANSIENT_STATUS = [0x14, 0x02]

    /***
     * Sample rate lives in two places, both documented.
     *
     * Word 131 of the wavesample parameter block (section 7.3) carries it in
     * the high byte of the word, so it comes back with every parameter dump.
     * Page 20 item 0D (section 9.5) is the same value as a single settable
     * parameter. It is tagged "receive only", which per NOTE 1 means the EPS
     * will not announce it when you change it on the front panel, not that it
     * cannot be written; NOTE 3 marks the parameters that refuse a single PUT,
     * and this is not one of them.
     */
    static SAMPLE_RATE_PARAM = 0x0D
    static SAMPLE_RATE_WORD = 131

    /***
     * Root key, likewise in two places.
     *
     * Word 80 of the wavesample parameter block shares itself: the high byte is
     * the root key, the low byte is the Volume Modulator Crossfade Fadecurve.
     * That sharing only matters if you write the block back, and there is no
     * need to, because section 9.7 gives root key its own address on the pitch
     * page. It carries no "*" or "**", so it takes a single PUT PARAMETER.
     */
    static ROOT_KEY_PAGE = 0x10
    static ROOT_KEY_PARAM = 0x01
    static ROOT_KEY_WORD = 80

    /***
     * Fine tune, the next parameter along on the pitch page, range -99 to +99.
     * This is what cancels the pitch error left over when a file's rate does not
     * land on one the EPS can hold.
     *
     * Word 86 of the block is described only as a "signed 7 bit fraction in hi
     * byte", with no scale given, so the readback below is the direct reading
     * and is treated as informational until hardware confirms it. Writing goes
     * through the parameter page, where the range is stated plainly.
     */
    static FINE_TUNE_PARAM = 0x0A
    static FINE_TUNE_WORD = 86
    static FINE_TUNE_LIMIT = 99

    /***
     * Pitch LFO Amount, section 9.7, on the same pitch page as the root key and
     * fine tune above. Documented as -15.7 to +15.7 in 0.1 increments, and
     * carrying neither a "*" nor a "**", so a single PUT PARAMETER reaches it.
     *
     * This is the front panel's Pitch / LFO AMOUNT. A wavesample arrives with
     * it set to something non-zero, which the morphing soundscape has to undo:
     * the LFO that sweeps the crossfade is the same LFO, so anything left here
     * makes every layer wobble in pitch as it fades.
     */
    static PITCH_PAGE = 0x10
    static PITCH_LFO_AMOUNT_PARAM = 0x02

    /***
     * Instruments the EPS holds at once, numbered 1 to 8 on the front panel and
     * 0 to 7 in every sysex message. Section 7.1 gives the instrument block one
     * pointer per slot.
     */
    static INSTRUMENT_COUNT = 8

    /***
     * How many layers a morphing soundscape can use. Section 7.1 gives the
     * instrument eight layer pointers, and the mode puts one wavesample in
     * each, so eight waveforms is the ceiling however many are loaded.
     */
    static MAX_MORPH_LAYERS = 8

    /***
     * Morphing soundscape crossfade geometry, section 9.9.
     *
     * Four breakpoints per layer say where that layer is heard across the
     * modulator's 0-127 range: A fade in starts, B fade in complete, C fade out
     * starts, D fade out complete. Laying them out comes down to a single
     * number, the width of one fade ramp measured in layer spacings, and
     * getCrossFadeBreakPoints derives the rest from it.
     *
     * MIN is the geometry the mode shipped with: a ramp half a spacing wide, so
     * each layer spends half its turn alone at full volume and the other half
     * handing over. That is the narrowest setting worth offering. At 1.0 the
     * flat part has shrunk to nothing, the layers are triangles, and exactly two
     * are sounding at every point of the sweep. MAX is 2.0, a ramp two spacings
     * wide, at which three layers sound at once.
     */
    static MORPH_OVERLAP_MIN = 0.5
    static MORPH_OVERLAP_MAX = 2

    /***
     * Where the overlap control starts, as a percentage of the way from MIN to
     * MAX. Half way puts the ramps a little wider than the triangles, so two
     * waveforms are always audible together and the sweep never lands on a
     * single one.
     */
    static DEFAULT_MORPH_OVERLAP_PERCENT = 50

    /***
     * Vol Mod Crossfade Fadecurve, page 18 item 05, documented in section 9.9
     * as "0-1 (CROSSFADE-LINEAR)".
     *
     * Section 9 spells enumerated ranges out in order — "0-1 (OFF-ON)",
     * "0-2 (Reset Off-Reset On-Human)" — so 0 is CROSSFADE and 1 is LINEAR.
     * The mode used to send 1. LINEAR is a straight ramp on the volume, and two
     * unrelated waveforms passing each other on straight ramps lose level in
     * the middle of the handover, which is heard as one wave stopping before
     * the next arrives rather than as a morph. CROSSFADE is the curve that
     * exists to hold the level up through exactly that region, and it is the
     * one this mode wants.
     *
     * The parameter carries a "*", so per NOTE 3 the EPS may refuse to set it
     * from a single PUT PARAMETER at all, in which case the refusal appears in
     * the event log and the curve stays at whatever the front panel last chose.
     * Set this to 1 to hear the old behaviour.
     */
    static MORPH_FADECURVE = 0

    /***
     * What to ask for when checking that the link works.
     *
     * Free System Blocks, page 34 item 00 on the System-MIDI page. Section 9.1
     * says a System-MIDI parameter ignores the instrument, layer and wavesample
     * fields, which is the whole point: a freshly powered EPS has none of those,
     * so anything addressed to a wavesample would fail for reasons that say
     * nothing about the connection. It is also read only, so the test cannot
     * disturb the instrument, and the answer is a genuinely useful number.
     *
     * Section 7.1: one block is 256 words, so one block is 256 samples.
     */
    /***
     * THESE TWO ARE NOT A PAGE AND AN ITEM, despite the names. They are the two
     * six bit MIDI bytes that carry parameter number $0D00, free system blocks.
     *
     * Section 4.2 sends a parameter number as "hi byte" and "lo byte", and by
     * section 2.3 that means a twelve bit number split into two six bit halves —
     * not the page and the item as separate bytes. So $0D00 goes out as $34 $00,
     * because $0D00 >> 6 is $34.
     *
     * Every setParameter call in this file follows the same convention, which is
     * why they read oddly: setParameter(0x20, 0x0D) is parameter $080D, the
     * sample rate, and setParameter(0x1C, 0x07) is $0707, the LFO modulation
     * source. Use parameterBytes() below rather than working it out by hand.
     */
    static PING_PAGE = 0x34
    static PING_ITEM = 0x00
    static SAMPLES_PER_BLOCK = 256

    /***
     * A parameter number from the page and item that section 9 lists it under.
     * The page is the high byte and the item is the low byte, so pitch envelope
     * time 1 — page $01, item $03 — is parameter $0103.
     */
    static parameterNumber(page, item){
        return ((page & 0x0F) << 8) | (item & 0xFF)
    }

    /***
     * A parameter number as the two six bit bytes that go on the wire.
     *
     * This is the conversion that is easy to miss and produces no error when it
     * is missed: send the page and the item as two bytes and the synth reads
     * (page << 6) | item, which is a different, perfectly valid parameter
     * number. It answers about that one instead, so the reply looks like a
     * success and the values are simply about something else. A sweep built
     * that way returned the track page and the three envelopes for every page
     * it asked about, and never reached master tune at all.
     */
    static parameterBytes(number){
        return [(number >> 6) & 0x3F, number & 0x3F]
    }

    /***
     * The parameter pages, indexed the way section 9 indexes them: by the
     * "SysEx High Byte" that goes on the wire, which is the byte these tables
     * are actually headed with.
     *
     * WHY THIS IS A LIST AND NOT A RANGE, AND WHY IT MATTERS
     *
     * Sweeping every high byte from $00 to $3F sounds harmless and is not. An
     * EPS-16 PLUS asked for effects items past $09 answered a few of them and
     * then died with "Error 129 — Reboot?", twice, on hardware. The effects
     * page is the one place the specification says outright that some items
     * neither transmit nor receive, and going past them does not produce a
     * refusal — it takes the machine down.
     *
     * So the sweep walks these and stops where they stop. Anything not listed
     * here is undefined territory that has already been shown to be dangerous.
     *
     * maxItem $09 on the effects page is from section 9.12 and NOTE 2, and is
     * the same limit readEffect() already uses. It happens to be safe on both
     * machines: on an original EPS this high byte is the MIDI page, whose items
     * run $00 to $08, so the cap covers all of it and still stops short of what
     * hurts a 16 PLUS.
     */
    static PARAMETER_PAGES = [
        { byte: 0x00, name: "track" },
        { byte: 0x04, name: "envelope 1" },
        { byte: 0x08, name: "envelope 2" },
        { byte: 0x0C, name: "envelope 3" },
        { byte: 0x10, name: "pitch" },
        { byte: 0x14, name: "filter" },
        { byte: 0x18, name: "amp" },
        { byte: 0x1C, name: "LFO" },
        { byte: 0x20, name: "wavesample" },
        { byte: 0x24, name: "layer" },
        { byte: 0x28, name: "instrument" },
        { byte: 0x2C, name: "sequence" },
        { byte: 0x30, name: "effects (16+) / MIDI (Classic)", maxItem: 0x09 },
        { byte: 0x34, name: "system/MIDI" },
        { byte: 0x38, name: "edit context" }
    ]

    static parameterPage(highByte){
        return EPS16.PARAMETER_PAGES.find(page => page.byte == highByte) || null
    }

    /***
     * Wavesample name: section 7.3, word offsets 00 to 11, "12 ASCII bytes, one
     * byte per word", carried in the high byte like every other word in the
     * block.
     *
     * Section 9.5 has no entry for it at all, so unlike the sample rate, the
     * root key and fine tune there is no single PUT PARAMETER that reaches it.
     * NOTE 3 of section 9 gives the only route: read the whole parameter block
     * with GET WAVESAMPLE PARAMETERS, change the twelve words, and send the
     * block back with PUT WAVESAMPLE PARAMETERS. See setWavesampleName.
     */
    static NAME_WORD = 0
    static NAME_LENGTH = 12

    /***
     * Instruments and layers name themselves the same way, at the same offset.
     * Section 7.1 word 00-11 for the instrument, section 7.2 word 00-11 for the
     * layer, both "12 ASCII bytes, one byte per word".
     *
     * Both are marked "**" in section 9 as well, Instrument Name at page 28
     * item 08 and Layer Name at page 24 item 05, which per NOTE 3 means they
     * accept neither a single GET nor a single PUT. The whole block route is
     * the only one, exactly as for the wavesample.
     */
    static BLOCK_INSTRUMENT = { get: 0x03, put: 0x0C, label: "instrument" }
    static BLOCK_LAYER      = { get: 0x04, put: 0x0D, label: "layer" }
    static BLOCK_WAVESAMPLE = { get: 0x05, put: 0x0E, label: "wavesample" }

    /***
     * What a newly created thing is called when the user has not said. Twelve
     * characters is the hard limit, so "UNNAMED LAYER" does not fit and is
     * spelled "UNNAMED LAYR", which does, at exactly twelve.
     */
    static DEFAULT_INSTRUMENT_NAME = "UNNAMED INST"
    static DEFAULT_LAYER_NAME = "UNNAMED LAYR"
    static DEFAULT_WAVESAMPLE_NAME = "UNNAMED WS"

    /***
     * The character set the EPS will actually display, established on hardware
     * rather than from the specification, which says only "12 ASCII bytes".
     *
     * The synth is misleadingly permissive about this. It accepts any byte you
     * send without complaint and hands the same byte back on a GET, so a name
     * looks perfectly fine from this end. Walk over to the front panel and the
     * characters outside this set are simply not there: send "Bass Sweep" and
     * the display reads "B S", the lower case having been dropped rather than
     * folded. The front panel's own rename screen offers exactly these.
     */
    static NAME_DISALLOWED = /[^A-Z0-9 *+-]/g

    /***
     * Trims a name to what the EPS can hold and show.
     *
     * Letters are folded up, because upper case is the only case the display
     * has, and dropping to the allowed set silently is precisely the trap
     * described above. Sharps become "+", the nearest thing the set offers, so
     * a generated "PWM C#3" arrives as "PWM C+3" rather than losing the sharp
     * and reading as a different note. Everything else outside the set becomes
     * a space, which keeps word breaks in a file name intact.
     *
     * Spaces themselves are ordinary characters, runs of them included, since a
     * name is stored space padded to twelve either way.
     */
    static sanitizeName(name){
        const clean = String(name == null ? '' : name)
            // Decompose first so an accented letter keeps its letter instead of
            // becoming a space. Sample packs are full of them.
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/#/g, '+')
            .replace(EPS16.NAME_DISALLOWED, ' ')
            .slice(0, EPS16.NAME_LENGTH)
        // Nothing but spaces means no name: the field is space padded anyway,
        // so writing one would only blank whatever the EPS already has. Any
        // trailing spaces go for the same reason, while leading ones are kept
        // in case they were meant to position the name on the display.
        return clean.trim().length == 0 ? '' : clean.replace(/ +$/, '')
    }

    inputs = []
    outputs = []
    constructor(setUpCallback, errorCallback, successCallback){
        this.inputs = []
        this.outputs = []
        this.chunkSize = EPS16.DEFAULT_CHUNK_SAMPLES
        // Ramp width for the morphing soundscape, in layer spacings. Set from
        // the interface as a percentage; see setMorphOverlap.
        this.morphOverlap = EPS16.MORPH_OVERLAP_MIN
        this.setMorphOverlap(EPS16.DEFAULT_MORPH_OVERLAP_PERCENT)
        // Sysex header nibble: the EPS's base channel minus one. Everything
        // is ignored by the synth if this does not match, with no error and
        // no clue, which is why the connection test can scan for it.
        this.baseChannel = 0
        // Rolling measurement of how fast sample blocks actually get through,
        // taken from the time between handing a block to the MIDI port and the
        // EPS acknowledging it. Used only for reporting.
        this.transferStats = { dataBytes: 0, dataMs: 0 }
        this.instNum = 0
        this.layerNum = 0
        this.wsBytes = [0x00, 0x01]
        this.midiInput = NaN
        this.midiOutput = NaN
        this.midiMessages = []
        this.setUpCallback = setUpCallback
        this.errorCallback = errorCallback
        this.successCallback = successCallback
        // Optional log sinks. Both default to no-ops so the class works without
        // any UI attached.
        this.midiCallback = () => {}
        this.debugCallback = () => {}
        // Never let a missing or refused Web MIDI implementation escape the
        // constructor. This runs before the rest of the page is wired up, so a
        // throw here would take the editor, the generator and every button with
        // it, and the page would look dead rather than merely disconnected.
        // Firefox does not always expose requestMIDIAccess; Chrome always does.
        if(typeof navigator.requestMIDIAccess != 'function'){
            this.errorCallback("Error: This browser does not support Web MIDI, so the EPS16+ "
                + "cannot be reached. Generating, editing, previewing and saving WAV files still work. "
                + "Chrome or a Chromium based browser is needed for transfers.")
            return
        }
        try{
            navigator.requestMIDIAccess({sysex: true}).then( (midiAccess) => {
                for(let input of midiAccess.inputs.values()){
                    this.inputs.push(input)
                }
                for(let output of midiAccess.outputs.values()){
                    this.outputs.push(output)
                }
                this.setUpCallback(this.inputs, this.outputs)

            }, (error) => {
                this.errorCallback(`Error: Web MIDI access was refused (${error}). `
                    + "Sysex permission is required to talk to the EPS16+.")
            });
        }catch(error){
            this.errorCallback(`Error: Could not request Web MIDI access (${error})`)
        }

    }
    /***
     * EPS Sysex Commands
     */
    /***
     * Fetches one parameter block: instrument, layer or wavesample.
     *
     * All three follow the same exchange, described in section 4.2 and worked
     * through in section 8: the GET is answered with an ACK and the matching
     * PUT header, and the block itself only follows once we ACK that.
     */
    /***
     * Fetches a parameter block, waiting the EPS out if it is busy.
     *
     * The same treatment as putParamBlock and for the same reason. A restore
     * finishes by reading the new instrument back so the saved parameters can
     * be overlaid on the EPS's own pointer words, and that read lands moments
     * after everything else, when the synth is still busy: it answered "Disk
     * Access in Progress" and the whole restore was thrown away one command
     * from the end. See epswave-log-20260803--141537.
     */
    async getParamBlock(kind){
        for(let attempt = 1; attempt <= EPS16.PARAM_BLOCK_ATTEMPTS; attempt++){
            const block = await this.getParamBlockOnce(kind)
            if(block.length > 0) return block
            if(!EPS16.TRANSIENT_STATUS.includes(this.lastStatusCode)) return []
            if(attempt == EPS16.PARAM_BLOCK_ATTEMPTS) return []
            this.debug(`EPS busy (${this.statusText(this.lastStatusCode)}); asking for the `
                + `${kind.label} block again in ${EPS16.BUSY_RETRY_MS / 1000}s, `
                + `attempt ${attempt + 1}`)
            await this.sleep(EPS16.BUSY_RETRY_MS)
        }
        return []
    }
    async getParamBlockOnce(kind){
        let cmd = this.createMIDIMessage(kind.get)
        await this.sendData(cmd);
        let messages = await this.readMessages()
        // Recorded so the retry above can tell a busy synth from a real refusal.
        this.noteStatus(messages)
        for(let msg of messages){
            if(await this.isAck(msg)){
                await this.sendAck()
                let responses = await this.readMessages()
                for(let resp of responses){
                    // Skip anything short enough to be a response command; the
                    // parameter block is the long message.
                    if(resp.length <= 4) continue
                    return this.convertFrom16BitMidi(resp, true)
                }
            }
        }
        return []
    }
    async getWavesampleParams(){
        const params = await this.getParamBlock(EPS16.BLOCK_WAVESAMPLE)
        if(params.length == 0){
            this.errorCallback("Error: Unable to get WaveSample Parameters")
            return []
        }
        this.readSampleRate(params)
        this.readRootKey(params)
        this.readFineTune(params)
        this.readWavesampleName(params)
        return params
    }
    /***
     * The instrument's own parameter block, section 7.1. Fetched only to read
     * or change its name, so nothing else in it is decoded.
     */
    async getInstrumentParams(){
        const params = await this.getParamBlock(EPS16.BLOCK_INSTRUMENT)
        if(params.length == 0){
            this.errorCallback("Error: Unable to get instrument parameters")
            return []
        }
        this.lastInstrumentName = this.readBlockName(params)
        this.debug(`Instrument name "${this.lastInstrumentName}"`)
        return params
    }
    /***
     * The layer's parameter block, section 7.2. Same story as the instrument.
     */
    async getLayerParams(){
        const params = await this.getParamBlock(EPS16.BLOCK_LAYER)
        if(params.length == 0){
            this.errorCallback("Error: Unable to get layer parameters")
            return []
        }
        this.lastLayerName = this.readBlockName(params)
        this.debug(`Layer name "${this.lastLayerName}"`)
        return params
    }
    /***
     * Sends a whole instrument to the synth: its layers, its wavesamples, all
     * of the audio and every parameter block.
     *
     * Takes the shape that getInstrumentInventory and EPSEfe.readInstrument
     * both return, plus a function that yields the audio of one wavesample,
     * so it does not care whether the instrument came off a disk image or
     * anywhere else.
     *
     * THE ORDER HERE IS NOT ARBITRARY. Four things constrain it:
     *
     * 1. CREATE LAYER makes a layer *and* one wavesample, whose number it
     *    takes. So each layer is created with the lowest numbered wavesample it
     *    owns, and the rest are created individually afterwards.
     * 2. Audio goes in before parameters. Wavesample words 115-130 are offsets
     *    into the wavedata and mean nothing until the data is there.
     * 3. A copy is made after the wavesample it copies has its audio, because
     *    COPY WAVESAMPLE is what establishes the sharing and there has to be
     *    something to share.
     * 4. Layer blocks go in after wavesample blocks, so that the key maps
     *    reference wavesamples that already exist and are already the right
     *    size.
     *
     * The instrument's own block is the one that cannot be written back as it
     * was read: of its 323 words, everything from word 29 on is a pointer into
     * the EPS's RAM, and the addresses that were valid when the backup was
     * taken mean nothing now. So it is read back from the freshly created
     * instrument and only the 29 parameter words are overlaid.
     */
    static RESTORE_PARAMETER_WORDS = 29
    // Section 7.1 word 25, the Instrument ID Field. The one word of those 29
    // that is not overlaid; see the merge at the end of uploadInstrument.
    static INSTRUMENT_ID_WORD = 25
    static RESTORE_SETTLE_MS = 2000

    /***
     * Which wavesample numbers the selected instrument currently holds, from
     * its own pointer table. Null if the instrument cannot be read.
     */
    async occupiedWavesamples(){
        const words = await this.getParamBlock(EPS16.BLOCK_INSTRUMENT)
        if(words.length == 0) return null
        return EPSBlocks.decodeInstrument(words).wavesamples
            .filter(slot => slot.exists).map(slot => slot.number)
    }

    /***
     * Which layers the selected instrument currently holds, from its own
     * pointer table. Null if the instrument cannot be read.
     */
    async occupiedLayers(){
        const words = await this.getParamBlock(EPS16.BLOCK_INSTRUMENT)
        if(words.length == 0) return null
        return EPSBlocks.decodeInstrument(words).layers
            .filter(slot => slot.exists).map(slot => slot.number)
    }

    /***
     * Creates a layer and confirms that it is actually there.
     *
     * CREATE LAYER IS ACKNOWLEDGED WHETHER OR NOT IT DOES ANYTHING. This is the
     * same failure as CREATE WAVESAMPLE ignoring the number it is given, in a
     * second command: on a synth that had just refused CREATE INSTRUMENT with a
     * NAK and accepted it on the retry, the CREATE LAYER that followed was
     * acknowledged with a plain ACK, and the instrument's layer pointer table
     * was still empty afterwards. Nothing noticed, so the restore carried on
     * and asked for a wavesample in a layer that did not exist, which came back
     * "Invalid Layer" — a true statement about a situation five commands old
     * and no help at all in finding the cause.
     *
     * So the pointer table is read back and the command repeated until the
     * layer appears. What the table said is logged either way, because this
     * check is only trustworthy if a layer really does show up there as soon as
     * it is created, and a log that says otherwise is how that gets found out.
     */
    async createLayerConfirmed(number, label){
        for(let attempt = 1; attempt <= EPS16.PARAM_BLOCK_ATTEMPTS; attempt++){
            const beforeLayers = await this.occupiedLayers()
            const beforeWavesamples = await this.occupiedWavesamples()
            if(beforeLayers === null || beforeWavesamples === null){
                return { ok: false, reason: "could not read the instrument" }
            }
            // Already there. CREATE LAYER on an occupied layer would be refused,
            // and on a retry after a lost acknowledgement it may well exist.
            if(beforeLayers.includes(number)){
                this.debug(`${label}: layer ${number + 1} is already there`)
                return { ok: true, existed: true, wavesample: null }
            }
            const status = await this.sendCommand(
                this.createMIDIMessage(EPS16.CMD_CREATE_LAYER), label)
            if(status != 0x00){
                return { ok: false, status, reason: this.statusText(status) }
            }
            const afterLayers = await this.occupiedLayers()
            const afterWavesamples = await this.occupiedWavesamples()
            if(afterLayers === null || afterWavesamples === null){
                return { ok: false, reason: "could not read the instrument back" }
            }
            if(afterLayers.includes(number)){
                // Section 4.3 says CREATE LAYER also produces a wavesample.
                // Hardware does it sometimes, so whatever appeared is reported
                // rather than assumed either way.
                const added = afterWavesamples.filter(n => !beforeWavesamples.includes(n))
                this.debug(`${label}: layers now [${afterLayers.map(n => n + 1).join(", ")}]`
                    + (added.length ? `, and it brought wavesample ${added.join(", ")}` : ""))
                return { ok: true, wavesample: added.length == 1 ? added[0] : null, added }
            }
            this.debug(`${label}: acknowledged, but the layer table is still `
                + `[${afterLayers.map(n => n + 1).join(", ")}]; retrying in `
                + `${EPS16.BUSY_RETRY_MS / 1000}s, attempt ${attempt + 1}`)
            await this.sleep(EPS16.BUSY_RETRY_MS)
        }
        return { ok: false,
            reason: "the EPS acknowledged the command but no layer ever appeared" }
    }

    /***
     * Runs a command that creates a wavesample and reports which number the EPS
     * gave it.
     *
     * THE NUMBER IN THE COMMAND IS NOT HONOURED. Section 4.3 documents CREATE
     * WAVESAMPLE as taking a "New WaveSample number", and it does not use it:
     * asked for wavesample 17 in a layer already holding wavesample 1, a real
     * EPS-16 PLUS acknowledged the command and created wavesample **2**. Every
     * later command addressed to 17 was then correctly refused as invalid,
     * which is the whole of a failure that took a dozen attempts to pin down.
     * The proof is in epswave-log-20260804--102209: the instrument's pointer
     * table holds 1 and 2, and 2 contains the 128 sample square wave that
     * CREATE WAVESAMPLE supplies.
     *
     * So the number is learned rather than chosen: the pointer table is read
     * before and after, and whatever appeared is what the EPS decided to call
     * it. That costs one extra instrument read per created object, about a
     * second, against a transfer measured in minutes — and unlike inferring the
     * rule, it cannot be wrong.
     */
    async createAndIdentify(cmd, label){
        const before = await this.occupiedWavesamples()
        if(before === null) return { ok: false, reason: "could not read the instrument" }
        const status = await this.sendCommand(cmd, label)
        if(status != 0x00) return { ok: false, status, reason: this.statusText(status) }
        const after = await this.occupiedWavesamples()
        if(after === null) return { ok: false, reason: "could not read the instrument back" }
        const added = after.filter(number => !before.includes(number))
        if(added.length != 1){
            return { ok: false, added,
                reason: added.length == 0 ? "the EPS accepted the command but created nothing"
                    : `the EPS created ${added.length} wavesamples at once (${added.join(", ")})` }
        }
        this.debug(`${label}: the EPS assigned wavesample ${added[0]}`)
        return { ok: true, number: added[0] }
    }

    /***
     * Asks the EPS what it actually has, and writes the answer to the log.
     *
     * Run when a restore gives up, because the interesting question at that
     * point is not what we asked for but what the synth ended up with. The
     * failure this exists for is a CREATE WAVESAMPLE that is acknowledged and
     * then denied: the EPS answers "Invalid Wavesample" to the next command
     * addressing the number it just accepted. Reading the instrument's own
     * pointer table settles what really got created, and under which number.
     *
     * Everything is wrapped, and every step is optional. This runs when things
     * have already gone wrong, so it must not be able to make them worse or
     * throw over the top of the real error.
     */
    async diagnoseInstrument(){
        const lines = []
        const say = (text) => { lines.push(text); this.debug(`PROBE: ${text}`) }
        const restore = { layer: this.layerNum, ws: this.wsBytes }
        try{
            say(`--- probing instrument ${this.instNum + 1} after a failure ---`)
            const words = await this.getParamBlock(EPS16.BLOCK_INSTRUMENT)
            if(words.length == 0){
                say("the instrument block could not be read at all")
                return lines
            }
            const inst = EPSBlocks.decodeInstrument(words)
            const layers = inst.layers.filter(l => l.exists).map(l => l.number)
            const wavesamples = inst.wavesamples.filter(w => w.exists).map(w => w.number)
            say(`name "${inst.name}", ${inst.sizeBlocks} blocks claimed`)
            say(`layers occupied: [${layers.join(", ")}]`)
            say(`wavesamples occupied: [${wavesamples.join(", ")}]`)

            for(const number of layers){
                this.setLayerNumber(number)
                const block = await this.getParamBlock(EPS16.BLOCK_LAYER)
                if(block.length == 0){ say(`layer ${number}: unreadable`); continue }
                const layer = EPSBlocks.decodeLayer(block)
                say(`layer ${number} "${layer.name}" plays wavesamples `
                    + `[${layer.wavesamplesUsed.join(", ")}]`)
            }
            for(const number of wavesamples){
                // A wavesample is addressed through its layer, and after a
                // failure the maps may not agree with the pointer table, so
                // every layer is tried until one answers.
                let found = null
                for(const layerNumber of layers){
                    this.setLayerNumber(layerNumber)
                    this.setWavesampleNumber(number)
                    const block = await this.getParamBlock(EPS16.BLOCK_WAVESAMPLE)
                    if(block.length > 0){
                        found = { layerNumber, ws: EPSBlocks.decodeWavesample(block) }
                        break
                    }
                }
                if(!found){ say(`wavesample ${number}: exists in the table but answers nothing`) }
                else{
                    say(`wavesample ${number} (layer ${found.layerNumber}) "${found.ws.name}" `
                        + `${found.ws.sampleEnd} samples, keys ${found.ws.keyRangeLo}-`
                        + `${found.ws.keyRangeHi}`
                        + (found.ws.isCopy ? `, copy of ${found.ws.copyNumber}` : ""))
                }
            }
            const free = await this.freeBlocks()
            if(free !== null) say(`free memory ${free} blocks`)
            say("--- end of probe ---")
        }catch(error){
            say(`the probe itself failed: ${error.message}`)
        }finally{
            this.layerNum = restore.layer
            this.wsBytes = restore.ws
        }
        return lines
    }

    /***
     * Free sound memory, in blocks of 256 words. Null if the EPS will not say.
     */
    async freeBlocks(){
        const answer = await this.getParameter(EPS16.PING_PAGE, EPS16.PING_ITEM)
        return answer.answered && answer.value !== null ? answer.value : null
    }

    async uploadInstrument(inventory, audioFor, progressCallback = () => {}){
        const report = { ok: false, instrument: -1, message: "", uploaded: 0, copied: 0 }
        const say = (percent, what) => progressCallback(percent, what)

        /***
         * Original EPS instruments go the same way as EPS-16 PLUS ones.
         *
         * The two machines lay their parameter blocks out identically — see
         * the long note above WS_PAN_WORD in epsBlocks.js for the evidence —
         * and the EPS-16 PLUS's own additions all live in low bytes that an
         * original EPS leaves at zero, which is the sensible default for every
         * one of them. So the blocks need one field moved and nothing else.
         *
         * The audio needs nothing at all. Appendix B describes the original
         * EPS as 13 bit, and its samples are stored left justified in 16 bit
         * words with the low three bits zero, which is exactly what the
         * EPS-16 PLUS wants: in every original EPS wavesample examined not one
         * sample in 20,000 has a low bit set. Sending it unchanged is right,
         * and it will simply be a quieter 13 bits of a 16 bit machine.
         *
         * What is lost is what the original EPS never had: no effect, and no
         * value for any of the EPS-16 PLUS-only parameters. Both are also true
         * of loading the instrument on the synth from a disk.
         */
        const original = !inventory.instrument.isEps16Plus
        if(original){
            this.successCallback("Success: This is an original EPS instrument. Its layers "
                + "and wavesamples transfer as they are — the two machines use the same "
                + "block layout — and the EPS-16 PLUS-only parameters take their default "
                + "values.")
        }

        const layers = inventory.layers
        const sources = inventory.wavesamples.filter(ws => !ws.isCopy)
        const copies = inventory.wavesamples.filter(ws => ws.isCopy)
        if(layers.length == 0 || sources.length == 0){
            report.message = "This instrument has no layers or no wavesamples holding audio."
            return report
        }

        // Progress is weighted by audio, because the audio is essentially all of
        // the time. Everything else is a handful of short messages.
        const totalSamples = sources.reduce((sum, ws) => sum + ws.sampleEnd, 0)
        let doneSamples = 0

        /***
         * Pre-flight on free memory, and a running note of it afterwards.
         *
         * This exists because of a failure worth explaining. The only
         * instrument that will not restore is also the largest, and it fails
         * with "Insert System Disk" ($02) on the first command addressed to its
         * second wavesample, right after the first one's 65,536 samples have
         * gone in. Section 5 describes $02 as the EPS needing its system disk
         * before the command can be executed, and the WAIT code's description
         * mentions loading an overlay.
         *
         * The EPS-16 PLUS keeps parts of its operating system in the same RAM
         * as the samples. A plausible reading, and the reason for measuring
         * rather than guessing, is that a large enough instrument evicts an
         * overlay and the synth then wants the disk to fetch it back. If that
         * is what is happening, free memory will be visibly low at the point it
         * gives up — and half finished instruments from earlier attempts, which
         * hold their memory until deleted, make it far more likely.
         *
         * Either way, knowing how much room is left is worth having, and
         * refusing before a long transfer beats failing in the middle of one.
         */
        const needed = inventory.source == "efe" && inventory.file
            ? inventory.file.sizeBlocks
            : Math.ceil(totalSamples / EPS16.SAMPLES_PER_BLOCK)
        const free = await this.freeBlocks()
        if(free !== null){
            this.debug(`Free memory ${free} blocks; "${inventory.instrument.name}" needs `
                + `about ${needed}`)
            if(free < needed){
                report.message = `Not enough room on the EPS: ${free} blocks free, this `
                    + `instrument needs about ${needed}. Delete something on the synth — `
                    + `half finished instruments from earlier attempts hold their memory `
                    + `until they are deleted.`
                return report
            }
        }

        // The search starts at whatever instrument is selected and walks up, so
        // where it lands depends on that selection as well as on what the synth
        // already holds. Which slot it took is reported straight away rather
        // than only at the end, because "it went somewhere I did not expect" is
        // otherwise only discovered after several minutes of transfer.
        const from = this.instNum
        if(!await this.createNextFreeInstrument()){
            report.message = `No free instrument slot at or after ${from + 1} on the EPS.`
            return report
        }
        report.instrument = this.instNum
        // A synth that has just been asked to make an instrument is not ready
        // for the next command. In the run that produced createLayerConfirmed,
        // CREATE INSTRUMENT was refused with a NAK, accepted on the retry, and
        // the CREATE LAYER that came half a second later was acknowledged and
        // did nothing. Everything downstream retries; pausing here means it
        // usually does not have to.
        await this.sleep(EPS16.RESTORE_SETTLE_MS)
        say(0, `using instrument ${this.instNum + 1}`
            + (this.instNum != from ? ` (${from + 1} was taken)` : ""))
        this.successCallback(`Success: Restoring into instrument ${this.instNum + 1}`
            + (this.instNum != from ? `, since ${from + 1} was already in use` : ""))
        this.debug(`Restoring "${inventory.instrument.name}" into instrument `
            + `${this.instNum + 1}: ${layers.length} layer(s), ${sources.length} `
            + `wavesample(s) plus ${copies.length} copy/copies`)

        // Every give-up point goes through here, so the probe runs once and
        // always. What the synth actually ended up with is the thing worth
        // knowing when a restore fails, and it is gone the moment the half
        // built instrument is deleted to try again.
        const fail = async (message) => {
            this.errorCallback(`Error: ${message}`)
            report.message = message + ` Instrument ${report.instrument + 1} on the EPS is `
                + "half built; delete it there before trying again."
            report.probe = await this.diagnoseInstrument()
            return report
        }

        // --- structure, learning the numbers the EPS assigns ------------------
        //
        // The file's wavesample numbers cannot be reproduced: CREATE WAVESAMPLE
        // ignores the number it is given and picks its own. So each object is
        // created, the instrument is read back to see what appeared, and a map
        // is built from the file's numbering onto the synth's. Everything that
        // refers to a wavesample later — the audio, the copies, the layer maps
        // and the copy fields in the parameter blocks — goes through that map.
        const toSynth = new Map()
        const strays = []
        for(const layer of layers){
            const owned = [...layer.wavesamplesUsed].sort((a, b) => a - b)
            say(0, `creating layer ${layer.number + 1}`)
            this.setLayerNumber(layer.number)
            this.setWavesampleNumber(1)
            // CREATE LAYER may or may not bring a wavesample with it. Section
            // 4.3 says it does; hardware says otherwise more often than not, so
            // rather than depend on either, whatever appears is noted. It may
            // also do nothing at all while acknowledging — see
            // createLayerConfirmed, which is why this is checked rather than
            // believed.
            const layerMade = await this.createLayerConfirmed(layer.number,
                `create layer ${layer.number + 1}`)
            if(!layerMade.ok){
                return await fail(`Could not create layer ${layer.number + 1}: `
                    + `${layerMade.reason}.`)
            }
            const made = { ok: layerMade.wavesample !== null && layerMade.wavesample !== undefined,
                number: layerMade.wavesample }
            const sourcesHere = owned.filter(n => !copies.some(ws => ws.number == n))
            const pending = [...sourcesHere]
            if(made.ok){
                if(pending.length > 0){
                    toSynth.set(pending.shift(), made.number)
                }else{
                    // A layer of nothing but copies still got a wavesample it
                    // has no use for. Remembered so it can be cleared away.
                    strays.push({ layer: layer.number, number: made.number })
                }
            }
            for(const fileNumber of pending){
                this.setWavesampleNumber(fileNumber)
                const result = await this.createAndIdentify(
                    this.createMIDIMessage(EPS16.CMD_CREATE_WAVESAMPLE),
                    `create wavesample ${fileNumber}`)
                if(!result.ok){
                    return await fail(`Could not create a wavesample for ${fileNumber}: `
                        + `${result.reason}.`)
                }
                toSynth.set(fileNumber, result.number)
            }
        }
        this.debug("Wavesample numbering, file -> EPS: "
            + [...toSynth].map(([from, to]) => `${from}->${to}`).join(", "))

        // --- audio -----------------------------------------------------------
        for(const ws of sources){
            const synthNumber = toSynth.get(ws.number)
            if(synthNumber === undefined){
                return await fail(`Wavesample ${ws.number} was never created.`)
            }
            const audio = await audioFor(ws)
            if(!audio || audio.length == 0){
                return await fail(`No audio available for wavesample ${ws.number}.`)
            }
            this.setLayerNumber(ws.layer == null ? layers[0].number : ws.layer)
            this.setWavesampleNumber(synthNumber)
            const before = doneSamples
            // Rescaled from this wavesample's own 0-100 to its share of the
            // whole instrument, because at forty minutes for a large one a bar
            // that restarts every wavesample says nothing about how long is left.
            const ok = await this.uploadWavesampleAudio(Array.from(audio), (percent) => {
                const within = (Number(percent) || 0) / 100
                say(Math.round(((before + within * ws.sampleEnd) / totalSamples) * 100),
                    `wavesample ${synthNumber}, ${Math.round(within * 100)}%`)
            })
            if(!ok) return await fail(`Upload of wavesample ${synthNumber} did not finish.`)
            // The EPS has housekeeping to do after taking a wavesample and is
            // not ready for the next command the instant it acknowledges the
            // last block.
            await this.sleep(EPS16.RESTORE_SETTLE_MS)
            doneSamples = before + ws.sampleEnd
            report.uploaded++
            say(Math.round((doneSamples / totalSamples) * 100),
                `wavesample ${report.uploaded} of ${sources.length} uploaded`)
        }

        // --- copies ----------------------------------------------------------
        // COPY WAVESAMPLE names a destination number, and on the evidence of
        // CREATE WAVESAMPLE that number is unlikely to be honoured either, so
        // the same before-and-after read is used and whatever appears is what
        // the copy is called.
        for(const ws of copies){
            const source = inventory.wavesamples.find(w => w.number == ws.copyNumber)
            if(!source){
                return await fail(`Wavesample ${ws.number} copies ${ws.copyNumber}, `
                    + "which is not in this instrument.")
            }
            const sourceSynth = toSynth.get(source.number)
            if(sourceSynth === undefined){
                return await fail(`Wavesample ${ws.number} copies ${ws.copyNumber}, `
                    + "which was never created.")
            }
            const destLayer = ws.layer == null ? layers[0].number : ws.layer
            const sourceLayer = source.layer == null ? layers[0].number : source.layer

            // Give the copy the spare wavesample CREATE LAYER left in this
            // layer, if there is one: the destination has to be free, and one
            // that exists would be refused as already in use.
            const spare = strays.findIndex(s => s.layer == destLayer)
            if(spare >= 0){
                await this.deleteWavesample(destLayer, strays[spare].number)
                strays.splice(spare, 1)
            }
            say(100, `copying wavesample ${sourceSynth} into layer ${destLayer + 1}`)

            const before = await this.occupiedWavesamples()
            if(!await this.copyWavesample(sourceLayer, sourceSynth, destLayer, ws.number)){
                return await fail(`Could not copy wavesample ${sourceSynth} for `
                    + `${ws.number}.`)
            }
            const after = await this.occupiedWavesamples()
            const added = before && after ? after.filter(n => !before.includes(n)) : []
            if(added.length != 1){
                return await fail(`Copied wavesample ${sourceSynth} but could not tell `
                    + `which number the EPS gave the copy`
                    + (added.length ? ` (${added.join(", ")})` : "") + ".")
            }
            this.debug(`copy of ${ws.number}: the EPS assigned wavesample ${added[0]}`)
            toSynth.set(ws.number, added[0])
            report.copied++
        }

        // Anything the EPS made that the instrument has no use for. Left in
        // place it would sound, since creating a wavesample also hands it a key
        // range across the whole layer.
        for(const stray of strays){
            this.debug(`Removing wavesample ${stray.number}, which CREATE LAYER `
                + `added to layer ${stray.layer + 1} and nothing needs`)
            await this.deleteWavesample(stray.layer, stray.number)
        }

        // --- parameters ------------------------------------------------------
        // The EPS is reliably busy for a few seconds after the last of the
        // audio goes in, and the block writes that follow are the part of a
        // restore with the most to lose. The retries below would ride it out
        // anyway; pausing first means they usually do not have to.
        say(100, "letting the EPS settle")
        await this.sleep(EPS16.RESTORE_SETTLE_MS)
        // Every wavesample number inside a block refers to the file's numbering
        // and has to be translated to the synth's before the block goes back.
        // A number with no translation is left alone rather than zeroed: it
        // means something was not created, which has already been reported, and
        // guessing here would only make the result harder to read.
        const remap = (number) => toSynth.has(number) ? toSynth.get(number) : number

        say(100, "writing wavesample parameters")
        for(const ws of inventory.wavesamples){
            const block = Array.from(ws.words)
            // Section 7.3 word 12: the wavesample holding this one's audio.
            if(ws.isCopy){
                block[12] = (remap(ws.copyNumber) << 8) | (block[12] & 0x00FF)
            }
            if(original){
                const moved = EPSBlocks.adaptWavesampleToEps16Plus(block)
                if(moved){
                    this.debug(`wavesample ${ws.number}: carried the original EPS pan `
                        + `${moved.pan} into the low byte of word ${moved.word}, which is `
                        + `where the EPS-16 PLUS keeps it`)
                }
            }
            this.setLayerNumber(ws.layer == null ? layers[0].number : ws.layer)
            this.setWavesampleNumber(remap(ws.number))
            if(!await this.putParamBlock(EPS16.BLOCK_WAVESAMPLE, block)){
                return await fail(`The EPS refused the parameter block for wavesample `
                    + `${remap(ws.number)}.`)
            }
        }
        say(100, "writing layer parameters")
        for(const layer of layers){
            const block = Array.from(layer.words)
            // Section 7.2 words 19-106: one wavesample number per key. This is
            // what actually decides which sample sounds where, and it is written
            // after everything else because creating a wavesample overwrites it
            // — a freshly created one is handed the whole layer.
            for(let i = 0; i < EPSBlocks.LAYER_MAP_LENGTH; i++){
                const at = EPSBlocks.LAYER_MAP_WORD + i
                const was = (block[at] >> 8) & 0xFF
                if(was == 0) continue
                block[at] = (remap(was) << 8) | (block[at] & 0x00FF)
            }
            this.setLayerNumber(layer.number)
            if(!await this.putParamBlock(EPS16.BLOCK_LAYER, block)){
                return await fail(`The EPS refused the parameter block for layer `
                    + `${layer.number + 1}.`)
            }
        }

        // The instrument block, read back and overlaid. See the note above.
        say(100, "writing instrument parameters")
        const fresh = await this.getParamBlock(EPS16.BLOCK_INSTRUMENT)
        if(fresh.length == 0) return await fail("Could not read the new instrument back.")
        const merged = Array.from(fresh)
        for(let word = 0; word < EPS16.RESTORE_PARAMETER_WORDS; word++){
            // Word 25 is the one word of the instrument's parameters that
            // describes the machine rather than the sound: section 7.1 calls
            // it the Instrument ID Field, "$FFFF indicates EPS-16 PLUS". What
            // is being built here is an EPS-16 PLUS instrument in an EPS-16
            // PLUS, whatever wrote the file, so the synth's own answer is kept
            // and the file's is dropped. Without this an original EPS file
            // would stamp its instrument as an original EPS on a machine that
            // is not one.
            if(word == EPS16.INSTRUMENT_ID_WORD) continue
            merged[word] = inventory.instrument.words
                ? inventory.instrument.words[word] : merged[word]
        }
        if(!await this.putParamBlock(EPS16.BLOCK_INSTRUMENT, merged)){
            return await fail("The EPS refused the instrument parameter block.")
        }

        report.ok = true
        report.message = `Sent "${inventory.instrument.name}" to instrument `
            + `${report.instrument + 1}: ${report.uploaded} wavesample(s) uploaded`
            + (report.copied ? `, ${report.copied} copied` : "")
            + (original ? ". It came from an original EPS, so it now holds the EPS-16 "
                + "PLUS defaults for the parameters that machine did not have"
              : ". Effects are not included and have to be set on the synth.")
        this.successCallback(`Success: ${report.message}`)
        return report
    }
    /***
     * What can be learned about the effect, which is less than you would want.
     *
     * THE ALGORITHM NAME CANNOT BE READ OVER MIDI AT ALL. Two independent
     * things in the specification say so and there is no way around either.
     * NOTE 2 of section 9 states that functions on the Effect Select-Bypass
     * page "neither transmit nor receive PUT or GET PARAMETER commands", and
     * section 9.12 repeats it for the FX Algorithm Select parameter
     * specifically. Nor is there any command in section 4 that reads the
     * display, so the front panel cannot be driven with VIRTUAL BUTTON PRESS
     * and then read back either. Whoever wants the algorithm has to look at
     * the synth.
     *
     * What is reachable is the rest of page 30. Items 00 to 09 carry no "*" or
     * "**" marker in any of the thirteen algorithm tables, so per NOTE 3 they
     * answer a single GET PARAMETER. Item 00 is Variation in every one of those
     * tables, which makes it the one field whose meaning is known without
     * knowing the algorithm.
     *
     * The rest are returned as raw numbers on purpose. Their names differ per
     * algorithm — item 03 is Decay Time in a reverb and something else entirely
     * in a delay — so labelling them without knowing which algorithm is loaded
     * would be inventing information. Section 9.12 is also the most OCR damaged
     * part of the document, which is a second reason not to lean on its labels.
     */
    static EFFECT_PAGE = 0x30
    static EFFECT_VARIATION_ITEM = 0x00
    static EFFECT_LAST_READABLE_ITEM = 0x09

    async readEffect(){
        const none = { readable: false, variation: null, parameters: [] }
        // The effect is a bonus on top of an inventory that is already complete
        // and has already cost real time to fetch. Nothing that happens on this
        // page is worth losing that over, so a failure here is reported and
        // swallowed rather than thrown.
        try{
            const variation = await this.getParameter(EPS16.EFFECT_PAGE,
                EPS16.EFFECT_VARIATION_ITEM)
            if(!variation.answered || variation.value == null){
                this.debug("Effect page did not answer; no effect parameters available")
                return none
            }
            const parameters = []
            for(let item = 1; item <= EPS16.EFFECT_LAST_READABLE_ITEM; item++){
                const answer = await this.getParameter(EPS16.EFFECT_PAGE, item)
                if(answer.answered && answer.value != null){
                    parameters.push({ item, value: answer.value })
                }
            }
            this.debug(`Effect variation ${variation.value}, `
                + `${parameters.length} readable parameters`)
            return { readable: true, variation: variation.value, parameters }
        }catch(error){
            this.debug(`Effect page could not be read: ${error.message}`)
            return none
        }
    }
    /***
     * Everything inside the selected instrument: its parameters, every layer,
     * every wavesample, and which wavesamples each layer plays on which keys.
     *
     * The expensive question — what is actually in there — turns out to be
     * free. Most of the instrument block is a directory: section 7.1 words 29
     * to 317 are the offsets of the pitch tables, the layers, the wavesamples
     * and the effect, and a zero offset means the object does not exist. So one
     * GET INSTRUMENT settles the entire inventory before anything else is
     * asked for, and nothing here has to probe or guess.
     *
     * The GETs after that are only for names and parameters, one per object
     * that exists. No wavedata is transferred, so this costs seconds rather
     * than the tens of minutes a backup of the same instrument would.
     *
     * The three selectors are saved and put back, because reading an inventory
     * should not quietly move the user's current layer and wavesample out from
     * under the rest of the page.
     */
    async getInstrumentInventory(progressCallback = null){
        const restore = { inst: this.instNum, layer: this.layerNum, ws: this.wsBytes }
        try{
            const instWords = await this.getInstrumentParams()
            if(instWords.length == 0) return null
            // The raw block travels with the decoded one, because a restore has
            // to write these words back and cannot reconstruct them from the
            // fields above.
            const instrument = { ...EPSBlocks.decodeInstrument(instWords), words: instWords }
            const layerSlots = instrument.layers.filter(l => l.exists)
            const wsSlots = instrument.wavesamples.filter(w => w.exists)
            const total = 1 + layerSlots.length + wsSlots.length
            let done = 1
            const step = (what) => {
                if(progressCallback) progressCallback(Math.round((done / total) * 100), what)
            }
            step("instrument")
            this.debug(`Inventory: "${instrument.name}", ${layerSlots.length} layer(s), `
                + `${wsSlots.length} wavesample(s)`)

            const layers = []
            for(const slot of layerSlots){
                this.setLayerNumber(slot.number)
                const words = await this.getLayerParams()
                done++
                step(`layer ${slot.number + 1}`)
                if(words.length == 0) continue
                layers.push({ ...EPSBlocks.decodeLayer(words),
                    number: slot.number, words })
            }

            const wavesamples = []
            for(const slot of wsSlots){
                // A wavesample belongs to a layer, so the layer selector has to
                // name the one that owns it or the GET addresses nothing. The
                // maps just read say who that is; anything the maps do not
                // mention is asked for under the first layer, which is the only
                // guess available and is logged when it happens.
                const owner = layers.find(l => l.wavesamplesUsed.includes(slot.number))
                if(!owner) this.debug(`Wavesample ${slot.number} is in no layer map`)
                this.setLayerNumber(owner ? owner.number : layerSlots[0].number)
                this.setWavesampleNumber(slot.number)
                const words = await this.getWavesampleParams()
                done++
                step(`wavesample ${slot.number}`)
                if(words.length == 0) continue
                const ws = EPSBlocks.decodeWavesample(words)
                wavesamples.push({ ...ws,
                    number: slot.number, words,
                    layer: owner ? owner.number : null,
                    sampleRateHz: WaveGen.rateFromCode(ws.sampleRateCode) })
            }

            // A copy holds no audio of its own, so counting one would double the
            // size of every split that shares a sample between zones.
            const audioSamples = wavesamples
                .filter(w => !w.isCopy)
                .reduce((sum, w) => sum + w.sampleEnd, 0)

            // Last, because it is ten more round trips and the useful part of
            // the inventory is already in hand if the effect page says nothing.
            step("effect")
            const effect = await this.readEffect()

            return { instrument, layers, wavesamples, audioSamples, effect,
                // Three MIDI bytes carry one 16 bit sample, section 2.3.
                wireBytes: audioSamples * 3 }
        }finally{
            this.instNum = restore.inst
            this.layerNum = restore.layer
            this.wsBytes = restore.ws
        }
    }
    /***
     * Reads the audio of every wavesample in an inventory off the synth.
     *
     * This is the other half of a backup. `getInstrumentInventory` settles what
     * an instrument contains in a handful of round trips; this is the part that
     * takes twenty minutes, so it is deliberately a separate call. Looking at
     * an instrument should not cost what copying one does.
     *
     * COPIES ARE NOT ASKED FOR. Section 7.3 word 12: a copy holds no audio of
     * its own, and asking the EPS for its wavedata answers with status $11,
     * "Wavesample is a copy". So only the sources are fetched, and a copy is
     * served from whichever wavesample actually holds its samples — the same
     * rule EPSEfe.readWavedata follows for a file, so a backup and a disk image
     * agree about what a copy sounds like.
     *
     * Returns a Map from wavesample number to Int16Array, plus a note of
     * anything that did not come back whole. A partial result is still returned
     * rather than thrown away: nineteen wavesamples out of twenty is worth
     * having, and the caller can decide.
     */
    async downloadAudio(inventory, progressCallback = () => {}){
        const restore = { inst: this.instNum, layer: this.layerNum, ws: this.wsBytes }
        const audio = new Map()
        const short = []
        const sources = inventory.wavesamples.filter(ws => !ws.isCopy)
        const totalSamples = sources.reduce((sum, ws) => sum + ws.sampleEnd, 0)
        let doneSamples = 0
        try{
            for(const ws of sources){
                // A wavesample is addressed through the layer that owns it. A
                // wavesample in no layer map is asked for under the first layer,
                // which is the only guess available.
                const layer = ws.layer == null
                    ? (inventory.layers.length ? inventory.layers[0].number : 0) : ws.layer
                this.setLayerNumber(layer)
                this.setWavesampleNumber(ws.number)
                const before = doneSamples
                const samples = await this.getWavesampleDataChunked(this.chunkSize,
                    (data, percent) => {
                        // Rescaled to this wavesample's share of the whole, so
                        // the bar means something across a multi-sample
                        // instrument rather than restarting six times.
                        const within = (Number(percent) || 0) / 100
                        progressCallback(totalSamples
                            ? Math.round(((before + within * ws.sampleEnd) / totalSamples) * 100)
                            : 100, `wavesample ${ws.number}, ${Math.round(within * 100)}%`)
                    })
                // The length is the synth's own end offset, read again at the
                // moment of the transfer, so a disagreement with the inventory
                // is worth saying out loud rather than quietly trusting either.
                if(samples.length != ws.sampleEnd){
                    this.debug(`Wavesample ${ws.number}: the inventory says `
                        + `${ws.sampleEnd} samples, the transfer gave ${samples.length}`)
                }
                if(samples.length == 0){
                    short.push({ number: ws.number, got: 0, wanted: ws.sampleEnd })
                }else{
                    audio.set(ws.number, Int16Array.from(samples))
                    if(samples.length < ws.sampleEnd){
                        short.push({ number: ws.number, got: samples.length,
                            wanted: ws.sampleEnd })
                    }
                }
                doneSamples = before + ws.sampleEnd
            }
        }finally{
            this.instNum = restore.inst
            this.layerNum = restore.layer
            this.wsBytes = restore.ws
        }

        // Copies point at the wavesample that holds their samples. Bounded,
        // because a copy chain that loops would otherwise hang the page.
        for(const ws of inventory.wavesamples.filter(w => w.isCopy)){
            let at = ws
            for(let hop = 0; at.isCopy && hop <= EPSBlocks.WAVESAMPLE_COUNT; hop++){
                const source = inventory.wavesamples.find(w => w.number == at.copyNumber)
                if(!source) break
                at = source
            }
            if(!at.isCopy && audio.has(at.number)) audio.set(ws.number, audio.get(at.number))
        }

        const got = sources.length - short.filter(s => s.got == 0).length
        const message = short.length == 0
            ? `Read ${audio.size} wavesample(s), ${doneSamples.toLocaleString()} samples`
            : `Read ${got} of ${sources.length} wavesample(s). Incomplete: `
                + short.map(s => `${s.number} (${s.got} of ${s.wanted})`).join(", ")
        if(short.length == 0) this.successCallback(`Success: ${message}`)
        else this.errorCallback(`Error: ${message}`)
        return { ok: short.length == 0, audio, short, message, samples: doneSamples }
    }

    /***
     * Commands used only by the restore. Section 4.3.
     *
     * All three take their numbers explicitly rather than operating on
     * "the current one", which is what makes an exact reproduction possible:
     * the layer and wavesample numbers of the original can be recreated as they
     * were, and then the layer maps and the copy references restore verbatim
     * without anything having to be renumbered.
     */
    static CMD_CREATE_LAYER = 0x16
    static CMD_CREATE_WAVESAMPLE = 0x19
    static CMD_DELETE_WAVESAMPLE = 0x1A
    static CMD_COPY_WAVESAMPLE = 0x1B

    /***
     * The copy data flag of COPY WAVESAMPLE.
     *
     * "The WaveData is copied if the data copy flag is set." Clear is therefore
     * the setting that does not duplicate the audio, which is what makes the
     * destination a copy in the section 7.3 sense — a wavesample whose Copy
     * Number names the one holding the data. That is what the front panel's own
     * copy operation offers when it asks whether to copy the data, and it is
     * what the instrument files contain.
     *
     * UNVERIFIED ON HARDWARE. If a restored instrument comes back with the
     * copies holding their own audio, and using twice the memory, this is the
     * value that is wrong. Read the instrument back after a restore and check
     * that the copies still report a Copy Number.
     */
    static COPY_SHARES_DATA = 0x00
    static COPY_DUPLICATES_DATA = 0x01

    /***
     * COPY WAVESAMPLE. The source is the usual instrument, layer and wavesample
     * in the message header; the destination and the flag are the data.
     */
    async copyWavesample(sourceLayer, sourceNumber, destLayer, destNumber,
            dataFlag = EPS16.COPY_SHARES_DATA){
        const restore = { layer: this.layerNum, ws: this.wsBytes }
        this.setLayerNumber(sourceLayer)
        this.setWavesampleNumber(sourceNumber)
        const destWs = this.convertTo12BitMidi([destNumber], 2)
        const message = this.createMIDIMessage(EPS16.CMD_COPY_WAVESAMPLE,
            [0x00, this.instNum, 0x00, destLayer, destWs[0], destWs[1], 0x00, dataFlag])
        const status = await this.sendCommand(message,
            `copy wavesample ${sourceNumber} to ${destNumber}`)
        this.layerNum = restore.layer
        this.wsBytes = restore.ws
        if(status == 0x00) return true
        this.errorCallback(`Error: Could not copy wavesample ${sourceNumber} to `
            + `${destNumber}: ${this.statusText(status)}`)
        return false
    }

    async deleteWavesample(layer, number){
        this.setLayerNumber(layer)
        this.setWavesampleNumber(number)
        // Not routed through sendCommand: this one is expected to fail
        // whenever CREATE LAYER did not leave a placeholder behind, and
        // retrying a failure that is normal would only cost time.
        await this.sendData(this.createMIDIMessage(EPS16.CMD_DELETE_WAVESAMPLE))
        const messages = await this.readMessages()
        this.noteStatus(messages)
        return messages.length > 0 && await this.isAck(messages[0])
    }

    async deleteInstrument(quiet = false){
        const status = await this.sendCommand(this.createMIDIMessage(0x1C),
            `delete instrument ${this.instNum + 1}`)
        if(status == 0x00){
            this.successCallback(`Success: Deleted instrument ${this.instNum + 1}`)
            return true
        }
        if(!quiet){
            this.errorCallback(`Error: Unable to delete instrument ${this.instNum + 1}: `
                + this.statusText(status))
        }
        return false
    }

    /***
     * Empties every instrument slot and selects the first one.
     *
     * A debugging convenience: a failed restore leaves a half built instrument
     * holding its memory, and clearing them one at a time on the front panel
     * between attempts is most of the work of testing. Slots that are already
     * empty refuse quietly, which is the expected answer rather than a problem,
     * so nothing is reported for them.
     */
    async deleteAllInstruments(progressCallback = () => {}){
        const before = this.instNum
        let deleted = 0
        for(let slot = 0; slot < EPS16.INSTRUMENT_COUNT; slot++){
            this.setInstrumentNumber(slot)
            progressCallback(Math.round((slot / EPS16.INSTRUMENT_COUNT) * 100),
                `instrument ${slot + 1}`)
            if(await this.deleteInstrument(true)) deleted++
        }
        this.setInstrumentNumber(0)
        this.debug(`Deleted ${deleted} instrument(s); was on ${before + 1}, now on 1`)
        return deleted
    }
    async sendAck(){
        const data = [
            0x01,
            0x00,
            0x00
        ]
        await this.sendData(data) 
    }
    /***
     * CREATE INSTRUMENT in the currently selected slot.
     *
     * `quiet` suppresses the failure message only. The macros below use this
     * command to *probe* for a free slot, where a refusal is the expected
     * answer for an occupied instrument and not something the user needs told
     * about seven times before the eighth attempt works.
     */
    /***
     * Creates an instrument in the currently selected slot.
     *
     * Routed through sendCommand so that a busy EPS is waited out rather than
     * mistaken for a slot that is already taken. That distinction matters here
     * more than anywhere else: createNextFreeInstrument reads a failure as
     * "occupied, try the next one", so a NAK meaning "not now" silently cost a
     * slot. It showed up as pressing Test Connection making the next restore
     * land one instrument further along than it should.
     */
    async createInstrument(name = null, quiet = false){
        const status = await this.sendCommand(this.createMIDIMessage(0x15),
            `create instrument ${this.instNum + 1}`)
        if(status == 0x00){
            this.successCallback("Success: Created instrument")
            await this.nameAfterCreate(EPS16.BLOCK_INSTRUMENT, name)
            return true
        }
        if(!quiet){
            this.errorCallback("Error: Unable to create instrument: "
                + this.statusText(status))
        }
        return false
    }

    /***
     * Claims the next free instrument slot, searching upwards from the one
     * currently selected, and leaves it selected on success.
     *
     * CREATE INSTRUMENT is the only way to ask whether a slot is free: it
     * refuses if the slot is occupied, so a refusal here is an ordinary result
     * rather than an error, which is why the probe is quiet.
     *
     * Two things this gets right that the three hand rolled copies it replaced
     * did not. The instrument number is set **before** each attempt rather than
     * after, so a search from slot 0 tries 0, 1, 2 ... 7; the old version set
     * it afterwards, which made every attempt use the previous loop index — it
     * tried slot 0 twice and stopped at slot 6. **Instrument 8 was therefore
     * unreachable**, and a synth with the first seven loaded reported that it
     * could not create an instrument while the eighth sat empty.
     */
    /***
     * What is in an instrument slot, asked without changing anything.
     *
     * CREATE INSTRUMENT is the cheaper probe and the one createNextFreeInstrument
     * uses, but it answers only yes or no, and it answers by *taking* the slot.
     * Reading the parameter block instead costs one round trip and comes back
     * with the name and size, which is what turns "instrument 3 is in use" into
     * a question a user can actually answer.
     *
     * The selected instrument is put back before returning, so this can be
     * called from anywhere without moving the rest of the page's idea of where
     * it is pointed.
     *
     * An unreadable block means either an empty slot or a synth that is not
     * listening, and those want very different responses from the caller. The
     * EPS says which by answering $05, Invalid Instrument, to a slot that is
     * merely empty; anything else — no answer at all, most often — leaves
     * `reachable` false and the caller should stop rather than assume the slot
     * is free and create over the top of a synth it cannot see.
     */
    /***
     * Marks a status code as an expected answer for as long as the returned
     * function has not been called, so the receive handler logs it instead of
     * reporting it as a fault.
     *
     * Asking an empty instrument slot for its parameter block is answered with
     * $05, Invalid Instrument. That is the answer the probe wants and the only
     * way to get it, but it arrives by the same path as a real refusal, so
     * without this every check of an empty slot put "Error: Invalid Instrument"
     * in front of the user immediately before telling them the slot was free.
     */
    expectStatus(codes){
        this.expected = new Set(codes)
        return () => { this.expected = null }
    }

    expecting(code){
        return this.expected != null && this.expected.has(code)
    }

    async inspectInstrument(number){
        const restore = this.instNum
        const done = this.expectStatus([0x05])
        this.setInstrumentNumber(number)
        try{
            const words = await this.getParamBlock(EPS16.BLOCK_INSTRUMENT)
            if(words.length == 0){
                const empty = this.lastStatusCode == 0x05
                this.debug(`Instrument ${number + 1}: ` + (empty ? "empty"
                    : `no answer (${this.statusText(this.lastStatusCode)})`))
                return { number, exists: false, reachable: empty,
                    status: this.lastStatusCode }
            }
            const inst = EPSBlocks.decodeInstrument(words)
            const found = {
                number, exists: true, reachable: true,
                name: inst.name,
                sizeBlocks: inst.sizeBlocks,
                layers: inst.layers.filter(l => l.exists).length,
                wavesamples: inst.wavesamples.filter(w => w.exists).length
            }
            this.debug(`Instrument ${number + 1}: "${found.name}", ${found.layers} layer(s), `
                + `${found.wavesamples} wavesample(s), ${found.sizeBlocks} blocks`)
            return found
        }finally{
            done()
            this.setInstrumentNumber(restore)
        }
    }

    /***
     * Leaves a fresh, empty instrument in the slot the user asked for, and that
     * slot selected.
     *
     * The alternative, and what the batch macros did before this, is to search
     * upwards for a free slot and use whatever turns up. That never destroys
     * anything, which is why it was the right default, but it means the user
     * cannot say where a sound should go and cannot tell where it went without
     * reading the log. Here the slot is the user's choice and the only way to
     * lose work is to be asked and to say yes.
     *
     * `confirm` is called only when the slot is occupied, is handed everything
     * inspectInstrument found, and returning false cancels the whole operation
     * — the caller gets `cancelled` and nothing has been sent. Overwriting is a
     * delete followed by a create rather than a create over the top, because
     * CREATE INSTRUMENT on an occupied slot is refused outright.
     */
    async claimInstrumentSlot(number, confirm = async () => false){
        const slot = Math.max(0, Math.min(EPS16.INSTRUMENT_COUNT - 1, number))
        const found = await this.inspectInstrument(slot)
        if(!found.exists && !found.reachable){
            const why = `Instrument ${slot + 1} could not be read `
                + `(${this.statusText(found.status)}), so nothing was sent. `
                + `Check the MIDI connection.`
            this.errorCallback(`Error: ${why}`)
            return { ok: false, instrument: slot, message: why }
        }
        if(found.exists){
            if(!await confirm(found)){
                this.debug(`Instrument ${slot + 1} kept; the upload was cancelled`)
                return { ok: false, cancelled: true, instrument: slot,
                    message: `Cancelled: instrument ${slot + 1} "${found.name}" was left alone.` }
            }
            this.debug(`Overwriting instrument ${slot + 1} "${found.name}" `
                + `(${found.sizeBlocks} blocks) at the user's request`)
            this.setInstrumentNumber(slot)
            if(!await this.deleteInstrument()){
                return { ok: false, instrument: slot,
                    message: `Instrument ${slot + 1} could not be deleted, so nothing was sent.` }
            }
            // The synth is not ready for the next command straight after one of
            // these; see createNextFreeInstrument's neighbours.
            await this.sleep(EPS16.RESTORE_SETTLE_MS)
        }
        this.setInstrumentNumber(slot)
        if(!await this.createInstrument()){
            return { ok: false, instrument: slot,
                message: `Instrument ${slot + 1} could not be created.` }
        }
        await this.sleep(EPS16.RESTORE_SETTLE_MS)
        this.debug(`Using instrument ${slot + 1}`)
        return { ok: true, instrument: slot, overwrote: found.exists ? found.name : null }
    }

    /***
     * The instrument acquisition step the batch macros share.
     *
     * Given a slot number it claims that slot, asking first if it is occupied.
     * Given nothing it does what it has always done and takes the next free one
     * searching upwards. Keeping both means the macros' numbering is unchanged
     * for every caller that does not opt in — which includes the librarian's
     * restore, where searching is still the right behaviour.
     */
    async acquireInstrument(options = {}, index = 0){
        const slots = options.slots
        if(!slots || slots[index] === undefined){
            EPS16.step(options, "finding a free instrument")
            return { ok: await this.createNextFreeInstrument(), instrument: this.instNum }
        }
        EPS16.step(options, `claiming instrument ${slots[index] + 1}`)
        return await this.claimInstrumentSlot(slots[index], options.confirmOverwrite)
    }

    /***
     * Says what a long macro is doing right now, for the status line.
     *
     * The percentage a transfer reports only covers the audio, which is most of
     * the time but none of the interesting parts: creating the instrument,
     * creating each layer and wavesample, and the settling pauses afterwards
     * all happen at 0% or at 100%, so a soundscape looked stalled twice per
     * layer. Static so it can be called without a live instance to hand and so
     * the absent-callback case reads as nothing rather than as a guard.
     */
    static step(options, what){
        if(options && typeof options.onStep == "function") options.onStep(what)
    }

    /*** step, for use inside an && chain: always true, so it reports without
     *  taking part in the decision. */
    stepping(options, what){
        EPS16.step(options, what)
        return true
    }

    async createNextFreeInstrument(){
        const start = Math.max(0, Math.min(EPS16.INSTRUMENT_COUNT - 1, this.instNum))
        for(let slot = start; slot < EPS16.INSTRUMENT_COUNT; slot++){
            this.setInstrumentNumber(slot)
            if(await this.createInstrument(null, true)) return true
        }
        this.errorCallback(`Error: No free instrument between ${start + 1} and `
            + `${EPS16.INSTRUMENT_COUNT}. Delete one on the EPS, or select a lower `
            + "instrument number to search from.")
        return false
    }
    async createLayer(name = null){
        const status = await this.sendCommand(this.createMIDIMessage(0x16),
            `create layer ${this.layerNum + 1}`)
        if(status == 0x00){
            this.successCallback("Success: Created layer")
            await this.nameAfterCreate(EPS16.BLOCK_LAYER, name)
            return true
        }
        this.errorCallback("Error: Unable to create layer: " + this.statusText(status))
        return false
    }
    /***
     * Makes sure the selected instrument, layer and wavesample all exist,
     * creating whatever is missing, so that an upload can just be pressed.
     *
     * Before this, uploading into an empty slot failed with whatever the first
     * command addressed to a thing that is not there happens to answer —
     * "Invalid Instrument", or worse, an upload that appears to work and lands
     * nowhere. The three Create buttons were the fix, and they required knowing
     * that the EPS needs an instrument before a layer and a layer before a
     * wavesample, which is knowledge about the synth rather than about the
     * sound anyone is trying to move.
     *
     * Only what is missing is created. An instrument that is already there is
     * left exactly as it is, including its other layers and wavesamples.
     *
     * THE WAVESAMPLE NUMBER MAY NOT BE THE ONE THAT WAS ASKED FOR. CREATE
     * WAVESAMPLE ignores the number in the command and assigns the next free
     * slot — the discovery that cost a week, written up in METHODS.md. So the
     * new one is created, the instrument is read back to see what appeared, and
     * that number is selected and reported. Asking for wavesample 5 in an empty
     * layer gets wavesample 1, and the caller is told so rather than left to
     * wonder why the sound is not where it was put.
     *
     * `names` supplies names for anything created; the wavesample is left
     * unnamed here because uploadWavToEPS names it from the editor at the end,
     * once the audio and every parameter are in place.
     */
    async prepareTarget(names = {}, progressCallback = () => {}){
        const wanted = (this.wsBytes[0] << 6) | this.wsBytes[1]
        const report = { ok: false, created: [], wavesample: wanted,
                         renumbered: false, message: "" }
        const say = (what) => { this.debug(`Preparing: ${what}`); progressCallback(what) }

        // --- the instrument --------------------------------------------------
        let words = await this.getParamBlock(EPS16.BLOCK_INSTRUMENT)
        if(words.length == 0){
            // Kept before anything else is sent, because CREATE INSTRUMENT is
            // about to overwrite it and this is the only clue to why the read
            // failed — an empty slot and an instrument in internal flash both
            // come back empty here, and only one of them can be fixed by
            // creating something.
            const why = this.statusText(this.lastStatusCode)
            say(`creating instrument ${this.instNum + 1}`)
            if(!await this.createInstrument(names.instrument)){
                report.message = `Instrument ${this.instNum + 1} could not be read `
                    + `(${why}) and a new one could not be created there either.`
                return report
            }
            report.created.push(`instrument ${this.instNum + 1}`)
            // The same settle the restore takes after CREATE INSTRUMENT: the
            // command that follows one is the command that gets ignored.
            await this.sleep(EPS16.RESTORE_SETTLE_MS)
            words = await this.getParamBlock(EPS16.BLOCK_INSTRUMENT)
            if(words.length == 0){
                report.message = `Created instrument ${this.instNum + 1} but could not `
                    + `read it back.`
                return report
            }
        }
        const instrument = EPSBlocks.decodeInstrument(words)

        // --- the layer -------------------------------------------------------
        let brought = null
        if(!instrument.layers.some(slot => slot.exists && slot.number == this.layerNum)){
            say(`creating layer ${this.layerNum + 1}`)
            const made = await this.createLayerConfirmed(this.layerNum,
                `create layer ${this.layerNum + 1}`)
            if(!made.ok){
                report.message = `Could not create layer ${this.layerNum + 1}: `
                    + `${made.reason}.`
                return report
            }
            report.created.push(`layer ${this.layerNum + 1}`)
            await this.nameAfterCreate(EPS16.BLOCK_LAYER, names.layer)
            // Section 4.3 says CREATE LAYER also produces a wavesample and the
            // hardware does it sometimes. When it has, that one is used rather
            // than making a second and leaving a spare behind to sound.
            brought = made.wavesample
        }

        // --- the wavesample --------------------------------------------------
        //
        // ASKED OF THE LAYER, NOT OF THE INSTRUMENT. The instrument's pointer
        // table is instrument-wide: wavesample 1 appearing in it says only that
        // some layer has a wavesample 1, not that this layer does. Checking
        // there instead let an upload into a freshly created second layer sail
        // past this step on the strength of a wavesample belonging to the
        // first, and then fail addressing a wavesample that layer has never
        // heard of.
        //
        // So the question is put the way the upload will put it: GET WAVESAMPLE
        // PARAMETERS for this layer and this number. An answer means it is
        // there and addressable, which is the whole of what needs to be true.
        if(brought !== null && brought !== undefined){
            this.setWavesampleNumber(brought)
            report.wavesample = brought
            report.created.push(`wavesample ${brought}`)
        }else if((await this.getParamBlock(EPS16.BLOCK_WAVESAMPLE)).length == 0){
            say("creating a wavesample")
            const result = await this.createAndIdentify(
                this.createMIDIMessage(EPS16.CMD_CREATE_WAVESAMPLE), "create wavesample")
            if(!result.ok){
                report.message = `Could not create a wavesample: ${result.reason}.`
                return report
            }
            this.setWavesampleNumber(result.number)
            report.wavesample = result.number
            report.created.push(`wavesample ${result.number}`)
        }

        report.ok = true
        report.renumbered = report.wavesample != wanted
        report.message = report.created.length == 0
            ? `Instrument ${this.instNum + 1}, layer ${this.layerNum + 1} and wavesample `
                + `${report.wavesample} were ready.`
            : `Prepared the EPS: created ${report.created.join(", ")}.`
        if(report.renumbered){
            report.message += ` The EPS numbers wavesamples itself, so this is `
                + `wavesample ${report.wavesample} rather than the ${wanted} that was `
                + `selected.`
        }
        return report
    }

    async createSqrWave(name = null){
        const status = await this.sendCommand(this.createMIDIMessage(0x19),
            "create wavesample")
        if(status == 0x00){
            this.successCallback("Success: Created SQR")
            await this.nameAfterCreate(EPS16.BLOCK_WAVESAMPLE, name)
            return true
        }
        this.errorCallback("Error: Unable to create SQR wavesample: "
            + this.statusText(status))
        return false
    }
    /***
     * Names something that has just been created, if a name was given. The
     * failure is reported but not fatal: the thing exists either way, and
     * saying "could not create" over a name that would not stick would be a
     * lie. Callers that create in a loop looking for a free slot pass nothing
     * and skip all of this.
     */
    async nameAfterCreate(kind, name){
        const clean = EPS16.sanitizeName(name)
        if(clean.length == 0) return true
        // The EPS has just allocated the block. Give it a moment before asking
        // to read it straight back.
        await this.sleep(300)
        if(await this.setBlockName(kind, clean)){
            this.successCallback(`Success: Named the ${kind.label} "${clean}"`)
            return true
        }
        return false
    }
    /***
     * Renames whatever is currently selected. Unlike naming at creation time,
     * an empty name here is a mistake worth pointing out rather than a silent
     * "leave it alone".
     */
    async rename(kind, name){
        const clean = EPS16.sanitizeName(name)
        if(clean.length == 0){
            this.errorCallback(`Error: Enter a name before renaming the ${kind.label}`)
            return false
        }
        this.previousBlockName = null
        if(await this.setBlockName(kind, clean)){
            const was = this.previousBlockName
            this.successCallback(`Success: Renamed the ${kind.label} `
                + (was ? `from "${was}" to "${clean}"` : `to "${clean}"`))
            return true
        }
        return false
    }
    async renameInstrument(name){ return await this.rename(EPS16.BLOCK_INSTRUMENT, name) }
    async renameLayer(name){ return await this.rename(EPS16.BLOCK_LAYER, name) }
    async renameWavesample(name){ return await this.rename(EPS16.BLOCK_WAVESAMPLE, name) }
    /***
     * Zeroes a wavesample's data from the start to its end offset.
     *
     * The end offset used to be computed, converted, and then dropped:
     * `data.concat(offsets)` returns a new array and the result was discarded,
     * so the command went out with a four byte start offset and no end offset
     * at all. Nothing on either page calls this yet, which is why it was never
     * noticed.
     *
     * Both offsets are four bytes, the same left justified form the other
     * wavedata commands use, hence the minimum length passed to the converter.
     */
    async clearWavesample(){
        const params = await this.getWavesampleParams()
        if(params.length == 0) return false
        const end = this.getEndOffset(params)
        const data = this.convertTo12BitMidi([0], 4)
            .concat(this.convertTo12BitMidi([end], 4))
        const status = await this.sendCommand(this.createMIDIMessage(0x1f, data),
            "clear wavesample")
        if(status == 0x00){
            this.successCallback("Success: Cleared wavesample")
            return true
        }
        this.errorCallback("Error: Unable to clear wavesample: " + this.statusText(status))
        return false
    }
    /***
     * Sends a command and returns the status the EPS answered with, or -1 for
     * silence. WAIT is followed through, per section 3.2, so the caller sees
     * the answer that came after it rather than the WAIT itself.
     */
    /***
     * Statuses that mean "you sent that too soon", for a command carrying no
     * data block.
     *
     * TRANSIENT_STATUS plus NAK. Section 5 defines NAK as "Something was wrong
     * with the last data transfer which could not be processed", which sounds
     * fatal, but section 3.1 gives it a second meaning: the receiver "should
     * send a response command with a negative acknowledge (NAK) status code if
     * another message is received during processing". For CREATE, DELETE and
     * COPY there is no data transfer to be wrong with, so only the second
     * meaning is available.
     *
     * This is what every remaining restore failure turned out to be. After a
     * wavesample's audio goes in, the next CREATE arrives while the EPS is
     * still working and is NAKed — at 4765 samples, at 2000, and at 65,536
     * alike, so it was never about size, numbering or memory. See
     * epswave-log-20260804--084716, --090628 and --091622, which fail
     * identically on three different instruments.
     */
    static BUSY_AFTER_COMMAND = [...EPS16.TRANSIENT_STATUS, 0x17]

    /***
     * Sends a command that carries no data, retrying while the EPS says it is
     * busy. Returns the final status.
     */
    async sendCommand(cmd, label){
        let status = await this.sendAndWait(cmd)
        for(let attempt = 1; attempt < EPS16.PARAM_BLOCK_ATTEMPTS
                && EPS16.BUSY_AFTER_COMMAND.includes(status); attempt++){
            this.debug(`EPS answered ${this.statusText(status)} to ${label}; retrying in `
                + `${EPS16.BUSY_RETRY_MS / 1000}s, attempt ${attempt + 1}`)
            await this.sleep(EPS16.BUSY_RETRY_MS)
            status = await this.sendAndWait(cmd)
        }
        return status
    }
    async sendAndWait(cmd, timeoutMs = EPS16.COMMAND_TIMER_MS){
        await this.sendData(cmd)
        let status = this.noteStatus(await this.readMessages(timeoutMs))
        if(status == 0x01){
            this.debug("EPS asked to wait; acknowledging")
            await this.sendAck()
            status = this.noteStatus(await this.readMessages(30000))
        }
        return status
    }
    async truncateWavesample(){
        const cmd = this.createMIDIMessage(0x1E)
        let status = await this.sendAndWait(cmd)
        // Same "not now" treatment as the parameter writes. Truncate is the
        // command immediately after the one that first showed this, so it is
        // the next thing that would fail for the same reason.
        for(let attempt = 1; attempt < EPS16.PARAM_BLOCK_ATTEMPTS
                && EPS16.TRANSIENT_STATUS.includes(status); attempt++){
            this.debug(`EPS answered ${this.statusText(status)} to truncate; retrying in `
                + `${EPS16.BUSY_RETRY_MS / 1000}s, attempt ${attempt + 1}`)
            await this.sleep(EPS16.BUSY_RETRY_MS)
            status = await this.sendAndWait(cmd)
        }
        if(status == 0x00){
            this.successCallback("Success: Truncated wavesample")
            return true
        }
        this.errorCallback(`Error: Unable to Truncate wavesample: ${this.statusText(status)}`)
        return false
    }
    async getWavesampleDataChunked(chunkSize, plotCallback){
        let wavedata = []
        const params = await this.getWavesampleParams()
        if(params.length == 0 ) return []
        const offset = this.getEndOffset(params)
        const size = Math.max(EPS16.MIN_CHUNK_SAMPLES,
            Math.min(EPS16.MAX_CHUNK_SAMPLES, chunkSize || this.chunkSize))
        // Walk to the end offset rather than looping a fixed number of times.
        // The old loop asked for one block past the end whenever the length was
        // an exact multiple of the block size, and it advanced by the requested
        // size even when the EPS returned fewer samples than that.
        while(wavedata.length < offset){
            const start = wavedata.length
            const end = Math.min(start + size, offset)
            /***
             * One chunk, with the same patience as everything else that talks
             * to this synth.
             *
             * A large wavesample is thousands of chunks and twenty minutes.
             * Without this, a single "Disk Access in Progress" nineteen minutes
             * in throws all of it away — and unlike a restore, there is nothing
             * to inspect afterwards to work out how far it got. The retry is
             * here rather than inside getWavesampleData because a chunk is the
             * unit that can be safely asked for again: it names its own start
             * and end, so a repeat is exactly the same request.
             */
            let wavePart = await this.getWavesampleData(start, end)
            for(let attempt = 1; attempt < EPS16.PARAM_BLOCK_ATTEMPTS
                    && wavePart.length == 0; attempt++){
                this.debug(`No answer for samples ${start}-${end}; retrying in `
                    + `${EPS16.BUSY_RETRY_MS / 1000}s, attempt ${attempt + 1}`)
                await this.sleep(EPS16.BUSY_RETRY_MS)
                wavePart = await this.getWavesampleData(start, end)
            }
            if(wavePart.length == 0){
                this.errorCallback(`Error: Download stopped at sample ${start} of ${offset}`)
                break
            }
            wavedata = wavedata.concat(wavePart)
            this.debug("WAVE", wavedata.length)

            plotCallback(wavedata, Math.min(100, Math.round((wavedata.length / offset) * 100)))
        }

        return wavedata
    }
    async getWavesampleData(start, end){
        let startOffset = this.convertTo12BitMidi([start],4)
        let endOffset = this.convertTo12BitMidi([end],4)
        let sampleOffsets = startOffset.concat(endOffset)
        let cmd = this.createMIDIMessage(0x06, sampleOffsets)
        await this.sendData(cmd)
        let responses = await this.readMessages()
        this.debug("#####################Responses", responses)
        for(let resp of responses){
            if(await this.isAck(resp)){
                // Section 8, step 3: the ACK has to reach the EPS inside its
                // two second timer, so do not dawdle here.
                await this.sleep(150)
                await this.sendAck()
                // The block itself is (end - start) * 3 bytes plus the frame,
                // so give it that long on top of the command timer.
                let messages = await this.readMessages(
                    EPS16.COMMAND_TIMER_MS + this.wireTime((end - start) * 3 + 5))
                this.debug("#####################", messages)
                for(let msg of messages){
                    if(msg.length > 4){
                        let waveData = this.convertFrom16BitMidi(msg)
                        for(let i=0; i<waveData.length; i++){
                            waveData[i] = this.convertToSignedInt(waveData[i]) 

                        }
                        this.successCallback("Success: Getting wavesample data from EPS")
                        return waveData
                    }
                }

            }
        }
        this.errorCallback("Error: Unable to get wavesample data from EPS")
        return []
    }
    /***
     * Turns the four six bit bytes of a parameter value back into a number.
     * Values are right justified in 24 bits and signed, per section 9.
     */
    decodeParameterValue(bytes){
        const word = ((bytes[0] & 0x3F) << 18) | ((bytes[1] & 0x3F) << 12)
            | ((bytes[2] & 0x3F) << 6) | (bytes[3] & 0x3F)
        return word >= 0x800000 ? word - 0x1000000 : word
    }
    /***
     * Asks the EPS for one parameter. The answer is an ACK followed by a PUT
     * PARAMETER message carrying the value inline.
     *
     * THE ANSWER MUST NOT BE ACKNOWLEDGED, which is worth stating because the
     * specification appears to say otherwise and I got this wrong once.
     *
     * Section 8's worked example ends with "if the data was successfully
     * received, the ACK status code should be sent", so an ACK was added here.
     * The synth disagrees: send one and it answers "Invalid Instrument", which
     * is what turned a clean connection test into a test plus an error. That
     * example is a WaveData transfer, a multi-message exchange where the ACK
     * keeps the next part coming. A parameter value arrives complete in one
     * message and there is nothing left to ask for.
     *
     * The problem the ACK was meant to fix — the command after a free memory
     * read being NAKed — was the EPS being busy, and is handled where it
     * belongs, in sendCommand.
     */
    /***
     * Reads the parameter that section 9 lists under this page and item.
     *
     * The one to use. getParameter below takes the two six bit halves of the
     * number already packed, which is a wire level detail nothing outside this
     * file should have to know, and getting it wrong is silent — see
     * parameterBytes.
     */
    async getParameterAt(page, item, timeoutMs = EPS16.COMMAND_TIMER_MS){
        const [hi, lo] = EPS16.parameterBytes(EPS16.parameterNumber(page, item))
        return this.getParameter(hi, lo, timeoutMs)
    }
    /*** Writes the parameter at this page and item. See getParameterAt. */
    async setParameterAt(page, item, value){
        const [hi, lo] = EPS16.parameterBytes(EPS16.parameterNumber(page, item))
        return this.setParameter(hi, lo, value)
    }
    /***
     * `page` and `item` here are the two six bit halves of the parameter
     * number, not the page and item from section 9. Kept because every existing
     * caller passes them that way; new code should use getParameterAt.
     */
    async getParameter(page, item, timeoutMs = EPS16.COMMAND_TIMER_MS){
        const cmd = this.createMIDIMessage(0x08, [page, item])
        await this.sendData(cmd)
        const messages = await this.readMessages(timeoutMs)
        const result = { answered: messages.length > 0, value: null, status: -1 }
        for(const msg of messages){
            const status = this.responseStatus(msg)
            if(status >= 0 && result.status < 0) result.status = status
            // PUT PARAMETER: command, instrument, layer and wavesample fields,
            // the page and item echoed back, then four bytes of value.
            if(msg.length >= 13 && msg[0] == 0x11){
                result.value = this.decodeParameterValue(msg.slice(9, 13))
            }
        }
        return result
    }
    /***
     * Checks that the EPS is reachable, without needing an instrument, a layer
     * or a wavesample to exist. Reports what it found rather than throwing, so
     * the caller can show the whole picture.
     */
    async ping(statusCallback = () => {}){
        const report = {
            ok: false, reachable: false, freeBlocks: null,
            channel: this.baseChannel, foundChannel: -1, status: -1, message: ""
        }
        if(!this.midiOutput || typeof this.midiOutput.send != 'function'){
            report.message = "No MIDI output is selected, so nothing can be sent."
            return report
        }
        if(!this.midiInput || typeof this.midiInput != 'object'){
            report.message = "No MIDI input is selected, so the EPS has no way to answer."
            return report
        }

        statusCallback(`Asking the EPS for its free memory on base channel ${this.baseChannel + 1} ...`)
        const answer = await this.getParameter(EPS16.PING_PAGE, EPS16.PING_ITEM)
        report.status = answer.status
        if(answer.answered){
            // Anything at all coming back proves the whole path: our message
            // reached the synth, sysex is switched on, it parsed the header,
            // and the return cable works. Even a refusal proves that.
            report.reachable = true
            if(answer.value !== null){
                report.ok = true
                report.freeBlocks = answer.value
                const samples = answer.value * EPS16.SAMPLES_PER_BLOCK
                report.message = `Connected. Sysex is on and working. Free memory `
                    + `${answer.value} blocks, about ${samples.toLocaleString()} samples `
                    + `(${Math.round(samples * 2 / 1024).toLocaleString()} KB).`
            }else if(answer.status >= 0){
                report.message = `The EPS answered, so sysex is on, but it declined the `
                    + `request: ${this.statusText(answer.status)}.`
            }else{
                report.message = "Something sent data back, but the reply was not "
                    + "the expected parameter value."
            }
            return report
        }

        // Silence has one cause that looks identical to a dead cable and is far
        // more common: the sysex header carries the base channel, and a synth
        // set to a different one ignores every message without complaint.
        statusCallback("No answer. Checking the other base channels ...")
        const found = await this.findBaseChannel(statusCallback)
        if(found >= 0){
            report.foundChannel = found
            report.reachable = true
            report.ok = true
            report.message = `The EPS is on base channel ${found + 1}, not `
                + `${report.channel + 1}. Switched to it.`
            return report
        }
        report.message = "No answer from the EPS on any base channel. Check that the MIDI "
            + "cables are the right way round, that both ports above are the ones the synth "
            + "is on, and that Edit / System-MIDI / Sysex-MIDI is set to ON."
        return report
    }
    /***
     * Tries every base channel and returns the one that answers, leaving it
     * selected. Restores the original if nothing does.
     */
    async findBaseChannel(statusCallback = () => {}){
        const original = this.baseChannel
        for(let channel=0; channel<16; channel++){
            if(channel == original) continue
            this.setBaseChannel(channel)
            this.debug(`Trying base channel ${channel + 1}`)
            statusCallback(`Trying base channel ${channel + 1} of 16 ...`)
            const answer = await this.getParameter(EPS16.PING_PAGE, EPS16.PING_ITEM, 700)
            if(answer.answered) return channel
        }
        this.setBaseChannel(original)
        return -1
    }
    setBaseChannel(channel){
        this.baseChannel = Math.max(0, Math.min(15, Math.floor(channel) || 0))
        return this.baseChannel
    }
    async setParameter(paramGroup, paramByte, paramValue){
        this.debug(`Setting Value ${paramValue.toString(16)}, ${paramValue} for group ${paramGroup.toString(16)}, ${paramByte.toString(16)}`)
        let header = [paramGroup, paramByte]
        // Section 9: parameter values are right justified in a 24 bit word.
        // Negatives therefore go as 24 bit two's complement. Passing one
        // straight through produced a negative MIDI byte, because
        // convertTo12BitMidi builds its bit string with toString(2), which
        // writes a minus sign rather than a sign bit. Nothing had used a
        // negative parameter until fine tune.
        const encoded = paramValue < 0 ? paramValue + 0x1000000 : paramValue
        let midiValue = this.convertTo12BitMidi([encoded],4)
        this.debug(`Converted 12 bit midi value is ${midiValue.map(val => val.toString(16))}`)
        let msg = header.concat(midiValue)
        let cmd = this.createMIDIMessage(0x11,msg)
        this.debug("Set Parameter", cmd)
        // The spec notes that PUT PARAMETER only answers when the parameter
        // number or value is wrong, so this usually times out. Keep it short:
        // it exists to pace the command, to drain an error response before it
        // can be mistaken for the answer to the next command, and to report
        // whether the value was accepted.
        let status = await this.sendAndWait(cmd, 300)
        // "Not now" rather than "not this": send the identical command again
        // after a pause. This is the only recovery the EPS offers for an
        // overlay it has to fetch, and it is what broke a restore of the one
        // instrument large enough to evict one.
        for(let attempt = 1; attempt < EPS16.PARAM_BLOCK_ATTEMPTS
                && EPS16.TRANSIENT_STATUS.includes(status); attempt++){
            this.debug(`EPS answered ${this.statusText(status)} to parameter `
                + `${paramGroup.toString(16)}/${paramByte.toString(16)}; retrying in `
                + `${EPS16.BUSY_RETRY_MS / 1000}s, attempt ${attempt + 1}`)
            await this.sleep(EPS16.BUSY_RETRY_MS)
            status = await this.sendAndWait(cmd, 300)
        }
        // Silence means accepted. ACK is not an error either, and WAIT has
        // already been followed through by sendAndWait: section 3.2 requires it
        // to be acknowledged and waited out, and treating it as success is what
        // made a restore fire commands into a machine that had asked for time
        // and then NAKed everything. See epswave-log-20260803--134217.
        if(status > 0x01){
            this.errorCallback(`Error: The EPS refused parameter `
                + `${paramGroup.toString(16)}/${paramByte.toString(16)} = ${paramValue}: `
                + `${this.statusText(status)}`)
            return false
        }
        return true
    }
    async putWavesampleDataInChunks(audio, chunkSize, numWaves=1, waveIndex=0, progressCallback=()=>{}){
        this.debug("Total Size: ", audio.length)
        let size = Math.max(EPS16.MIN_CHUNK_SAMPLES,
            Math.min(EPS16.MAX_CHUNK_SAMPLES, chunkSize || this.chunkSize))
        let start = 0
        while(start < audio.length){
            let length = Math.min(size, audio.length - start)
            let chunk = audio.slice(start, start + length)
            let sent = await this.putWavesampleData(chunk, start)
            let attempts = 1
            while(!sent && attempts < EPS16.MAX_CHUNK_ATTEMPTS){
                // Let the EPS finish giving up on the refused block before
                // offering another one. What happens next depends on why it was
                // refused: a busy machine wants time, a block that arrived too
                // slowly wants to be smaller.
                const busy = EPS16.TRANSIENT_STATUS.includes(this.lastStatusCode)
                await this.sleep(busy ? 2500 : 1500)
                if(busy){
                    this.debug("EPS was busy, offering the same block again")
                }else if(size > EPS16.MIN_CHUNK_SAMPLES){
                    size = Math.max(EPS16.MIN_CHUNK_SAMPLES, Math.floor(size / 2))
                    this.debug("Block refused, retrying with", size, "samples per block")
                }
                length = Math.min(size, audio.length - start)
                chunk = audio.slice(start, start + length)
                sent = await this.putWavesampleData(chunk, start)
                attempts++
            }
            if(!sent){
                this.errorCallback("Error: Unable to upload a portion of the wavesample"
                    + ` (stopped at sample ${start} of ${audio.length})`)
                return false
            }
            start += length
            this.debug("Percent Complete:", (start / audio.length) * 100)
            // A number, not a string of one. It used to be interpolated into a
            // template for no reason, which every caller that only displayed it
            // got away with and the progress bar did not: a bar has to do
            // arithmetic with it, and "43" is not 43.
            progressCallback(
                Math.round((waveIndex + (start / audio.length)) / numWaves * 100))
        }
        // The transfer ends with the EPS acknowledging the last block; section 8
        // has nothing after that. Two unsolicited ACKs used to be sent here, and
        // the EPS answered both with errors because nothing was pending, which
        // put a spurious "Disk Access in Progress" and "NAK" in the log at the
        // end of every otherwise perfect upload.
        this.successCallback(`Success: Sent ${audio.length} samples to the EPS`)
        await this.sleep(1000)
        await this.setParameter(0x20, 0x18, audio.length)
        return true

    }
    /***
     * Status code carried by a response command, or -1 if this is not one.
     */
    /***
     * The status code out of a response message, and what to do when the synth
     * sends one the specification does not allow.
     *
     * Section 4.1 gives a response as the command byte `01` followed by two
     * bytes: "Status Code hi byte, (always 0)" and the lo byte. The hi byte was
     * simply ignored here, and a real EPS-16 PLUS does not always send 0 in it.
     * Asked for an instrument that had been loaded from the machine's internal
     * flash, one answered `F0 0F 03 00 01 36 16 F7` — hi byte `36`. Reading
     * only the lo byte turned that into `16`, "Loop is too long", which is a
     * real code and completely misleading: the command was GET INSTRUMENT and
     * no loop was involved.
     *
     * Confirmed since: an instrument in internal flash cannot be read over MIDI
     * at all, and cannot be edited on the synth either. It has to be copied to
     * floppy or SCSI and loaded from there. statusText says so.
     *
     * So a non-zero hi byte is kept, folded into the returned value at a
     * magnitude no documented code can reach — section 5 runs to `1E` — which
     * means every existing `status != 0x00` test treats it as the failure it
     * is, and statusText can say plainly that it is not in the table rather
     * than naming the wrong fault.
     */
    responseStatus(message){
        if(typeof message == 'undefined' || message.length != 3 || message[0] != 1) return -1
        return message[1] == 0 ? message[2] : (message[1] << 8) | message[2]
    }
    /***
     * Plain text for a status code, borrowing the table used for logging.
     */
    statusText(code){
        if(code < 0) return "no response"
        /***
         * A status the specification does not describe.
         *
         * Named as such, with both bytes, because the alternative is
         * confidently reporting whatever the lo byte happens to collide with —
         * see responseStatus, where reading only the lo byte of `36 16` gave
         * "Loop is too long" for a GET INSTRUMENT.
         *
         * WHAT IT MEANS IS NOW KNOWN, at least for the case that produced it.
         * An instrument sitting in the machine's internal flash cannot be read
         * over MIDI at all, and cannot be edited on the synth either; it has to
         * be copied to floppy or SCSI and loaded from there first. That was
         * established on hardware rather than from the document, so the advice
         * is offered as the likely cause rather than stated as the meaning of
         * the code — no other undocumented status has been seen, and if one
         * turns up this message would otherwise send its finder the wrong way.
         */
        if(code > 0xFF){
            return `undocumented status ${((code >> 8) & 0xFF).toString(16).padStart(2, "0")} `
                + `${(code & 0xFF).toString(16).padStart(2, "0")} (section 4.1 says the hi byte `
                + `is always 0). This may indicate that your instrument is stored on the `
                + `internal flash memory; please offload it to floppy or SCSI first, reload, `
                + `and try again.`
        }
        return this.getResponseMessage([0x01, 0x00, code])
            .replace(/^(Error|INFO|SUCCESS): /, '')
    }
    /***
     * Records the status of whatever the EPS answered with, so the retry logic
     * can tell a block it disliked from a machine that was merely busy.
     */
    noteStatus(messages){
        this.lastStatusCode = -1
        for(let msg of messages){
            const status = this.responseStatus(msg)
            if(status >= 0){
                this.lastStatusCode = status
                return status
            }
        }
        return -1
    }
    async putWavesampleData(audio, start=0){
        this.debug("OFFSETS", start, audio.length, audio.length + start)
        let midiData = this.convertTo16BitMidi(audio)
        let startOffset = this.convertTo12BitMidi([start], 4)
        let endOffset = this.convertTo12BitMidi([audio.length + start], 4)
        let sampleOffsets = startOffset.concat(endOffset)
        let cmd = this.createMIDIMessage(0x0f,sampleOffsets)
        //send offset command (PUT WAVESAMPLE DATA, part one)
        await this.sendData(cmd)
        let messages = await this.readMessages()
        this.noteStatus(messages)
        if(messages.length == 0){
            this.errorCallback("Error: Unable to initiate pushing a wavesample to the the EPS"
                + " (no response to the data range command)")
            return false
        }
        let accepted = false
        for(let msg of messages){
            if(await this.isAck(msg)){
                accepted = true
                break
            }
        }
        if(!accepted){
            this.errorCallback(`Error: The EPS would not take the data range ${start} to `
                + `${start + audio.length}: ${this.statusText(this.lastStatusCode)}`
                + (EPS16.TRANSIENT_STATUS.includes(this.lastStatusCode) ? ", retrying" : ""))
            return false
        }
        // Part two: the block of samples. sendData holds for the wire time, so
        // the response window below starts once the EPS has the whole block.
        const started = Date.now()
        await this.sendData(midiData)
        let responses = await this.readMessages(EPS16.COMMAND_TIMER_MS + 1000)
        this.transferStats.dataBytes += midiData.length + 5
        this.transferStats.dataMs += Date.now() - started
        this.noteStatus(responses)
        if(responses.length == 0){
            // Silence is a failure. Reporting success here meant a block that
            // never landed still counted as written, which is how a transfer
            // could finish cleanly and still play back corrupted.
            this.errorCallback(`Error: No response after sending ${audio.length} samples`
                + ` at offset ${start}. Try a smaller block size.`)
            return false
        }
        for(let resp of responses){
            if(await this.isAck(resp)){
                // Per block, so it goes to the debug log rather than the event
                // log: a full length upload is two thousand blocks and would
                // push everything else out of a capped log.
                this.debug(`Sent samples ${start} to ${start + audio.length}`)
                return true
            }
        }
        this.errorCallback(`Error: The EPS refused a block of ${audio.length} samples at offset `
            + `${start}: ${this.statusText(this.lastStatusCode)}`
            + (this.lastStatusCode == 0x17
                ? ". A NAK here usually means the block took longer than 2 seconds to arrive;"
                    + " reduce the block size."
                : ""))
        return false


    }

    /***
     * The audio half of uploadWavToEPS, with nothing else attached.
     *
     * A restore writes the entire wavesample parameter block afterwards, so
     * every setting uploadWavToEPS establishes on the way in — loop mode, loop
     * position, loop start, sample start, and afterwards the rate, root key,
     * tuning and name — is overwritten a minute later. Sending them is not
     * merely wasted, it is five more commands that can fail.
     *
     * And they do. On hardware, the first of them, "set loop mode to forward",
     * came back "Insert System Disk" ($02) on the second wavesample of an
     * instrument, immediately after the first wavesample's 65,536 samples had
     * gone in, and everything addressed to that wavesample failed from then on.
     * The EPS-16 PLUS loads parts of its operating system from disk on demand,
     * and the most likely reading is that the large allocation evicted whatever
     * the loop mode editor needs. Not proven — but the command is unnecessary
     * here, and the cheapest fix for a command that fails is not to send it.
     *
     * Sample end is the one that has to be set. It is what makes TRUNCATE throw
     * away the single cycle square wave that CREATE WAVESAMPLE supplies, so the
     * real audio is not appended to it.
     */
    async uploadWavesampleAudio(audio, progressCallback = () => {}){
        // Clearing the square wave first is preferred but not required, and on
        // hardware it is sometimes not possible. On the second wavesample of an
        // instrument the EPS answered "Insert System Disk" to this parameter
        // write five times over fifteen seconds and never recovered, while the
        // identical write to the first wavesample had gone through moments
        // earlier. See epswave-log-20260804--095312.
        //
        // So it is attempted and then let go. A wavesample straight from CREATE
        // WAVESAMPLE holds a single cycle square wave, a few hundred bytes at
        // most, and the upload writes from offset 0 and grows the wavesample as
        // it goes — the same growth that happens after a truncate to one
        // sample. Whatever the square wave occupied is overwritten by the first
        // chunk. The sample end is set from the saved parameter block at the
        // end of the restore either way, so nothing downstream depends on this.
        let cleared = false
        if(await this.setParameter(0x20, 0x16, 1)){
            cleared = await this.truncateWavesample()
        }
        if(!cleared){
            this.successCallback("Note: Could not clear the new wavesample first, so the "
                + "audio is being written over it. This is expected to be harmless.")
        }
        return await this.putWavesampleDataInChunks(audio, this.chunkSize, 1, 0, progressCallback)
    }
    async uploadWavToEPS(audio, numWaves=1, waveIndex=0, progressCallback=()=>{}, sampleRate=0, rootKey=0, fineTune=null, name=null){
        await this.setParameter(0x20, 0x00, 2) // set loop forward
        await this.setParameter(0x20, 0x19, 0) // set loop pos
        await this.setParameter(0x20, 0x17, 0) // set loop start
        //await this.setParameter(0x20, 0x18, 1) // set loop end
        await this.setParameter(0x20, 0x15, 0) // set sample start
        await this.setParameter(0x20, 0x16, 1) // set sample end

        if(await this.truncateWavesample() && await this.putWavesampleDataInChunks(audio, this.chunkSize, numWaves, waveIndex, progressCallback)){
            // Last, so that a rate the EPS dislikes cannot disturb the transfer
            // itself. The data is already in by this point.
            if(sampleRate > 0){
                const actual = await this.setSampleRate(sampleRate)
                this.successCallback(`Success: Sample rate set to ${(actual/1000).toFixed(1)} kHz`)
            }
            if(rootKey > 0){
                const key = await this.setRootKey(rootKey)
                this.successCallback(`Success: Root key set to ${WaveGen.noteToName(key)} (${key})`)
            }
            if(typeof fineTune == 'number'){
                const cents = await this.setFineTune(fineTune)
                this.successCallback(`Success: Fine tune set to ${cents > 0 ? '+' : ''}${cents} cents`)
            }
            // Last of all: naming reads the parameter block back and returns it
            // whole, so everything above has to be in place first.
            const clean = EPS16.sanitizeName(name)
            if(clean.length > 0 && await this.setWavesampleName(clean)){
                this.successCallback(`Success: Wavesample named "${clean}"`)
            }
            //this.sendAck()
            return true
        }else{
            return false
        }
    }
    /**
     * Utility Commands for midi data coversions
     */
    convertToSignedInt(data){
        if(data > 32767) {data = data - 65536;}
        return data
    }
    /***
     * A mono 16 bit WAV, as an ArrayBuffer.
     *
     * Static and free of the DOM so that it can be tested without a browser,
     * and so the librarian can hand it whole wavesamples pulled out of a disk
     * image. saveFile below wraps it for the download.
     *
     * Originally from Recorder.js, https://github.com/mattdiamond/Recorderjs
     */
    static encodeWav(samples, sampleRate=44100){
        let buffer = new ArrayBuffer(44 + samples.length * 2);
        let view = new DataView(buffer);
        EPS16.writeWavHeader(view, samples.length, sampleRate)
        let offset = 44
        for(let i=0; i<samples.length; i++, offset +=2){
            view.setInt16(offset, samples[i], true)
        }
        return buffer
    }
    static writeWavHeader(view, sampleCount, sampleRate){
        const writeString = (at, string) => {
            for(let i=0; i<string.length; i++) view.setUint8(at + i, string.charCodeAt(i))
        }
        /* RIFF identifier */
        writeString(0, 'RIFF');
        /* RIFF chunk length */
        view.setUint32(4, 36 + sampleCount * 2, true);
        /* RIFF type */
        writeString(8, 'WAVE');
        /* format chunk identifier */
        writeString(12, 'fmt ');
        /* format chunk length */
        view.setUint32(16, 16, true);
        /* sample format (raw) */
        view.setUint16(20, 1, true);
        /* channel count */
        view.setUint16(22, 1, true);
        /* sample rate */
        view.setUint32(24, sampleRate, true);
        /* byte rate (sample rate * block align) */
        view.setUint32(28, sampleRate * 2, true);
        /* block align (channel count * bytes per sample) */
        view.setUint16(32, 1 * 2, true);
        /* bits per sample */
        view.setUint16(34, 16, true);
        /* data chunk identifier */
        writeString(36, 'data');
        /* data chunk length */
        view.setUint32(40, sampleCount * 2, true);
    }
    /***
     * Saves samples as a WAV. The name is optional and used to be "output.wav"
     * for everything, which is unhelpful the moment you save two.
     */
    saveFile(samples, sampleRate=44100, name="output.wav"){
        const blob = new Blob([EPS16.encodeWav(samples, sampleRate)], {type: 'audio/x-wav'})
        // Routed through the shared helper, which appends the anchor to the
        // document before clicking it and revokes the URL afterwards. Firefox
        // ignores a click on a detached anchor, so the old version of this
        // silently did nothing there.
        EPSWaveUI.download(blob, 'audio/x-wav', name)
    }
    readTag(view, offset){
        return String.fromCharCode(
            view.getUint8(offset), view.getUint8(offset + 1),
            view.getUint8(offset + 2), view.getUint8(offset + 3))
    }
    /***
     * Reads a mono 16 bit WAV file.
     *
     * Returns {audio, sampleRate, available, truncated} or null if the file
     * cannot be used. Oversized files are truncated rather than refused, so a
     * long recording can be brought in and trimmed down in the editor.
     */
    parseWavFile(buffer){
        const reject = (message, popup) => {
            this.errorCallback(`Error: ${message}`)
            alert(popup || message)
            return null
        }
        const view = new DataView(buffer)
        if(buffer.byteLength < 12 || this.readTag(view, 0) != "RIFF" || this.readTag(view, 8) != "WAVE"){
            return reject("Not a RIFF/WAVE file", "Not a WAV file")
        }

        // Walk the chunk list rather than assuming audio starts at byte 44.
        // Files carrying LIST/INFO metadata put other chunks ahead of the data,
        // and reading from a fixed offset turns those bytes into a burst of
        // noise at the start and shifts everything after it.
        let format = null
        let dataStart = -1
        let dataBytes = 0
        let offset = 12
        while(offset + 8 <= buffer.byteLength){
            const tag = this.readTag(view, offset)
            const size = view.getUint32(offset + 4, true)
            const body = offset + 8
            if(tag == "fmt " && size >= 16 && body + 16 <= buffer.byteLength){
                format = {
                    encoding: view.getUint16(body, true),
                    channels: view.getUint16(body + 2, true),
                    sampleRate: view.getUint32(body + 4, true),
                    bits: view.getUint16(body + 14, true)
                }
            }else if(tag == "data"){
                dataStart = body
                // Trust the file's real length over the header, so a truncated
                // file cannot make us read past the end of the buffer.
                dataBytes = Math.max(0, Math.min(size, buffer.byteLength - body))
            }
            // Chunks are padded to an even length. This always advances by at
            // least 8, so a corrupt size cannot spin the loop.
            offset = body + size + (size % 2)
        }

        if(!format) return reject("WAV file has no fmt chunk", "Not a valid WAV file")
        if(dataStart < 0) return reject("WAV file has no data chunk", "Not a valid WAV file")
        // 1 is PCM, 0xFFFE is extensible, which is still PCM for our purposes.
        if(format.encoding != 1 && format.encoding != 0xFFFE){
            return reject("Only uncompressed PCM WAV files are supported", "Only PCM files allowed")
        }
        if(format.bits != 16) return reject("Only 16 bit WAV files are supported", "Only 16 bit files allowed")
        if(format.channels != 1) return reject("Only mono WAV files are supported", "Only Mono Files allowed")

        const available = Math.floor(dataBytes / 2)
        const length = Math.min(available, EPS16.MAX_IMPORT_SAMPLES)
        const audio = []
        let position = dataStart
        for(let i=0; i<length; i++, position += 2){
            audio.push(view.getInt16(position, true))
        }
        return {
            audio: audio,
            sampleRate: format.sampleRate,
            available: available,
            truncated: available > length
        }
    }
    async isAck(message){
        // Section 4.1: a response command is exactly three bytes once the sysex
        // frame is off, 01 followed by the two byte status code. Anything
        // longer is a data block, which must never be mistaken for an ACK just
        // because it happens to start with 1 and end with 0.
        if(typeof message == 'undefined' || message.length != 3 || message[0] != 1) return false
        // The hi byte has to be zero for this to be a status at all: see
        // responseStatus. Without this test a response of 36 00 counts as an
        // ACK on the strength of its lo byte.
        if(message[1] != 0) return false
        const status = message[message.length-1]
        if(status == 0x01){ /// WAIT message
            // Section 3.2: acknowledge the WAIT, restart the command timer with
            // a thirty second value, and listen again. The old code neither
            // sent the ACK nor awaited the sleep, so WAIT mode never worked.
            this.debug("INFO: WAIT received, acknowledging and waiting up to 30 seconds")
            await this.sendAck()
            let messages = await this.readMessages(30000)
            for(let msg of messages){
                // Sequential, not a reduce over promises: `acc || this.isAck()`
                // ORs a Promise, which is always truthy, so every message used
                // to count as an ACK once a WAIT had been seen.
                if(await this.isAck(msg)) return true
            }
            return false
        }
        return status == 0x00 /// ACK message
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /***
     * Logging hooks
     */
    setMidiCallback(callback){
        this.midiCallback = callback
    }
    setDebugCallback(callback){
        this.debugCallback = callback
    }
    /***
     * Goes to the browser console always, and to the event log only when debug
     * output is switched on there.
     */
    debug(...parts){
        console.log(...parts)
        this.debugCallback(parts.map(part => this.describe(part)).join(" "))
    }
    describe(value){
        if(typeof value == 'string') return value
        if(Array.isArray(value) || ArrayBuffer.isView(value)){
            return `[${Array.from(value).join(", ")}]`
        }
        return String(value)
    }
    /***
     * Waits for the receiver to answer and returns everything that arrived, in
     * the order it arrived. This returns as soon as the reply lands, so a
     * generous default costs nothing: it is only paid when the EPS stays quiet,
     * and operations like truncating a long wavesample can take a while to
     * answer. Callers waiting on a block of sample data pass a window that also
     * covers the wire time.
     */
    async readMessages(timeoutMs = 4000){
        let readMessages = []
        const startTime = Date.now()
        while(this.midiMessages.length == 0 && (Date.now() - startTime) < timeoutMs){
            await this.sleep(10)
        }
        // A command can be answered by more than one message (a WAIT followed
        // by an ACK), so let a short burst settle rather than returning the
        // instant the first one lands.
        if(this.midiMessages.length > 0) await this.sleep(30)
        while(this.midiMessages.length > 0){
            // shift, not pop: responses have to come back in the order the EPS
            // sent them, otherwise a NAK can be read ahead of the ACK it
            // followed and the wrong one wins.
            const msg = this.midiMessages.shift()
            const striped = this.stripSysexHeader(msg)
            readMessages.push(striped)
        }
        return readMessages
    }
    onMIDIFailure() {
        alert('Could not access your MIDI devices.');
    }
    stripSysexHeader(message){
        let sliced = message.slice(4,message.length -1)
        return sliced
    }
    setInput(value){
        this.input = value
        this.midiInput = this.inputs.find((input) => input.name == this.input)
        this.midiInput.onmidimessage = (midiMessage) => {
            console.log("Received <-", midiMessage.data)
            this.midiCallback("<-", midiMessage.data)
            if(midiMessage.data[0] == 0xF0){ //Sysex Data
                this.midiMessages.push(midiMessage.data)
            }
            // A response command is the whole packet: frame, 01, and a two byte
            // status code. Testing data[4] alone also matched blocks of sample
            // data whose first byte happened to be 01, which logged invented
            // errors during a download.
            if(midiMessage.data.length == 8 && midiMessage.data[4] == 0x1){
                const stripped = this.stripSysexHeader(midiMessage.data)
                let message = this.getResponseMessage(stripped)
                // A refusal that was asked for is not a fault. Probing an empty
                // instrument slot answers $05, Invalid Instrument, which is the
                // whole point of the probe and not something to put in front of
                // the user in red; see expectStatus.
                const code = stripped.length == 3 && stripped[1] == 0 ? stripped[2] : -1
                if(message.indexOf("Error") != -1 && !this.expecting(code)){
                    this.errorCallback(message)
                }
                this.debug(this.expecting(code) ? `${message} (expected)` : message)
            }
        }
    }
    setOutput(value){
        this.output = value
        this.midiOutput = this.outputs.find((output) => output.name == this.output)
    }
    async sendData(message){
        if(!this.midiOutput || typeof this.midiOutput.send != 'function'){
            this.errorCallback("Error: No MIDI output selected, cannot send to the EPS16+")
            return false
        }
        let packet = [
            0xF0,
            0x0F,
            0x03,
            this.baseChannel & 0x0F
        ]
        packet = packet.concat(message)
        packet.push(0xf7)
        console.log("Send ->", packet)
        this.midiCallback("->", packet)
        // Anything still sitting in the queue belongs to a command that has
        // already been answered and read, so it can only confuse the response
        // to this one. A stale ACK is worse than no ACK: it makes a block that
        // was never accepted look like it was.
        this.midiMessages.length = 0
        this.midiOutput.send(packet)
        // send() only queues the bytes, it does not wait for them to go out.
        // Hold for the time the packet needs on the wire so callers start
        // listening for a response once the EPS has actually seen the message,
        // not while it is still arriving.
        await this.sleep(this.wireTime(packet.length) + 40)

    }
    /***
     * Milliseconds a packet of this many bytes occupies the MIDI wire.
     */
    wireTime(bytes){
        return Math.ceil(bytes / EPS16.MIDI_BYTES_PER_MS)
    }
    /***
     * Largest block, in samples, that still fits inside the EPS's two second
     * command timer at the given throughput, with a safety factor of two.
     */
    chunkSizeFor(bytesPerSecond){
        const budget = (bytesPerSecond * EPS16.COMMAND_TIMER_MS / 1000) / 2
        return Math.max(EPS16.MIN_CHUNK_SAMPLES,
            Math.min(EPS16.MAX_CHUNK_SAMPLES, Math.floor((budget - 5) / 3)))
    }
    setChunkSize(samples){
        this.chunkSize = Math.max(EPS16.MIN_CHUNK_SAMPLES,
            Math.min(EPS16.MAX_CHUNK_SAMPLES, Math.floor(samples) || EPS16.DEFAULT_CHUNK_SAMPLES))
        return this.chunkSize
    }
    createMIDIMessage(command, data=[]){
        let header = [
            command,
            0x00,
            this.instNum,
            0x00,
            this.layerNum,
        ].concat(this.wsBytes)
        let msg = header.concat(data)
        return msg
    }
    getResponseMessage(message){
        const code = message[2]
        switch(code){
            case 0x00: return "SUCCESS: ACK"
            case 0x01: return "INFO: WAIT" 
            case 0x02: return "Error: Insert System Disk"
            case 0x03: return "Error: Invalid Param Number"
            case 0x04: return "Error: Invalid Param Value"
            case 0x05: return "Error: Invalid Instrument"
            case 0x06: return "Error: Invalid Layer"
            case 0x07: return "Error: Layer In Use"
            case 0x08: return "Error: Invalid Wavesample"
            case 0x09: return "Error: Wavesample in Use"
            case 0x0a: return "Error: Invalid Wavesammple data range"
            case 0x0b: return "Error: File Not Found"
            case 0x0c: return "Error: Memory Full"
            case 0x0d: return "Error: Instrument in Use"
            case 0x0e: return "Error: No More Layers"
            case 0x0f: return "Error: No More Samples"
            case 0x10: return "Error: reserved"
            case 0x11: return "Error: Wavesample is a copy"
            case 0x12: return "Error: Zone Too Big"
            case 0x13: return "Error: Sequencer Must Be Stopped"
            case 0x14: return "Error: Disk Access in Progress"
            case 0x15: return "Error: Disk Full"
            case 0x16: return "Error: Loop is too long"
            case 0x17: return "Error: NAK"
            case 0x18: return "Error: No Layer To Edit"
            case 0x19: return "Error: No More Pitch Tables"
            case 0x1a: return "Error: Cross Fade length is zero"
            case 0x1b: return "Error: Cross Fade Length is greater than 50%"
            case 0x1c: return "Error: Loop Start is to close to sample start"
            case 0x1d: return "Error: Loop End is to close to sample end"
            case 0x1e: return "Error: Quiet Layer"
            default: return "Unknown!"
        }
    }

    convertTo12BitMidi(data, minSize=2){
        let binString = ''
        for( let byte of data){

            binString += byte.toString(2).padStart(16,0)
        }
        let stop = binString.length/6
        let midiArray = []
        for(let i=0; i<stop; i++){
            let last6Bits = binString.substring(binString.length - 6, binString.length)
            if(binString.length < 6 && parseInt(last6Bits,2) == 0){
                continue
            }else{
                binString = binString.substring(0, binString.length -6)
                midiArray.push(parseInt(last6Bits,2))
            }
        }
        while(midiArray.length < minSize){
            midiArray.push(0)
        }
        midiArray.reverse()
        return midiArray
        
    }
    convertTo16BitMidi(data){
        // Copy rather than adding the bias in place, otherwise the caller's
        // wavesample is corrupted and cannot be uploaded a second time.
        let biased = new Array(data.length)
        for(let i=0; i<data.length;i++){
            biased[i] = data[i] +2**16
        }
        let midiArray=[]
        for(let byte of biased){
            let byte3 = byte & 0x003F
            let byte2 = (byte & 0x00C0) >> 6
            byte2 = (byte & 0x0F00) >> 6 | byte2
            let byte1 = (byte & 0xF000) >> 12
            midiArray.push(byte1)
            midiArray.push(byte2)
            midiArray.push(byte3)
        }
        return midiArray
    }
    convertFrom16BitMidi(data){
        let midiArray=[]
        for(let i=0; i< data.length; i=i+3){
            const word = (data[i]&0x0F) << 12  |  (data[i+1]&0x3F) << 6  | data[i+2] &0x3F
            midiArray.push(word)
        }
        return midiArray
    }
    getEndOffset(bit16Params){
        let word1 = bit16Params[119] << 16
        let word2 = bit16Params[120] << 8
        let word3 = bit16Params[121]
        let word4 = bit16Params[122] >> 8
        let offset = (word1 | word2 |  word3 | word4) >> 9
        this.debug("OFFSET", offset)
        return offset
    }
    /***
     * Pulls the sample rate out of a parameter dump and remembers it. Word 131
     * carries the value in the high byte, the same convention as the offset
     * words either side of it.
     */
    readSampleRate(bit16Params){
        const code = (bit16Params[EPS16.SAMPLE_RATE_WORD] >> 8) & 0x7F
        if(code < WaveGen.RATE_CODE_MIN || code > WaveGen.RATE_CODE_MAX){
            this.debug("Sample rate code out of range:", code)
            return 0
        }
        this.lastSampleRateCode = code
        this.lastSampleRate = WaveGen.rateFromCode(code)
        this.debug(`Sample rate code ${code} = ${this.lastSampleRate} Hz`)
        return this.lastSampleRate
    }
    /***
     * Writes the sample rate of the selected wavesample. The rate is quantised
     * to what the hardware can represent, so the caller gets back the rate that
     * was actually set rather than the one it asked for.
     */
    async setSampleRate(hz){
        const code = WaveGen.codeForRate(hz)
        const actual = WaveGen.rateFromCode(code)
        this.debug(`Setting sample rate to ${actual} Hz (code ${code})`)
        await this.setParameter(0x20, EPS16.SAMPLE_RATE_PARAM, code)
        return actual
    }
    /***
     * Reads the rate back off the synth. Used to confirm that a write landed,
     * since the EPS answers a PUT PARAMETER only when it rejects one.
     */
    /***
     * Reads the root key out of a parameter dump. Only the high byte of word 80
     * belongs to it; the low byte is the crossfade fadecurve and is left alone.
     */
    readRootKey(bit16Params){
        const note = (bit16Params[EPS16.ROOT_KEY_WORD] >> 8) & 0x7F
        this.lastRootKey = note
        this.debug(`Root key ${note}`)
        return note
    }
    /***
     * Writes the root key of the selected wavesample: the MIDI note at which it
     * plays back at the pitch it was recorded or generated at.
     */
    async setRootKey(note){
        const key = Math.max(0, Math.min(127, Math.round(note)))
        this.debug(`Setting root key to ${key}`)
        await this.setParameter(EPS16.ROOT_KEY_PAGE, EPS16.ROOT_KEY_PARAM, key)
        return key
    }
    /***
     * Reads fine tune out of a parameter dump. See FINE_TUNE_WORD: the block's
     * scaling is not documented, so anything outside the range the parameter
     * page accepts is reported rather than believed.
     */
    readFineTune(bit16Params){
        const raw = (bit16Params[EPS16.FINE_TUNE_WORD] >> 8) & 0xFF
        const signed = raw > 127 ? raw - 256 : raw
        this.lastFineTuneRaw = signed
        this.lastFineTune = Math.abs(signed) <= EPS16.FINE_TUNE_LIMIT ? signed : null
        this.debug(`Fine tune raw ${signed}`)
        return this.lastFineTune
    }
    /***
     * Writes fine tune in cents. Sent as a negative parameter value when flat,
     * which is why setParameter had to learn two's complement.
     */
    async setFineTune(cents){
        const value = Math.max(-EPS16.FINE_TUNE_LIMIT,
            Math.min(EPS16.FINE_TUNE_LIMIT, Math.round(cents)))
        this.debug(`Setting fine tune to ${value}`)
        await this.setParameter(EPS16.ROOT_KEY_PAGE, EPS16.FINE_TUNE_PARAM, value)
        return value
    }
    /***
     * Reads the name out of a parameter dump. Words 0 to 11, one character per
     * word in the high byte, the same layout in all three block types.
     * Anything unprintable is shown as a space rather than dropped, so the
     * character positions still line up with the display.
     */
    readBlockName(bit16Params){
        let name = ''
        for(let i=0; i<EPS16.NAME_LENGTH; i++){
            const code = (bit16Params[EPS16.NAME_WORD + i] >> 8) & 0x7F
            name += (code >= 0x20 && code <= 0x7E) ? String.fromCharCode(code) : ' '
        }
        return name.replace(/ +$/, '')
    }
    readWavesampleName(bit16Params){
        this.lastWavesampleName = this.readBlockName(bit16Params)
        this.debug(`Wavesample name "${this.lastWavesampleName}"`)
        return this.lastWavesampleName
    }
    /***
     * Names an instrument, layer or wavesample.
     *
     * There is no single PUT PARAMETER for any of the three names, so this is a
     * read, modify, write of the entire parameter block. Only the twelve name
     * words change; every other word goes back exactly as it came, which the 12
     * and 16 bit conversions allow because they are exact inverses of each
     * other.
     *
     * Whatever the block already holds is fetched first rather than assumed, so
     * a rename cannot disturb the settings around it. In an upload this runs
     * last, after the rate, root key and fine tune, so the block read here
     * already carries those new values.
     */
    async setBlockName(kind, name){
        const clean = EPS16.sanitizeName(name)
        if(clean.length == 0) return true
        const params = await this.getParamBlock(kind)
        if(params.length < EPS16.NAME_LENGTH){
            this.errorCallback(`Error: Could not read the ${kind.label} parameters, so `
                + `"${clean}" was not set as the name`)
            return false
        }
        // Free: the block had to be fetched anyway, so the old name is already
        // here and the log can say what actually changed.
        this.previousBlockName = this.readBlockName(params)
        const block = params.slice()
        const padded = clean.padEnd(EPS16.NAME_LENGTH, ' ')
        for(let i=0; i<EPS16.NAME_LENGTH; i++){
            // Keep the low byte. Section 7 marks these words as ASCII in the
            // high byte and says nothing about the low one, so it is not ours
            // to clear.
            block[EPS16.NAME_WORD + i] =
                (block[EPS16.NAME_WORD + i] & 0x00FF) | (padded.charCodeAt(i) << 8)
        }
        this.debug(`Setting ${kind.label} name to "${clean}"`)
        return await this.putParamBlock(kind, block)
    }
    async setWavesampleName(name){
        return await this.setBlockName(EPS16.BLOCK_WAVESAMPLE, name)
    }
    async setInstrumentName(name){
        return await this.setBlockName(EPS16.BLOCK_INSTRUMENT, name)
    }
    async setLayerName(name){
        return await this.setBlockName(EPS16.BLOCK_LAYER, name)
    }
    /***
     * Sends a whole parameter block back. Two messages, as the note at the head
     * of section 4.2 requires of every PUT that carries a block: the command
     * with the edit context, then the block itself once the EPS has ACKed.
     */
    /***
     * Sends a parameter block, waiting the EPS out if it is busy.
     *
     * A restore writes seven or more blocks back to back immediately after a
     * multi-megabyte upload, and the EPS is still doing its own housekeeping
     * when the first of them arrives. It refuses with "Disk Access in Progress"
     * ($14), which is not a rejection of the block — offer the same one again a
     * few seconds later and it is taken. Without this a restore of a single
     * wavesample instrument died on its layer block having done everything
     * else right; see epswave-log-20260803--140115.
     *
     * Only the transient statuses are retried. A block the EPS genuinely
     * dislikes fails on the first attempt, as it should.
     */
    static PARAM_BLOCK_ATTEMPTS = 5
    static BUSY_RETRY_MS = 3000

    async putParamBlock(kind, block){
        for(let attempt = 1; attempt <= EPS16.PARAM_BLOCK_ATTEMPTS; attempt++){
            this.lastBlockError = ""
            if(await this.putParamBlockOnce(kind, block)) return true
            const busy = EPS16.TRANSIENT_STATUS.includes(this.lastStatusCode)
            if(!busy || attempt == EPS16.PARAM_BLOCK_ATTEMPTS){
                this.errorCallback(`Error: ${this.lastBlockError}`)
                return false
            }
            this.debug(`EPS busy (${this.statusText(this.lastStatusCode)}); `
                + `offering the ${kind.label} block again in `
                + `${EPS16.BUSY_RETRY_MS / 1000}s, attempt ${attempt + 1}`)
            await this.sleep(EPS16.BUSY_RETRY_MS)
        }
        return false
    }

    /***
     * One attempt. Records why it failed in lastBlockError rather than
     * reporting it, so that a refusal which the next attempt recovers from does
     * not appear in the event log as an error that mattered.
     */
    async putParamBlockOnce(kind, block){
        const cmd = this.createMIDIMessage(kind.put)
        await this.sendData(cmd)
        let messages = await this.readMessages()
        this.noteStatus(messages)
        if(messages.length == 0){
            this.lastBlockError = `No response to the ${kind.label} parameter block command`
            return false
        }
        let accepted = false
        for(let msg of messages){
            if(await this.isAck(msg)){
                accepted = true
                break
            }
        }
        if(!accepted){
            this.lastBlockError = `The EPS would not take a ${kind.label} parameter block: `
                + this.statusText(this.lastStatusCode)
            return false
        }
        await this.sendData(this.convertTo16BitMidi(block))
        const responses = await this.readMessages(EPS16.COMMAND_TIMER_MS + 1000)
        this.noteStatus(responses)
        if(responses.length == 0){
            this.lastBlockError = `No response after sending a ${block.length} word `
                + `${kind.label} parameter block`
            return false
        }
        for(let resp of responses){
            if(await this.isAck(resp)) return true
        }
        this.lastBlockError = `The EPS refused the ${kind.label} parameter block: `
            + this.statusText(this.lastStatusCode)
        return false
    }
    /***
     * One value for one wave of a multi wave upload. Accepts an array with an
     * entry per wave, a single value for all of them, or nothing at all, which
     * returns null so the caller leaves that setting alone. Zero is a real
     * value here, so it cannot double as the "not given" marker.
     */
    perWave(values, index){
        if(values === null || typeof values == 'undefined') return null
        if(!Array.isArray(values)) return values
        if(values.length == 0) return null
        const value = values[index]
        return (typeof value == 'number' || typeof value == 'string') ? value : values[0]
    }
    async readBackSampleRate(){
        const params = await this.getWavesampleParams()
        if(params.length == 0) return 0
        return this.readSampleRate(params)
    }
    setInstrumentNumber(num){
        this.instNum = num
    }
    /***
     * Which machine is believed to be on the other end.
     *
     * NOTHING BRANCHES ON THIS, and nothing should until there is a measured
     * difference to branch on. The sysex frame, the 12 and 16 bit packing, the
     * command numbers and the response codes are identical across the EPS
     * Classic and the EPS-16 PLUS — the reference library in
     * reference/code/eps2.0/ drives both with one code path, and its author
     * owned a Classic — so a model test today would be a test with nothing on
     * either side of it.
     *
     * It is recorded because the probe captures need it: a capture that does
     * not say which machine produced it is worth much less than one that does,
     * and asking the operator to remember is asking for the one field that will
     * be missing from the one file that mattered.
     */
    setModel(model){
        this.model = model
        return this.model
    }
    setLayerNumber(num){
        this.layerNum = num
    }
    setWavesampleNumber(num){
        this.wsBytes = this.convertTo12BitMidi([num],2)
        return true
    }
    /***
     * How wide the fades in a morphing soundscape are, from a 0 to 100 control.
     *
     * 0 is MORPH_OVERLAP_MIN, the layout the mode shipped with, and 100 is
     * MORPH_OVERLAP_MAX. The stored value is a ramp width in layer spacings,
     * which is what the geometry below is written in terms of; the percentage
     * exists because "how much do the waves bleed into each other" is the
     * question being asked, and it has no natural units.
     */
    setMorphOverlap(percent){
        const pct = Math.max(0, Math.min(100, Number(percent)))
        const span = EPS16.MORPH_OVERLAP_MAX - EPS16.MORPH_OVERLAP_MIN
        this.morphOverlap = EPS16.MORPH_OVERLAP_MIN + (isNaN(pct) ? 0 : pct/100) * span
        return this.morphOverlap
    }

    /***
     * Where one layer of a morphing soundscape is heard, as the four crossfade
     * breakpoints of section 9.9.
     *
     * The layers sit at evenly spaced centres across the modulator's 0-127
     * range, one `spacing` apart. Each is a trapezoid: silent, ramping up over
     * `ramp`, flat across `plateau`, ramping down over `ramp`, silent again.
     * Only the ramp is chosen. The plateau is whatever is left of a spacing,
     * and it runs out once the ramp reaches a full spacing.
     *
     * Deriving the plateau that way rather than choosing it separately is what
     * keeps the handover aligned at every setting. With `plateau = spacing -
     * ramp` the algebra gives A(n+1) == C(n) and B(n+1) == D(n) exactly, so a
     * layer starts fading in at the instant the layer before it starts fading
     * out, however wide the ramps are. Past an overlap of 1 the plateau is gone
     * and the ramps simply keep widening, which is where layers more than one
     * spacing apart start to sound together — three at once, then four.
     *
     * The two ends need no special case: the first layer's A and B fall below 0
     * and the last layer's C and D above 127, and the clamp turns that into
     * "full volume from the start" and "full volume to the end", which is what
     * the previous version of this function spelled out by hand.
     */
    getCrossFadeBreakPoints(length, step, overlap = this.morphOverlap){
        const spacing = 127 / Math.max(1, length - 1)
        const ramp = overlap * spacing
        const plateau = Math.max(0, spacing - ramp)
        const centre = step * spacing
        const clamp = (v) => Math.max(0, Math.min(127, Math.round(v)))

        let breakPoints = {
            pointA: clamp(centre - plateau/2 - ramp),
            pointB: clamp(centre - plateau/2),
            pointC: clamp(centre + plateau/2),
            pointD: clamp(centre + plateau/2 + ramp)
        }
        // Rounding can push two of these onto the same step but never past each
        // other. The specification does not say what the EPS does with a set
        // that arrives out of order, so it never finds out.
        breakPoints.pointB = Math.max(breakPoints.pointA, breakPoints.pointB)
        breakPoints.pointC = Math.max(breakPoints.pointB, breakPoints.pointC)
        breakPoints.pointD = Math.max(breakPoints.pointC, breakPoints.pointD)
        return breakPoints
    }

    /***
     * Transfer self test
     */

    /***
     * A deterministic test pattern of the requested length. Every sample is
     * derived from its own index with Knuth's multiplicative hash, so the value
     * at any position is unique and unpredictable: a block that arrives shifted,
     * duplicated or dropped cannot accidentally match, the way a ramp or a sine
     * sometimes can. The pattern uses the full 16 bit range to exercise every
     * bit of the three byte word format.
     */
    static testPattern(length){
        const data = new Array(length)
        for(let i=0; i<length; i++){
            const hash = (i * 2654435761) % 4294967296
            const word = Math.floor(hash / 65536) & 0xFFFF
            let value = word > 32767 ? word - 65536 : word
            // -32768 has no positive counterpart; keep the pattern symmetric so
            // a mismatch is always a transfer fault and never a clamp.
            if(value == -32768) value = -32767
            data[i] = value
        }
        return data
    }

    /***
     * Uploads the test pattern, waits, reads it back and compares. Returns a
     * report rather than printing one, so the caller decides how to show it.
     */
    async runLoopbackTest(length, progressCallback=()=>{}, statusCallback=()=>{}, sampleRate=0){
        const expected = EPS16.testPattern(length)
        const report = {
            rateRequested: sampleRate,
            rateWritten: 0,
            rateReadBack: 0,
            passed: false,
            stage: 'upload',
            requested: length,
            returned: 0,
            mismatches: 0,
            firstMismatch: -1,
            lastMismatch: -1,
            examples: [],
            blockSize: this.chunkSize,
            uploadMs: 0,
            bytesPerSecond: 0,
            suggestedBlockSize: this.chunkSize,
            message: ''
        }
        this.transferStats = { dataBytes: 0, dataMs: 0 }

        if(!this.midiOutput || typeof this.midiOutput.send != 'function'){
            report.message = "Cannot run the test: no MIDI output is selected."
            return report
        }

        if(sampleRate > 0) report.rateWritten = WaveGen.rateFromCode(WaveGen.codeForRate(sampleRate))

        statusCallback(`Uploading ${length} test samples in blocks of ${this.chunkSize} ...`)
        const started = Date.now()
        const uploaded = await this.uploadWavToEPS(expected, 1, 0, progressCallback, sampleRate)
        report.uploadMs = Date.now() - started
        if(this.transferStats.dataMs > 0){
            report.bytesPerSecond = Math.round(
                (this.transferStats.dataBytes / this.transferStats.dataMs) * 1000)
            report.suggestedBlockSize = this.chunkSizeFor(report.bytesPerSecond)
        }
        if(!uploaded){
            report.message = `Upload failed after ${(report.uploadMs/1000).toFixed(1)} s.`
            return report
        }

        report.stage = 'readback'
        statusCallback("Upload finished. Waiting 5 seconds before reading it back ...")
        await this.sleep(5000)

        statusCallback("Reading the wavesample back from the EPS ...")
        const actual = await this.getWavesampleDataChunked(this.chunkSize, (data, percent) => {
            progressCallback(`${percent}`)
        })
        // getWavesampleDataChunked fetches the parameter block first, so the
        // rate the synth is actually holding is already decoded by now. This is
        // the check on whether a PUT PARAMETER to a "receive only" parameter
        // sticks.
        report.rateReadBack = this.lastSampleRate || 0
        report.returned = actual.length
        report.received = actual

        report.stage = 'compare'
        const shared = Math.min(expected.length, actual.length)
        for(let i=0; i<shared; i++){
            if(actual[i] === expected[i]) continue
            report.mismatches++
            if(report.firstMismatch < 0) report.firstMismatch = i
            report.lastMismatch = i
            if(report.examples.length < 5){
                report.examples.push({ index: i, expected: expected[i], actual: actual[i] })
            }
        }
        report.passed = report.mismatches == 0 && report.returned == length

        if(report.passed){
            report.message = `PASS: all ${length} samples came back identical.`
        }else if(report.returned != length){
            report.message = `FAIL: sent ${length} samples, got ${report.returned} back`
                + (report.mismatches > 0 ? `, and ${report.mismatches} of the shared ones differ.` : '.')
        }else{
            report.message = `FAIL: ${report.mismatches} of ${length} samples differ`
                + `, first at ${report.firstMismatch}, last at ${report.lastMismatch}.`
        }
        return report
    }

    /***
     * Macros
     */
    async uploadAsTranswave(arrayOfWaveTables, progressCallback, sampleRates=[], rootKeys=[], fineTunes=[], names=[], options={}){
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        const claimed = await this.acquireInstrument(options)
        if(!claimed.ok){
            if(!claimed.cancelled){
                this.errorCallback(claimed.message
                    || "Error: Could not create an instrument for the transwave")
            }
            return claimed
        }
        EPS16.step(options, "creating the layer")
        if(!await this.createLayer()){
            this.errorCallback("Error: Could not create an instrument for the transwave")
            return { ok: false, instrument: this.instNum }
        }
        EPS16.step(options, "creating the wavesample")
        if(!await this.createSqrWave()){
            this.errorCallback("Error: Could not create an instrument for the transwave")
            return { ok: false, instrument: this.instNum }
        }
        let transwave = []
        for(let wave of arrayOfWaveTables){
            transwave = transwave.concat(wave)
        }
        EPS16.step(options, `sending ${transwave.length} samples`)
        // Every wave ends up in one wavesample here, so only the first slot's
        // name has anywhere to go.
        // `const`, and not by taste. A class body is strict mode, so the
        // undeclared assignment this used to be threw a ReferenceError the
        // moment the audio finished going in — after the samples were sent and
        // before any of the four modulation settings below. Every transwave
        // ever made with this ended up as a plain wavesample holding the right
        // audio with none of the transwave wiring, and the caller's `finally`
        // tidied the spinner away so it looked like it had worked.
        const isSuccess = await this.uploadWavToEPS(transwave, 1, 0, progressCallback,
            this.perWave(sampleRates, 0), this.perWave(rootKeys, 0), this.perWave(fineTunes, 0),
            this.perWave(names, 0))
        if(!isSuccess){
            this.errorCallback("Error: Unable to upload transwave to EPS16")
            return { ok: false, instrument: this.instNum }
        }
        // Each of these reports for itself now, so the outcome is the AND of
        // them rather than a guess made afterwards from whatever happened to be
        // in the message queue. The old test here was `messages.length = 0`, an
        // assignment rather than a comparison: it emptied the array, evaluated
        // to 0, and took the failure branch every single time, so a transwave
        // that went in perfectly still reported an error.
        EPS16.step(options, "waiting for the synth")
        await this.sleep(1000)
        EPS16.step(options, "setting the mod wheel sweep")
        let ok = true
        // Pitch LFO amount to zero, the same as every layer of a soundscape
        // gets. A freshly created wavesample has the LFO wired to pitch by
        // default, so a transwave wobbles as it plays and the wobble is easy to
        // mistake for the transwave sweep itself doing something wrong.
        ok = await this.setParameter(EPS16.PITCH_PAGE, EPS16.PITCH_LFO_AMOUNT_PARAM, 0) && ok
        //set loop end
        ok = await this.setParameter(0x20,0x18,arrayOfWaveTables[0].length) && ok
        //set modulation to transwave
        ok = await this.setParameter(0x20,0x06,0x07) && ok
        //set modulation source to wheel
        ok = await this.setParameter(0x20,0x07,0x0A) && ok
        //set modulation ammount
        ok = await this.setParameter(0x20,0x08,arrayOfWaveTables.length+1) && ok
        if(ok){
            this.successCallback("Complete: Uploaded Transwave")
        }else{
            this.errorCallback("Error: The transwave samples were sent, but the EPS refused one "
                + "of the modulation settings above")
        }
        return { ok, instrument: this.instNum }
    }
    async uploadToDifferentInstruments(arrayOfWaveTables, progressCallback, sampleRates=[], rootKeys=[], fineTunes=[], names=[], options={}){
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        let index = 0
        for(let wave of arrayOfWaveTables){
            // Each wave takes the next free instrument. Running out of them
            // used to end the search quietly and carry on around the outer
            // loop, so the remaining waves went nowhere and the run still
            // reported that it had completed.
            const of = `${index + 1} of ${arrayOfWaveTables.length}`
            const claimed = await this.acquireInstrument(options, index)
            if(claimed.cancelled) return { ...claimed, uploaded: index }
            EPS16.step(options, `wave ${of}: creating the layer and wavesample`)
            if(!(claimed.ok && await this.createLayer() && await this.createSqrWave())){
                this.errorCallback(`Error: Stopped after ${index} of `
                    + `${arrayOfWaveTables.length} samples, with no instrument left to upload into`)
                return { ok: false, uploaded: index, instrument: this.instNum }
            }
            EPS16.step(options, `wave ${of}: sending ${wave.length} samples`)
            await this.uploadWavToEPS(wave, arrayOfWaveTables.length, index, progressCallback,
                this.perWave(sampleRates, index), this.perWave(rootKeys, index),
                this.perWave(fineTunes, index), this.perWave(names, index))
            this.successCallback("Success: Adding new instrument")
            index++
            EPS16.step(options, "waiting for the synth")
            await this.sleep(500)
        }
        this.successCallback("Complete: Uploading samples")
        return { ok: true, uploaded: index, instrument: this.instNum }
    }
    async createMorphingWaveTable(arrayOfWaveTables, progressCallback, sampleRates=[], rootKeys=[], fineTunes=[], names=[], options={}){
        //enable all patche
        const claimed = await this.acquireInstrument(options)
        if(!claimed.ok){
            if(!claimed.cancelled){
                this.errorCallback(claimed.message
                    || "Error: Unable to create instrument for morphing wave forms")
            }
            return claimed
        }
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        await this.setParameter(0x28, 0x00, 0xFF) // enable all patches
        // Only eight layers ever get uploaded, so the breakpoints have to be
        // spread over eight as well. Computing them for the full count and then
        // stopping at eight leaves the top of the sweep with no layer assigned
        // to it, which is silence.
        // Also what the progress is measured against. Counting against every
        // wave handed in would leave the bar stopping at eight ninths for a
        // run of nine, since the ninth is never uploaded. These two arguments
        // reach nothing but the progress arithmetic.
        const layerCount = Math.min(arrayOfWaveTables.length, EPS16.MAX_MORPH_LAYERS)
        this.debugCallback(`Soundscape: ${layerCount} layers, fade ramp `
            + `${this.morphOverlap.toFixed(2)} of a layer spacing`)
        for(let i=0; i< arrayOfWaveTables.length; i++){
            if(i == EPS16.MAX_MORPH_LAYERS) break
            const bp = this.getCrossFadeBreakPoints(layerCount, i)
            let wave = arrayOfWaveTables[i]
            const of = `layer ${i + 1} of ${layerCount}`
            this.setLayerNumber(i)
            EPS16.step(options, `${of}: creating the layer and wavesample`)
            //this.setWavesampleNumber(1)
            if( !(await this.createLayer() && await this.createSqrWave() && this.setWavesampleNumber(i+1) && this.stepping(options, `${of}: sending ${wave.length} samples`) && await this.uploadWavToEPS(wave, layerCount, i, progressCallback,
                this.perWave(sampleRates, i), this.perWave(rootKeys, i), this.perWave(fineTunes, i),
                this.perWave(names, i)))){
                this.errorCallback("Error: Unable to update instrument parameters")
                return { ok: false, uploaded: i, instrument: this.instNum }
            }
            EPS16.step(options, `${of}: waiting for the synth`)
            await this.sleep(500)
            EPS16.step(options, `${of}: setting the crossfade`)
            // The same LFO that sweeps the crossfade is wired to pitch by
            // default, so without this every layer wobbles in pitch as it
            // fades and eight of them together are chaos. Section 9.7 gives
            // Pitch LFO Amount its own address and no "*" marker, so a single
            // PUT PARAMETER reaches it; this is the front panel's
            // Pitch / LFO AMOUNT set to zero, per layer.
            await this.setParameter(EPS16.PITCH_PAGE, EPS16.PITCH_LFO_AMOUNT_PARAM, 0)
            await this.setParameter(0x18,0x05, EPS16.MORPH_FADECURVE) // fade curve: CROSSFADE, not LINEAR
            await this.setParameter(0x18,0x03, bp.pointA)
            await this.setParameter(0x18,0x0B, bp.pointB)
            await this.setParameter(0x18,0x04, bp.pointC)
            await this.setParameter(0x18,0x0C, bp.pointD)
            await this.setParameter(0x18,0x07, 0) // modulation source to LFO
            await this.setParameter(0x18,0x0A, 127) // modulation amount
            await this.setParameter(0x1C,0x02, 15) // LFO speed
            await this.setParameter(0x1C,0x03, 127) // LFO depth
            await this.setParameter(0x1C,0x04, 0) // LFO Delay
            await this.setParameter(0x1C,0x05, 1) // LFO Reset
            await this.setParameter(0x1C,0x08, 0x0F) // LFO Modulation source
            await this.setParameter(0x1C,0x07, 0x0F) // LFO Modulation source

            this.setWavesampleNumber(1)
            EPS16.step(options, `${of}: waiting for the synth`)
            await this.sleep(1000)

        }
        this.successCallback("Complete: Uploading samples")
        return { ok: true, uploaded: layerCount, instrument: this.instNum }
    }


}
