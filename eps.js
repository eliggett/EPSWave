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
     * Samples per PUT/GET WAVESAMPLE DATA block. 256 samples is 773 bytes on
     * the wire, a quarter of a second at the full MIDI rate and around half a
     * second through a slow USB adapter, so it clears the two second timer with
     * plenty of room. Raise it for a fast interface, lower it if blocks are
     * still being refused.
     */
    static DEFAULT_CHUNK_SAMPLES = 256
    static MIN_CHUNK_SAMPLES = 32
    static MAX_CHUNK_SAMPLES = 2048

    /***
     * How many times a single block is offered before the upload gives up. Each
     * failure halves the block size, so the last attempt is a quarter the size
     * of the first.
     */
    static MAX_CHUNK_ATTEMPTS = 4

    /***
     * Status codes that mean "not now" rather than "not this". Section 5 gives
     * 14 as "Current disk activity prevented the execution of the command",
     * which says nothing about the block that was offered, so the answer is to
     * wait and offer the same block again. Halving it, the remedy for a block
     * the EPS could not receive in time, would only make the transfer longer.
     */
    static TRANSIENT_STATUS = [0x14]

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
    static PING_PAGE = 0x34
    static PING_ITEM = 0x00
    static SAMPLES_PER_BLOCK = 256

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
    async getParamBlock(kind){
        let cmd = this.createMIDIMessage(kind.get)
        await this.sendData(cmd);
        let messages = await this.readMessages()
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
    async deleteInstrument(){
        const msg = this.createMIDIMessage(0x1C)
        await this.sendData(msg)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Deleted instrument")
        }else{
            this.errorCallback("Error: Unable to delete instrument")
        }
    }
    async sendAck(){
        const data = [
            0x01,
            0x00,
            0x00
        ]
        await this.sendData(data) 
    }
    async createInstrument(name = null){
        let message = this.createMIDIMessage(0x15)
        await this.sendData(message)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Created instrument")
            await this.nameAfterCreate(EPS16.BLOCK_INSTRUMENT, name)
            return true
        }else{
            this.errorCallback("Error: Unable to create instrument")
            return false
        }

    }
    async createLayer(name = null){
        let message = this.createMIDIMessage(0x16)
        await this.sendData(message)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Created layer")
            await this.nameAfterCreate(EPS16.BLOCK_LAYER, name)
            return true
        }else{
            this.errorCallback("Error: Unable to create layer")
            return false
        }
    }
    async createSqrWave(name = null){
        let message = this.createMIDIMessage(0x19)
        await this.sendData(message)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Created SQR")
            await this.nameAfterCreate(EPS16.BLOCK_WAVESAMPLE, name)
            return true
        }else{
            this.errorCallback("Error: Unable to create SQR wavesample")
            return false;
        }
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
    async clearWavesample(){
        let params = await this.getWavesampleParams()
        if(params.length == 0) return false
        let length = this.getEndOffset(params)
        let offsets = this.convertTo12BitMidi([length])
        let data = [
            0x00, // start offset
            0x00, // start offset
            0x00, // start offset
            0x00, // start offset
        ]
        data.concat(offsets)
        let cmd = this.createMIDIMessage(0x1f, data)
        await this.sendData(cmd)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Cleared wavesample")
            return true
        }else{
            this.errorCallback("Error: Ubnable to clear wavesample")
            return false
        }

    }
    async truncateWavesample(){
        let cmd = this.createMIDIMessage(0x1E)
        await this.sendData(cmd)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Truncated wavesample")
            return true
        }else{
            this.errorCallback("Error: Unable to Truncate wavesample")
            return false
        }
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
            const wavePart = await this.getWavesampleData(start, end)
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
     * Asks the EPS for one parameter. The answer is a PUT PARAMETER message
     * carrying the value inline, so unlike a data transfer there is no second
     * exchange to complete.
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
                report.message = "The EPS answered, so sysex is on, but the reply was not "
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
        await this.sendData(cmd)
        // The spec notes that PUT PARAMETER only answers when the parameter
        // number or value is wrong, so this usually times out. Keep it short:
        // it exists to pace the command, to drain an error response before it
        // can be mistaken for the answer to the next command, and to report
        // whether the value was accepted.
        const messages = await this.readMessages(300)
        const status = this.noteStatus(messages)
        // Silence means accepted. ACK and WAIT are not errors either.
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
            progressCallback(
                `${ Math.round((waveIndex + (start/audio.length))/numWaves*100) }`)
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
    responseStatus(message){
        if(typeof message == 'undefined' || message.length != 3 || message[0] != 1) return -1
        return message[2]
    }
    /***
     * Plain text for a status code, borrowing the table used for logging.
     */
    statusText(code){
        if(code < 0) return "no response"
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
    saveFile(samples, sampleRate=44100){
        // Stolen from Recorder.js
        // https://github.com/mattdiamond/Recorderjs
        let buffer = new ArrayBuffer(44 + samples.length * 2);
        let view = new DataView(buffer);
        /* RIFF identifier */
        this.writeString(view, 0, 'RIFF');
        /* RIFF chunk length */
        view.setUint32(4, 36 + samples.length * 2, true);
        /* RIFF type */
        this.writeString(view, 8, 'WAVE');
        /* format chunk identifier */
        this.writeString(view, 12, 'fmt ');
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
        this.writeString(view, 36, 'data');
        /* data chunk length */
        view.setUint32(40, samples.length * 2, true);
        let offset = 44
        for(let i=0; i<samples.length; i++, offset +=2){
            view.setInt16(offset, samples[i], true)
        }
        let audioBlob = new Blob([view], {type: 'audio/x-wav'});
        let url = (window.URL || window.webkitURL).createObjectURL(audioBlob);
        let link = window.document.createElement('a');
        link.href = url;
        link.download = 'output.wav';
        link.innerHTML="Download"
        link.click();
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
    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    async isAck(message){
        // Section 4.1: a response command is exactly three bytes once the sysex
        // frame is off, 01 followed by the two byte status code. Anything
        // longer is a data block, which must never be mistaken for an ACK just
        // because it happens to start with 1 and end with 0.
        if(typeof message == 'undefined' || message.length != 3 || message[0] != 1) return false
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
                let message = this.getResponseMessage(this.stripSysexHeader(midiMessage.data))
                if(message.indexOf("Error") != -1){
                    this.errorCallback(message)
                }
                this.debug(message)
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
    async putParamBlock(kind, block){
        const cmd = this.createMIDIMessage(kind.put)
        await this.sendData(cmd)
        let messages = await this.readMessages()
        this.noteStatus(messages)
        if(messages.length == 0){
            this.errorCallback(`Error: No response to the ${kind.label} parameter block command`)
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
            this.errorCallback(`Error: The EPS would not take a ${kind.label} parameter block: `
                + this.statusText(this.lastStatusCode))
            return false
        }
        await this.sendData(this.convertTo16BitMidi(block))
        const responses = await this.readMessages(EPS16.COMMAND_TIMER_MS + 1000)
        this.noteStatus(responses)
        if(responses.length == 0){
            this.errorCallback(`Error: No response after sending a ${block.length} word `
                + `${kind.label} parameter block`)
            return false
        }
        for(let resp of responses){
            if(await this.isAck(resp)) return true
        }
        this.errorCallback(`Error: The EPS refused the ${kind.label} parameter block: `
            + this.statusText(this.lastStatusCode))
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
    setLayerNumber(num){
        this.layerNum = num
    }
    setWavesampleNumber(num){
        this.wsBytes = this.convertTo12BitMidi([num],2)
        return true
    }
    getCrossFadeBreakPoints(length, step){
        const sectionLength = Math.floor( 128 / ((length -1)*2) )
        const halfSectionLength = Math.floor(sectionLength/2)
        
        let breakPoints = { pointA:0, pointB:0, pointC:127, pointD:127}
        if(step == 0){
            breakPoints.pointC = halfSectionLength
            breakPoints.pointD = halfSectionLength + sectionLength
        }else if(step == (length-1)){
            let prev = this.getCrossFadeBreakPoints(length, step -1)
            breakPoints.pointA = prev.pointC
            breakPoints.pointB = prev.pointD 
        }
        else{
            let prev = this.getCrossFadeBreakPoints(length, step -1)
            breakPoints.pointA = prev.pointC
            breakPoints.pointB = prev.pointD 
            breakPoints.pointC = breakPoints.pointB + sectionLength 
            breakPoints.pointD = breakPoints.pointC + sectionLength
        }
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
    async uploadAsTranswave(arrayOfWaveTables, progressCallback, sampleRates=[], rootKeys=[], fineTunes=[], names=[]){
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        let isSuccess = false
        for(let i=this.instNum; i<8; i++){
            if(await this.createInstrument() && await this.createLayer() &&await this.createSqrWave()){
                isSuccess = true
                break;
            }else{
                this.setInstrumentNumber(i)
            }
        }
        if(!isSuccess) {
            this.errorCallback("Error: Could not create an instrument for the transwave")
            return
        }
        let transwave = []
        for(let wave of arrayOfWaveTables){
            transwave = transwave.concat(wave)
        }
        // Every wave ends up in one wavesample here, so only the first slot's
        // name has anywhere to go.
        isSuccess = await this.uploadWavToEPS(transwave, 1, 0, progressCallback,
            this.perWave(sampleRates, 0), this.perWave(rootKeys, 0), this.perWave(fineTunes, 0),
            this.perWave(names, 0))
        if(!isSuccess){
            this.errorCallback("Error: Unable to upload transwave to EPS16")
            return
        }
        // Each of these reports for itself now, so the outcome is the AND of
        // them rather than a guess made afterwards from whatever happened to be
        // in the message queue. The old test here was `messages.length = 0`, an
        // assignment rather than a comparison: it emptied the array, evaluated
        // to 0, and took the failure branch every single time, so a transwave
        // that went in perfectly still reported an error.
        await this.sleep(1000)
        let ok = true
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

    }
    async uploadToDifferentInstruments(arrayOfWaveTables, progressCallback, sampleRates=[], rootKeys=[], fineTunes=[], names=[]){
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        let index =0
        for(let wave of arrayOfWaveTables){
            //find an empty instrument
            for(let i=this.instNum; i<8; i++){
                if(await this.createInstrument() && await this.createLayer() && await this.createSqrWave()){
                    await this.uploadWavToEPS(wave, arrayOfWaveTables.length, index, progressCallback,
                        this.perWave(sampleRates, index), this.perWave(rootKeys, index),
                        this.perWave(fineTunes, index), this.perWave(names, index))
                    this.successCallback("Success: Adding new instrument")
                    index++
                    await this.sleep(500)
                    break;
                }else{
                    this.setInstrumentNumber(i)
                }

            }
        }
        this.successCallback("Complete: Uploading samples")
    }
    async createMorphingWaveTable(arrayOfWaveTables, progressCallback, sampleRates=[], rootKeys=[], fineTunes=[], names=[]){
        //enable all patche
        let isSuccess = false
        for(let i=this.instNum; i<8; i++){
            if(await this.createInstrument()){
                isSuccess = true
                break;
            }else{
                this.setInstrumentNumber(i)
            }

        }
        if(!isSuccess){
            this.errorCallback("Error:  Unable to create instrument for morphing wave forms")
            return false
        }
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        await this.setParameter(0x28, 0x00, 0xFF) // enable all patches
        for(let i=0; i< arrayOfWaveTables.length; i++){
            if(i==8) break
            const bp = this.getCrossFadeBreakPoints(arrayOfWaveTables.length,i)
            let wave = arrayOfWaveTables[i]
            this.setLayerNumber(i)
            //this.setWavesampleNumber(1)
            if( !(await this.createLayer() && await this.createSqrWave() && this.setWavesampleNumber(i+1) && await this.uploadWavToEPS(wave, arrayOfWaveTables.length, i, progressCallback,
                this.perWave(sampleRates, i), this.perWave(rootKeys, i), this.perWave(fineTunes, i),
                this.perWave(names, i)))){
                this.errorCallback("Error: Unable to update instrument parameters")
                return false
            }
            await this.sleep(500)
            await this.setParameter(0x18,0x05, 1) // crossfade to linier
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
            await this.sleep(1000)

        }
        this.successCallback("Complete: Uploading samples")
    }


}
