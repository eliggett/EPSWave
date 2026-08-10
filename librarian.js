/***
 * The patch librarian page.
 *
 * Six ways to move an instrument between three places: the synth, an Ensoniq
 * .EFE disk file, and a .epswave of our own. All six work.
 *
 * They all end in the same place. getInstrumentInventory, EPSEfe.readInstrument
 * and EPSWaveFile.read return the same shape, because the parameter blocks are
 * the same layout whichever way they arrive, so render() does not know or care
 * which button was pressed. audioFor() is the same idea for the samples: three
 * sources, one question.
 */

/***
 * Bytes per second to assume when estimating how long a transfer would take.
 *
 * The measured end to end figure while this was written was 1353, against a
 * nominal 3125 for MIDI's 31250 baud: see "Blocks and the two second command
 * timer" in METHODS.md. Estimating with the measured number rather than the
 * nominal one is the difference between telling someone twenty minutes and
 * telling them eight when it will be twenty.
 */
const LIBRARIAN_BYTES_PER_SECOND = 1353

const librarian = {
    eps: null,
    current: null,

    /***
     * The status panel above the cards.
     *
     * The same panel, the same styling and the same code as the wavesample
     * editor's — EPSWaveUI.status writes the line and drives the bar — so the
     * two pages report a transfer identically. A percentage of null leaves the
     * bar dark rather than at nought, which is what "nothing is being measured
     * right now" should look like.
     *
     * The panel is one line and clips what will not fit, so anything that needs
     * a paragraph to explain itself says it in the event log and leaves a short
     * line here. Every caller below that had a paragraph does both.
     */
    status(text, percent = null){
        EPSWaveUI.status(text, percent)
    },

    /***
     * The audio of one wavesample, whatever the instrument was opened from.
     *
     * Three sources, one question. A disk image holds its samples inside the
     * image and they are extracted on demand; a `.epswave` and a backup read
     * off the synth both carry a Map. Copies are followed to whatever holds
     * the samples in all three, so this answers for every wavesample that
     * sounds, and null only when there is genuinely nothing.
     */
    audioFor(inventory, number){
        if(!inventory) return null
        if(inventory.audio && inventory.audio.has(number)) return inventory.audio.get(number)
        if(inventory.source == "efe"){
            return EPSEfe.readWavedata(inventory.file, inventory, number)
        }
        return null
    },

    /***
     * Whether every wavesample that needs audio has it. What decides whether
     * an instrument can be sent to the synth or written to a file.
     */
    hasAllAudio(inventory){
        if(!inventory) return false
        if(inventory.source == "efe") return true
        return inventory.wavesamples.filter(ws => !ws.isCopy)
            .every(ws => inventory.audio && inventory.audio.has(ws.number))
    },

    /***
     * Draws an inventory, from either source.
     */
    render(inventory){
        librarian.current = inventory
        const inst = inventory.instrument
        const escape = escapeHtml
        const key = (note) => {
            const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
            return `${names[note % 12]}${Math.floor(note / 12) - 1}`
        }
        const keyRange = (lo, hi) => `${lo}-${hi} <span class="text-muted">`
            + `(${key(lo)}-${key(hi)})</span>`

        // The size the synth reports is not maintained on disk, so for a file
        // the real figure is the image length. See METHODS.md.
        const sizeBlocks = inventory.source == "efe"
            ? inventory.file.sizeBlocks : inst.sizeBlocks
        const seconds = inventory.wireBytes / LIBRARIAN_BYTES_PER_SECOND
        const duration = seconds < 90 ? `${Math.round(seconds)} s`
            : `${(seconds / 60).toFixed(1)} min`

        let html = `<div class="mb-3">
            <h5 class="mb-1">${escape(inst.name) || "<i>unnamed</i>"}</h5>
            <div class="text-muted small">
                ${inventory.source == "efe"
                    ? `from ${escape(inventory.file.fileName || inventory.file.name + ".EFE")}`
                    : inventory.source == "epswave"
                    ? `from ${escape(inventory.fileName || "an EPSWave file")}`
                    : "read from the EPS over MIDI"}
                &middot; ${inst.isEps16Plus ? "EPS-16 PLUS"
                    : `<b>original EPS</b> (id 0x${inst.id.toString(16).toUpperCase()})`}
                &middot; ${sizeBlocks} blocks
                &middot; keys ${keyRange(inst.keyRangeLo, inst.keyRangeHi)}
                ${inst.transpose ? `&middot; transpose ${inst.transpose}` : ""}
                &middot; ${inst.hasEffect ? "has an effect" : "no effect"}
            </div>
        </div>`

        // Said once, on the instrument it applies to, rather than as a warning
        // on a button that would then have to appear for every file. What it
        // amounts to in practice is small — see the note above WS_PAN_WORD in
        // epsBlocks.js — and saying so is more useful than a bare label.
        if(!inst.isEps16Plus){
            html += `<div class="alert alert-secondary py-2 mb-3"><small>
                This was written by an <b>original EPS</b>, not an EPS-16 PLUS. It can still
                be sent: both machines lay their layers and wavesamples out identically, and
                the audio is 13 bit stored in the 16 bit words the EPS-16 PLUS expects.
                The parameters the EPS-16 PLUS added and the original EPS never had &mdash;
                the mixer and pan modulators, the boost switch, the LFO rate modulation,
                the layer delay &mdash; arrive at their defaults.
            </small></div>`
        }

        html += `<div class="table-responsive"><table class="table table-sm mb-3">
            <thead><tr><th>Layer</th><th>Name</th><th>Velocity</th>
                <th>Pitch table</th><th>WaveSamples</th></tr></thead><tbody>`
        for(const layer of inventory.layers){
            html += `<tr><td>${layer.number + 1}</td>
                <td>${escape(layer.name) || "<i>unnamed</i>"}</td>
                <td>${layer.velocityLo}-${layer.velocityHi}</td>
                <td>${layer.pitchTable || "<span class='text-muted'>none</span>"}</td>
                <td>${layer.wavesamplesUsed.join(", ") || "<span class='text-muted'>none</span>"}</td></tr>`
        }
        html += `</tbody></table></div>`

        // Reading the audio off the synth is a transfer of its own, so an
        // instrument that has only been looked at does not have it yet. The
        // column is left out rather than shown full of dead buttons.
        const haveAudio = librarian.hasAllAudio(inventory)

        html += `<div class="table-responsive"><table class="table table-sm mb-3">
            <thead><tr><th>WS</th><th>Name</th><th>Layer</th><th>Keys</th><th>Root</th>
                <th>Rate</th><th class="text-right">Samples</th><th>Notes</th>
                ${haveAudio ? "<th></th>" : ""}</tr></thead><tbody>`
        for(const ws of inventory.wavesamples){
            html += `<tr><td>${ws.number}</td>
                <td>${escape(ws.name) || "<i>unnamed</i>"}</td>
                <td>${ws.layer == null
                    ? "<span class='text-muted'>none</span>" : ws.layer + 1}</td>
                <td>${keyRange(ws.keyRangeLo, ws.keyRangeHi)}</td>
                <td>${ws.rootKey} <span class="text-muted">(${key(ws.rootKey)})</span></td>
                <td>${(ws.sampleRateHz / 1000).toFixed(2)} kHz</td>
                <td class="text-right">${ws.isCopy ? "&mdash;" : ws.sampleEnd.toLocaleString()}</td>
                <td>${ws.isCopy
                    ? `<span class="text-muted">shares WS ${ws.copyNumber}</span>` : ""}</td>
                ${haveAudio ? `<td class="text-right"><button class="btn btn-outline-secondary
                    btn-sm py-0 saveWav" data-ws="${ws.number}"
                    title="Save this wavesample as a WAV file">WAV</button></td>` : ""}</tr>`
        }
        html += `</tbody></table></div>`

        if(haveAudio){
            html += `<button id="saveAllWav" class="btn btn-outline-secondary btn-sm mb-3">
                <i class="fa-solid fa-file-arrow-down"></i> Save every wavesample as WAV
            </button>`
        }

        // The effect, and a plain statement of what cannot be had. The algorithm
        // name is not readable over MIDI by any route — see readEffect in eps.js
        // — so saying where to find it beats leaving a blank that looks like a
        // bug. Only the MIDI path has any of this; an EFE carries an effect
        // block but there is nothing yet that decodes it.
        if(inventory.source == "efe" && inventory.effect){
            // The one thing a file can say and the synth cannot. Worth showing
            // prominently: it is the only way to know which algorithm to
            // reselect by hand after sending the instrument across.
            const fx = inventory.effect
            html += `<div class="alert alert-secondary py-2 mb-3"><small>
                <b>Effect &mdash; ${escape(fx.name)}.</b>
                Effects are not sent to the synth: the algorithm cannot be selected over
                MIDI. Set it by hand at <i>Edit &rarr; Effect</i> after the transfer.
                ${fx.innerNames.length ? `<br>The block also names
                    ${fx.innerNames.map(n => `<b>${escape(n)}</b>`).join(", ")}
                    &mdash; probably its variations, though the specification counts four
                    and there are ${fx.innerNames.length} &mdash; and is currently on
                    setting ${fx.currentVariation}.` : ""}
            </small></div>`
        }else if(inventory.effect && inventory.effect.readable){
            const raw = inventory.effect.parameters
                .map(p => `<code>${p.item.toString(16).padStart(2, "0")}</code>:${p.value}`)
                .join(" &nbsp;")
            html += `<div class="alert alert-secondary py-2 mb-3"><small>
                <b>Effect &mdash; variation ${inventory.effect.variation + 1} of 4.</b>
                The algorithm name cannot be read over MIDI: the Effect Select&middot;Bypass
                page neither sends nor answers parameter commands, and nothing reads the
                display. Read it off the synth at <i>Edit &rarr; Effect</i> and note it
                alongside this backup.
                ${raw ? `<br>Readable effect parameters, unlabelled because their
                    meaning depends on the algorithm: ${raw}` : ""}
            </small></div>`
        }else if(inventory.source == "midi"){
            html += `<div class="small text-muted mb-3">
                The effect page did not answer, so this instrument probably has no effect.
            </div>`
        }

        html += `<div class="small text-muted">
            ${inventory.layers.length} layer${inventory.layers.length == 1 ? "" : "s"},
            ${inventory.wavesamples.length} wavesample${inventory.wavesamples.length == 1 ? "" : "s"}
            (${inventory.wavesamples.filter(ws => ws.isCopy).length} sharing another's audio),
            ${inventory.audioSamples.toLocaleString()} samples of audio.
            Sending this to the EPS would take about ${duration}
            at the measured ${LIBRARIAN_BYTES_PER_SECOND} bytes per second.
        </div>`

        $("#inventory").html(html)
        $("#inventoryCard").show()

        // Delegated off the rows that were just written, so the handlers do not
        // have to be torn down and rebuilt when a second file is opened.
        $("#inventory .saveWav").click(function(){
            librarian.saveWav(parseInt($(this).data("ws")))
        })
        $("#inventory #saveAllWav").click(() => {
            let saved = 0
            for(const ws of librarian.current.wavesamples){
                if(librarian.saveWav(ws.number)) saved++
            }
            window.log(`Saved ${saved} wavesample(s) as WAV`)
        })
    },

    /***
     * Writes one wavesample out as a mono 16 bit WAV at its own sample rate.
     *
     * A copy is followed to whichever wavesample holds the audio, so saving one
     * gives the sound it plays rather than an empty file. That does mean saving
     * every wavesample of an instrument built from copies writes the same audio
     * more than once, under the different names, which is the honest
     * representation of what the instrument contains.
     */
    saveWav(number){
        const inventory = librarian.current
        if(!inventory) return false
        const ws = inventory.wavesamples.find(w => w.number == number)
        try{
            const samples = librarian.audioFor(inventory, number)
            if(!samples || samples.length == 0){
                throw new Error(`No audio in hand for wavesample ${number}`)
            }
            const clean = (text) => String(text).replace(/[^A-Za-z0-9._-]+/g, "-")
                .replace(/^-+|-+$/g, "") || "instrument"
            const name = `${clean(inventory.instrument.name)}-ws${number}`
                + `-${ws.sampleRateHz}Hz.wav`
            EPSWaveUI.download(new Blob([EPS16.encodeWav(samples, ws.sampleRateHz)],
                { type: "audio/x-wav" }), "audio/x-wav", name)
            window.log(`Saved ${name}: ${samples.length.toLocaleString()} samples `
                + `at ${ws.sampleRateHz} Hz`)
            return true
        }catch(error){
            window.log(`Error: wavesample ${number}: ${error.message}`)
            librarian.status(`Error: ${escapeHtml(error.message)}`)
            return false
        }
    },

    /***
     * Read instrument from EPS. Everything comes from the instrument's own
     * pointer tables, so nothing has to be guessed at or probed for.
     */
    async readFromEps(){
        const button = $("#readFromEps")
        // Held so that closing the page mid-transfer asks first.
        const release = EPSWaveUI.hold("reading the instrument")
        button.prop("disabled", true)
        $("#readFromEpsSpinner").show()
        librarian.status("Reading instrument ...", 0)
        try{
            const inventory = await librarian.eps.getInstrumentInventory((percent, what) => {
                librarian.status(`Reading ${escapeHtml(what)} ... ${percent}%`, percent)
            })
            if(!inventory){
                // getInstrumentParams has already said why in the log.
                window.log("Error: could not read the instrument. Check that the instrument "
                    + "number is one the EPS actually has loaded, and see above.")
                librarian.status("Error: could not read the instrument")
                return
            }
            inventory.source = "midi"
            librarian.render(inventory)
            const message = `Read "${inventory.instrument.name}": ${inventory.layers.length} `
                + `layer(s), ${inventory.wavesamples.length} wavesample(s)`
            window.log(message)
            librarian.status(escapeHtml(message))
        }catch(error){
            window.log(`Error: ${error.message}`)
            librarian.status(`Error: ${escapeHtml(error.message)}`)
        }finally{
            $("#readFromEpsSpinner").hide()
            release()
            button.prop("disabled", false)
        }
    },

    /***
     * Save instrument to an EPSWave file.
     *
     * The only button that may have to go and fetch what it is about to save.
     * An instrument read from the synth arrives as parameters alone, because
     * looking at one should not cost the twenty minutes copying one does, so
     * the audio is read here — once, and then kept, so saving a second time or
     * exporting a WAV afterwards is instant.
     */
    async saveToOwn(){
        const inventory = librarian.current
        if(!inventory){
            librarian.status("Open an instrument first")
            return
        }
        const button = $("#saveOwn")
        // Held so that closing the page mid-transfer asks first.
        const release = EPSWaveUI.hold("saving an EPSWave file")
        button.prop("disabled", true)
        $("#saveOwnSpinner").show()
        try{
            if(!librarian.hasAllAudio(inventory)){
                if(!await librarian.fetchAudio(inventory)) return
            }

            const clean = (text) => String(text).replace(/[^A-Za-z0-9._-]+/g, "-")
                .replace(/^-+|-+$/g, "") || "instrument"
            const name = clean(inventory.instrument.name) + EPSWaveFile.EXTENSION
            const text = EPSWaveFile.write(inventory, inventory.audio || new Map(), {
                source: inventory.source,
                sourceName: inventory.source == "midi"
                    ? `EPS instrument ${librarian.eps.instNum + 1}`
                    : (inventory.file ? inventory.file.fileName || inventory.file.name : "")
            })
            EPSWaveUI.download(new Blob([text], { type: "application/json" }),
                "application/json", name)
            const message = `Saved ${name}: ${inventory.layers.length} layer(s), `
                + `${inventory.wavesamples.length} wavesample(s), `
                + `${Math.round(text.length / 1024).toLocaleString()} KB`
            window.log(message)
            // Re-rendered because the WAV buttons appear the moment the audio
            // is in hand, and it just arrived.
            librarian.render(inventory)
            librarian.status(escapeHtml(message))
        }catch(error){
            window.log(`Error: ${error.message}`)
            librarian.status(`Error: ${escapeHtml(error.message)}`)
        }finally{
            $("#saveOwnSpinner").hide()
            release()
            button.prop("disabled", false)
        }
    },

    /***
     * Save instrument to an Ensoniq .EFE.
     *
     * Confirmed on hardware: a file written here loads on an EPS-16 PLUS and
     * plays. The writer reproduces the EPS's allocator from measurements of 42
     * of its own files — see the long note in epsEfe.js — and three of its
     * fields are still written blind, which the synth has now shown it does not
     * mind.
     *
     * Like saving a .epswave, this fetches the audio first if it is not already
     * in hand.
     */
    async saveToEfe(){
        const inventory = librarian.current
        if(!inventory){
            librarian.status("Open an instrument first")
            return
        }
        const button = $("#saveToEfe")
        // Held so that closing the page mid-transfer asks first.
        const release = EPSWaveUI.hold("saving an EFE file")
        button.prop("disabled", true)
        $("#saveToEfeSpinner").show()
        try{
            if(!librarian.hasAllAudio(inventory)){
                if(!await librarian.fetchAudio(inventory)) return
            }
            const audio = new Map()
            for(const ws of inventory.wavesamples){
                const samples = librarian.audioFor(inventory, ws.number)
                if(samples) audio.set(ws.number, samples)
            }
            const written = EPSEfe.write(inventory, audio)
            // Ensoniq disk names are eight characters and upper case.
            const stem = String(inventory.instrument.name || "INST")
                .toUpperCase().replace(/[^A-Z0-9-]+/g, "").slice(0, 8) || "INST"
            const name = `${stem}.EFE`
            EPSWaveUI.download(new Blob([written.bytes],
                { type: "application/octet-stream" }), "application/octet-stream", name)
            for(const note of written.lost) window.log(`Note: ${note}`)
            const message = `Saved ${name}: ${written.blocks} blocks, `
                + `${written.bytes.length.toLocaleString()} bytes`
            window.log(message)
            librarian.render(inventory)
            // Whatever the writer could not carry across is in the log, from
            // the loop above, rather than repeated here — the panel is one line
            // and there can be several notes.
            librarian.status(escapeHtml(message)
                + (written.lost.length
                    ? ` — ${written.lost.length} note(s), see the log` : ""))
        }catch(error){
            window.log(`Error: ${error.message}`)
            librarian.status(`Error: ${escapeHtml(error.message)}`)
        }finally{
            $("#saveToEfeSpinner").hide()
            release()
            button.prop("disabled", false)
        }
    },

    /***
     * Reads the audio off the synth onto an inventory, asking first, because it
     * is the twenty minute part. Shared by both save buttons. Returns whether
     * there is now enough to write a file.
     */
    async fetchAudio(inventory){
        const seconds = inventory.wireBytes / LIBRARIAN_BYTES_PER_SECOND
        const estimate = seconds < 90 ? `${Math.round(seconds)} seconds`
            : `about ${(seconds / 60).toFixed(0)} minutes`
        if(!window.confirm(`Read the audio of "${inventory.instrument.name}" off the EPS?\n\n`
                + `${inventory.audioSamples.toLocaleString()} samples, which takes `
                + `${estimate}. Leave the synth alone while it runs.\n\n`
                + `The parameters are already in hand; this is the wavedata.`)){
            return false
        }
        const started = Date.now()
        // Said before the first callback rather than after it: the synth is
        // asked for its first block straight away, and a panel still reading
        // READY while that happens looks like a button that did nothing.
        librarian.status("Reading audio ...", 0)
        const result = await librarian.eps.downloadAudio(inventory, (percent, what) => {
            const gone = (Date.now() - started) / 1000
            const left = percent > 2 ? ` — about ${Math.max(1,
                Math.round((gone / percent) * (100 - percent) / 60))} min left` : ""
            librarian.status(`Reading: ${escapeHtml(what)} … ${percent}%${left}`, percent)
        })
        window.log(result.message)
        // A partial read is kept and offered rather than discarded. It took
        // twenty minutes to get and it is still most of an instrument.
        inventory.audio = result.audio
        if(!result.ok && !window.confirm(`${result.message}\n\nSave what did come back anyway?`)){
            librarian.render(inventory)
            return false
        }
        return true
    },

    /***
     * Read instrument from an EPSWave file. No synth, no Web MIDI, same as
     * opening an EFE.
     */
    readFromOwn(file){
        const reader = new FileReader()
        reader.onload = () => {
            try{
                const inventory = EPSWaveFile.read(reader.result)
                inventory.fileName = file.name
                const held = inventory.wavesamples.filter(ws => !ws.isCopy
                    && inventory.audio.has(ws.number)).length
                window.log(`Opened ${file.name}: "${inventory.instrument.name}", `
                    + `${inventory.layers.length} layer(s), `
                    + `${inventory.wavesamples.length} wavesample(s), `
                    + `audio for ${held}`)
                librarian.render(inventory)
                librarian.status(`Opened ${escapeHtml(file.name)}`)
            }catch(error){
                window.log(`Error: ${file.name}: ${error.message}`)
                librarian.status(`Error: ${escapeHtml(error.message)}`)
            }
        }
        reader.onerror = () => {
            window.log(`Error: could not read ${file.name}`)
            librarian.status("Error: could not read that file")
        }
        reader.readAsText(file)
    },

    /***
     * Empties every instrument slot on the synth and selects the first.
     *
     * For testing: a failed restore leaves a half built instrument holding its
     * memory, and clearing them by hand between attempts is most of the work.
     * Confirms first, because it throws away whatever is loaded and there is no
     * undo.
     */
    async deleteAll(){
        if(!window.confirm("Delete EVERY instrument on the EPS?\n\n"
                + "All eight slots are emptied and anything loaded and unsaved is lost. "
                + "The instrument selector goes back to 1.")){
            return
        }
        const button = $("#deleteAll")
        // Held so that closing the page mid-transfer asks first.
        const release = EPSWaveUI.hold("clearing the synth")
        button.prop("disabled", true)
        $("#deleteAllSpinner").show()
        librarian.status("Clearing the synth ...", 0)
        try{
            const deleted = await librarian.eps.deleteAllInstruments((percent, what) => {
                librarian.status(`Deleting ${escapeHtml(what)} …`, percent)
            })
            const free = await librarian.eps.freeBlocks()
            const message = `Cleared the synth: ${deleted} instrument(s) deleted`
                + (free !== null ? `, ${free} blocks free` : "")
            window.log(message)
            $("#instNum").val(0)
            librarian.status(escapeHtml(message))
        }catch(error){
            window.log(`Error: ${error.message}`)
            librarian.status(`Error: ${escapeHtml(error.message)}`)
        }finally{
            $("#deleteAllSpinner").hide()
            release()
            button.prop("disabled", false)
        }
    },

    /***
     * Test patches, for isolating why one instrument will not restore.
     *
     * CS-80STR is the only EPS-16 PLUS instrument to hand that fails, and the
     * only one that differs from the rest in two ways at once: its wavesamples
     * are numbered 1, 2, 17, 18 rather than consecutively, and it is the only
     * one that uploads audio into more than one wavesample. Everything else,
     * including a single 82,772 sample wavesample larger than either of its
     * two, restores cleanly.
     *
     * At the moment it fails almost nothing about the file is involved. The
     * instrument, the layer and wavesample 1 have been created, 65,536 samples
     * have gone in, wavesample 17 has been created and acknowledged, and then
     * one command addressed to wavesample 17 comes back "Insert System Disk".
     * No parameter block has been written yet. So the only things that can
     * matter are the number 17 and the size of the upload before it.
     *
     * These variants change exactly one of those at a time. Each takes seconds
     * rather than the five minutes the real instrument costs, so the question
     * can be settled in one sitting:
     *
     *   dense   — same audio, wavesamples renumbered 1, 2, 3, 4
     *   short   — same numbering, every wavesample cut to 2000 samples
     *   both    — dense numbering and short audio, the control that should work
     *
     * If "dense" restores and "short" does not, it is the numbering. If the
     * reverse, it is the size. If both work and neither alone does, it is the
     * two together.
     */
    SHORT_SAMPLES: 2000,

    variant(kind){
        const source = librarian.current
        if(!source || !librarian.hasAllAudio(source)) return null
        // Deep enough to leave the opened instrument untouched: the blocks are
        // copied because they are about to be edited, and a failed experiment
        // should not change what a second experiment starts from.
        const inventory = {
            ...source,
            instrument: { ...source.instrument, words: Array.from(source.instrument.words) },
            layers: source.layers.map(l => ({ ...l, words: Array.from(l.words),
                map: [...l.map], wavesamplesUsed: [...l.wavesamplesUsed] })),
            wavesamples: source.wavesamples.map(w => ({ ...w, words: Array.from(w.words) }))
        }

        if(kind == "dense" || kind == "both"){
            // Renumber to 1, 2, 3 ... in the order the wavesamples already
            // appear. Every reference has to move with them: the layer maps,
            // which name a wavesample per key, and the copy numbers.
            const renumber = new Map()
            inventory.wavesamples.forEach((ws, index) => renumber.set(ws.number, index + 1))
            // Including the audio, which is keyed by wavesample number.
            if(inventory.audio){
                inventory.audio = new Map([...inventory.audio]
                    .map(([number, samples]) => [renumber.get(number) || number, samples]))
            }
            for(const ws of inventory.wavesamples){
                ws.number = renumber.get(ws.number)
                if(ws.isCopy){
                    ws.copyNumber = renumber.get(ws.copyNumber)
                    ws.words[12] = (ws.copyNumber << 8) | (ws.words[12] & 0x00FF)
                }
            }
            for(const layer of inventory.layers){
                layer.wavesamplesUsed = layer.wavesamplesUsed.map(n => renumber.get(n))
                for(let i = 0; i < EPSBlocks.LAYER_MAP_LENGTH; i++){
                    const at = EPSBlocks.LAYER_MAP_WORD + i
                    const was = (layer.words[at] >> 8) & 0xFF
                    if(was == 0) continue
                    layer.words[at] = (renumber.get(was) << 8) | (layer.words[at] & 0x00FF)
                }
            }
        }

        if(kind == "short" || kind == "both"){
            // An EFE's audio is extracted from the image on demand and follows
            // sampleEnd by itself. A Map does not, so it is cut here — and cut
            // on a copy of the Map, or shortening a test variant would shorten
            // the instrument it was built from.
            if(inventory.audio) inventory.audio = new Map(inventory.audio)
            for(const ws of inventory.wavesamples){
                if(ws.sampleEnd <= librarian.SHORT_SAMPLES) continue
                if(inventory.audio && inventory.audio.has(ws.number)){
                    inventory.audio.set(ws.number,
                        inventory.audio.get(ws.number).slice(0, librarian.SHORT_SAMPLES))
                }
                ws.sampleEnd = librarian.SHORT_SAMPLES
                EPSBlocks.writeSampleOffset(ws.words, 119, ws.sampleEnd)
                // The loop has to stay inside the shortened data or the EPS
                // rejects the block for reasons that have nothing to do with
                // what is being tested.
                ws.loopStart = 0
                ws.loopEnd = ws.sampleEnd
                EPSBlocks.writeSampleOffset(ws.words, 123, 0)
                EPSBlocks.writeSampleOffset(ws.words, 127, ws.sampleEnd)
            }
        }

        inventory.audioSamples = inventory.wavesamples.filter(w => !w.isCopy)
            .reduce((sum, w) => sum + w.sampleEnd, 0)
        inventory.wireBytes = inventory.audioSamples * 3
        inventory.variant = kind
        return inventory
    },

    /***
     * Save instrument to EPS. The first thing on this page that writes to the
     * synth rather than reading from it, hence the confirmation: it claims a
     * whole instrument slot and takes minutes to do it.
     */
    async saveToEps(variant = null){
        const inventory = variant ? librarian.variant(variant) : librarian.current
        if(!inventory){
            librarian.status("Open an instrument first")
            return
        }
        // What can be sent is what has audio, whatever it was opened from. An
        // instrument read off the synth and not yet backed up is parameters
        // only, and sending it would build something silent.
        if(!librarian.hasAllAudio(inventory)){
            window.log("Error: this instrument has no wavedata in hand. Read it off the "
                + "synth first with \"Save instrument to EPSWave file\", or open an EFE "
                + "or EPSWave file that already holds it.")
            librarian.status("Error: no wavedata in hand for this instrument")
            return
        }
        const seconds = inventory.wireBytes / LIBRARIAN_BYTES_PER_SECOND
        const estimate = seconds < 90 ? `${Math.round(seconds)} seconds`
            : `about ${(seconds / 60).toFixed(0)} minutes`
        if(!window.confirm(`Send "${inventory.instrument.name}"`
                + `${variant ? ` (test variant: ${variant})` : ""} to the EPS?\n\n`
                + `This claims the first free instrument slot at or after the one selected `
                + `above, and takes ${estimate}. Leave the synth alone while it runs, and `
                + `stop the sequencer if it is playing.\n\n`
                + (inventory.instrument.isEps16Plus ? ""
                    : `This is an original EPS instrument. The EPS-16 PLUS parameters it `
                        + `has no values for arrive at their defaults.\n\n`)
                + `Effects are not sent — the algorithm cannot be selected over MIDI.`)){
            return
        }

        const button = $("#saveToEps")
        // Held so that closing the page mid-transfer asks first.
        const release = EPSWaveUI.hold("sending to the EPS")
        button.prop("disabled", true)
        $("#saveToEpsSpinner").show()
        const started = Date.now()
        // The first thing uploadInstrument does is ask for free memory and hunt
        // for an empty slot, neither of which reports progress, so the panel is
        // given something to say before it is called rather than only once the
        // first callback arrives.
        librarian.status("Sending instrument ...", 0)
        try{
            const report = await librarian.eps.uploadInstrument(inventory,
                (ws) => librarian.audioFor(inventory, ws.number),
                (percent, what) => {
                    const gone = (Date.now() - started) / 1000
                    const left = percent > 2 ? ` — about ${Math.max(1,
                        Math.round((gone / percent) * (100 - percent) / 60))} min left` : ""
                    librarian.status(`Sending: ${escapeHtml(what)} … ${percent}%${left}`,
                        percent)
                })
            window.log(report.message)
            librarian.status(`${report.ok ? "Done" : "Failed"}: `
                + escapeHtml(report.message))
        }catch(error){
            window.log(`Error: ${error.message}`)
            librarian.status(`Error: ${escapeHtml(error.message)}`)
        }finally{
            $("#saveToEpsSpinner").hide()
            release()
            button.prop("disabled", false)
        }
    },

    /***
     * Read instrument from an .EFE file. No synth involved, and no Web MIDI
     * either, so this works in any browser and on a page opened from disk.
     */
    readFromEfe(file){
        const reader = new FileReader()
        reader.onload = () => {
            try{
                const efe = EPSEfe.parse(reader.result)
                // The name inside an EFE header is the instrument's, which is
                // usually nothing like the file's — "JUHAD ENOUGH" in
                // JUHADENO.EFE. Both are worth showing, so the one the user
                // actually picked travels with the parsed file.
                efe.fileName = file.name
                window.log(`Opened ${file.name}: "${efe.name}", ${efe.typeName}, `
                    + `${efe.sizeBlocks} blocks`)
                librarian.render(EPSEfe.readInstrument(efe))
                librarian.status(`Opened ${escapeHtml(file.name)}`)
            }catch(error){
                window.log(`Error: ${file.name}: ${error.message}`)
                librarian.status(`Error: ${escapeHtml(error.message)}`)
            }
        }
        reader.onerror = () => {
            window.log(`Error: could not read ${file.name}`)
            librarian.status("Error: could not read that file")
        }
        reader.readAsArrayBuffer(file)
    }
}

function escapeHtml(text){
    return String(text).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
}

$(document).ready(function(){
    EPSWaveUI.initLog()
    EPSWaveUI.initAbout()
    EPSWaveUI.initHelp()
    EPSWaveUI.wireTheme()

    librarian.eps = new EPS16(function(inputs, outputs){
        EPSWaveUI.fillMidiPorts(librarian.eps, inputs, outputs)
    }, (error) => window.log(error), (success) => window.log(success))

    librarian.eps.setMidiCallback((direction, bytes) => {
        if(!$("#logMidi").is(":checked")) return
        window.log(`${direction} ${EPSWaveUI.formatMidiBytes(bytes)}`)
    })
    librarian.eps.setDebugCallback((message) => {
        if(!$("#logDebug").is(":checked")) return
        window.log(`DEBUG: ${message}`)
    })
    EPSWaveUI.wireMidi(librarian.eps)

    // After the two callbacks above: the probe capture wraps whatever is
    // already installed so that starting a capture does not silence the event
    // log. See EPSProbe.attach. Guarded, because the instrument list and the
    // rest of the page are built below this line — see wireDebugTools.
    EPSWaveUI.wireDebugTools(librarian.eps)

    // Instrument 1-8, matching the front panel rather than the wire, where the
    // same instruments are 0-7.
    for(let i = 0; i < EPS16.INSTRUMENT_COUNT; i++){
        $("#instNum").append($("<option>").val(i).html(i + 1))
    }
    const storedInstrument = parseInt(window.safeStorage.get("instNum"))
    const startInstrument = isNaN(storedInstrument) ? 0 : storedInstrument
    $("#instNum").val(startInstrument)
    librarian.eps.setInstrumentNumber(startInstrument)
    $("#instNum").change(function(){
        librarian.eps.setInstrumentNumber(parseInt($(this).val()))
        window.safeStorage.set("instNum", $(this).val())
    })

    $("#readFromEps").click(() => librarian.readFromEps())
    $("#saveToEps").click(() => librarian.saveToEps())
    $("#deleteAll").click(() => librarian.deleteAll())
    // The test patch buttons are commented out in librarian.html; this stays so
    // that uncommenting them is the whole of bringing them back. See the note
    // above librarian.variant().
    $(".testVariant").click(function(){ librarian.saveToEps($(this).data("variant")) })

    // The file input is hidden and driven by the button, so the six actions
    // read as six buttons rather than five buttons and a file picker.
    $("#readFromEfe").click(() => $("#efeFile").click())
    $("#efeFile").change(function(){
        if(this.files && this.files[0]) librarian.readFromEfe(this.files[0])
        // Cleared so that choosing the same file twice in a row still fires.
        this.value = ""
    })
    $("#saveOwn").click(() => librarian.saveToOwn())
    $("#saveToEfe").click(() => librarian.saveToEfe())
    $("#readOwn").click(() => $("#ownFile").click())
    $("#ownFile").change(function(){
        if(this.files && this.files[0]) librarian.readFromOwn(this.files[0])
        this.value = ""
    })
})
