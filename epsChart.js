/***
 * One waveform slot: the canvas editor, an optional WAV file input, an optional
 * waveform generator panel, and audio preview.
 *
 * `wavesample` stays the public handle on the data, as the rest of the app and
 * eps.js expect a plain array of signed 16 bit ints.
 */
class EPSChart {

    constructor(elementId, label, color, hasFileUpload, eps){
        this.wavesample = []
        this.eps = eps
        this.label = label
        this.color = color
        this.elementId = elementId
        this.sampleRate = WaveGen.DEFAULT_SAMPLE_RATE
        this.preview = new WavePreview()

        const canvas = document.getElementById(elementId + "_chart")
        const toolbar = document.createElement("div")
        canvas.parentNode.insertBefore(toolbar, canvas)

        this.editor = new WaveEditor(canvas, toolbar, {
            color: color,
            onChange: (data) => {
                this.wavesample = data
                this.refreshPreview()
            }
        })
        this.mountPreviewButton()

        if(hasFileUpload){
            let self = this;
            document.getElementById(elementId).addEventListener('change', function(){
                let reader = new FileReader();
                reader.onload = function() {
                    let arrayBuffer = this.result;
                    self.importWav(self.eps.parseWavFile(arrayBuffer))
                }
                reader.readAsArrayBuffer(this.files[0]);

            }, false);
        }
    }

    /***
     * Takes a parsed WAV file, picks the closest EPS rate for it and loads it.
     *
     * Hardly any file will land exactly on an EPS rate, so a mismatch is
     * reported as a plain note with the pitch offset rather than as a problem.
     * The synth tunes the wavesample to key anyway, and the offset is the number
     * you would tune by.
     */
    importWav(wav){
        if(!wav) return
        const nearest = WaveGen.nearestSampleRate(wav.sampleRate)
        this.sampleRate = nearest
        const rateEl = document.getElementById(`${this.elementId}_genRate`)
        if(rateEl) rateEl.value = nearest

        this.setWavesample(wav.audio)

        let note = wav.truncated
            ? `Note: WAV holds ${wav.available} samples, over the ${EPS16.MAX_IMPORT_SAMPLES} limit.`
                + ` Imported the first ${wav.audio.length}`
            : `Success: Imported ${wav.audio.length} samples`
        note += `. File is ${(wav.sampleRate / 1000).toFixed(1)} kHz, set to nearest EPS rate `
            + `${(nearest / 1000).toFixed(1)} kHz`
        const cents = Math.round(WaveGen.centsBetween(wav.sampleRate, nearest))
        note += cents == 0
            ? ' (exact)'
            : ` (${cents > 0 ? '+' : ''}${cents} cents, tune to key on the synth)`
        this.eps.successCallback(note)
    }

    /***
     * Single place that owns the wavesample and redraws it. The editor holds the
     * live array so edits are visible through `wavesample` without a copy back.
     */
    setWavesample(wavesample, options = {}){
        if(!wavesample) return
        this.editor.setData(wavesample, options)
        this.wavesample = this.editor.getData()
        this.refreshPreview()
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

        const typeOptions = WaveGen.TYPES.map(
            type => `<option value="${type.value}">${type.label}</option>`).join("")
        const rateOptions = WaveGen.SAMPLE_RATES.map(
            rate => `<option value="${rate}">${(rate/1000).toFixed(1)} kHz</option>`).join("")
        let noteOptions = ""
        for(let note=24; note<=96; note++){
            noteOptions += `<option value="${note}">${WaveGen.noteToName(note)} (${WaveGen.noteToFrequency(note).toFixed(2)} Hz)</option>`
        }

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
                            <select id="${id}_genRate" class="custom-select custom-select-sm">${rateOptions}</select>
                        </div>
                        <div class="col-8 mb-2">
                            <label class="mb-0"><small>Fundamental</small></label>
                            <select id="${id}_genNote" class="custom-select custom-select-sm">${noteOptions}</select>
                        </div>
                        <div class="col-4 mb-2">
                            <label class="mb-0"><small>Periods</small></label>
                            <input type="number" id="${id}_genPeriods" class="form-control form-control-sm" value="1" min="1">
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

        rateEl.value = WaveGen.DEFAULT_SAMPLE_RATE
        noteEl.value = WaveGen.DEFAULT_NOTE

        const spreadLabel = () => {
            labelEl.innerHTML = WaveGen.usesDetune(typeEl.value)
                ? `&plusmn;${pulseEl.value} cents`
                : `${pulseEl.value}%`
        }

        /***
         * Detune only survives cycle quantisation on a long enough buffer, so
         * raise the periods field to the minimum that expresses it rather than
         * quietly generating a plain saw. Never suggests more than fits inside
         * the generator's size limit, and never lowers what the user set.
         */
        const raisePeriodsForDetune = () => {
            if (!WaveGen.usesDetune(typeEl.value)) return
            const periodSamples = parseInt(rateEl.value) / WaveGen.noteToFrequency(parseInt(noteEl.value))
            const fits = Math.max(1, Math.floor(WaveGen.MAX_SAMPLES / periodSamples))
            const needed = Math.min(fits, WaveGen.periodsForDetune(parseInt(pulseEl.value)))
            if ((parseInt(periodsEl.value) || 1) < needed) periodsEl.value = needed
        }

        /***
         * The pulse width slider doubles as the super saw detune control, so it
         * gets a new title, range and units when the waveform changes.
         */
        const configureSpread = () => {
            if (WaveGen.usesDetune(typeEl.value)) {
                groupEl.style.display = ''
                titleEl.innerHTML = 'Detune Spread'
                pulseEl.min = 0
                pulseEl.max = 100
                pulseEl.value = 25
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
        }
        typeEl.addEventListener('change', configureSpread)
        configureSpread()

        pulseEl.addEventListener('input', () => {
            spreadLabel()
            raisePeriodsForDetune()
        })
        noteEl.addEventListener('change', raisePeriodsForDetune)
        ampEl.addEventListener('input', () => {
            document.getElementById(`${id}_genAmpLabel`).innerHTML = `${ampEl.value}%`
        })

        // Changing the rate changes the pitch the buffer plays back at, so keep
        // preview and WAV export in step even before the next Generate.
        rateEl.addEventListener('change', (event) => {
            this.sampleRate = parseInt(event.target.value)
            raisePeriodsForDetune()
            this.refreshPreview()
        })

        document.getElementById(`${id}_genBtn`).addEventListener('click', () => {
            this.generate()
        })
    }

    /***
     * Reads the generator controls and replaces this slot's wavesample.
     */
    generate(){
        const id = this.elementId
        this.sampleRate = parseInt(document.getElementById(`${id}_genRate`).value)
        const note = parseInt(document.getElementById(`${id}_genNote`).value)
        // One slider, read as a percentage for pulse and as cents for super saw.
        const spread = parseInt(document.getElementById(`${id}_genPulse`).value)
        const result = WaveGen.generate({
            type: document.getElementById(`${id}_genType`).value,
            frequency: WaveGen.noteToFrequency(note),
            sampleRate: this.sampleRate,
            periods: parseInt(document.getElementById(`${id}_genPeriods`).value) || 1,
            pulseWidth: spread / 100,
            detuneCents: spread,
            amplitude: parseInt(document.getElementById(`${id}_genAmp`).value) / 100,
            bandLimited: document.getElementById(`${id}_genBandLimited`).checked
        })
        this.setWavesample(result.data, { periodSamples: result.periodSamples })
        document.getElementById(`${id}_genPeriods`).value = result.periods

        let info = `${result.totalSamples} samples, ${result.periods} period(s) of `
            + `${result.periodSamples.toFixed(1)} samples, plays at `
            + `${result.actualFrequency.toFixed(2)} Hz`
        if(result.harmonics) info += `, ${result.harmonics} harmonics`
        if(result.clamped){
            info += `. Reduced to fit the ${WaveGen.MAX_SAMPLES} sample generator limit.`
        }
        if(result.detune){
            const detune = result.detune
            info += `. ${WaveGen.SUPER_SAW_VOICES} saws detuned &plusmn;`
                + `${detune.achievedCents.toFixed(1)} cents`
            // Voices snap to whole cycles, so a short buffer can land either
            // side of the request, or flatten it to nothing entirely.
            const tolerance = Math.max(0.5, detune.requestedCents * 0.1)
            if(Math.abs(detune.achievedCents - detune.requestedCents) > tolerance){
                info += ` rather than the &plusmn;${detune.requestedCents} asked for`
                    + ` (${detune.requiredPeriods} periods would land closer)`
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
