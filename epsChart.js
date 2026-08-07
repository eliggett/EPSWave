/***
 * One waveform slot: the canvas editor, an optional WAV file input, an optional
 * waveform generator panel, and audio preview.
 *
 * `wavesample` stays the public handle on the data, as the rest of the app and
 * eps.js expect a plain array of signed 16 bit ints.
 */
class EPSChart {

    /***
     * Wires a pair of sample rate selects: a short one holding the rates most
     * people want plus an "Other rate" entry, and a second one holding every
     * rate the EPS can represent, hidden until it is asked for.
     *
     * onChange is called with the chosen rate in Hz whenever either changes.
     */
    static mountRateSelects(mainEl, allEl, rate, onChange = () => {}){
        if(!mainEl || !allEl) return rate
        const option = (code) =>
            `<option value="${WaveGen.rateFromCode(code)}">${WaveGen.rateLabel(code)}</option>`
        mainEl.innerHTML = WaveGen.COMMON_RATE_CODES.map(option).join("")
            + `<option value="other">Other rate ...</option>`
        allEl.innerHTML = WaveGen.allRateCodes().map(option).join("")

        mainEl.addEventListener('change', () => {
            if(mainEl.value == 'other'){
                allEl.style.display = ''
                onChange(parseInt(allEl.value))
            }else{
                allEl.style.display = 'none'
                onChange(parseInt(mainEl.value))
            }
        })
        allEl.addEventListener('change', () => onChange(parseInt(allEl.value)))
        return EPSChart.selectRate(mainEl, allEl, rate)
    }

    /***
     * Points a mounted pair of selects at a rate, opening the full list if the
     * rate is not one of the common ones. Returns the rate as the hardware can
     * actually hold it.
     */
    static selectRate(mainEl, allEl, rate){
        if(!mainEl || !allEl) return rate
        const code = WaveGen.codeForRate(rate)
        const hz = WaveGen.rateFromCode(code)
        if(WaveGen.COMMON_RATE_CODES.includes(code)){
            mainEl.value = hz
            allEl.style.display = 'none'
        }else{
            mainEl.value = 'other'
            allEl.value = hz
            allEl.style.display = ''
        }
        return hz
    }

    /***
     * Option list of MIDI notes, showing the note name and the number, because
     * octave numbering differs between the EPS's display and MIDI convention
     * and the number is the thing that actually goes over the wire.
     */
    static noteOptionsHtml(from = 0, to = 127){
        let html = ""
        for(let note=from; note<=to; note++){
            html += `<option value="${note}">${WaveGen.noteToName(note)} (${note})</option>`
        }
        return html
    }

    /***
     * Short names for the generated waveforms, for the default wavesample name.
     * The EPS holds twelve characters, so "Saw (down)" cannot go in as it
     * stands and still leave room for the note.
     */
    static WAVE_NAMES = {
        sine: 'SINE',
        triangle: 'TRI',
        sawDown: 'SAW DN',
        sawUp: 'SAW UP',
        square: 'SQR',
        pulse: 'PWM',
        superSaw: 'SUPRSAW'
    }

    /***
     * Turns a file name into a starting point for a wavesample name: no path,
     * no extension. Underscores and the rest of the punctuation a file name
     * collects become spaces in sanitizeName, so nothing else is needed here.
     * Long names are cut at twelve characters, which is all the EPS keeps.
     */
    static nameFromFile(fileName){
        const base = String(fileName || '').split(/[\\/]/).pop().replace(/\.[^.]*$/, '')
        return EPS16.sanitizeName(base)
    }

    /***
     * Live generation: moving a generator control builds a new waveform on the
     * spot, so the Generate button becomes a way to re-roll rather than the
     * only way to hear a change. Set false to go back to generating on the
     * button alone; nothing else has to change.
     */
    static LIVE_GENERATE = true

    /***
     * How long the panel waits for the controls to stop moving before it
     * rebuilds. A super saw filling the whole 65536 sample limit takes the
     * better part of a third of a second to build, and that work blocks the
     * page, so generating on every event of a slider drag would make the
     * slider itself stutter. Waiting for a pause gives one waveform per
     * gesture rather than forty, and 150 ms is short enough to read as
     * immediate.
     */
    static LIVE_DELAY_MS = 150

    constructor(elementId, label, color, hasFileUpload, eps){
        this.wavesample = []
        this.eps = eps
        this.label = label
        this.color = color
        this.elementId = elementId
        this.sampleRate = WaveGen.DEFAULT_SAMPLE_RATE
        // Name written into the wavesample's parameter block on upload. Empty
        // means "leave whatever the EPS already calls it alone".
        this.name = ''
        // Set once the user types in the name field, so importing a file or
        // generating a waveform stops proposing names over the top of theirs.
        this.nameEdited = false
        this.nameInputId = null
        // The MIDI note this wavesample plays back at its own pitch. For a
        // generated waveform that is the fundamental it was generated at.
        this.rootKey = WaveGen.DEFAULT_NOTE
        // Cents of correction sent with the wavesample, cancelling whatever
        // pitch error the EPS's rate quantisation leaves behind.
        this.fineTune = 0
        // Whether the generator itself made what is on screen. Every control is
        // live either way; this decides only whether a live rebuild has to save
        // what it is about to overwrite. See liveGenerate.
        this.fromGenerator = false
        this.liveTimer = null
        // Where this slot reads from and writes to on the synth. Card local: it
        // reaches the EPS16 object only through applyTarget, immediately before
        // a transfer.
        this.instrument = 0
        this.layer = 0
        this.wavesampleNumber = 1
        this.preview = new WavePreview()

        const canvas = document.getElementById(elementId + "_chart")
        const toolbar = document.createElement("div")
        canvas.parentNode.insertBefore(toolbar, canvas)

        this.editor = new WaveEditor(canvas, toolbar, {
            color: color,
            // Only used for the ms/division readout, so it has to be kept in
            // step wherever the rate is set: here, on import, and on the rate
            // select.
            sampleRate: this.sampleRate,
            onChange: (data) => {
                this.wavesample = data
                // Hand edits are the user's work, not the generator's. A slider
                // will still rebuild over them, but it has to save them first.
                this.fromGenerator = false
                this.refreshPreview()
            }
        })
        this.mountPreviewButton()

        if(hasFileUpload){
            let self = this;
            document.getElementById(elementId).addEventListener('change', function(){
                // Read off the input, not off the FileReader, which never sees
                // the name.
                const fileName = this.files[0] ? this.files[0].name : ''
                let reader = new FileReader();
                reader.onload = function() {
                    let arrayBuffer = this.result;
                    self.importWav(self.eps.parseWavFile(arrayBuffer), fileName)
                }
                reader.readAsArrayBuffer(this.files[0]);

            }, false);
        }
    }

    /***
     * Wires the twelve character name field for this slot.
     *
     * Typing is filtered as it happens, to the set the EPS can display, so what
     * is on screen is what will appear on the synth. The alternative is worse
     * than it sounds: the EPS takes any character without complaint and reads
     * it straight back, so a name that is quietly unreadable on the front panel
     * looks correct everywhere else. Trailing spaces are left alone until the
     * field is, because stripping them per keystroke fights anyone trying to
     * type a space in the middle of a name.
     */
    mountNameInput(inputId){
        this.nameInputId = inputId
        const el = document.getElementById(inputId)
        if(!el) return
        el.maxLength = EPS16.NAME_LENGTH
        el.value = this.name

        el.addEventListener('input', () => {
            const caret = el.selectionStart
            const clean = el.value
                .toUpperCase()
                .replace(/#/g, '+')
                .replace(EPS16.NAME_DISALLOWED, '')
                .slice(0, EPS16.NAME_LENGTH)
            if(clean != el.value){
                const removed = el.value.length - clean.length
                el.value = clean
                // Rejected characters shift everything after the caret left, so
                // move it by as many as were dropped or the cursor jumps to the
                // end on every filtered keystroke.
                el.setSelectionRange(Math.max(0, caret - removed), Math.max(0, caret - removed))
            }
            this.name = clean
            this.nameEdited = clean.length > 0
        })
        el.addEventListener('change', () => this.setName(el.value, true))
        el.addEventListener('blur', () => this.setName(el.value, true))
    }

    /***
     * Stores the name for this slot and shows it in the field. `fromUser` marks
     * it as chosen deliberately, which suggestName then respects.
     */
    setName(name, fromUser = false){
        this.name = EPS16.sanitizeName(name)
        if(fromUser) this.nameEdited = this.name.length > 0
        const el = this.nameInputId ? document.getElementById(this.nameInputId) : null
        if(el && el.value != this.name) el.value = this.name
        return this.name
    }

    /***
     * Offers a name derived from what was just loaded or generated, without
     * overwriting one the user typed.
     */
    suggestName(name){
        if(this.nameEdited) return this.name
        return this.setName(name)
    }

    /***
     * Takes a parsed WAV file, picks the closest EPS rate for it and loads it.
     *
     * Hardly any file will land exactly on an EPS rate, so a mismatch is
     * reported as a plain note with the pitch offset rather than as a problem.
     * The synth tunes the wavesample to key anyway, and the offset is the number
     * you would tune by.
     */
    importWav(wav, fileName = ''){
        if(!wav) return
        this.suggestName(EPSChart.nameFromFile(fileName))
        const nearest = WaveGen.nearestSampleRate(wav.sampleRate)
        this.sampleRate = nearest
        this.editor.setSampleRate(nearest)
        EPSChart.selectRate(
            document.getElementById(`${this.elementId}_genRate`),
            document.getElementById(`${this.elementId}_genRateAll`),
            nearest)

        const pitch = PitchDetect.detect(wav.audio, wav.sampleRate)
        this.setWavesample(wav.audio,
            pitch.confident ? { periodSamples: pitch.period } : {})

        let note = wav.truncated
            ? `Note: WAV holds ${wav.available} samples, over the ${EPS16.MAX_IMPORT_SAMPLES} limit.`
                + ` Imported the first ${wav.audio.length}`
            : `Success: Imported ${wav.audio.length} samples`
        note += `. File is ${(wav.sampleRate / 1000).toFixed(1)} kHz, set to nearest EPS rate `
            + `${(nearest / 1000).toFixed(1)} kHz`

        const rateCents = Math.round(WaveGen.centsBetween(wav.sampleRate, nearest))
        if(pitch.confident){
            // The detected period is a count of samples, so the pitch the synth
            // will actually sound is the EPS rate over that period. Deriving
            // the tuning from it covers the rate quantisation as well, which is
            // why nothing is added for rateCents here.
            const sounding = nearest / pitch.period
            const tuning = PitchDetect.tuningFor(sounding)
            this.rootKey = tuning.rootKey
            const rootEl = document.getElementById(`${this.elementId}_genRoot`)
            if(rootEl) rootEl.value = this.rootKey
            const applied = this.setFineTune(tuning.fineTune)
            note += `. Detected ${WaveGen.noteToName(tuning.rootKey)} `
                + `(${sounding.toFixed(2)} Hz on the EPS), root key set to `
                + `${WaveGen.noteToName(tuning.rootKey)} with `
                + `${applied > 0 ? '+' : ''}${applied} cents of fine tune`
        }else{
            // No usable pitch, so fall back to cancelling the rate mismatch
            // alone and leave the root key where the user had it.
            const applied = this.setFineTune(-rateCents)
            note += rateCents == 0 ? ' (exact)'
                : ` (${rateCents > 0 ? '+' : ''}${rateCents} cents, fine tune set to `
                    + `${applied > 0 ? '+' : ''}${applied} to cancel it)`
            note += `. No root key detected: ${pitch.reason}`
        }
        this.eps.successCallback(note)
    }

    /***
     * Records the fine tune for this slot, clamped to what the EPS accepts, and
     * shows it on the generator panel if there is one. Returns the value that
     * was actually stored.
     */
    setFineTune(cents){
        this.fineTune = Math.max(-EPS16.FINE_TUNE_LIMIT,
            Math.min(EPS16.FINE_TUNE_LIMIT, Math.round(cents) || 0))
        const fineEl = document.getElementById(`${this.elementId}_genFine`)
        if(fineEl) fineEl.value = this.fineTune
        return this.fineTune
    }

    /***
     * Single place that owns the wavesample and redraws it. The editor holds the
     * live array so edits are visible through `wavesample` without a copy back.
     */
    setWavesample(wavesample, options = {}){
        if(!wavesample) return
        this.editor.setData(wavesample, options)
        this.wavesample = this.editor.getData()
        // Whatever arrived here came from somewhere else — a file, the synth,
        // a test — until generate says otherwise, which it does immediately
        // after calling this.
        this.fromGenerator = false
        this.refreshPreview()
    }

    /***
     * Queues a regeneration after the controls have been still for a moment.
     *
     * Every control is live, whatever is on screen and whoever put it there.
     * The panel describes a waveform, so moving anything on it means build me
     * that waveform, and pressing Generate afterwards is a step that only ever
     * confirmed what the panel already said.
     *
     * That does mean a slider can throw away a pencil edit, an imported WAV or
     * a wavesample pulled off the synth. Undo brings it back: generate() puts
     * whatever it is about to replace on the undo stack first, and a live
     * rebuild keeps the stack rather than clearing it, so a slider moved by
     * accident costs one press of the undo button.
     */
    liveGenerate(options = {}){
        if(!EPSChart.LIVE_GENERATE) return
        clearTimeout(this.liveTimer)
        // A live rebuild shows the whole of what it made, exactly as the button
        // does. Holding the old view sounds helpful and is not: most of these
        // controls change the length of the buffer, so the window that was
        // showing three cycles of a saw is a sliver of the front of a super saw
        // thirty times longer, and the display looks wrong rather than zoomed.
        this.liveTimer = setTimeout(() => this.generate({ live: true }), EPSChart.LIVE_DELAY_MS)
    }

    /***
     * Swap the audio under a running preview so edits are audible straight away
     * rather than needing a stop and start.
     */
    refreshPreview(){
        if(this.preview.isPlaying){
            this.preview.play(this.wavesample, this.sampleRate)
        }
    }

    /***
     * Preview lives on the editor toolbar rather than in the generator panel, so
     * slots without a generator can still audition their wavesample.
     */
    mountPreviewButton(){
        if(!this.editor.extraEl) return
        const button = document.createElement("button")
        button.className = "btn btn-outline-secondary"
        button.title = "Preview (loops the whole wavesample)"
        button.innerHTML = '<i class="fa-solid fa-play"></i>'
        this.editor.extraEl.appendChild(button)

        this.preview.onStateChange = (playing) => {
            button.innerHTML = playing
                ? '<i class="fa-solid fa-stop"></i>'
                : '<i class="fa-solid fa-play"></i>'
            button.classList.toggle("btn-secondary", playing)
            button.classList.toggle("btn-outline-secondary", !playing)
        }
        button.addEventListener("click", async () => {
            await this.preview.toggle(this.wavesample, this.sampleRate)
        })
    }

    /***
     * Injects the waveform generator controls into the given container. Kept off
     * the constructor so each slot can opt in without changing how it is built.
     */
    mountGenerator(containerId){
        const container = document.getElementById(containerId)
        if(!container) return
        const id = this.elementId
        // The last period count this panel put in the field itself, so it can
        // tell its own suggestion from a figure the user typed.
        this.autoPeriods = null

        const typeOptions = WaveGen.TYPES.map(
            type => `<option value="${type.value}">${type.label}</option>`).join("")
        let noteOptions = ""
        for(let note=24; note<=96; note++){
            noteOptions += `<option value="${note}">${WaveGen.noteToName(note)} (${WaveGen.noteToFrequency(note).toFixed(2)} Hz)</option>`
        }
        const rootOptions = EPSChart.noteOptionsHtml()

        container.innerHTML = `
            <div class="card mb-2">
                <div class="card-header py-1"><small><i class="fa-solid fa-wave-square"></i> Generate Waveform</small></div>
                <div class="card-body py-2">
                    <div class="form-row">
                        <div class="col-6 mb-2">
                            <label class="mb-0"><small>Waveform</small></label>
                            <select id="${id}_genType" class="custom-select custom-select-sm">${typeOptions}</select>
                        </div>
                        <div class="col-6 mb-2">
                            <label class="mb-0"><small>Sample Rate</small></label>
                            <select id="${id}_genRate" class="custom-select custom-select-sm"></select>
                            <select id="${id}_genRateAll" class="custom-select custom-select-sm mt-1" style="display:none"></select>
                        </div>
                        <div class="col-8 mb-2">
                            <label class="mb-0"><small>Fundamental</small></label>
                            <select id="${id}_genNote" class="custom-select custom-select-sm">${noteOptions}</select>
                        </div>
                        <div class="col-4 mb-2">
                            <label class="mb-0"><small>Periods</small></label>
                            <input type="number" id="${id}_genPeriods" class="form-control form-control-sm" value="1" min="1">
                        </div>
                        <div class="col-6 mb-2">
                            <label class="mb-0"><small>Root Key</small></label>
                            <select id="${id}_genRoot" class="custom-select custom-select-sm">${rootOptions}</select>
                        </div>
                        <div class="col-6 mb-2">
                            <label class="mb-0"><small>Fine Tune (cents)</small></label>
                            <input type="number" id="${id}_genFine" class="form-control form-control-sm"
                                value="0" min="-99" max="99" step="1">
                        </div>
                        <div class="col-6 mb-2" id="${id}_genPulseGroup" style="display:none">
                            <label class="mb-0"><small><span id="${id}_genPulseTitle">Pulse Width</span>: <span id="${id}_genPulseLabel">50%</span></small></label>
                            <input type="range" id="${id}_genPulse" class="custom-range" min="5" max="95" value="50">
                        </div>
                        <div class="col-6 mb-2">
                            <label class="mb-0"><small>Amplitude: <span id="${id}_genAmpLabel">99%</span></small></label>
                            <input type="range" id="${id}_genAmp" class="custom-range" min="10" max="100" value="99">
                        </div>
                    </div>
                    <div class="form-row" id="${id}_genSawGroup" style="display:none">
                        <div class="col-12 mb-1">
                            <div class="form-check form-check-inline">
                                <input class="form-check-input" type="checkbox" id="${id}_genRandomPhase">
                                <label class="form-check-label" for="${id}_genRandomPhase">
                                    <small>Random start phase</small>
                                </label>
                            </div>
                            <div class="form-check form-check-inline">
                                <input class="form-check-input" type="checkbox" id="${id}_genDrift">
                                <label class="form-check-label" for="${id}_genDrift">
                                    <small>Drift</small>
                                </label>
                            </div>
                            <div class="form-check form-check-inline">
                                <input class="form-check-input" type="checkbox" id="${id}_genTrackingHpf">
                                <label class="form-check-label" for="${id}_genTrackingHpf"
                                    title="24 dB/octave below the fundamental, as on the JP-8000">
                                    <small>Tracking HPF</small>
                                </label>
                            </div>
                        </div>
                        <div class="col-12 mb-2" id="${id}_genDriftGroup" style="display:none">
                            <label class="mb-0"><small>Drift Depth: <span id="${id}_genDriftLabel">&plusmn;10 cents</span></small></label>
                            <input type="range" id="${id}_genDriftAmount" class="custom-range" min="1" max="50" value="10">
                        </div>
                    </div>
                    <div class="form-row align-items-center">
                        <div class="col-auto">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="${id}_genBandLimited" checked>
                                <label class="form-check-label" for="${id}_genBandLimited">
                                    <small>Band limited (no aliasing)</small>
                                </label>
                            </div>
                        </div>
                        <div class="col">
                            <button id="${id}_genBtn" class="btn btn-sm btn-info btn-block">
                                <i class="fa-solid fa-bolt"></i> Generate
                            </button>
                        </div>
                    </div>
                    <small class="text-muted" id="${id}_genInfo"></small>
                </div>
            </div>
        `

        const typeEl = document.getElementById(`${id}_genType`)
        const pulseEl = document.getElementById(`${id}_genPulse`)
        const ampEl = document.getElementById(`${id}_genAmp`)
        const rateEl = document.getElementById(`${id}_genRate`)
        const noteEl = document.getElementById(`${id}_genNote`)
        const periodsEl = document.getElementById(`${id}_genPeriods`)
        const groupEl = document.getElementById(`${id}_genPulseGroup`)
        const titleEl = document.getElementById(`${id}_genPulseTitle`)
        const labelEl = document.getElementById(`${id}_genPulseLabel`)
        const sawGroupEl = document.getElementById(`${id}_genSawGroup`)
        const randomPhaseEl = document.getElementById(`${id}_genRandomPhase`)
        const driftEl = document.getElementById(`${id}_genDrift`)
        const driftGroupEl = document.getElementById(`${id}_genDriftGroup`)
        const driftAmountEl = document.getElementById(`${id}_genDriftAmount`)
        const hpfEl = document.getElementById(`${id}_genTrackingHpf`)
        const bandEl = document.getElementById(`${id}_genBandLimited`)

        const rootEl = document.getElementById(`${id}_genRoot`)
        const fineEl = document.getElementById(`${id}_genFine`)
        noteEl.value = WaveGen.DEFAULT_NOTE
        rootEl.value = this.rootKey
        fineEl.value = this.fineTune

        const spreadLabel = () => {
            labelEl.innerHTML = WaveGen.usesDetune(typeEl.value)
                ? `&plusmn;${pulseEl.value} cents`
                : `${pulseEl.value}%`
        }
        const driftLabel = () => {
            document.getElementById(`${id}_genDriftLabel`).innerHTML
                = `&plusmn;${driftAmountEl.value} cents`
        }
        const ampLabel = () => {
            document.getElementById(`${id}_genAmpLabel`).innerHTML = `${ampEl.value}%`
        }

        /***
         * How far random phase and drift are moving the voices about. Both
         * loosen how precisely each voice has to land on its nominal detune,
         * which is what decides the buffer length.
         */
        const smearCents = () => WaveGen.smearCents(
            parseInt(pulseEl.value) || 0,
            randomPhaseEl.checked,
            driftEl.checked ? (parseInt(driftAmountEl.value) || 0) : 0)

        /***
         * Detune only survives cycle quantisation on a long enough buffer, so
         * set the periods field to the minimum that expresses it rather than
         * quietly generating a plain saw. Never suggests more than fits inside
         * the generator's size limit.
         *
         * A figure this put there is ours to move in either direction, so
         * turning on random phase or drift can hand the samples back rather
         * than leaving the buffer pinned at the strict length. A figure the
         * user typed is only ever raised.
         */
        const raisePeriodsForDetune = () => {
            if (!WaveGen.usesDetune(typeEl.value)) return
            const periodSamples = this.sampleRate / WaveGen.noteToFrequency(parseInt(noteEl.value))
            const fits = Math.max(1, Math.floor(WaveGen.MAX_SAMPLES / periodSamples))
            const needed = Math.min(fits,
                WaveGen.periodsForDetune(parseInt(pulseEl.value), smearCents()))
            const current = parseInt(periodsEl.value) || 1
            if (current === this.autoPeriods || current < needed) {
                periodsEl.value = needed
                this.autoPeriods = needed
            }
        }

        // Band limiting is shared with every other waveform, so the super saw's
        // preference for it off is handed back on the way out rather than
        // quietly leaving the next sine to alias.
        let bandLimitedBeforeSaw = null

        // The period count the current waveform's own sizing displaced, and
        // whether that count was this panel's suggestion or the user's own
        // number. Null when the waveform on the dropdown did not move the field.
        let displacedPeriods = null

        /***
         * Hands back the period count the outgoing waveform's sizing displaced.
         *
         * Some waveforms need a long buffer to be themselves — a super saw over
         * a couple of cycles quantises to a plain saw — so picking one raises
         * the period count on the spot. That figure has nothing to do with the
         * next waveform, and leaving a sine at the hundred and thirty nine
         * periods a super saw needed is a surprise every time.
         *
         * Deliberately not a list of which waveforms are long: it restores
         * whenever the field was moved by the sizing rather than by the user, so
         * any waveform added later that sizes its own buffer is covered without
         * anything here knowing about it.
         *
         * A number the user typed is left where it is. Only a figure this panel
         * put there is this panel's to take away, which is the same rule
         * raisePeriodsForDetune works to.
         */
        const restoreDisplacedPeriods = () => {
            if (displacedPeriods === null) return
            if ((parseInt(periodsEl.value) || 1) === this.autoPeriods) {
                periodsEl.value = displacedPeriods.value
                // Only still ours if it was ours before the sizing took it. A
                // figure the user typed goes back to being theirs, so the
                // sizing can raise it again but never lower it.
                this.autoPeriods = displacedPeriods.auto ? displacedPeriods.value : null
            }
            displacedPeriods = null
        }

        /***
         * The pulse width slider doubles as the super saw detune control, so it
         * gets a new title, range and units when the waveform changes. Picking
         * the super saw also drops its whole preset in, since none of its
         * settings mean anything to the other waveforms.
         */
        const configureSpread = () => {
            // Back to the length the incoming waveform should be sized from,
            // before it gets a chance to size the field itself.
            restoreDisplacedPeriods()
            const periodsBefore = parseInt(periodsEl.value) || 1
            const beforeWasAuto = periodsBefore === this.autoPeriods

            const superSaw = WaveGen.usesDetune(typeEl.value)
            sawGroupEl.style.display = superSaw ? '' : 'none'
            if (!superSaw && bandLimitedBeforeSaw !== null) {
                bandEl.checked = bandLimitedBeforeSaw
                bandLimitedBeforeSaw = null
            }
            if (superSaw) {
                const preset = WaveGen.SUPER_SAW_DEFAULTS
                groupEl.style.display = ''
                titleEl.innerHTML = 'Detune Spread'
                pulseEl.min = 0
                pulseEl.max = 100
                pulseEl.value = preset.detuneCents
                ampEl.value = preset.amplitude
                ampLabel()
                randomPhaseEl.checked = preset.randomPhase
                driftEl.checked = preset.drift
                driftAmountEl.value = preset.driftCents
                driftGroupEl.style.display = preset.drift ? '' : 'none'
                driftLabel()
                hpfEl.checked = preset.trackingHighPass
                if (bandLimitedBeforeSaw === null) bandLimitedBeforeSaw = bandEl.checked
                bandEl.checked = preset.bandLimited
            } else if (typeEl.value === 'pulse') {
                groupEl.style.display = ''
                titleEl.innerHTML = 'Pulse Width'
                pulseEl.min = 5
                pulseEl.max = 95
                pulseEl.value = 50
            } else {
                groupEl.style.display = 'none'
            }
            spreadLabel()
            raisePeriodsForDetune()

            // Whether this waveform's own sizing moved the field, and so what
            // there is to hand back when a different one is picked. Read off
            // the field rather than from the type, so it stays true of whatever
            // is added later.
            const periodsAfter = parseInt(periodsEl.value) || 1
            displacedPeriods = periodsAfter !== periodsBefore
                ? { value: periodsBefore, auto: beforeWasAuto }
                : null
        }
        /***
         * Every generator control, as a plain object, for the clipboard.
         *
         * Read off the controls rather than kept alongside them, so there is no
         * second copy of the panel's state to fall out of step with it, and so
         * a control added to the markup later is picked up by adding one line
         * here rather than by remembering to update a mirror.
         */
        this.generatorSettings = () => ({
            type: typeEl.value,
            note: parseInt(noteEl.value),
            periods: parseInt(periodsEl.value) || 1,
            spread: parseInt(pulseEl.value),
            amplitude: parseInt(ampEl.value),
            randomPhase: randomPhaseEl.checked,
            drift: driftEl.checked,
            driftCents: parseInt(driftAmountEl.value),
            trackingHighPass: hpfEl.checked,
            bandLimited: bandEl.checked,
            // Travels with the rest so a pasted period count keeps knowing
            // whether it was this panel's suggestion or a number someone typed.
            autoPeriods: this.autoPeriods
        })

        /***
         * Puts those controls back, and does not rebuild.
         *
         * Assigning to `value` and `checked` fires no events, so none of the
         * listeners below run and the pasted samples stay exactly as they were
         * copied. That is the point: paste moves a waveform *and* the settings
         * that describe it, and a paste that regenerated would hand back
         * something subtly different from what was copied — a super saw re-rolls
         * its random phases, so it would not even be the same waveform twice.
         *
         * configureSpread runs first, to lay the panel out for the incoming
         * waveform — labels, slider range, which rows are shown, and the whole
         * preset a super saw drops in — and the saved figures then go over the
         * top of it, so what was copied wins over what the preset would have
         * chosen.
         */
        this.applyGeneratorSettings = (saved) => {
            if(!saved) return
            typeEl.value = saved.type
            configureSpread()
            noteEl.value = saved.note
            pulseEl.value = saved.spread
            ampEl.value = saved.amplitude
            randomPhaseEl.checked = saved.randomPhase
            driftEl.checked = saved.drift
            driftAmountEl.value = saved.driftCents
            driftGroupEl.style.display = saved.drift ? '' : 'none'
            hpfEl.checked = saved.trackingHighPass
            bandEl.checked = saved.bandLimited
            periodsEl.value = saved.periods
            this.autoPeriods = saved.autoPeriods
            // Nothing was displaced on the way in — the count came from the
            // clipboard rather than from this waveform's sizing — so there is
            // nothing to hand back when the type is next changed.
            displacedPeriods = null
            spreadLabel()
            driftLabel()
            ampLabel()
        }

        /***
         * Every control that changes the samples asks for a rebuild. The ones
         * that only change how the wavesample is played on the synth — root
         * key and fine tune — do not, since there is nothing to rebuild.
         *
         * configureSpread is called at mount time as well as on a change, so
         * this hangs off the listener rather than off the function: a panel
         * appearing on screen is not the user asking for a waveform.
         */
        const live = (options) => this.liveGenerate(options)

        typeEl.addEventListener('change', () => {
            configureSpread()
            live()
        })
        configureSpread()

        pulseEl.addEventListener('input', () => {
            spreadLabel()
            raisePeriodsForDetune()
            live()
        })

        driftEl.addEventListener('change', () => {
            driftGroupEl.style.display = driftEl.checked ? '' : 'none'
            raisePeriodsForDetune()
            live()
        })
        driftAmountEl.addEventListener('input', () => {
            driftLabel()
            raisePeriodsForDetune()
            live()
        })
        randomPhaseEl.addEventListener('change', () => {
            raisePeriodsForDetune()
            live()
        })
        hpfEl.addEventListener('change', live)
        bandEl.addEventListener('change', live)
        // On change rather than input, unlike the sliders. Generating writes
        // the count it actually achieved back into this field, so rebuilding
        // per keystroke would rewrite the number under the user mid-way
        // through typing it. Waiting for the field to be committed — Enter, a
        // click away, or either spinner arrow — costs nothing and cannot fight
        // the typing.
        periodsEl.addEventListener('change', live)
        // A generated waveform plays back at its own pitch when the key played
        // is the fundamental it was generated at, so the root key follows the
        // fundamental. Change it afterwards to transpose the sample on the
        // keyboard, or to give an imported WAV a sensible home key.
        noteEl.addEventListener('change', () => {
            raisePeriodsForDetune()
            rootEl.value = noteEl.value
            this.rootKey = parseInt(noteEl.value)
            live()
        })
        rootEl.addEventListener('change', () => {
            this.rootKey = parseInt(rootEl.value)
        })
        fineEl.addEventListener('change', () => {
            this.fineTune = this.setFineTune(parseInt(fineEl.value) || 0)
        })
        ampEl.addEventListener('input', () => {
            ampLabel()
            live()
        })

        // Changing the rate changes the pitch the buffer plays back at, so keep
        // preview and WAV export in step even before the next Generate.
        this.sampleRate = EPSChart.mountRateSelects(
            rateEl,
            document.getElementById(`${id}_genRateAll`),
            this.sampleRate,
            (hz) => {
                this.sampleRate = hz
                this.editor.setSampleRate(hz)
                raisePeriodsForDetune()
                this.refreshPreview()
                live()
            })
        this.editor.setSampleRate(this.sampleRate)

        document.getElementById(`${id}_genBtn`).addEventListener('click', () => {
            this.generate()
        })

        // Saving reports through the same line the generator writes its summary
        // to. A file arriving in the downloads folder is easy to miss, and the
        // one thing worth saying out loud is the rate it was written at, since
        // that is what decides the pitch it plays back at anywhere else.
    }

    /***
     * Hands the slot's wavesample to the browser as a WAV file.
     *
     * Written at the slot's EPS rate rather than at a standard audio rate, so
     * the file sounds like what the editor is showing and reloads round trip.
     * Fine tune has nowhere to go in a WAV header and is left behind: it exists
     * to cancel the EPS's rate quantisation on the synth, which a file played
     * at its own written rate does not suffer from.
     *
     * Returns the file name, or null when there is nothing to save.
     */
    saveWav(){
        if(!this.wavesample || this.wavesample.length === 0) return null
        // this.name is already the EPS's twelve character set, so the only
        // thing left to do is keep spaces and its two punctuation marks out of
        // a file name. Falls back to the slot's label for an unnamed slot.
        const base = String(this.name || this.label || 'wavesample')
            .trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
        const fileName = `${base || 'wavesample'}.wav`
        this.eps.saveFile(this.wavesample, this.sampleRate, fileName)
        return fileName
    }

    /***
     * Injects this slot's transfer controls: where it points on the synth, the
     * two directions it can move a wavesample, and the clipboard.
     *
     * Every card gets the whole set. Before this the page had a card that could
     * receive and not generate beside a card that could generate and not
     * receive, which is not a design so much as the order the two were written
     * in, and it meant that editing something off the synth and keeping a copy
     * involved moving it between two panels that could not talk to each other.
     */
    mountTransfer(containerId){
        const container = document.getElementById(containerId)
        if(!container) return
        const id = this.elementId

        const options = (count, from, label) => {
            let html = ''
            for(let i = 0; i < count; i++){
                html += `<option value="${from + i}">${label(from + i)}</option>`
            }
            return html
        }

        container.innerHTML = `
            <div class="form-row align-items-end">
                <div class="col">
                    <label class="small mb-1" for="${id}_tgtInst">Instrument</label>
                    <select id="${id}_tgtInst" class="custom-select custom-select-sm">
                        ${options(EPS16.INSTRUMENT_COUNT, 0, (n) => n + 1)}
                    </select>
                </div>
                <div class="col">
                    <label class="small mb-1" for="${id}_tgtLayer">Layer</label>
                    <select id="${id}_tgtLayer" class="custom-select custom-select-sm">
                        ${options(EPSBlocks.LAYER_COUNT, 0, (n) => n + 1)}
                    </select>
                </div>
                <div class="col">
                    <label class="small mb-1" for="${id}_tgtWave">Wavesample</label>
                    <select id="${id}_tgtWave" class="custom-select custom-select-sm">
                        ${options(EPSBlocks.WAVESAMPLE_COUNT - 1, 1, (n) => n)}
                    </select>
                </div>
            </div>
            <div class="form-row mt-2">
                <div class="col-6">
                    <button id="${id}_get" class="btn btn-sm btn-info btn-block eps-transfer"
                        title="Read this instrument, layer and wavesample off the EPS into this tab">
                        <i class="fa-solid fa-download"></i> Get from EPS
                    </button>
                </div>
                <div class="col-6">
                    <button id="${id}_put" class="btn btn-sm btn-info btn-block eps-transfer"
                        title="Send this tab's wavesample to the EPS, creating what is missing">
                        <i class="fa-solid fa-upload"></i> Send to EPS
                    </button>
                </div>
            </div>
            <div class="form-row mt-2">
                <div class="col-4">
                    <button id="${id}_copy" class="btn btn-sm btn-outline-secondary btn-block"
                        title="Copy this wavesample, its rate, root key, fine tune and name">
                        <i class="fa-regular fa-copy"></i> Copy
                    </button>
                </div>
                <div class="col-4">
                    <button id="${id}_paste" class="btn btn-sm btn-outline-secondary btn-block"
                        title="Replace this tab with the copied wavesample">
                        <i class="fa-regular fa-clipboard"></i> Paste
                    </button>
                </div>
                <div class="col-4">
                    <button id="${id}_save" class="btn btn-sm btn-outline-info btn-block"
                        title="Save this wavesample to this computer as a WAV file">
                        <i class="fa-solid fa-file-arrow-down"></i> Save
                    </button>
                </div>
            </div>
            <small class="form-text text-muted" id="${id}_tgtInfo"></small>
        `

        const say = (text) => {
            document.getElementById(`${id}_tgtInfo`).innerHTML = text
            if(window.log) window.log(`${this.label}: ${text}`)
        }
        const instEl = document.getElementById(`${id}_tgtInst`)
        const layerEl = document.getElementById(`${id}_tgtLayer`)
        const waveEl = document.getElementById(`${id}_tgtWave`)
        instEl.value = this.instrument
        layerEl.value = this.layer
        waveEl.value = this.wavesampleNumber

        // Card local state only. Nothing here reaches the EPS16 object; see
        // applyTarget for why that matters now that every tab has a set of
        // these.
        instEl.addEventListener('change', () => { this.instrument = parseInt(instEl.value) })
        layerEl.addEventListener('change', () => { this.layer = parseInt(layerEl.value) })
        waveEl.addEventListener('change', () => { this.wavesampleNumber = parseInt(waveEl.value) })

        document.getElementById(`${id}_get`).addEventListener('click', () => this.getFromEps(say))
        document.getElementById(`${id}_put`).addEventListener('click', () => this.sendToEps(say))

        document.getElementById(`${id}_copy`).addEventListener('click', () => {
            const held = this.copy()
            say(held ? `Copied ${held.data.length} samples`
                    + `${held.name ? ` ("${held.name}")` : ''}, `
                    + `${(held.sampleRate / 1000).toFixed(1)} kHz, root `
                    + `${WaveGen.noteToName(held.rootKey)}`
                    + (held.generator ? ', with the generator settings' : '')
                : 'Nothing to copy: this tab is empty.')
        })
        document.getElementById(`${id}_paste`).addEventListener('click', () => {
            const held = this.paste()
            say(held ? `Pasted ${held.data.length} samples from ${held.from}`
                : 'Nothing has been copied yet.')
        })
        document.getElementById(`${id}_save`).addEventListener('click', () => {
            const saved = this.saveWav()
            say(saved ? `Saved ${this.wavesample.length} samples to ${saved}, `
                    + `16 bit mono at ${(this.sampleRate / 1000).toFixed(1)} kHz`
                : 'Nothing to save yet: generate a waveform or load a WAV file first.')
        })
    }

    /***
     * Reads this slot's wavesample off the synth, along with the four settings
     * that say how it should sound.
     *
     * The rate, root key and fine tune all arrive in the parameter block the
     * download already fetched, so they are applied rather than left for the
     * user to guess at, and the generator panel's controls are moved to match.
     */
    async getFromEps(say){
        const done = EPSWaveUI.startTransfer(`Reading ${this.label} from the EPS`)
        if(!done){
            say(`Busy: ${EPSWaveUI.transferring}. One transfer at a time.`)
            return
        }
        try{
            this.applyTarget()
            const audio = await this.eps.getWavesampleDataChunked(this.eps.chunkSize,
                (partial, percent) => {
                    EPSWaveUI.status(`Reading ${this.label} from the EPS`, percent)
                    this.setWavesample(partial)
                })
            if(!audio || audio.length == 0){
                say(`Nothing came back from instrument ${this.instrument + 1}, `
                    + `layer ${this.layer + 1}, wavesample ${this.wavesampleNumber}.`)
                return
            }
            this.setWavesample(audio)
            let note = `Read ${audio.length} samples from instrument `
                + `${this.instrument + 1}, layer ${this.layer + 1}, `
                + `wavesample ${this.wavesampleNumber}`
            if(this.eps.lastSampleRate){
                this.sampleRate = EPSChart.selectRate(
                    document.getElementById(`${this.elementId}_genRate`),
                    document.getElementById(`${this.elementId}_genRateAll`),
                    this.eps.lastSampleRate)
                this.editor.setSampleRate(this.sampleRate)
                this.refreshPreview()
                note += `, ${(this.eps.lastSampleRate / 1000).toFixed(1)} kHz`
            }
            if(typeof this.eps.lastRootKey == 'number'){
                this.rootKey = this.eps.lastRootKey
                const rootEl = document.getElementById(`${this.elementId}_genRoot`)
                if(rootEl) rootEl.value = this.rootKey
                note += `, root ${WaveGen.noteToName(this.rootKey)}`
            }
            if(typeof this.eps.lastFineTune == 'number'){
                note += `, fine tune ${this.setFineTune(this.eps.lastFineTune)}`
            }
            if(this.eps.lastWavesampleName && this.eps.lastWavesampleName.length > 0){
                this.setName(this.eps.lastWavesampleName, true)
                note += `, named "${this.eps.lastWavesampleName}"`
            }
            say(note)
        }catch(error){
            say(`The read failed: ${error.message}`)
        }finally{
            done(`Read ${this.label}`)
        }
    }

    /***
     * Sends this slot to the synth, creating whatever is missing on the way.
     *
     * prepareTarget builds the instrument, layer and wavesample if they are not
     * there, so an empty synth needs nothing set up by hand. It can also come
     * back with a different wavesample number than was asked for — the EPS
     * assigns its own — and when it does, the card's own selector is moved to
     * match, because the alternative is a control that quietly disagrees with
     * where the audio went.
     */
    async sendToEps(say){
        if(!this.wavesample || this.wavesample.length == 0){
            say('Nothing to send: this tab is empty.')
            return
        }
        const done = EPSWaveUI.startTransfer(`Sending ${this.label} to the EPS`)
        if(!done){
            say(`Busy: ${EPSWaveUI.transferring}. One transfer at a time.`)
            return
        }
        try{
            this.applyTarget()
            const ready = await this.eps.prepareTarget({},
                (what) => EPSWaveUI.status(`Sending ${this.label}: ${what}`))
            if(!ready.ok){
                say(`Could not prepare instrument ${this.instrument + 1}: ${ready.message}`)
                return
            }
            if(ready.created.length > 0 || ready.renumbered) say(ready.message)
            if(ready.renumbered){
                this.wavesampleNumber = ready.wavesample
                const waveEl = document.getElementById(`${this.elementId}_tgtWave`)
                if(waveEl) waveEl.value = this.wavesampleNumber
            }
            const ok = await this.eps.uploadWavToEPS(this.wavesample, 1, 0,
                (percent) => EPSWaveUI.status(`Sending ${this.label} to the EPS`, percent),
                this.sampleRate, this.rootKey, this.fineTune, this.name)
            say(ok ? `Sent ${this.wavesample.length} samples to instrument `
                    + `${this.instrument + 1}, layer ${this.layer + 1}, `
                    + `wavesample ${this.wavesampleNumber}`
                : 'The upload did not complete; see the log.')
        }catch(error){
            say(`The upload failed: ${error.message}`)
        }finally{
            done(`Sent ${this.label}`)
        }
    }

    /***
     * The page's own clipboard, shared by every slot.
     *
     * Not the system clipboard, on purpose. What is being copied is a
     * wavesample and everything the EPS needs to play it back — the rate, the
     * root key, the fine tune and the name — and none of that survives a trip
     * through text. It exists so that four variations on one waveform for a
     * transwave can be made by loading the file once, and it keeps the metadata
     * because a copy that arrives at the wrong pitch is not a copy.
     */
    static clipboard = null

    /*** Snapshots this slot. The samples are copied, not shared, so editing
     *  either side afterwards cannot reach into the other. */
    copy(){
        if(!this.wavesample || this.wavesample.length === 0) return null
        EPSChart.clipboard = {
            data: this.wavesample.slice(),
            sampleRate: this.sampleRate,
            rootKey: this.rootKey,
            fineTune: this.fineTune,
            name: this.name,
            from: this.label,
            // A slot with no generator mounted has none to copy, and pasting
            // into one leaves whatever settings it has alone.
            generator: this.generatorSettings ? this.generatorSettings() : null,
            // Whether those settings actually describe these samples. True for
            // a generated waveform, false for an imported file or anything
            // drawn on the canvas, where the panel is showing settings that
            // have nothing to do with what is in the buffer.
            fromGenerator: this.fromGenerator
        }
        return EPSChart.clipboard
    }

    /***
     * Replaces this slot with whatever was copied.
     *
     * The name comes across marked as the user's, so that generating or
     * importing into this slot later does not propose a name over the top of
     * the one that was deliberately pasted here.
     */
    paste(){
        const held = EPSChart.clipboard
        if(!held) return null
        this.sampleRate = held.sampleRate
        this.editor.setSampleRate(held.sampleRate)
        EPSChart.selectRate(
            document.getElementById(`${this.elementId}_genRate`),
            document.getElementById(`${this.elementId}_genRateAll`),
            held.sampleRate)
        this.rootKey = held.rootKey
        const rootEl = document.getElementById(`${this.elementId}_genRoot`)
        if(rootEl) rootEl.value = this.rootKey
        this.setFineTune(held.fineTune)
        if(held.name) this.setName(held.name, true)
        // Before the samples, because laying the panel out reads the sample
        // rate that was just set, and because none of it may disturb what
        // lands in the editor.
        if(this.applyGeneratorSettings) this.applyGeneratorSettings(held.generator)
        // Repaints and refreshes the preview. Also clears fromGenerator, which
        // is why the line below comes after it rather than before.
        this.setWavesample(held.data.slice())
        // Paste reproduces the slot it was copied from, down to whether the
        // samples on screen are the generator's own work.
        //
        // A copied waveform arrives with the settings that made it, so the
        // panel is telling the truth about what is on screen and moving a
        // slider adjusts it — which is the point of pasting a waveform four
        // times to make four variations of it.
        //
        // A copy taken from an imported file or from something drawn on the
        // canvas is nobody's but the user's, exactly as it was at the other
        // end, so the first slider that rebuilds over it saves it for undo.
        this.fromGenerator = held.fromGenerator === true && held.generator != null
        return held
    }

    /***
     * Points the EPS at this slot's instrument, layer and wavesample.
     *
     * Called immediately before every command this card sends and at no other
     * time. The three numbers on the EPS16 object are the address every sysex
     * command carries, and they are global to the connection while the controls
     * that set them are now per card — so the only safe discipline is that
     * nobody sets them on change and everybody sets them on use. A card that
     * relied on them still being what it left them as would work perfectly
     * until the user touched another tab.
     */
    applyTarget(){
        this.eps.setInstrumentNumber(this.instrument)
        this.eps.setLayerNumber(this.layer)
        this.eps.setWavesampleNumber(this.wavesampleNumber)
        this.eps.debug(`${this.label}: addressing instrument ${this.instrument + 1}, `
            + `layer ${this.layer + 1}, wavesample ${this.wavesampleNumber}`)
    }

    /***
     * Reads the generator controls and replaces this slot's wavesample.
     *
     * Always leaves the editor showing the whole of the new waveform, whether
     * it was the button that asked or a control being moved.
     *
     * `live` marks the rebuilds nobody explicitly asked for — a slider moving
     * rather than the button being pressed — which are the ones that have to be
     * undoable. The button is a deliberate act and starts the slot clean, as it
     * always has.
     */
    generate(options = {}){
        const live = options.live === true
        const id = this.elementId
        // Anything queued is about to be done here anyway, and letting it fire
        // afterwards would re-roll the random phases of the waveform the user
        // just asked for.
        clearTimeout(this.liveTimer)
        const note = parseInt(document.getElementById(`${id}_genNote`).value)
        this.rootKey = parseInt(document.getElementById(`${id}_genRoot`).value) || note
        const type = document.getElementById(`${id}_genType`).value
        // Waveform and pitch, the two things you would want to read off the
        // display: "PWM C3".
        this.suggestName(`${EPSChart.WAVE_NAMES[type] || type} ${WaveGen.noteToName(note)}`)
        // One slider, read as a percentage for pulse and as cents for super saw.
        const spread = parseInt(document.getElementById(`${id}_genPulse`).value)
        const driftEl = document.getElementById(`${id}_genDrift`)
        const periodsEl = document.getElementById(`${id}_genPeriods`)
        const asked = parseInt(periodsEl.value) || 1
        const result = WaveGen.generate({
            type: type,
            frequency: WaveGen.noteToFrequency(note),
            sampleRate: this.sampleRate,
            periods: asked,
            pulseWidth: spread / 100,
            detuneCents: spread,
            amplitude: parseInt(document.getElementById(`${id}_genAmp`).value) / 100,
            bandLimited: document.getElementById(`${id}_genBandLimited`).checked,
            randomPhase: document.getElementById(`${id}_genRandomPhase`).checked,
            driftCents: driftEl && driftEl.checked
                ? parseInt(document.getElementById(`${id}_genDriftAmount`).value) || 0 : 0,
            trackingHighPass: document.getElementById(`${id}_genTrackingHpf`).checked
        })
        // A live rebuild about to overwrite something the generator did not
        // make — a pencil edit, an import, a wavesample off the synth — puts it
        // on the undo stack on its way past. Only once: after this the slot is
        // the generator's own, and dragging a slider through twenty rebuilds
        // should leave one thing to undo back to, not twenty.
        if(live && !this.fromGenerator && this.wavesample.length > 0){
            this.editor.snapshotAll()
        }
        // Live rebuilds keep the stack, so that snapshot survives every later
        // move of the sliders. The button clears it, as a fresh start should.
        this.setWavesample(result.data,
            { periodSamples: result.periodSamples, keepUndo: live })
        // Now the generator's to replace, which is what lets the next slider
        // move rebuild it without asking.
        this.fromGenerator = true
        periodsEl.value = result.periods
        // Generating can clamp the count to fit the size limit. If the figure it
        // replaced was one we put there, the replacement is ours to move too.
        if (this.autoPeriods === asked) this.autoPeriods = result.periods

        // The buffer holds a whole number of samples, so the pitch it really
        // loops at is a shade off the note asked for. Cancel that too, the same
        // way an imported file's rate mismatch is cancelled.
        const drift = WaveGen.centsBetween(WaveGen.noteToFrequency(note), result.actualFrequency)
        this.setFineTune(-drift)

        let info = `${result.totalSamples} samples, ${result.periods} period(s) of `
            + `${result.periodSamples.toFixed(1)} samples, plays at `
            + `${result.actualFrequency.toFixed(2)} Hz on `
            + `${WaveGen.noteToName(this.rootKey)}`
        if(this.fineTune != 0){
            info += ` with ${this.fineTune > 0 ? '+' : ''}${this.fineTune} cents of fine tune`
        }
        if(result.harmonics) info += `, ${result.harmonics} harmonics`
        if(result.clamped){
            info += `. Reduced to fit the ${WaveGen.MAX_SAMPLES} sample generator limit.`
        }
        if(result.detune){
            const detune = result.detune
            info += `. ${WaveGen.SUPER_SAW_VOICES} saws detuned &plusmn;`
                + `${detune.achievedCents.toFixed(1)} cents`
            if(detune.randomPhaseVoices){
                info += `, ${detune.randomPhaseVoices} at random start phases`
            }
            if(detune.driftCents){
                info += `, drifting &plusmn;${detune.driftCents} cents once across the loop`
            }
            // Voices snap to whole cycles, so a short buffer can land either
            // side of the request, or flatten it to nothing entirely.
            const tolerance = Math.max(0.5, detune.requestedCents * 0.1)
            if(Math.abs(detune.achievedCents - detune.requestedCents) > tolerance){
                info += ` rather than the &plusmn;${detune.requestedCents} asked for`
                    + ` (${detune.requiredPeriods} periods would land closer)`
            }
            if(result.highPassHz){
                info += `, high passed at 24 dB/octave below `
                    + `${result.highPassHz.toFixed(1)} Hz`
            }
            if(detune.distinctVoices < WaveGen.SUPER_SAW_VOICES){
                info += `. Only ${detune.distinctVoices} distinct pitches at this length;`
                    + ` a lower sample rate or wider spread separates them`
            }
        }
        document.getElementById(`${id}_genInfo`).innerHTML = info
        return result
    }
}
