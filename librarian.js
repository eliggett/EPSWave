/***
 * The patch librarian page.
 *
 * Six things an instrument can be moved between: the synth, an Ensoniq .EFE
 * disk file, and a file in a format of our own. Two of the six work — reading
 * from the synth and reading an EFE — and the other four are on the page,
 * disabled, with the reason on each. They are left visible on purpose: what is
 * missing and why is the most useful thing this page can say right now.
 *
 * Both working paths end in the same place. getInstrumentInventory and
 * EPSEfe.readInstrument return the same shape, because the parameter blocks are
 * the same layout whichever way they arrive, so renderInventory does not know
 * or care which button was pressed.
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

/***
 * What each unbuilt button is waiting on. Shown as its tooltip, so the roadmap
 * lives on the thing it describes rather than in a document nobody opens.
 */
const LIBRARIAN_NOT_YET = {
    saveToEfe: "Not built yet. Writing an EFE means reproducing the EPS's own memory "
        + "layout — object placement, 16 byte chunking and the packed offset tables — "
        + "and two header fields whose meaning is still unclear. Reading one is solved; "
        + "writing one is a project of its own.",
    readOwn: "Not built yet. Waiting on the format, which is waiting on saving one.",
    saveOwn: "Not built yet. The format is undecided: JSON or YAML holding the raw "
        + "parameter blocks and the audio, so that a backup keeps everything even where "
        + "we do not yet understand it."
}

const librarian = {
    eps: null,
    current: null,

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
                    : "read from the EPS over MIDI"}
                &middot; ${inst.isEps16Plus ? "EPS-16 PLUS"
                    : `<b>original EPS</b> (id 0x${inst.id.toString(16).toUpperCase()})`}
                &middot; ${sizeBlocks} blocks
                &middot; keys ${keyRange(inst.keyRangeLo, inst.keyRangeHi)}
                ${inst.transpose ? `&middot; transpose ${inst.transpose}` : ""}
                &middot; ${inst.hasEffect ? "has an effect" : "no effect"}
            </div>
        </div>`

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

        // Audio is only in hand for a file. Reading it from the synth is a
        // transfer of its own and has not been built, so the column is left out
        // rather than shown full of dead buttons.
        const haveAudio = inventory.source == "efe"

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
        if(inventory.effect && inventory.effect.readable){
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
        if(!inventory || inventory.source != "efe") return false
        const ws = inventory.wavesamples.find(w => w.number == number)
        try{
            const samples = EPSEfe.readWavedata(inventory.file, inventory, number)
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
            $("#librarianStatus").removeClass("alert-secondary alert-success")
                .addClass("alert-danger").html(escapeHtml(error.message)).show()
            return false
        }
    },

    /***
     * Read instrument from EPS. Everything comes from the instrument's own
     * pointer tables, so nothing has to be guessed at or probed for.
     */
    async readFromEps(){
        const button = $("#readFromEps")
        button.prop("disabled", true)
        $("#readFromEpsSpinner").show()
        $("#librarianStatus").removeClass("alert-danger alert-success")
            .addClass("alert-secondary").html("Reading instrument ...").show()
        try{
            const inventory = await librarian.eps.getInstrumentInventory((percent, what) => {
                $("#librarianStatus").html(`Reading ${what} ... ${percent}%`)
            })
            if(!inventory){
                // getInstrumentParams has already said why in the log.
                $("#librarianStatus").removeClass("alert-secondary").addClass("alert-danger")
                    .html("Could not read the instrument. Check that the instrument number "
                        + "is one the EPS actually has loaded, and see the event log.")
                return
            }
            inventory.source = "midi"
            librarian.render(inventory)
            const message = `Read "${inventory.instrument.name}": ${inventory.layers.length} `
                + `layer(s), ${inventory.wavesamples.length} wavesample(s)`
            window.log(message)
            $("#librarianStatus").removeClass("alert-secondary").addClass("alert-success")
                .html(message)
        }catch(error){
            window.log(`Error: ${error.message}`)
            $("#librarianStatus").removeClass("alert-secondary").addClass("alert-danger")
                .html(`Error: ${escapeHtml(error.message)}`)
        }finally{
            $("#readFromEpsSpinner").hide()
            button.prop("disabled", false)
        }
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
        button.prop("disabled", true)
        $("#deleteAllSpinner").show()
        try{
            const deleted = await librarian.eps.deleteAllInstruments((percent, what) => {
                $("#librarianStatus").removeClass("alert-danger alert-success")
                    .addClass("alert-secondary").html(`Deleting ${escapeHtml(what)} …`).show()
            })
            const free = await librarian.eps.freeBlocks()
            const message = `Cleared the synth: ${deleted} instrument(s) deleted`
                + (free !== null ? `, ${free} blocks free` : "")
            window.log(message)
            $("#instNum").val(0)
            $("#librarianStatus").removeClass("alert-secondary")
                .addClass("alert-success").html(message).show()
        }catch(error){
            window.log(`Error: ${error.message}`)
            $("#librarianStatus").removeClass("alert-secondary alert-success")
                .addClass("alert-danger").html(escapeHtml(error.message)).show()
        }finally{
            $("#deleteAllSpinner").hide()
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
        if(!source || source.source != "efe") return null
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
            for(const ws of inventory.wavesamples){
                if(ws.sampleEnd <= librarian.SHORT_SAMPLES) continue
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
            $("#librarianStatus").removeClass("alert-secondary alert-success")
                .addClass("alert-danger").html("Open an instrument first.").show()
            return
        }
        if(inventory.source != "efe"){
            $("#librarianStatus").removeClass("alert-secondary alert-success")
                .addClass("alert-danger").html("Only an instrument opened from an EFE file "
                    + "can be sent: reading the audio back off the synth is not built yet, "
                    + "so an instrument read over MIDI has no wavedata to send.").show()
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
                + `Effects are not sent — the algorithm cannot be selected over MIDI.`)){
            return
        }

        const button = $("#saveToEps")
        button.prop("disabled", true)
        $("#saveToEpsSpinner").show()
        const started = Date.now()
        try{
            const report = await librarian.eps.uploadInstrument(inventory,
                (ws) => EPSEfe.readWavedata(inventory.file, inventory, ws.number),
                (percent, what) => {
                    const gone = (Date.now() - started) / 1000
                    const left = percent > 2 ? ` — about ${Math.max(1,
                        Math.round((gone / percent) * (100 - percent) / 60))} min left` : ""
                    $("#librarianStatus").removeClass("alert-danger alert-success")
                        .addClass("alert-secondary")
                        .html(`Sending: ${escapeHtml(what)} … ${percent}%${left}`).show()
                })
            window.log(report.message)
            $("#librarianStatus").removeClass("alert-secondary")
                .addClass(report.ok ? "alert-success" : "alert-danger")
                .html(escapeHtml(report.message)).show()
        }catch(error){
            window.log(`Error: ${error.message}`)
            $("#librarianStatus").removeClass("alert-secondary alert-success")
                .addClass("alert-danger").html(escapeHtml(error.message)).show()
        }finally{
            $("#saveToEpsSpinner").hide()
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
                $("#librarianStatus").removeClass("alert-secondary alert-danger")
                    .addClass("alert-success").html(`Opened ${escapeHtml(file.name)}`).show()
            }catch(error){
                window.log(`Error: ${file.name}: ${error.message}`)
                $("#librarianStatus").removeClass("alert-secondary alert-success")
                    .addClass("alert-danger").html(escapeHtml(error.message)).show()
            }
        }
        reader.onerror = () => {
            window.log(`Error: could not read ${file.name}`)
            $("#librarianStatus").removeClass("alert-secondary alert-success")
                .addClass("alert-danger").html("Could not read that file").show()
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
    $(".testVariant").click(function(){ librarian.saveToEps($(this).data("variant")) })

    // The file input is hidden and driven by the button, so the six actions
    // read as six buttons rather than five buttons and a file picker.
    $("#readFromEfe").click(() => $("#efeFile").click())
    $("#efeFile").change(function(){
        if(this.files && this.files[0]) librarian.readFromEfe(this.files[0])
        // Cleared so that choosing the same file twice in a row still fires.
        this.value = ""
    })

    for(const [id, reason] of Object.entries(LIBRARIAN_NOT_YET)){
        $(`#${id}`).attr("title", reason).prop("disabled", true)
    }
})
