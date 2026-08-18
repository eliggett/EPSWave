/***
 * Hardware probes and the capture format they write.
 *
 * WHY THIS EXISTS
 *
 * Everything the project knows about the EPS-16 PLUS comes from Ensoniq's
 * External Command Specification, which states on its first page that it
 * "applies specifically to the EPS-16 PLUS only (not the Original EPS)".
 * These probes were written when the original EPS had no manual to hand, and
 * everything the project knew about it came from Andrew Arensburger's 1992
 * sysex library in reference/code/eps2.0/ — genuinely useful, because its
 * author owned a Classic and not a 16 PLUS, so its Classic paths are the tested
 * ones and its 16 PLUS paths are the guesses.
 *
 * Four things were not settled by either source. Ensoniq's own EPS External
 * Command Specification of June 12 1989 has since turned up, and it answers
 * three of them outright:
 *
 *   1. ANSWERED. The Classic's parameter numbers. The 16 PLUS merged the
 *      Classic's separate System (page $0D) and MIDI (page $0C) pages into one
 *      and renumbered them. eps.h has a reconstruction, but it is incomplete
 *      and has collisions in it (PE1_L1S and PE1_L4H are both $010E). Section 9
 *      of the 1989 specification gives the full map and cross-checks exactly
 *      against eps.h wherever the two overlap; it settles that collision as
 *      Level 4 Hard $010E, Level 1 Soft $010F. No amount of dumping instruments
 *      reveals any of this, because block transfers never mention a parameter
 *      number.
 *   2. ANSWERED. Block lengths. eps.h allocates for an instrument block of 968
 *      bytes where section 7.1 describes 969, which is 321 words against 323 —
 *      a difference of exactly the effect offset the Classic cannot have. The
 *      1989 sections 7.1 to 7.4 give 323 / 107 / 139 / 107, the same as the 16
 *      PLUS, making the eps.h figure an allocation quirk.
 *   3. ANSWERED. Which fields the 16 PLUS added in the low bytes of existing
 *      words. All of them: every one of the 1989 document's four block tables
 *      is headed "all values in hi byte of word", with no escape clause and no
 *      split-word entry anywhere in it. That includes word 105, where the
 *      Classic keeps wavesample pan and the 16 PLUS does not.
 *   4. STILL OPEN. Whether the Classic truncates or rounds when it discards the
 *      low three bits of every sample. The specification does not mention it.
 *
 * So: three probes, one per question that hardware can answer, plus a capture
 * format built on the assumption that there is exactly one session with a
 * borrowed machine and no second chance to ask a follow up question. Two of
 * those probes now confirm a documented answer rather than discovering an
 * unknown one, which makes them cheaper to interpret and no less worth running
 * — a specification is a statement of intent, and this one is thirty six years
 * old.
 *
 * What is still genuinely unknown, and worth watching for in a capture:
 *
 *   - Word 105's pan SCALE. The byte is settled; the value is not. The Classic
 *     numbers pan 0-18 by Table 5, where 9-16 are Solo Out 1-8; the 16 PLUS
 *     uses -99 to +99 and routes elsewhere. See EPSBlocks.WS_PAN_WORD.
 *   - Whether any parameter silently refuses a single PUT. The 16 PLUS marks
 *     these "*" and "**". The 1989 specification has no such marker system —
 *     its only stated restriction is "Read Only" on three items — so this was
 *     never written down for the Classic rather than lost in transmission.
 *   - Whether modulation source really tops out at 15. Table 2 lists 0-15;
 *     sections 9.5 and 9.7 to 9.10 say 0-17 and 0-18.
 *
 * reference/eps-classic-vs-16plus.md has the whole comparison, both machines'
 * value ranges, and the notation trap that makes a Classic page number a
 * quarter of the byte that goes on the wire.
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
                // Not back to wherever it started — onto instrument 1, every
                // time, including when the dump was stopped or threw.
                //
                // Every command carries an instrument, layer and wavesample in
                // its header, so GET PARAMETER answers about whichever one the
                // app is currently addressing. A dump walks all eight and used
                // to leave the app pointed at the last one it touched, which
                // silently became the subject of every parameter sweep that
                // followed. Measured on hardware: the values read back really
                // do change with the selection, so a sweep taken after a dump
                // and one taken before it were not comparable, and neither was
                // reliably about anything in particular.
                //
                // Parking somewhere fixed and known makes the selection a
                // constant rather than a variable nobody was tracking.
                await this.parkOn(EPSProbe.RESTING_INSTRUMENT, found)
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
     * Where everything is left pointing when a probe finishes: instrument 1.
     */
    static RESTING_INSTRUMENT = 0

    /***
     * Points the app at a known instrument, and at a layer and wavesample
     * inside it that actually exist.
     *
     * The layer and wavesample matter as much as the instrument. Addressing
     * instrument 1 layer 1 wavesample 1 sounds safe and is not: plenty of
     * instruments have no layer 1 or no wavesample 1, and then every layer and
     * wavesample parameter in a sweep answers with a refusal instead of a
     * value. That would look like a machine with a much smaller parameter map
     * than it has, which is exactly the wrong conclusion to hand back from a
     * session that cannot be repeated.
     *
     * So the dump's own findings are used where they are available, and where
     * they are not it falls back to the first of each and says so.
     */
    async parkOn(instrumentNumber, found = []){
        const entry = found.find(i => i && !i.empty && i.number == instrumentNumber)
        let layer = 0
        let wavesample = 1
        let informed = false
        if(entry){
            const liveLayer = entry.layers.find(l => l.answered)
            const liveWs = entry.wavesamples.find(w => w.answered
                && (!liveLayer || w.layer == liveLayer.layer))
                || entry.wavesamples.find(w => w.answered)
            if(liveLayer){ layer = liveLayer.layer; informed = true }
            if(liveWs){ wavesample = liveWs.number; informed = true }
        }
        // Two separate things, and the second is the one that was missing.
        //
        // These three lines only change who the *next message* is addressed to.
        // The synth's own selection — the instrument lit on the front panel —
        // is a different piece of state entirely, and nothing here touched it,
        // which is why a dump kept ending with instrument 8 selected however
        // often this said it had parked on 1.
        this.eps.setInstrumentNumber(instrumentNumber)
        this.eps.setLayerNumber(layer)
        this.eps.setWavesampleNumber(wavesample)

        // So press the button, and then check, out loud, that it took.
        const selection = await this.eps.selectInstrumentOnSynth(instrumentNumber,
            text => this.log(text))
        this.capture.event("finding", { probe: "addressing", what: "selected on the synth",
            requested: selection.requested, reported: selection.reported,
            name: selection.name, ok: selection.ok, status: selection.status,
            packet: EPS16.packetHex(selection.packet),
            note: "VIRTUAL BUTTON PRESS of the Instrument button, then Current "
                + "Edit Instr. ($38 $00) and the instrument block's name read "
                + "back to confirm it." })
        if(!selection.ok){
            this.log(`NOTE: the synth did not confirm instrument ${instrumentNumber + 1}. `
                + `Anything read after this may be about a different instrument.`)
        }

        const target = { instrument: instrumentNumber, layer, wavesample, informed,
            selected: selection.ok, reported: selection.reported, name: selection.name }
        this.capture.event("finding", { probe: "addressing", what: "parked",
            ...target,
            note: "Everything after this addresses these numbers until something "
                + "changes them. GET PARAMETER answers about whatever is in the "
                + "message header, so this is the subject of every later sweep." })
        this.log(`Now addressing instrument ${instrumentNumber + 1}, layer ${layer + 1}, `
            + `wavesample ${wavesample}`
            + (informed ? " (found in the dump)" : " (nothing dumped to go on, so the first of each)"))
        return target
    }

    static hex2(value){ return Number(value).toString(16).toUpperCase().padStart(2, "0") }

    /*** What the app is addressing right now, for the record. */
    addressing(){
        return {
            instrument: this.eps.instNum,
            layer: this.eps.layerNum,
            wavesample: (this.eps.wsBytes[0] << 6) | this.eps.wsBytes[1]
        }
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
     *
     * NARROWED SWEEPS
     *
     * Pass `only` — a list of {page, item} — to ask about those numbers and
     * nothing else. This is what makes the differential test practical. Of the
     * 512 numbers a default sweep asks about, only some tens ever answer, so a
     * repeat sweep spends the overwhelming majority of its time re-confirming
     * that the same several hundred numbers are still invalid. Reading back
     * only the live ones turns a snapshot from a minute into a few seconds,
     * and the differential test is a sequence of snapshots — which is the
     * difference between covering five front panel controls in a session and
     * covering twenty.
     *
     * The trade is that a number which is invalid during the establishing
     * sweep and becomes valid later is never revisited. For the differential
     * test, where what changes between snapshots is one control on the front
     * panel, that is a small risk knowingly taken; the full range is still one
     * checkbox away.
     */
    /***
     * How many silent commands in a row mean the machine has gone, rather than
     * one reply being missed.
     *
     * An invalid parameter number is answered — with $03, immediately — so
     * silence is not how a synth says no. Six in a row is a machine that has
     * stopped listening, and on an EPS-16 PLUS that has been seen to mean
     * "Error 129 — Reboot?" on the display. Carrying on from there sends
     * hundreds more commands into the void, wastes the rest of a session that
     * may not be repeatable, and buries the one parameter that caused it under
     * a wall of identical silence.
     */
    static SILENCE_IS_A_CRASH = 6

    async probeParameters(options = {}){
        // The pages an instrument is made of, by default — see
        // EPS16.PARAMETER_PAGES. Not every page section 9 documents, because
        // reading and writing instruments and wavesamples does not depend on
        // the sequencer, the system settings or the effects, and the effects
        // page is where the machine has been seen to crash.
        const pages = options.pages || EPS16.instrumentPages()
        const itemFrom = options.itemFrom == null ? 0x00 : options.itemFrom
        const itemTo = options.itemTo == null ? 0x1F : options.itemTo
        const timeoutMs = options.timeoutMs || 400
        // 150 ms. Measured on an EPS-16 PLUS, which answered consistently
        // anywhere above about 75; this doubles that, on the grounds that the
        // machine the probe was written for has never been tested and the
        // reference library's own between-commands pause is 200.
        const gap = options.gapMs == null ? 150 : options.gapMs
        const label = options.label || "sweep"

        // Either the numbers we were handed, or every number in the range.
        // Building the list up front rather than looping over the ranges keeps
        // the two cases on one code path, so a narrowed sweep cannot drift
        // away from a full one in how it records or paces itself.
        /***
         * `high` and `low` are the two bytes that go on the wire, which is also
         * how section 9 indexes itself: each of its tables is headed with a
         * "SysEx High Byte" and its rows give low bytes.
         *
         * NOTHING HERE CONVERTS ANYTHING, on purpose. The first version of this
         * carried section 9's high bytes and then passed them through the
         * page/item packer on the way out, which turned envelope 3 ($0C) into
         * the effects page ($30) and crashed the machine. Speaking one
         * representation from the table to the wire removes the conversion, and
         * with it the chance of doing it backwards.
         */
        const targets = []
        if(options.only){
            for(const target of options.only){
                targets.push({ high: target.high, low: target.low })
            }
        }else{
            for(const high of pages){
                // Where a page has a documented end, stop there. The effects
                // page is not merely undefined past item $09, it is dangerous;
                // see EPS16.PARAMETER_PAGES.
                const known = EPS16.parameterPage(high)
                const last = known && known.maxItem != null
                    ? Math.min(itemTo, known.maxItem) : itemTo
                for(let low = itemFrom; low <= last; low++) targets.push({ high, low })
            }
        }
        const narrowed = options.only != null

        // Which instrument, layer and wavesample this sweep is about. Recorded
        // because it is not a detail: the values come back for whatever is in
        // the message header, so two sweeps taken against different selections
        // are measuring different things however alike their numbers look.
        const addressing = this.addressing()

        return this.run("parameters", { pages, itemFrom, itemTo,
                timeoutMs, gapMs: gap, label, narrowed, count: targets.length,
                addressing }, async () => {
            const values = []
            let answered = 0
            let silent = 0
            let crashedAt = null

            for(let done = 0; done < targets.length; done++){
                this.check()
                const { high, low } = targets[done]
                // getParameter, which takes the two wire bytes as they are.
                // Not getParameterAt — that packs a page and an item into them,
                // and these are already packed.
                const answer = await this.eps.getParameter(high, low, timeoutMs)
                // The same number the reference library would call it by, for
                // anyone reading the capture with eps.h open. Derived here
                // rather than sent: the wire carries `high` and `low`.
                const number = (high << 6) | low
                const record = { high, low, number,
                    page: (number >> 8) & 0xFF, item: number & 0xFF,
                    answered: answer.answered, value: answer.value,
                    status: answer.status,
                    statusText: this.eps.statusText(answer.status) }
                values.push(record)

                // Silence is not how a synth refuses; it answers $03 for that.
                // A run of it means the machine has stopped listening, and the
                // last thing it was asked is the interesting part.
                silent = answer.answered ? 0 : silent + 1
                if(silent >= EPSProbe.SILENCE_IS_A_CRASH){
                    crashedAt = values[values.length - silent] || record
                    const where = EPS16.parameterPage(crashedAt.high)
                    this.capture.event("finding", { probe: "parameters",
                        what: "the synth stopped answering", label,
                        lastAnswered: values.filter(v => v.answered).slice(-1)[0] || null,
                        firstSilent: crashedAt, silentInARow: silent })
                    this.log(`STOPPED: the synth went quiet after `
                        + `$${EPSProbe.hex2(crashedAt.high)} $${EPSProbe.hex2(crashedAt.low)}`
                        + `${where ? ` (${where.name} page)` : ""}`
                        + ` and has not answered ${silent} commands since. Check its display — `
                        + `if it is showing an error, note the number in the capture and `
                        + `reboot it. The sweep has stopped rather than sending hundreds more `
                        + `commands into the dark.`)
                    break
                }
                // Only the ones that said something go in the capture as their
                // own line. Five hundred "invalid parameter number" lines would
                // bury the sixty that matter, and the count of them is in the
                // result object anyway.
                if(answer.value !== null){
                    answered++
                    this.capture.event("parameter", { label, narrowed, ...record })
                }
                if(done % 16 == 0 || done == targets.length - 1){
                    this.progress(Math.round(((done + 1) / targets.length) * 100))
                    const known = EPS16.parameterPage(high)
                    this.status(`Parameter sweep${narrowed ? " (narrowed)" : ""}: `
                        + `$${EPSProbe.hex2(high)} $${EPSProbe.hex2(low)}`
                        + `${known ? ` (${known.name})` : ""}`
                        + ` — ${answered} answered of ${done + 1} tried`)
                    // Flushed as it goes rather than at the end, so a sweep that
                    // dies half way through has written everything up to the
                    // point it died.
                    await this.capture.flush()
                }
                await this.breathe(gap)
            }

            const live = values.filter(v => v.value !== null)
            this.capture.event("finding", { probe: "parameters", label, narrowed, addressing,
                tried: values.length, answered: live.length, crashedAt,
                pages: [...new Set(live.map(v => v.high))] })
            this.log(`Parameter sweep "${label}"${narrowed ? " (narrowed)" : ""} `
                + `on instrument ${addressing.instrument + 1}, layer ${addressing.layer + 1}, `
                + `wavesample ${addressing.wavesample}: `
                + `${live.length} of ${values.length} numbers returned a value, on pages `
                + `${[...new Set(live.map(v => "$" + EPSProbe.hex2(v.high)))].join(", ")}`)
            return { label, values, narrowed, addressing, crashedAt,
                answered: live.length, tried: values.length,
                // The live set, ready to be handed back as `only` next time.
                live: live.map(v => ({ high: v.high, low: v.low })) }
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
    diffParameters(before, after, changed = ""){
        const key = (record) => `${record.high},${record.low}`
        const map = new Map(before.values.map(record => [key(record), record]))
        const changes = []
        for(const record of after.values){
            const was = map.get(key(record))
            if(!was) continue
            if(was.value === record.value) continue
            changes.push({ high: record.high, low: record.low,
                page: record.page, item: record.item,
                from: was.value, to: record.value,
                delta: (was.value == null || record.value == null)
                    ? null : record.value - was.value })
        }
        // Two sweeps taken against different instruments, layers or wavesamples
        // are not comparable, and the difference does not announce itself: the
        // table looks exactly like a table of parameters that moved because
        // somebody turned a knob. This is how that confound was found in the
        // first place, so it is checked rather than trusted.
        const targetKey = (a) => a ? `${a.instrument},${a.layer},${a.wavesample}` : "unknown"
        const sameTarget = targetKey(before.addressing) == targetKey(after.addressing)

        // `changed` is what the operator says they altered on the front panel.
        // It is the other half of the measurement: a list of numbers that moved
        // means nothing on its own, and the two have to be one record rather
        // than two entries that happen to be adjacent in the file.
        const report = { before: before.label, after: after.label, changed, changes,
            addressing: { before: before.addressing || null, after: after.addressing || null,
                same: sameTarget } }
        if(!sameTarget){
            this.log(`WARNING: these two sweeps were taken against different targets `
                + `(${targetKey(before.addressing)} then ${targetKey(after.addressing)}), so what moved `
                + `below is the change of subject, not the control you changed.`)
        }
        this.capture.event("finding", { probe: "parameter-diff", ...report })
        this.log(`Parameter diff ${before.label} → ${after.label}`
            + (changed ? ` [${changed}]` : "") + ": "
            + (changes.length == 0 ? "nothing changed"
                : changes.map(c => `$${EPSProbe.hex2(c.high)} $${EPSProbe.hex2(c.low)}`
                    + ` (=$${c.page.toString(16).padStart(2,"0")}${c.item.toString(16).padStart(2,"0")})`
                    + `: ${c.from} → ${c.to}`).join(", ")))
        return report
    }

    /***
     * Two parameter blocks, word by word.
     *
     * This is what the differential test was missing. Watching which parameter
     * number moves says what a control is called on the wire; watching which
     * word of the block moves says where it lives in the data an instrument is
     * actually made of — and that is the question that decides whether writing
     * an instrument back to a machine works.
     *
     * The high and low halves are reported separately because that is the exact
     * form the disagreement takes. Section 7.3 and eps.h agree that word 105
     * holds pan and disagree about which half of it, and no amount of reading
     * parameter numbers settles that. One block dump either side of somebody
     * moving the pan control does, in one line.
     */
    diffBlocks(before, after, label){
        const changes = []
        const shared = Math.min(before.length, after.length)
        for(let word = 0; word < shared; word++){
            if(before[word] == after[word]) continue
            changes.push({ word,
                from: before[word], to: after[word],
                fromHi: (before[word] >> 8) & 0xFF, toHi: (after[word] >> 8) & 0xFF,
                fromLo: before[word] & 0xFF, toLo: after[word] & 0xFF,
                half: (before[word] >> 8) != (after[word] >> 8)
                    ? ((before[word] & 0xFF) != (after[word] & 0xFF) ? "both" : "high")
                    : "low" })
        }
        const report = { block: label, words: shared, changes }
        this.capture.event("finding", { probe: "block-diff", ...report })
        if(changes.length == 0){
            this.log(`${label} block: nothing changed.`)
        }else{
            this.log(`${label} block: ` + changes.map(c =>
                `word ${c.word} $${EPSProbe.hex4(c.from)}→$${EPSProbe.hex4(c.to)} `
                + `(${c.half} byte: ${c.half == "low" ? `${c.fromLo}→${c.toLo}`
                    : `${c.fromHi}→${c.toHi}`})`).join(", "))
        }
        return report
    }

    static hex4(value){ return Number(value).toString(16).toUpperCase().padStart(4, "0") }

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
    /***
     * The ten rates an original EPS offers on its front panel, in kHz, from
     * reference material rather than from either specification: 52.0, 39.0,
     * 31.2, 26.0, 19.5, 15.6, 13.0, 9.75, 7.8 and 6.25. Section 7.3 gives the
     * period as rate * 1.6 microseconds on both machines, so these are the
     * codes those rates correspond to.
     */
    static CLASSIC_RATE_CODES = [12, 16, 20, 24, 32, 40, 48, 64, 80, 100]

    /***
     * Does the Classic honour a sample rate code it has no front panel name for?
     *
     * THIS IS THE ONE QUESTION ON THE LIST THAT COULD BREAK AN ORDINARY UPLOAD.
     * Section 9.5 gives Sample Rate as an item with range 0-127 on both
     * machines, and the app relies on that: it works the code out from whatever
     * the loaded wav file was recorded at, sends it, and the sample plays back
     * at the pitch it was sampled at. On a 16 PLUS this is established. But the
     * Classic's panel offers ten fixed rates, and if the machine snaps an
     * arbitrary code to the nearest of them then every upload comes out at the
     * wrong speed — audibly wrong, and wrong in a way that looks like a bug in
     * the pitch detection rather than a rounding rule in the synth.
     *
     * So: write a code, read it back, see what stuck. Codes that sit between
     * two panel rates are the interesting ones; two panel rates are included as
     * a control, because a machine that refuses everything and a machine that
     * accepts everything look identical if you only try the awkward values.
     *
     * Read back with GET PARAMETER rather than from the parameter block. The
     * block would work too, but it is 139 words per attempt against three
     * bytes, and section 9.5 marks Sample Rate "receive only" on the 16 PLUS,
     * which per NOTE 1 means it answers a GET perfectly well.
     *
     * Restores whatever the wavesample had when it started, on the way out and
     * also if it throws. This writes to the operator's instrument, and it is
     * the only probe that changes a setting they might care about.
     */
    async probeSampleRate(options = {}){
        const instrumentNumber = options.instrument == null ? 0 : options.instrument
        const codes = options.codes || [20, 21, 26, 33, 40, 100]
        const gap = options.gapMs == null ? 150 : options.gapMs

        return this.run("sample-rate", { instrument: instrumentNumber, codes }, async () => {
            const target = options.target
                || await this.findWavedataTarget(instrumentNumber, options)
            this.eps.setInstrumentNumber(target.instrument)
            this.eps.setLayerNumber(target.layer)
            this.eps.setWavesampleNumber(target.wavesample)

            const before = await this.eps.getParameter(0x20, EPS16.SAMPLE_RATE_PARAM)
            const original = before.answered ? before.value : null
            this.log(`Sample rate probe on instrument ${target.instrument + 1}, `
                + `layer ${target.layer + 1}, wavesample ${target.wavesample} `
                + `"${target.name}". It is currently code `
                + `${original == null ? "unreadable" : original}`
                + `${original == null ? "" : ` (${WaveGen.rateFromCode(original)} Hz)`}.`)
            this.capture.event("finding", { probe: "sample-rate", what: "starting value",
                code: original, target })

            const attempts = []
            try{
                for(let i = 0; i < codes.length; i++){
                    if(this.aborted) break
                    const code = codes[i]
                    this.progress(i / codes.length)
                    this.status(`Trying sample rate code ${code}`)
                    const accepted = await this.eps.setParameter(0x20,
                        EPS16.SAMPLE_RATE_PARAM, code)
                    await this.eps.sleep(gap)
                    const back = await this.eps.getParameter(0x20, EPS16.SAMPLE_RATE_PARAM)
                    const got = back.answered ? back.value : null
                    const panel = EPSProbe.CLASSIC_RATE_CODES.includes(code)
                    const attempt = { code, accepted, readBack: got, onPanel: panel,
                        held: got === code,
                        hz: WaveGen.rateFromCode(code),
                        readBackHz: got == null ? null : WaveGen.rateFromCode(got) }
                    attempts.push(attempt)
                    this.capture.event("finding", { probe: "sample-rate",
                        what: "attempt", ...attempt })
                    this.log(`  code ${code} (${attempt.hz} Hz`
                        + `${panel ? ", a front panel rate" : ", between panel rates"}`
                        + `): ${accepted ? "accepted" : "refused"}, reads back as `
                        + `${got == null ? "nothing" : got}`
                        + `${attempt.held ? " — held" : " — CHANGED"}`)
                    await this.eps.sleep(gap)
                }
            }finally{
                if(original != null){
                    await this.eps.setParameter(0x20, EPS16.SAMPLE_RATE_PARAM, original)
                    this.log(`Put the sample rate back to code ${original}`)
                }
            }

            const offPanel = attempts.filter(a => !a.onPanel)
            const offPanelHeld = offPanel.filter(a => a.held)
            const arbitrary = offPanel.length > 0 && offPanelHeld.length == offPanel.length
            this.log(offPanel.length == 0
                ? `No off-panel codes were tried, so this says nothing about snapping.`
                : arbitrary
                    ? `The synth kept every code it was given, including `
                      + `${offPanel.length} that are not front panel rates. Uploads at `
                      + `the wav file's own rate will play at the right pitch.`
                    : `The synth did NOT keep ${offPanel.length - offPanelHeld.length} of `
                      + `${offPanel.length} off-panel codes. Uploads may need their rate `
                      + `snapped to one of the ten panel rates and resampled to match.`)

            return { target, original, attempts, arbitraryRatesHeld: arbitrary }
        })
    }

    /***
     * PROBE F — instrument transpose, and whether the block carries it.
     *
     * THE OBSERVATION THIS EXISTS TO EXPLAIN. On an EPS-M running RAM 2.49, an
     * operator changed instrument transpose by three semitones. Page 10 item 13
     * ($28 $0D) moved 244 to 247, which is exactly the three semitones he
     * dialled, so the parameter is real and GET PARAMETER reports it. But the
     * instrument block was read immediately before and immediately after that
     * edit and the two are identical in all 323 words — word 28, where the
     * EPS-16 PLUS keeps Transposition, held 0 both times, and neither 244 nor
     * 247 appears anywhere in either block.
     *
     * Two explanations fit, and they call for opposite code:
     *
     *   1. The Classic does not keep transpose in the instrument block, and the
     *      block layouts diverge here. Reading word 28 on a Classic would then
     *      be meaningless and conversion silently loses transpose.
     *   2. The block does carry it, but a front panel edit is not committed to
     *      the block that GET INSTRUMENT returns until something else makes it
     *      so. The reading would then be a timing artefact and word 28 fine.
     *
     * SO THIS PROBE TAKES THE OPERATOR OUT OF THE LOOP. The second half writes
     * transpose with PUT PARAMETER — the app's own edit, at a moment the app
     * chooses — and re-reads the block. If the block moves for our write but
     * not for the operator's, explanation 2 is right and the difference is
     * commitment, not layout. If the block never moves for anything while GET
     * PARAMETER happily reports the new value, explanation 1 is right.
     *
     * The first half is still worth running, because the operator's panel is
     * the case that actually matters and because the octave item is unexplained
     * either way: it reads a constant 144 against a documented range of 0-5 on
     * the Classic and -4 to +4 on the 16 PLUS, and 144 fits neither.
     *
     * EVERYTHING IS PUT BACK. The instrument belongs to somebody else and this
     * writes to it, so the original values of both items are read first and
     * restored in a finally, the same way probeSampleRate does.
     */
    static TRANSPOSE_PAGE = 0x28
    static TRANSPOSE_OCTAVE = 0x0C
    static TRANSPOSE_SEMITONE = 0x0D

    /***
     * The operator's half, as four stops rather than one.
     *
     * One edit gave a difference and no absolute reading worth anything: 244 to
     * 247 is +3 semitones from an unknown starting point, in an encoding that
     * fits neither manual. Four known settings turn that into arithmetic — if
     * 0, +1, -1 and +1 octave produce four values, the encoding is readable
     * from the four of them however strange it looks.
     *
     * Zero first, deliberately. It is the one setting whose number we can
     * predict under every encoding we have considered, so if the item does not
     * read 0 there we have learned something before the other three are even
     * asked for.
     */
    static TRANSPOSE_STEPS = [
        {
            id: "transpose-zero",
            title: "Transpose to zero",
            what: "Set <b>both</b> transpose amounts to <b>0</b> &mdash; octave "
                + "and semitone. The instrument should play at concert pitch."
        },
        {
            id: "transpose-up-1",
            title: "Up one semitone",
            what: "Now set the <b>semitone</b> transpose to <b>+1</b>, leaving "
                + "the octave at 0."
        },
        {
            id: "transpose-down-1",
            title: "Down one semitone",
            what: "Now set the <b>semitone</b> transpose to <b>&minus;1</b>. This "
                + "is the one that says which half of the byte the sign lives in."
        },
        {
            id: "transpose-octave",
            title: "Up one octave",
            what: "Put the <b>semitone</b> back to <b>0</b> and set the "
                + "<b>octave</b> transpose to <b>+1</b>. This is the only step "
                + "that moves the octave item, which has so far only ever been "
                + "seen holding 144."
        }
    ]

    /***
     * Reads both transpose items and the instrument block, as one observation.
     *
     * The block comes last so that if the operator is still touching the synth
     * the parameters and the block are as close together as they can be.
     */
    async readTranspose(label){
        const octave = await this.eps.getParameter(
            EPSProbe.TRANSPOSE_PAGE, EPSProbe.TRANSPOSE_OCTAVE)
        const semitone = await this.eps.getParameter(
            EPSProbe.TRANSPOSE_PAGE, EPSProbe.TRANSPOSE_SEMITONE)
        const block = await this.block(EPS16.BLOCK_INSTRUMENT, `transpose: ${label}`)
        const words = block.answered ? block.words : null
        return {
            label,
            octave: octave.answered ? octave.value : null,
            semitone: semitone.answered ? semitone.value : null,
            // Word 28 is where the 16 PLUS keeps it. Both halves are recorded
            // because which half a signed value lives in is exactly the sort of
            // thing the two machines disagree about.
            word28: words ? words[28] : null,
            word28High: words ? (words[28] >> 8) & 0xFF : null,
            word28Low: words ? words[28] & 0xFF : null,
            words
        }
    }

    /***
     * Which words differ between two of those observations.
     *
     * Reported rather than assumed: if transpose is in the block at all but not
     * at word 28, this is what finds it, and that is a better outcome than
     * either of the two explanations above.
     */
    static transposeBlockDiff(before, after){
        if(!before || !after || !before.words || !after.words) return null
        const changes = []
        const length = Math.min(before.words.length, after.words.length)
        for(let word = 0; word < length; word++){
            if(before.words[word] == after.words[word]) continue
            changes.push({ word,
                from: before.words[word], to: after.words[word],
                fromHi: (before.words[word] >> 8) & 0xFF,
                toHi: (after.words[word] >> 8) & 0xFF,
                fromLo: before.words[word] & 0xFF,
                toLo: after.words[word] & 0xFF })
        }
        return changes
    }

    /***
     * `stops` are the values PUT PARAMETER will try for the semitone item in
     * the automatic half. `onStep` is awaited before each operator stop and is
     * given the step, so the UI can put a dialog up; returning "skip" skips the
     * stop and anything else falsy stops the guided half early.
     */
    async probeTranspose(options = {}){
        const instrumentNumber = options.instrument == null
            ? this.eps.instNum : options.instrument
        const stops = options.stops || [0, 1, 12, -1]
        const gap = options.gapMs == null ? 150 : options.gapMs
        const onStep = options.onStep || null
        const steps = options.steps || EPSProbe.TRANSPOSE_STEPS

        return this.run("transpose", { instrument: instrumentNumber, stops }, async () => {
            this.eps.setInstrumentNumber(instrumentNumber)

            const start = await this.readTranspose("start")
            this.log(`Transpose probe on instrument ${instrumentNumber + 1}. `
                + `Octave item reads ${start.octave}, semitone item reads `
                + `${start.semitone}, and instrument block word 28 holds `
                + `${start.word28} (high ${start.word28High}, low ${start.word28Low}).`)
            this.capture.event("finding", { probe: "transpose", what: "starting value",
                octave: start.octave, semitone: start.semitone,
                word28: start.word28, word28High: start.word28High,
                word28Low: start.word28Low })

            const panel = []
            let previous = start

            // ---- half one: the operator's front panel ----------------------
            for(const step of steps){
                if(this.aborted) break
                if(!onStep) break
                const choice = await onStep(step)
                if(choice == "skip"){
                    this.capture.note(`Skipped: ${step.title}`,
                        { step: step.id, outcome: "skip" })
                    continue
                }
                if(!choice) break

                const now = await this.readTranspose(step.id)
                const blockChanges = EPSProbe.transposeBlockDiff(previous, now)
                const observation = {
                    step: step.id,
                    octave: now.octave, semitone: now.semitone,
                    octaveMoved: now.octave !== previous.octave,
                    semitoneMoved: now.semitone !== previous.semitone,
                    word28: now.word28,
                    word28Moved: now.word28 !== previous.word28,
                    blockChanges
                }
                panel.push(observation)
                this.capture.event("finding", { probe: "transpose",
                    what: "panel edit", ...observation })
                this.log(`  ${step.title}: octave ${previous.octave} -> ${now.octave}, `
                    + `semitone ${previous.semitone} -> ${now.semitone}, `
                    + `block word 28 ${previous.word28} -> ${now.word28}`
                    + (blockChanges && blockChanges.length
                        ? `. ${blockChanges.length} block word(s) moved: `
                          + blockChanges.map(c => c.word).join(", ")
                        : `. The instrument block did not move at all.`))
                previous = now
                await this.breathe(gap)
            }

            // ---- half two: our own PUT PARAMETER ---------------------------
            // This is the half that separates the two explanations, because
            // nobody is touching the synth while it runs.
            const written = []
            const original = start.semitone
            try{
                for(const value of stops){
                    if(this.aborted) break
                    this.status(`Writing transpose semitone ${value}`)
                    const accepted = await this.eps.setParameter(
                        EPSProbe.TRANSPOSE_PAGE, EPSProbe.TRANSPOSE_SEMITONE, value)
                    await this.eps.sleep(gap)
                    const now = await this.readTranspose(`put ${value}`)
                    const attempt = {
                        wrote: value, accepted,
                        was: previous.semitone,
                        readBack: now.semitone,
                        held: now.semitone === value,
                        // `held` alone is not evidence the write did anything:
                        // writing a value the parameter already held reads back
                        // as a success on a synth that ignored the message
                        // entirely. Only a value that both arrived AND differs
                        // from what was there a moment ago proves the write
                        // landed, and that is what the verdict must rest on.
                        changed: now.semitone === value && previous.semitone !== value,
                        word28: now.word28,
                        word28Moved: now.word28 !== previous.word28,
                        blockChanges: EPSProbe.transposeBlockDiff(previous, now)
                    }
                    written.push(attempt)
                    this.capture.event("finding", { probe: "transpose",
                        what: "put parameter", ...attempt })
                    this.log(`  PUT semitone ${value}: `
                        + `${accepted ? "accepted" : "refused"}, reads back `
                        + `${attempt.readBack}${attempt.held ? " — held" : " — CHANGED"}, `
                        + `block word 28 ${previous.word28} -> ${now.word28}`
                        + (attempt.word28Moved ? " — MOVED" : " — unmoved"))
                    previous = now
                    await this.breathe(gap)
                }
            }finally{
                if(original != null){
                    await this.eps.setParameter(EPSProbe.TRANSPOSE_PAGE,
                        EPSProbe.TRANSPOSE_SEMITONE, original)
                    this.log(`Put the semitone transpose back to ${original}`)
                }
            }

            // ---- the conclusion, spelled out -------------------------------
            const panelMovedBlock = panel.some(p => p.word28Moved)
            const putMovedBlock = written.some(w => w.word28Moved)
            const putMovedParameter = written.some(w => w.changed)
            let verdict
            if(putMovedBlock && !panelMovedBlock){
                verdict = "commitment"
                this.log(`VERDICT: the block carries transpose — our own PUT PARAMETER `
                    + `moved word 28 — but the operator's front panel edit did not reach `
                    + `it. That is the "not committed yet" explanation, and word 28 is `
                    + `the right place to read after all.`)
            }else if(putMovedBlock && panelMovedBlock){
                verdict = "block carries it"
                this.log(`VERDICT: word 28 moved for both the panel and PUT PARAMETER. `
                    + `The block carries transpose exactly as the 16 PLUS does, and the `
                    + `EPS-M reading was something else — compare the block words listed `
                    + `above.`)
            }else if(putMovedParameter && !putMovedBlock){
                verdict = "not in the block"
                this.log(`VERDICT: PUT PARAMETER changed the transpose and it read back `
                    + `changed, yet no word of the instrument block moved. On this machine `
                    + `transpose is not in the block, so a block-level conversion loses `
                    + `it and word 28 must not be trusted for a Classic.`)
            }else{
                verdict = "inconclusive"
                this.log(`VERDICT: inconclusive — the transpose parameter did not move `
                    + `when written, so nothing can be said about where it is stored.`)
            }

            this.capture.event("finding", { probe: "transpose", what: "verdict",
                verdict, panelMovedBlock, putMovedBlock, putMovedParameter,
                octaveConstant: panel.every(p => !p.octaveMoved) })

            return { start, panel, written, verdict,
                panelMovedBlock, putMovedBlock, putMovedParameter }
        })
    }

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
