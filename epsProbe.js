/***
 * Hardware probes and the capture format they write.
 *
 * WHY THIS EXISTS
 *
 * Everything the project knows about the EPS-16 PLUS comes from Ensoniq's
 * External Command Specification, which states on its first page that it
 * "applies specifically to the EPS-16 PLUS only (not the Original EPS)".
 * Everything it knows about the original EPS comes from Andrew Arensburger's
 * 1992 sysex library in reference/code/eps2.0/ — which is genuinely useful,
 * because its author owned a Classic and not a 16 PLUS, so its Classic paths
 * are the tested ones and its 16 PLUS paths are the guesses. The two sources
 * cover each other almost exactly.
 *
 * Almost. Four things are not settled by either, and cannot be settled by
 * reading:
 *
 *   1. The Classic's parameter numbers. The 16 PLUS merged the Classic's
 *      separate System (page $0D) and MIDI (page $0C) pages into one and
 *      renumbered them. eps.h has a reconstruction, but it is incomplete and
 *      has at least two collisions in it (PE1_L1S and PE1_L4H are both $010E).
 *      No amount of dumping instruments reveals any of this, because block
 *      transfers never mention a parameter number.
 *   2. Block lengths. eps.h allocates for an instrument block of 968 bytes
 *      where section 7.1 describes 969, which is 321 words against 323 — a
 *      difference of exactly the effect offset the Classic cannot have.
 *   3. Which fields the 16 PLUS added in the low bytes of existing words.
 *      Section 7.3 and eps.h disagree about word 105 (pan), so "the low bytes
 *      were free on the Classic" cannot be applied as a rule.
 *   4. Whether the Classic truncates or rounds when it discards the low three
 *      bits of every sample.
 *
 * So: three probes, one per question that hardware can answer, plus a capture
 * format built on the assumption that there is exactly one session with a
 * borrowed machine and no second chance to ask a follow up question.
 *
 * THE RULES THAT SHAPED THIS FILE
 *
 * Raw bytes, always. Every probe records the MIDI traffic underneath it, both
 * directions, with timestamps. A decoded log cannot falsify the decoder, and
 * the decoder is the thing under test. Decoded values are recorded too, clearly
 * labelled as interpretation, and never instead.
 *
 * Written to disk as it goes, not at the end. If the synth locks up on the four
 * hundredth message the first three hundred and ninety nine are still worth
 * having. The capture is JSON Lines for this reason and no other: appending a
 * line is a write at a known offset, where rewriting one JSON object would be
 * the whole file every time.
 *
 * Nothing here assumes the model. The transport is identical across the two
 * machines — same manufacturer byte, same product ID, same packing, same
 * handshake — so these probes run against a 16 PLUS as readily as a Classic,
 * which is also the only way to test them before the Classic arrives. Running
 * the whole set against a known 16 PLUS first is the calibration: anything that
 * looks surprising in a Classic capture can be compared against a machine whose
 * answers are documented.
 */

/***
 * The capture file.
 *
 * Line 1 is a manifest naming the format, the app, the session and everything
 * the person running the probe told us about their machine. Every line after
 * it is one event. That layout means the file explains itself to whoever opens
 * it in six months without this source next to them, and it means a truncated
 * file is still a valid capture of everything up to the truncation.
 */
class EPSCapture {

    static FORMAT = "epswave-probe-capture"
    static FORMAT_VERSION = 1

    /***
     * How much raw MIDI to keep, in bytes of payload.
     *
     * A full instrument dump is megabytes of wavedata and there is no value in
     * every byte of it: the packing is settled by the first block and the last.
     * Past the budget, message bodies stop being recorded and their direction,
     * length and timing keep being recorded, so the transcript stays complete
     * as a transcript and only the payloads thin out. The file says when this
     * happened. Generous by default because a lost byte cannot be re-asked for
     * and a large file can be.
     */
    static DEFAULT_RAW_BUDGET = 16 * 1024 * 1024

    constructor(options = {}){
        this.rawBudget = options.rawBudget || EPSCapture.DEFAULT_RAW_BUDGET
        this.rawBytes = 0
        this.rawTruncated = false
        this.lines = []
        this.pending = []
        this.sequence = 0
        this.started = 0
        this.handle = null
        this.written = 0
        this.partNumber = 0
        this.open = false
        this.meta = {}
        this.onError = options.onError || (() => {})
    }

    /***
     * Starts a capture. Must be called from a click: choosing a file needs a
     * user gesture, and there is no way to ask for one later.
     *
     * Two storage strategies, and the difference is worth understanding before
     * a session rather than during one. With the File System Access API (any
     * Chromium browser, which is also the only kind that has Web MIDI) the
     * capture is appended to a real file on disk as it runs and survives the
     * tab being closed, the page crashing or the machine hanging. Without it,
     * lines accumulate in memory and are downloaded in numbered parts at every
     * checkpoint, which survives everything except the tab going away.
     */
    async begin(meta){
        this.started = Date.now()
        this.meta = meta || {}
        this.open = true
        this.lines = []
        this.pending = []
        this.written = 0
        this.rawBytes = 0
        this.rawTruncated = false

        const manifest = {
            format: EPSCapture.FORMAT,
            formatVersion: EPSCapture.FORMAT_VERSION,
            note: "JSON Lines. Line 1 is this manifest; every later line is one "
                + "event. `midi` events carry the raw bytes on the wire as a hex "
                + "string, before any decoding. Anything named `decoded` or "
                + "`interpretation` is this app's reading of those bytes and may "
                + "be wrong; the hex is the evidence.",
            startedAt: new Date(this.started).toISOString(),
            app: {
                page: typeof location != "undefined" ? location.pathname : "",
                userAgent: typeof navigator != "undefined" ? navigator.userAgent : ""
            },
            session: this.meta
        }

        if(typeof window != "undefined" && typeof window.showSaveFilePicker == "function"){
            try{
                this.handle = await window.showSaveFilePicker({
                    suggestedName: EPSCapture.suggestedName(this.meta),
                    types: [{ description: "EPSWave probe capture",
                        accept: { "application/x-ndjson": [".jsonl"] } }]
                })
            }catch(error){
                // A cancelled picker is not a failure worth stopping for: the
                // in-memory path works, so say which one is in use and carry on.
                this.handle = null
            }
        }

        this.line(manifest)
        await this.flush()
        return { live: this.handle != null }
    }

    static suggestedName(meta){
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
        const model = (meta.model || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-")
        return `epswave-probe-${model}-${stamp}.jsonl`
    }

    /*** Milliseconds since the capture began, the timebase for every event. */
    now(){ return Date.now() - this.started }

    line(object){
        this.pending.push(JSON.stringify(object))
    }

    /***
     * One event. `kind` says what it is and the rest is free form, because the
     * point of a capture is to hold things nobody thought to model yet.
     */
    event(kind, payload = {}){
        if(!this.open) return
        this.line({ seq: this.sequence++, t: this.now(), kind, ...payload })
    }

    /***
     * One MIDI message, exactly as it went out or came in.
     *
     * `bytes` is whatever Web MIDI handed over or whatever was handed to it,
     * including the F0 and F7, with nothing stripped and nothing interpreted.
     */
    midi(direction, bytes){
        if(!this.open) return
        const length = bytes.length
        if(this.rawBytes + length > this.rawBudget){
            if(!this.rawTruncated){
                this.rawTruncated = true
                this.event("raw-budget-reached", {
                    budget: this.rawBudget,
                    note: "Message bodies are no longer recorded. Direction, "
                        + "length and timing still are."
                })
            }
            this.line({ seq: this.sequence++, t: this.now(), kind: "midi",
                dir: direction, len: length, omitted: true })
            return
        }
        this.rawBytes += length
        this.line({ seq: this.sequence++, t: this.now(), kind: "midi",
            dir: direction, len: length, hex: EPSCapture.hex(bytes) })
    }

    /*** A line of human commentary, from the app or from the person running it. */
    note(text, extra = {}){
        this.event("note", { text, ...extra })
    }

    /***
     * Writes everything queued since the last flush.
     *
     * Appends at a tracked offset rather than rewriting, so the cost of a flush
     * is the size of what is new and not the size of the session. A capture
     * that got slower as it got longer would be at its slowest exactly during
     * the wavedata probe, which is the part that most needs to not be slow.
     */
    async flush(){
        if(this.pending.length == 0) return
        const chunk = this.pending.join("\n") + "\n"
        this.pending = []
        this.lines.push(chunk)
        if(!this.handle) return
        try{
            const writable = await this.handle.createWritable({ keepExistingData: true })
            await writable.write({ type: "write", position: this.written, data: chunk })
            await writable.close()
            this.written += new Blob([chunk]).size
        }catch(error){
            this.onError(`Could not write the capture file: ${error.message}. `
                + `Keeping it in memory instead — use Download capture before closing this tab.`)
            this.handle = null
        }
    }

    /***
     * A checkpoint. Flushes, and on the in-memory path hands over a numbered
     * part so that a session which ends badly has still produced files.
     */
    async checkpoint(label){
        this.event("checkpoint", { label })
        await this.flush()
        if(this.handle) return null
        return this.downloadPart(label)
    }

    downloadPart(label){
        this.partNumber++
        const name = EPSCapture.suggestedName(this.meta)
            .replace(/\.jsonl$/, `-part${String(this.partNumber).padStart(2, "0")}.jsonl`)
        this.download(name)
        return name
    }

    /*** The whole capture so far, as one blob. */
    text(){
        return this.lines.join("") + (this.pending.length ? this.pending.join("\n") + "\n" : "")
    }

    download(name){
        const filename = name || EPSCapture.suggestedName(this.meta)
        if(typeof EPSWaveUI != "undefined" && EPSWaveUI.download){
            EPSWaveUI.download(this.text(), "application/x-ndjson;charset=utf-8", filename)
        }
        return filename
    }

    async finish(summary){
        if(!this.open) return
        this.event("session-end", { summary: summary || null,
            rawBytes: this.rawBytes, rawTruncated: this.rawTruncated,
            events: this.sequence })
        await this.flush()
        this.open = false
    }

    stats(){
        return { events: this.sequence, rawBytes: this.rawBytes,
            rawTruncated: this.rawTruncated, live: this.handle != null,
            bytes: this.lines.reduce((sum, chunk) => sum + chunk.length, 0) }
    }

    static HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"))

    static hex(bytes){
        let text = ""
        for(let i = 0; i < bytes.length; i++) text += EPSCapture.HEX[bytes[i] & 0xFF]
        return text
    }
}

/***
 * The probes themselves.
 *
 * Every one of them is read-only unless its options say otherwise, and the two
 * that can write say so in their names and refuse to run without an explicit
 * flag. That ordering is deliberate: reads first, writes afterwards and only on
 * a scratch target, so that a write which hangs the machine cannot cost the
 * read capture that was the point of the session.
 */
class EPSProbe {

    constructor(eps, capture, hooks = {}){
        this.eps = eps
        this.capture = capture
        this.status = hooks.status || (() => {})
        this.progress = hooks.progress || (() => {})
        this.log = hooks.log || (() => {})
        this.aborted = false
        this.running = null
        this.attached = false
        this.results = {}
    }

    /***
     * Starts recording the MIDI traffic.
     *
     * Wraps whatever callback the page already installed rather than replacing
     * it, so the event log keeps working while a probe runs. The page wires its
     * logging at start up and the probe attaches later, which is the only order
     * in which wrapping is safe — hence attaching here rather than in the
     * constructor, and the guard against doing it twice.
     */
    attach(){
        if(this.attached) return
        this.attached = true
        const previous = this.eps.midiCallback
        this.eps.setMidiCallback((direction, bytes) => {
            this.capture.midi(direction, bytes)
            if(previous) previous(direction, bytes)
        })
        const previousDebug = this.eps.debugCallback
        this.eps.setDebugCallback((message) => {
            this.capture.event("debug", { text: message })
            if(previousDebug) previousDebug(message)
        })
    }

    abort(){ this.aborted = true }

    check(){
        if(this.aborted) throw new Error("Stopped by the operator")
    }

    /***
     * Wraps one probe run: names it in the capture, times it, and makes sure
     * the end marker is written even when the run throws or is stopped.
     */
    async run(name, options, body){
        if(this.running) throw new Error(`${this.running} is already running`)
        this.running = name
        this.aborted = false
        const started = Date.now()
        this.capture.event("probe-start", { probe: name, options })
        this.log(`Probe ${name} started`)
        let outcome = "ok"
        let error = null
        try{
            const result = await body()
            this.capture.event("probe-result", { probe: name, result })
            this.results[name] = result
            return result
        }catch(thrown){
            outcome = "error"
            error = thrown.message
            this.capture.event("probe-error", { probe: name, error: error })
            this.log(`Probe ${name} stopped: ${error}`)
            throw thrown
        }finally{
            this.capture.event("probe-end", { probe: name, outcome, error,
                ms: Date.now() - started })
            await this.capture.checkpoint(`after ${name}`)
            this.running = null
            this.progress(null)
        }
    }

    /***
     * A parameter block, captured rather than merely fetched.
     *
     * getParamBlock in eps.js returns decoded words and nothing else. What the
     * probe needs on top is the *length* of what arrived, because that is the
     * measurement that settles whether the Classic's instrument block is 321
     * words or 323, and it is thrown away by every normal caller.
     *
     * The length is recovered from the decoded array rather than by reaching
     * into the transport: three MIDI bytes carry one word, so a word count is a
     * byte count, and the raw bytes are in the capture either way for anyone
     * who wants to check that claim.
     */
    async block(kind, label){
        this.check()
        this.capture.event("step", { what: label, command: kind.label,
            inst: this.eps.instNum, layer: this.eps.layerNum, ws: this.eps.wsBytes })
        const words = await this.eps.getParamBlock(kind)
        const answered = words.length > 0
        const record = {
            block: kind.label,
            instrument: this.eps.instNum,
            layer: this.eps.layerNum,
            answered,
            words: answered ? Array.from(words) : null,
            wordCount: words.length,
            wireBytes: words.length * 3,
            status: this.eps.lastStatusCode,
            statusText: this.eps.statusText(this.eps.lastStatusCode)
        }
        this.capture.event("block", record)
        return record
    }

    /*** Paces a probe so the synth is not asked for the next thing too soon. */
    async breathe(ms){
        if(ms > 0) await this.eps.sleep(ms)
    }

    /***
     * PROBE A — block dump.
     *
     * Walks the instrument, its layers and its wavesamples, recording every
     * parameter block raw. If the same instrument exists as an .EFE file that
     * this project can already read, comparing the two closes the loop: an EFE
     * is the synth's own RAM image written to disk, and section 7 says the MIDI
     * block is "the data as it exists in RAM", so the two should be identical
     * word for word. A match confirms the whole block layer at once. A mismatch
     * names the exact word offsets that differ, which is just as useful.
     *
     * WHERE THIS DELIBERATELY DOES NOT TRUST ITSELF
     *
     * The obvious way to find the layers and wavesamples is to read the offset
     * tables in the instrument block, which is what the librarian does. But the
     * meaning of those tables is one of the things under test on an unfamiliar
     * machine, so using them as the only guide would make the probe blind to
     * exactly the fault it is looking for.
     *
     * So both: layers 0-7 are asked for unconditionally and the answers are
     * recorded, giving a list that owes nothing to any table; the wavesample
     * list comes from the offset table, because 127 slots is too many to sweep
     * across every layer; and a short independent sweep of the low wavesample
     * numbers is done anyway as a cross check. If the table and the machine
     * disagree, the capture shows it.
     */
    async probeBlocks(options = {}){
        const instruments = options.instruments || [this.eps.instNum]
        const gap = options.gapMs == null ? 150 : options.gapMs
        const scanLimit = options.wsScanLimit == null ? 8 : options.wsScanLimit

        return this.run("blocks", { instruments, gapMs: gap, wsScanLimit: scanLimit }, async () => {
            const found = []
            const restore = { inst: this.eps.instNum, layer: this.eps.layerNum,
                ws: this.eps.wsBytes }
            try{
                for(let index = 0; index < instruments.length; index++){
                    const number = instruments[index]
                    this.check()
                    const base = (index / instruments.length) * 100
                    const span = 100 / instruments.length
                    this.status(`Instrument ${number + 1}: parameter block`)
                    this.progress(base)
                    this.eps.setInstrumentNumber(number)
                    this.eps.setLayerNumber(0)
                    this.eps.setWavesampleNumber(1)

                    const instrument = await this.block(EPS16.BLOCK_INSTRUMENT,
                        `instrument ${number + 1}`)
                    await this.breathe(gap)
                    if(!instrument.answered){
                        this.log(`Instrument ${number + 1}: ${instrument.statusText}`)
                        found.push({ number, empty: true, instrument })
                        continue
                    }

                    // Decoded separately and labelled as a reading, never mixed
                    // into the raw record. On an unfamiliar machine this may be
                    // nonsense, and nonsense next to the bytes that produced it
                    // is informative; nonsense instead of them is not.
                    const interpretation = EPSProbe.interpret(
                        () => EPSBlocks.decodeInstrument(instrument.words))
                    this.capture.event("interpretation",
                        { of: "instrument", number, ...interpretation })
                    if(interpretation.value){
                        this.log(`Instrument ${number + 1}: "${interpretation.value.name}"`
                            + `, ${instrument.wordCount} words`
                            + `, id $${(interpretation.value.id || 0).toString(16)}`)
                    }

                    const entry = { number, empty: false, instrument, interpretation,
                        layers: [], wavesamples: [], scan: [] }

                    // Every layer, whatever the table said.
                    for(let layer = 0; layer < EPSBlocks.LAYER_COUNT; layer++){
                        this.check()
                        this.status(`Instrument ${number + 1}: layer ${layer + 1}`)
                        this.progress(base + span * 0.15)
                        this.eps.setLayerNumber(layer)
                        const block = await this.block(EPS16.BLOCK_LAYER,
                            `instrument ${number + 1} layer ${layer + 1}`)
                        await this.breathe(gap)
                        entry.layers.push({ layer, ...block })
                    }
                    const liveLayers = entry.layers.filter(l => l.answered).map(l => l.layer)
                    this.log(`Instrument ${number + 1}: layers answering `
                        + (liveLayers.length ? liveLayers.map(l => l + 1).join(", ") : "none"))

                    // Wavesamples the instrument's own table claims to have.
                    const claimed = interpretation.value
                        ? interpretation.value.wavesamples.filter(w => w.exists).map(w => w.number)
                        : []
                    const layerOf = (wsNumber) => {
                        for(const record of entry.layers){
                            if(!record.answered) continue
                            const decoded = EPSProbe.interpret(
                                () => EPSBlocks.decodeLayer(record.words))
                            if(decoded.value && decoded.value.wavesamplesUsed.includes(wsNumber)){
                                return record.layer
                            }
                        }
                        return liveLayers.length ? liveLayers[0] : 0
                    }

                    for(let i = 0; i < claimed.length; i++){
                        this.check()
                        const wsNumber = claimed[i]
                        this.status(`Instrument ${number + 1}: wavesample ${wsNumber}`
                            + ` (${i + 1} of ${claimed.length})`)
                        this.progress(base + span * (0.2 + 0.7 * (i / Math.max(1, claimed.length))))
                        const owner = layerOf(wsNumber)
                        this.eps.setLayerNumber(owner)
                        this.eps.setWavesampleNumber(wsNumber)
                        const block = await this.block(EPS16.BLOCK_WAVESAMPLE,
                            `instrument ${number + 1} ws ${wsNumber}`)
                        await this.breathe(gap)
                        const decoded = EPSProbe.interpret(
                            () => EPSBlocks.decodeWavesample(block.words))
                        if(block.answered){
                            this.capture.event("interpretation",
                                { of: "wavesample", number: wsNumber, ...decoded })
                        }
                        entry.wavesamples.push({ number: wsNumber, layer: owner,
                            fromTable: true, ...block, interpretation: decoded })
                    }

                    // The cross check: ask for low numbered wavesamples under
                    // the first live layer regardless of what the table said,
                    // and record which ones answer. Cheap, and the only way the
                    // capture can contradict the table.
                    if(scanLimit > 0 && liveLayers.length){
                        this.eps.setLayerNumber(liveLayers[0])
                        for(let wsNumber = 1; wsNumber <= scanLimit; wsNumber++){
                            this.check()
                            this.status(`Instrument ${number + 1}: cross check ws ${wsNumber}`)
                            this.progress(base + span * (0.9 + 0.1 * (wsNumber / scanLimit)))
                            this.eps.setWavesampleNumber(wsNumber)
                            const block = await this.block(EPS16.BLOCK_WAVESAMPLE,
                                `cross check ws ${wsNumber}`)
                            await this.breathe(gap)
                            entry.scan.push({ number: wsNumber, layer: liveLayers[0],
                                answered: block.answered, wordCount: block.wordCount,
                                status: block.status, statusText: block.statusText })
                        }
                        const answered = entry.scan.filter(s => s.answered).map(s => s.number)
                        const disagreement = answered.filter(n => !claimed.includes(n))
                            .concat(claimed.filter(n => n <= scanLimit && !answered.includes(n)))
                        if(disagreement.length){
                            this.log(`NOTE: instrument ${number + 1} — the offset table and the `
                                + `machine disagree about wavesample(s) `
                                + `${disagreement.join(", ")}. Captured.`)
                            this.capture.event("finding", { probe: "blocks",
                                what: "offset table disagrees with the machine",
                                instrument: number, wavesamples: disagreement,
                                claimed, answered })
                        }
                    }

                    found.push(entry)
                }
            }finally{
                this.eps.instNum = restore.inst
                this.eps.layerNum = restore.layer
                this.eps.wsBytes = restore.ws
            }

            // The measurement this probe exists for, stated plainly so it is
            // readable without tooling.
            const lengths = {}
            for(const entry of found){
                if(entry.empty) continue
                lengths.instrument = entry.instrument.wordCount
                for(const layer of entry.layers){
                    if(layer.answered) lengths.layer = layer.wordCount
                }
                for(const ws of entry.wavesamples){
                    if(ws.answered) lengths.wavesample = ws.wordCount
                }
            }
            this.capture.event("finding", { probe: "blocks", what: "block lengths in words",
                lengths, expected16Plus: { instrument: 323, layer: 107, wavesample: 139 } })
            this.log(`Block lengths: instrument ${lengths.instrument || "?"}, `
                + `layer ${lengths.layer || "?"}, wavesample ${lengths.wavesample || "?"} words `
                + `(EPS-16 PLUS: 323, 107, 139)`)

            return { instruments: found, lengths }
        })
    }

    /***
     * Finds a wavesample worth pointing the wavedata probe at, inside one
     * instrument, without anybody having to choose one.
     *
     * WHY THIS EXISTS RATHER THAN THREE DROPDOWNS
     *
     * Asking the person at the synth to pick an instrument, a layer and a
     * wavesample asks them to know things the app can work out: that a layer
     * number is not the same as a layer that exists, that a wavesample which
     * says it holds four hundred samples might hold none of its own, and that
     * an empty slot answers with a refusal rather than silence. Every one of
     * those is a way for a session to produce a capture of nothing.
     *
     * So the instrument is fixed — slot 1 unless told otherwise — and the rest
     * is measured. Which of the eight layers actually answer, which wavesamples
     * the instrument's own table claims, and then a look at each one to find
     * out how much audio it really has.
     *
     * Two things disqualify a candidate:
     *
     *   A copy. Section 7.3 word 12: if it is non-zero the wavesample holds no
     *   audio of its own and shares another's. Asking for its wavedata answers
     *   $11, "Wavesample is a copy", so a probe pointed at one measures nothing
     *   and looks broken doing it.
     *
     *   Too short. A handful of samples cannot say anything convincing about
     *   which bits a machine keeps, and the write test's pattern has a floor of
     *   35 samples before it can even be sent.
     *
     * The largest survivor wins, on the reasoning that the longest wavesample
     * in an instrument is the one most likely to be a real recording rather
     * than a click or a single cycle — and the probe only ever reads or writes
     * its first few thousand samples, so size costs nothing.
     *
     * Read-only. Nothing here changes anything on the synth, which is what lets
     * the write test call it first and name its target in the confirmation.
     */
    static TARGET_MINIMUM_SAMPLES = 256

    async findWavedataTarget(instrumentNumber = 0, options = {}){
        const minimum = options.minimumSamples || EPSProbe.TARGET_MINIMUM_SAMPLES
        this.status(`Looking for a wavesample in instrument ${instrumentNumber + 1}`)
        this.capture.event("step", { what: "finding a wavedata target",
            instrument: instrumentNumber, minimumSamples: minimum })

        this.eps.setInstrumentNumber(instrumentNumber)
        this.eps.setLayerNumber(0)
        this.eps.setWavesampleNumber(1)

        const instrument = await this.block(EPS16.BLOCK_INSTRUMENT,
            `target search: instrument ${instrumentNumber + 1}`)
        if(!instrument.answered){
            throw new Error(`Instrument ${instrumentNumber + 1} did not answer `
                + `(${instrument.statusText}). Load an instrument into that slot from disk.`)
        }
        const decoded = EPSProbe.interpret(() => EPSBlocks.decodeInstrument(instrument.words))
        if(!decoded.value){
            throw new Error(`Instrument ${instrumentNumber + 1} could not be read: ${decoded.error}`)
        }

        // Which layers exist, asked rather than inferred, and what each claims
        // to hold. A layer that does not answer is simply not there.
        const layers = []
        for(let layer = 0; layer < EPSBlocks.LAYER_COUNT; layer++){
            this.check()
            this.eps.setLayerNumber(layer)
            const block = await this.block(EPS16.BLOCK_LAYER, `target search: layer ${layer + 1}`)
            if(!block.answered) continue
            const map = EPSProbe.interpret(() => EPSBlocks.decodeLayer(block.words))
            layers.push({ number: layer, uses: map.value ? map.value.wavesamplesUsed : [] })
        }
        if(layers.length == 0){
            throw new Error(`Instrument ${instrumentNumber + 1} has no layers that answer`)
        }

        const claimed = decoded.value.wavesamples.filter(w => w.exists).map(w => w.number)
        const candidates = []
        for(const number of claimed){
            this.check()
            // A wavesample is addressed through the layer that owns it, so the
            // layer maps decide which one to ask under. Anything no map
            // mentions is asked for under the first live layer, which is the
            // only guess available and is recorded when it happens.
            const owner = layers.find(l => l.uses.includes(number)) || layers[0]
            this.eps.setLayerNumber(owner.number)
            this.eps.setWavesampleNumber(number)
            const block = await this.block(EPS16.BLOCK_WAVESAMPLE,
                `target search: wavesample ${number}`)
            if(!block.answered) continue
            const ws = EPSProbe.interpret(() => EPSBlocks.decodeWavesample(block.words))
            if(!ws.value) continue
            candidates.push({
                instrument: instrumentNumber, layer: owner.number, wavesample: number,
                name: ws.value.name, sampleEnd: ws.value.sampleEnd,
                isCopy: ws.value.isCopy, guessedLayer: !layers.some(l => l.uses.includes(number)),
                words: block.words
            })
        }

        const usable = candidates
            .filter(c => !c.isCopy && c.sampleEnd >= minimum)
            .sort((a, b) => b.sampleEnd - a.sampleEnd)

        this.capture.event("finding", { probe: "wavedata", what: "target search",
            instrument: instrumentNumber, layers: layers.map(l => l.number),
            candidates: candidates.map(({ words, ...rest }) => rest),
            chosen: usable.length ? usable[0].wavesample : null })

        if(usable.length == 0){
            const why = candidates.length == 0
                ? "it has no wavesamples that answer"
                : `its ${candidates.length} wavesample(s) are all copies or shorter than `
                    + `${minimum} samples`
            throw new Error(`Nothing usable in instrument ${instrumentNumber + 1}: ${why}. `
                + `Load a sampled instrument into that slot and try again.`)
        }

        const chosen = usable[0]
        this.log(`Target: instrument ${chosen.instrument + 1}, layer ${chosen.layer + 1}, `
            + `wavesample ${chosen.wavesample} "${chosen.name}", `
            + `${chosen.sampleEnd.toLocaleString()} samples`
            + (usable.length > 1 ? ` (the largest of ${usable.length} usable)` : ""))
        return chosen
    }

    /***
     * Compares a block probe against an instrument read from an .EFE file.
     *
     * Offline, so it can be run long after the session by anyone holding the
     * capture and the file. Word by word, and the differing offsets are listed
     * rather than counted, because "words 18 and 105 differ" is a diagnosis and
     * "2 words differ" is not.
     */
    compareWithEfe(blockResult, efeInstrument, instrumentNumber = null){
        const entry = blockResult.instruments.find(i => !i.empty
            && (instrumentNumber == null || i.number == instrumentNumber))
        if(!entry) throw new Error("The block probe found no instrument to compare")

        const diff = (fromSynth, fromFile, label) => {
            if(!fromSynth || !fromFile) return { label, compared: 0, missing: true }
            const shared = Math.min(fromSynth.length, fromFile.length)
            const differing = []
            for(let word = 0; word < shared; word++){
                if((fromSynth[word] & 0xFFFF) == (fromFile[word] & 0xFFFF)) continue
                differing.push({ word, synth: fromSynth[word], file: fromFile[word] })
            }
            return { label, compared: shared,
                synthWords: fromSynth.length, fileWords: fromFile.length,
                identical: differing.length == 0, differing }
        }

        const report = { instrument: null, layers: [], wavesamples: [] }
        report.instrument = diff(entry.instrument.words,
            efeInstrument.instrument.words, "instrument")

        for(const layer of entry.layers.filter(l => l.answered)){
            const fromFile = efeInstrument.layers.find(l => l.number == layer.layer)
            report.layers.push(diff(layer.words, fromFile && fromFile.words,
                `layer ${layer.layer + 1}`))
        }
        for(const ws of entry.wavesamples.filter(w => w.answered)){
            const fromFile = efeInstrument.wavesamples.find(w => w.number == ws.number)
            report.wavesamples.push(diff(ws.words, fromFile && fromFile.words,
                `wavesample ${ws.number}`))
        }

        // Words 29 and up of the instrument block are RAM addresses, so they
        // are expected to differ and their differing says nothing. Called out
        // rather than filtered, because "everything below 29 matches" is the
        // result and hiding the rest would leave that unsaid.
        report.instrumentParametersMatch = report.instrument.differing
            .every(entry => entry.word >= EPS16.RESTORE_PARAMETER_WORDS)
        report.summary = `instrument ${report.instrument.identical ? "identical"
            : `${report.instrument.differing.length} words differ`
                + `${report.instrumentParametersMatch ? " (all pointers, parameters match)" : ""}`}`
            + `; layers ${report.layers.filter(l => l.identical).length}/${report.layers.length} identical`
            + `; wavesamples ${report.wavesamples.filter(w => w.identical).length}`
            + `/${report.wavesamples.length} identical`

        this.capture.event("finding", { probe: "efe-compare", ...report })
        this.log(`EFE comparison: ${report.summary}`)
        return report
    }

    /***
     * PROBE B — parameter sweep.
     *
     * Asks GET PARAMETER for every page and item in a range and records what
     * came back. Read-only, so it is safe to run on a machine holding work
     * somebody cares about.
     *
     * This is the probe that no amount of instrument dumping replaces. A block
     * transfer never names a parameter number, so the Classic's page and item
     * map — which the 16 PLUS renumbered wholesale, merging the Classic's
     * separate MIDI page $0C and System page $0D into one — can only be found
     * by asking. An invalid number answers $03 "Invalid Param Number", which is
     * a fast, definite no, so a sweep of a thousand numbers is minutes rather
     * than hours.
     *
     * The timeout is short on purpose and adjustable from the panel. Most of a
     * sweep is refusals, which come back immediately; only a page the machine
     * ignores entirely costs the full wait, and paying four seconds for each of
     * those turns a four minute sweep into an hour.
     */
    async probeParameters(options = {}){
        const pageFrom = options.pageFrom == null ? 0x00 : options.pageFrom
        const pageTo = options.pageTo == null ? 0x0F : options.pageTo
        const itemFrom = options.itemFrom == null ? 0x00 : options.itemFrom
        const itemTo = options.itemTo == null ? 0x1F : options.itemTo
        const timeoutMs = options.timeoutMs || 400
        const gap = options.gapMs == null ? 30 : options.gapMs
        const label = options.label || "sweep"

        return this.run("parameters", { pageFrom, pageTo, itemFrom, itemTo,
                timeoutMs, gapMs: gap, label }, async () => {
            const values = []
            const total = (pageTo - pageFrom + 1) * (itemTo - itemFrom + 1)
            let done = 0
            let answered = 0

            for(let page = pageFrom; page <= pageTo; page++){
                for(let item = itemFrom; item <= itemTo; item++){
                    this.check()
                    const answer = await this.eps.getParameter(page, item, timeoutMs)
                    done++
                    const record = { page, item,
                        answered: answer.answered, value: answer.value,
                        status: answer.status,
                        statusText: this.eps.statusText(answer.status) }
                    values.push(record)
                    // Only the ones that said something go in the capture as
                    // their own line. A thousand "invalid parameter number"
                    // lines would bury the sixty that matter, and the count of
                    // them is in the result object anyway.
                    if(answer.value !== null){
                        answered++
                        this.capture.event("parameter", { label, ...record })
                    }
                    if(done % 16 == 0 || done == total){
                        this.progress(Math.round((done / total) * 100))
                        this.status(`Parameter sweep: page $${page.toString(16)
                            .padStart(2, "0")} item $${item.toString(16).padStart(2, "0")}`
                            + ` — ${answered} answered of ${done} tried`)
                    }
                    await this.breathe(gap)
                }
                // Flushed per page so a sweep that dies half way through has
                // written everything up to the page it died on.
                await this.capture.flush()
            }

            const live = values.filter(v => v.value !== null)
            this.capture.event("finding", { probe: "parameters", label,
                tried: values.length, answered: live.length,
                pages: [...new Set(live.map(v => v.page))] })
            this.log(`Parameter sweep "${label}": ${live.length} of ${values.length} `
                + `numbers returned a value, on pages `
                + `${[...new Set(live.map(v => "$" + v.page.toString(16).padStart(2, "0")))].join(", ")}`)
            return { label, values, answered: live.length, tried: values.length }
        })
    }

    /***
     * The differential half of probe B.
     *
     * A sweep says which parameter numbers exist. It cannot say what any of
     * them mean, because the value of parameter $0D05 is just a number. So:
     * sweep, have the person at the synth change exactly one thing on the front
     * panel, sweep again, and the number that moved is that thing. Fifteen of
     * these and the Classic's map is documented rather than reconstructed.
     *
     * Free running values are the trap. Free memory, for instance, changes on
     * its own, and so does anything the sequencer touches, so a diff always has
     * a little noise in it and the answer is the parameter that moved *by the
     * amount the control moved*, not merely the only one that moved.
     */
    diffParameters(before, after){
        const key = (record) => `${record.page},${record.item}`
        const map = new Map(before.values.map(record => [key(record), record]))
        const changes = []
        for(const record of after.values){
            const was = map.get(key(record))
            if(!was) continue
            if(was.value === record.value) continue
            changes.push({ page: record.page, item: record.item,
                from: was.value, to: record.value,
                delta: (was.value == null || record.value == null)
                    ? null : record.value - was.value })
        }
        const report = { before: before.label, after: after.label, changes }
        this.capture.event("finding", { probe: "parameter-diff", ...report })
        this.log(`Parameter diff ${before.label} → ${after.label}: `
            + (changes.length == 0 ? "nothing changed"
                : changes.map(c => `$${c.page.toString(16).padStart(2, "0")}`
                    + `${c.item.toString(16).padStart(2, "0")}: ${c.from} → ${c.to}`).join(", ")))
        return report
    }

    /***
     * PROBE C — wavedata.
     *
     * Two halves. The read half is safe on any machine: pull samples out of the
     * selected wavesample and look at which bit positions ever carry a one. If
     * bits 0, 1 and 2 are clear across tens of thousands of samples, the machine
     * is keeping thirteen bits, and that is a measurement of Appendix B rather
     * than a reading of it.
     *
     * Which wavesample it works on is found rather than chosen — see
     * findWavedataTarget. Pass `target` to use one already found, which is what
     * the write half does so that the confirmation dialog can name the
     * wavesample it is about to destroy before anybody agrees to it.
     *
     * The write half OVERWRITES THE AUDIO in that wavesample and is off
     * unless `write` is set. It sends a pattern built to exercise each bit
     * position on its own (see EPSBitDepth.bitProbePattern — a ramp cannot
     * answer this question, because every value in a ramp differs from its
     * neighbour in the low bits and a machine that drops them still returns
     * something ramp shaped) and compares the readback bit by bit. That says
     * not only how many bits survive but whether the machine rounds or
     * truncates on the way, which is what decides whether uploads should be
     * dithered before they are sent.
     *
     * Writes stay inside the wavesample's existing length. Growing one is a
     * different conversation with the synth involving create and truncate, and
     * whether those work on a Classic is its own unknown; this probe is about
     * the data path and nothing else.
     */
    async probeWavedata(options = {}){
        const write = options.write == true
        const requested = options.length || 4096
        const instrumentNumber = options.instrument == null ? 0 : options.instrument

        return this.run("wavedata", { write, length: requested,
                instrument: instrumentNumber }, async () => {
            this.progress(0)
            // Given by the caller when the target was found in advance, which is
            // how the write half gets to name it in a confirmation first.
            const target = options.target
                || await this.findWavedataTarget(instrumentNumber, options)

            this.eps.setInstrumentNumber(target.instrument)
            this.eps.setLayerNumber(target.layer)
            this.eps.setWavesampleNumber(target.wavesample)
            const end = target.sampleEnd
            this.capture.event("finding", { probe: "wavedata", what: "target",
                instrument: target.instrument, layer: target.layer,
                wavesample: target.wavesample, name: target.name, sampleEnd: end })

            const length = Math.min(requested, end)
            this.log(`Wavedata probe on instrument ${target.instrument + 1}, `
                + `layer ${target.layer + 1}, wavesample ${target.wavesample} `
                + `"${target.name}": it holds ${end.toLocaleString()} samples, using ${length}`)

            this.status(`Reading ${length} samples`)
            const original = await this.readSamples(0, length, 0, 45)
            const before = EPSBitDepth.analyse(original)
            this.capture.event("finding", { probe: "wavedata", what: "existing data",
                analysis: before, firstSamples: original.slice(0, 64) })
            // Silence is a real outcome, not a 16 bit machine. An unused
            // wavesample reads back as zeros, every bit is clear, and a naive
            // reading of that mask says "no low bits set, therefore 13 bits" —
            // which would be the wrong conclusion drawn confidently.
            if(before.lowestSetBit < 0){
                this.log(`Existing data is entirely zeros, which says nothing about the `
                    + `machine. Point the probe at a wavesample holding real audio.`)
            }else{
                this.log(`Existing data: lowest set bit ${before.lowestSetBit}`
                    + `, so about ${before.effectiveBits} significant bits`
                    + `; low three bits always zero: ${before.lowThreeBitsAlwaysZero}`)
            }

            const result = { target, length, before, roundTrip: null }

            if(!write){
                this.progress(100)
                this.status("Wavedata read probe finished")
                return result
            }

            // The write half. Everything above this line was read-only.
            //
            // bitProbePattern has a floor: the bit exercising section alone is
            // 37 samples and it will not return fewer, so a wavesample shorter
            // than that would be written past its end. Growing a wavesample is
            // a different conversation with the synth — create, then truncate,
            // then grow — and whether those work on an unfamiliar machine is
            // its own question, not this probe's.
            const pattern = EPSBitDepth.bitProbePattern(length)
            if(pattern.length > end){
                throw new Error(`This wavesample holds only ${end} samples and the test `
                    + `pattern needs ${pattern.length}. Point the probe at a longer one.`)
            }
            this.capture.event("step", { what: "writing bit probe pattern",
                length: pattern.length, firstSamples: pattern.slice(0, 64) })
            this.status(`Writing ${pattern.length} test samples`)
            this.log(`Writing the bit probe pattern over ${pattern.length} samples of `
                + `instrument ${target.instrument + 1}, layer ${target.layer + 1}, `
                + `wavesample ${target.wavesample} "${target.name}"`)

            const chunk = this.eps.chunkSize
            for(let offset = 0; offset < pattern.length; offset += chunk){
                this.check()
                const slice = pattern.slice(offset, Math.min(offset + chunk, pattern.length))
                const sent = await this.eps.putWavesampleData(slice, offset)
                if(!sent) throw new Error(`The synth refused the block at offset ${offset}`)
                this.progress(45 + Math.round((offset / pattern.length) * 30))
                this.status(`Writing test samples: ${offset + slice.length} of ${pattern.length}`)
            }

            await this.breathe(1000)
            this.status("Reading the pattern back")
            const readBack = await this.readSamples(0, pattern.length, 75, 100)
            const comparison = EPSBitDepth.compareRoundTrip(pattern, readBack)
            const after = EPSBitDepth.analyse(readBack)
            result.roundTrip = { comparison, after,
                sent: pattern.slice(0, 64), received: readBack.slice(0, 64) }

            this.capture.event("finding", { probe: "wavedata", what: "round trip",
                comparison, after,
                // The first 64 of each inline, so the headline is readable in
                // the capture without cross referencing the raw hex. The rest
                // is recoverable from the MIDI events either way.
                sent: pattern.slice(0, 64), received: readBack.slice(0, 64) })

            this.log(`Round trip: ${comparison.identical} of ${comparison.compared} samples `
                + `came back identical. What the synth stores is quantised to `
                + `${comparison.quantum === null ? "nothing" : comparison.quantum}`
                + `, so it keeps ${comparison.effectiveBits} bits, and it `
                + `${comparison.behaviour}`
                + ` (error ${comparison.error.min} to ${comparison.error.max}, `
                + `mean ${comparison.error.mean.toFixed(2)}).`)
            if(comparison.effectiveBits == 13){
                this.log(`Thirteen bits is what Appendix B describes for the original EPS. `
                    + (comparison.behaviour == "rounds"
                        ? `It rounds, so the machine is already doing the right thing and `
                            + `uploads need only be dithered (EPSBitDepth.to13).`
                        : `It does not round, so every sample is biased by up to a full step; `
                            + `uploads should be rounded and dithered before sending `
                            + `(EPSBitDepth.to13).`))
            }
            this.progress(100)
            return result
        })
    }

    /***
     * Reads a range of samples in blocks, reporting progress across a span of
     * the overall probe rather than 0-100, so a probe with several phases has
     * one bar that only ever moves forwards.
     */
    async readSamples(start, end, progressFrom, progressTo){
        const chunk = this.eps.chunkSize
        let samples = []
        for(let offset = start; offset < end; offset += chunk){
            this.check()
            const to = Math.min(offset + chunk, end)
            const part = await this.eps.getWavesampleData(offset, to)
            if(part.length == 0){
                this.log(`No answer for samples ${offset}-${to}, stopping the read there`)
                break
            }
            samples = samples.concat(part)
            const fraction = (offset - start) / Math.max(1, end - start)
            this.progress(Math.round(progressFrom + (progressTo - progressFrom) * fraction))
            this.status(`Read ${samples.length} of ${end - start} samples`)
        }
        return samples
    }

    /***
     * Runs a decode without letting it take the probe down with it.
     *
     * Every decoder in this project was written against the EPS-16 PLUS. Handed
     * a block from a machine whose layout differs it may throw, and a probe
     * that dies while interpreting data it has already safely captured would be
     * the worst possible way to lose a session.
     */
    static interpret(body){
        try{
            return { value: body(), error: null }
        }catch(error){
            return { value: null, error: error.message }
        }
    }
}

// Node runs the tests; the browser gets the classes from the script tags.
if(typeof module != 'undefined' && module.exports){
    module.exports = { EPSCapture, EPSProbe }
}
