/***
 * Waveform generation for the EPS16+.
 *
 * All wavesamples in this app are plain arrays of signed 16 bit ints
 * (-32767..32767), which is what eps.js expects for upload and WAV export.
 */
class WaveGen {

    /***
     * Sample rates supported by the EPS16+.
     *
     * Word 131 of the wavesample parameter block (section 7.3 of the External
     * Command Specification) holds the rate as a divider: the sample period is
     * that value times 1.6 microseconds. So every rate the machine can hold is
     * 625000/code Hz, and nothing else.
     *
     * The seven rates offered when sampling are codes 14, 21, 28, 35, 42, 49
     * and 56, which is a single clock over 7k for k = 2..8. Editing an existing
     * wavesample reaches the whole range: code 2 is 312.5 kHz and code 100 is
     * 6.25 kHz, matching the limits seen on the front panel.
     */
    static RATE_CLOCK = 625000
    static RATE_CODE_MIN = 2
    static RATE_CODE_MAX = 100

    /***
     * Codes worth putting at the top of a menu: the seven sampling rates, plus
     * code 13 which at 48077 Hz is the closest the EPS gets to a 48 kHz file.
     * Code 14 doubles as the nearest to 44.1 kHz.
     */
    static COMMON_RATE_CODES = [13, 14, 21, 28, 35, 42, 49, 56]

    /***
     * Rates are rounded to whole Hz. The error is under a fiftieth of a cent
     * and it keeps every rate an integer, which the selects and the WAV header
     * both want.
     */
    static rateFromCode(code){
        return Math.round(WaveGen.RATE_CLOCK / code)
    }

    static codeForRate(hz){
        const code = Math.round(WaveGen.RATE_CLOCK / hz)
        return Math.max(WaveGen.RATE_CODE_MIN, Math.min(WaveGen.RATE_CODE_MAX, code))
    }

    /***
     * Every rate the EPS can hold, fastest first.
     */
    static allRateCodes(){
        const codes = []
        for(let code=WaveGen.RATE_CODE_MIN; code<=WaveGen.RATE_CODE_MAX; code++) codes.push(code)
        return codes
    }

    /***
     * Menu text for a rate code. The two codes that matter for imported files
     * say so, because 48.1 and 44.6 kHz do not look like the 48 and 44.1 kHz
     * the file claims to be.
     */
    static rateLabel(code){
        const hz = WaveGen.rateFromCode(code)
        // Enough decimals to keep every entry distinct: the codes crowd together
        // at the slow end, where 1 decimal would print four pairs of twins.
        let label = hz >= 100000 ? `${(hz/1000).toFixed(0)} kHz`
            : hz >= 10000 ? `${(hz/1000).toFixed(1)} kHz`
            : `${(hz/1000).toFixed(2)} kHz`
        if(code == 13) label += " (48k files)"
        if(code == 14) label += " (44.1k files)"
        return label
    }

    static SAMPLE_RATES = WaveGen.COMMON_RATE_CODES.map(code => WaveGen.rateFromCode(code))
    static DEFAULT_SAMPLE_RATE = WaveGen.rateFromCode(14)

    /***
     * Largest waveform the generator will produce. Hand editing is not capped.
     *
     * 65536 samples is ~1.47s at 44.6kHz. It is this large because detuned
     * layers only loop seamlessly when every voice completes a whole number of
     * cycles in the buffer, so fine detune needs a long buffer: resolution is
     * roughly 1731/periods cents. Long uploads are the cost.
     */
    static MAX_SAMPLES = 65536

    /***
     * Oscillator count for the super saw, matching the JP-8000: a centre voice
     * plus six detuned around it. The offsets are generated from this count and
     * an odd number puts one voice exactly on the fundamental, which is what
     * anchors the pitch. An even count has no centre and leaves the fundamental
     * only implied between the innermost pair.
     */
    static SUPER_SAW_VOICES = 7

    /***
     * Where the super saw controls land when it is picked.
     *
     * Chosen by ear rather than derived: a wide spread with the voices smeared
     * by random phases and a slow shallow drift, the tracking high pass keeping
     * the beats between them out of the bottom end, and band limiting off
     * because the hard edges are a good part of what makes a super saw sound
     * like one.
     */
    static SUPER_SAW_DEFAULTS = {
        detuneCents: 32,
        amplitude: 99,
        randomPhase: true,
        drift: true,
        driftCents: 6,
        trackingHighPass: true,
        bandLimited: false
    }

    static NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    static DEFAULT_NOTE = 48 // C3

    static TYPES = [
        { value: 'sine', label: 'Sine' },
        { value: 'triangle', label: 'Triangle' },
        { value: 'sawDown', label: 'Saw (down)' },
        { value: 'sawUp', label: 'Saw (up)' },
        { value: 'square', label: 'Square' },
        { value: 'pulse', label: 'Pulse (PWM)' },
        { value: 'superSaw', label: 'Super Saw' }
    ]

    /*** Types that reuse the pulse width slider for something else */
    static usesDetune(type) {
        return type === 'superSaw'
    }

    /***
     * Periods needed for the requested detune to come out roughly right.
     *
     * Snapping voices to whole cycles quantises detune to a step of about
     * 1731/periods cents, so a buffer just long enough for a non-zero detune
     * badly overshoots what was asked for. Aim instead for a step no larger
     * than a quarter of the request.
     *
     * `smearCents` widens that. Random start phases and drift both move the
     * voices around by more than the quantisation error does, so once either is
     * on, placing every voice exactly on its nominal detune stops being worth
     * the samples it costs. Half the request is as coarse as this will ever go:
     * beyond that neighbouring voices round onto the same cycle count and the
     * super saw collapses back into a single saw.
     */
    static periodsForDetune(cents, smearCents = 0) {
        if (cents <= 0) return 1
        const step = Math.min(Math.max(cents / 4, smearCents), cents / 2)
        return Math.ceil(1731 / step)
    }

    /***
     * Pitch distance between two sample rates. Playing material recorded at one
     * rate back at another shifts it by exactly this much.
     */
    static centsBetween(fromRate, toRate) {
        if (fromRate <= 0 || toRate <= 0) return 0
        return 1200 * Math.log2(toRate / fromRate)
    }

    /***
     * Closest EPS rate to an arbitrary one, measured in pitch rather than in Hz
     * so the choice matches what will be heard.
     */
    static nearestSampleRate(rate) {
        // The whole code range, not just the sampling rates: an imported file is
        // an edit to an existing wavesample, which is exactly where the EPS
        // opens up every rate. It is the difference between landing a 16 kHz
        // file 3 cents out and landing it a whole tone flat.
        let best = WaveGen.DEFAULT_SAMPLE_RATE
        let bestDistance = Infinity
        for (const code of WaveGen.allRateCodes()) {
            const candidate = WaveGen.rateFromCode(code)
            const distance = Math.abs(WaveGen.centsBetween(rate, candidate))
            if (distance < bestDistance) {
                bestDistance = distance
                best = candidate
            }
        }
        return best
    }

    static noteToFrequency(midiNote) {
        return 440 * Math.pow(2, (midiNote - 69) / 12)
    }

    static noteToName(midiNote) {
        const name = WaveGen.NOTE_NAMES[midiNote % 12]
        const octave = Math.floor(midiNote / 12) - 1
        return `${name}${octave}`
    }

    static clamp(value, min, max) {
        return Math.min(max, Math.max(min, value))
    }

    /***
     * Generate a periodic waveform.
     *
     * The buffer is built so it holds a whole number of periods across its full
     * length, because uploadWavToEPS() loops the entire wavesample. The phase is
     * derived from (i / totalSamples) * periods rather than from a per sample
     * increment, so the loop point is seamless even when the ideal period length
     * is not a whole number of samples.
     *
     * opts:
     *   type        one of TYPES
     *   frequency   fundamental in Hz
     *   sampleRate  playback rate the EPS is set to
     *   periods     how many cycles to fit in the buffer
     *   pulseWidth  0..1, pulse type only
     *   amplitude   0..1 peak level
     *   phase       0..1 starting phase offset
     *   bandLimited true for additive synthesis, false for naive hard edges
     *   randomPhase super saw only: scatter the detuned voices' start phases
     *   driftCents  super saw only: how far the detuned voices wander, 0 for none
     *   trackingHighPass super saw only: 24 dB/oct below the fundamental
     */
    static generate(opts) {
        const sampleRate = opts.sampleRate || WaveGen.DEFAULT_SAMPLE_RATE
        const frequency = opts.frequency
        const pulseWidth = WaveGen.clamp(opts.pulseWidth === undefined ? 0.5 : opts.pulseWidth, 0.01, 0.99)
        const amplitude = WaveGen.clamp(opts.amplitude === undefined ? 0.99 : opts.amplitude, 0, 1)
        const phase = opts.phase || 0
        const bandLimited = opts.bandLimited !== false

        const idealPeriod = sampleRate / frequency
        let periods = Math.max(1, Math.round(opts.periods || 1))
        let totalSamples = Math.round(periods * idealPeriod)
        let clamped = false

        if (totalSamples > WaveGen.MAX_SAMPLES) {
            clamped = true
            // Drop periods until we fit. A single period longer than the cap
            // gets truncated instead, which detunes it, but that only happens
            // for very low notes at high sample rates.
            periods = Math.max(1, Math.floor(WaveGen.MAX_SAMPLES / idealPeriod))
            totalSamples = Math.min(WaveGen.MAX_SAMPLES, Math.round(periods * idealPeriod))
        }
        totalSamples = Math.max(2, totalSamples)

        // The rounding above shifts the pitch slightly, so report what the
        // buffer actually plays back as rather than what was asked for.
        const actualFrequency = (periods * sampleRate) / totalSamples

        // Harmonics that survive below Nyquist at this rate. Low notes at high
        // rates can ask for hundreds, so cap it to keep generation snappy.
        const maxHarmonic = Math.min(1024, Math.max(1, Math.floor((sampleRate / 2) / actualFrequency)))

        let raw
        let detune = null
        let harmonics = bandLimited ? maxHarmonic : 0
        let highPassHz = 0

        if (opts.type === 'superSaw') {
            const layered = WaveGen.renderSuperSaw({
                totalSamples: totalSamples,
                periods: periods,
                sampleRate: sampleRate,
                detuneCents: opts.detuneCents === undefined ? 25 : opts.detuneCents,
                bandLimited: bandLimited,
                phase: phase,
                randomPhase: opts.randomPhase === true,
                driftCents: opts.driftCents || 0
            })
            raw = layered.raw
            detune = layered.detune
            harmonics = layered.harmonics
            // Tracks the pitch the buffer really plays at, not the note that
            // was asked for, so it stays on the fundamental after rounding.
            if (opts.trackingHighPass) {
                highPassHz = actualFrequency
                raw = WaveGen.trackingHighPass(raw, sampleRate, highPassHz)
            }
        } else {
            raw = new Array(totalSamples)
            for (let i = 0; i < totalSamples; i++) {
                const t = ((i / totalSamples) * periods + phase) % 1
                raw[i] = bandLimited
                    ? WaveGen.sampleBandLimited(opts.type, t, maxHarmonic, pulseWidth)
                    : WaveGen.sampleNaive(opts.type, t, pulseWidth)
            }
        }

        return {
            data: WaveGen.normalize(raw, amplitude),
            totalSamples: totalSamples,
            periods: periods,
            periodSamples: totalSamples / periods,
            actualFrequency: actualFrequency,
            harmonics: harmonics,
            detune: detune,
            highPassHz: highPassHz,
            clamped: clamped
        }
    }

    /***
     * Six detuned saws, JP-8000 style.
     *
     * Each voice is snapped to a whole number of cycles across the buffer. That
     * is what keeps the loop seamless, and it is also why the detune you get is
     * coarser than the detune you ask for on a short buffer: the achieved
     * amount is reported back so the caller can say so.
     */
    static renderSuperSaw(params) {
        const totalSamples = params.totalSamples
        const periods = params.periods
        const voices = WaveGen.SUPER_SAW_VOICES
        const detuneCents = Math.max(0, params.detuneCents)

        // Offsets spread evenly over -1..+1, so the outer voices sit at the
        // full requested detune and the rest fall between.
        const offsets = []
        const cycleCounts = []
        const achieved = []
        for (let v = 0; v < voices; v++) {
            const offset = voices === 1 ? 0 : (2 * v) / (voices - 1) - 1
            const ratio = Math.pow(2, (offset * detuneCents) / 1200)
            const cycles = Math.max(1, Math.round(periods * ratio))
            offsets.push(offset)
            cycleCounts.push(cycles)
            achieved.push(1200 * Math.log2(cycles / periods))
        }

        // One shared band-limited saw table read at different rates, rather than
        // summing harmonics per voice per sample. The voices are within a few
        // cents of each other, so sizing the table for the highest one keeps
        // every voice below Nyquist.
        let table = null
        let harmonics = 0
        if (params.bandLimited) {
            const topCycles = Math.max.apply(null, cycleCounts)
            const topFrequency = (topCycles * params.sampleRate) / totalSamples
            harmonics = Math.min(1024, Math.max(1, Math.floor((params.sampleRate / 2) / topFrequency)))
            table = WaveGen.buildSawTable(harmonics)
        }

        // Drift maps are shared: the six detuned voices only ever wander in one
        // of two directions, so at most two get built however many voices there
        // are. The centre voice never drifts, so it is not asked for one.
        const driftCents = Math.max(0, params.driftCents || 0)
        const driftMaps = {}
        const driftMapFor = (direction) => {
            if (!driftMaps[direction]) {
                driftMaps[direction] = WaveGen.buildDriftMap(totalSamples, driftCents, direction)
            }
            return driftMaps[direction]
        }

        const raw = new Array(totalSamples).fill(0)
        let randomised = 0
        let drifting = 0
        for (let v = 0; v < voices; v++) {
            const cycles = cycleCounts[v]
            // The one voice sitting on the fundamental anchors the pitch, and it
            // is left exactly as it was: no scattered phase, no drift.
            const centre = offsets[v] === 0
            // Stagger the starting phases. Every voice is cycle aligned to the
            // buffer, so without this they would all launch together and put a
            // large spike at sample zero that normalisation then pays for.
            // Scattering them at random does the same job less evenly, and gives
            // each generation its own character rather than the fixed comb the
            // regular stagger always produces.
            let voicePhase = params.phase + v / voices
            if (params.randomPhase && !centre) {
                voicePhase = Math.random()
                randomised++
            }
            // Where the voice is in its cycles at each sample: a straight ramp
            // normally, a drifting one when asked. Voices above the fundamental
            // drift down, voices below it drift up.
            let map = null
            if (driftCents > 0 && !centre) {
                map = driftMapFor(offsets[v] > 0 ? -1 : 1)
                drifting++
            }
            for (let i = 0; i < totalSamples; i++) {
                const position = map ? map[i] : i / totalSamples
                const t = (position * cycles + voicePhase) % 1
                raw[i] += table ? WaveGen.readTable(table, t) : 2 * t - 1
            }
        }

        let spread = 0
        for (const cents of achieved) spread = Math.max(spread, Math.abs(cents))

        // Voices that round to the same cycle count end up at the same pitch,
        // just phase shifted. They still thicken the tone but they stop beating
        // against each other, and any that land on the centre count weight the
        // fundamental more heavily, so the caller is told how many pitches the
        // buffer actually resolved.
        const distinctVoices = new Set(cycleCounts).size

        return {
            raw: raw,
            harmonics: harmonics,
            detune: {
                requestedCents: detuneCents,
                achievedCents: spread,
                voiceCents: achieved,
                cycleCounts: cycleCounts,
                distinctVoices: distinctVoices,
                randomPhaseVoices: randomised,
                driftCents: drifting ? driftCents : 0,
                driftVoices: drifting,
                requiredPeriods: WaveGen.periodsForDetune(detuneCents,
                    WaveGen.smearCents(detuneCents, params.randomPhase, driftCents))
            }
        }
    }

    /***
     * How far the voices are being moved about by things other than their
     * nominal detune. Feeds periodsForDetune, which spends fewer samples once
     * the smearing is wider than the error it is trying to avoid.
     */
    static smearCents(detuneCents, randomPhase, driftCents) {
        let smear = randomPhase ? detuneCents / 2 : 0
        if (driftCents > 0) smear = Math.max(smear, driftCents)
        return smear
    }

    /***
     * A drift shape: how far through its cycles a voice is at each sample,
     * as a fraction of the whole buffer.
     *
     * The voice's pitch swings `cents` either side of nominal over a single LFO
     * cycle spanning the entire buffer, which is as slow as the material allows
     * and is what "takes the whole period to complete" means. Integrating pitch
     * gives phase, and the integral is then scaled to end on exactly 1.
     *
     * That last step is what keeps the loop seamless. Whatever the drift does in
     * between, the voice still completes its whole number of cycles across the
     * buffer, so the wrap point lands on the same phase it started at; and the
     * LFO is at zero on both ends, so the pitch matches across the join as well
     * as the phase does. Nothing here needs the loop criteria loosened.
     */
    static buildDriftMap(totalSamples, cents, direction) {
        const map = new Float64Array(totalSamples + 1)
        const scale = (direction * cents) / 1200
        let sum = 0
        for (let i = 0; i < totalSamples; i++) {
            // Midpoint of the sample's span, so this is the integral of the
            // pitch rather than a left hand approximation of it.
            const u = (i + 0.5) / totalSamples
            sum += Math.pow(2, scale * Math.sin(2 * Math.PI * u))
            map[i + 1] = sum
        }
        for (let i = 1; i <= totalSamples; i++) map[i] /= sum
        return map
    }

    /***
     * Butterworth Q values for a four pole cascade. Two biquads at 12 dB an
     * octave each is where the JP-8000's 24 dB an octave comes from.
     */
    static HPF_STAGE_Q = [0.54119610, 1.30656296]

    /***
     * Cycles of the cutoff to run the filter for before keeping its output.
     * Four poles settle in a handful; this is generous rather than marginal,
     * and it costs at most one extra pass over the buffer.
     */
    static HPF_SETTLE_CYCLES = 16

    /***
     * A tracking high pass, JP-8000 style: 24 dB an octave below the
     * fundamental the buffer was generated at.
     *
     * Seven detuned saws stack a lot of weight underneath the fundamental —
     * every pair of voices beats, and the beats are all slower than the note.
     * That is the low frequency thickening the JP-8000 answers with a high pass
     * that follows the pitch, and this is the same filter.
     *
     * Filtering a loop is the awkward part. Run an IIR once from silence and it
     * starts with a transient and finishes holding a state it did not begin
     * with, so the join clicks. The signal is periodic, so instead the filter is
     * run round and round the buffer until its state settles, and only then is
     * the output kept. What comes back is the steady state periodic response,
     * which repeats exactly and therefore joins exactly.
     */
    static trackingHighPass(values, sampleRate, cutoffHz) {
        const total = values.length
        // Nothing below DC to remove, and nothing above Nyquist to keep.
        if (!(cutoffHz > 0) || cutoffHz >= sampleRate / 2 || total < 1) {
            return values.slice()
        }
        const stages = WaveGen.HPF_STAGE_Q.map(
            q => WaveGen.highPassBiquad(sampleRate, cutoffHz, q))
        const state = stages.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }))
        const step = (i) => {
            let v = values[i]
            for (let s = 0; s < stages.length; s++) {
                v = WaveGen.stepBiquad(stages[s], state[s], v)
            }
            return v
        }

        // Whole laps only. Stopping part way round would leave the state
        // holding the middle of the buffer when the kept pass starts at the
        // beginning of it, which is the very seam this is avoiding.
        const settle = Math.ceil((WaveGen.HPF_SETTLE_CYCLES * sampleRate) / cutoffHz)
        const laps = Math.max(1, Math.ceil(settle / total))
        for (let lap = 0; lap < laps; lap++) {
            for (let i = 0; i < total; i++) step(i)
        }

        const output = new Array(total)
        for (let i = 0; i < total; i++) output[i] = step(i)
        return output
    }

    /***
     * One high pass biquad, bilinear transformed, normalised so a0 is 1.
     * Straight out of the RBJ cookbook.
     */
    static highPassBiquad(sampleRate, cutoffHz, q) {
        const w0 = (2 * Math.PI * cutoffHz) / sampleRate
        const cos0 = Math.cos(w0)
        const alpha = Math.sin(w0) / (2 * q)
        const a0 = 1 + alpha
        const shared = (1 + cos0) / 2
        return {
            b0: shared / a0,
            b1: (-(1 + cos0)) / a0,
            b2: shared / a0,
            a1: (-2 * cos0) / a0,
            a2: (1 - alpha) / a0
        }
    }

    static stepBiquad(coefficients, state, x) {
        const y = coefficients.b0 * x + coefficients.b1 * state.x1 + coefficients.b2 * state.x2
            - coefficients.a1 * state.y1 - coefficients.a2 * state.y2
        state.x2 = state.x1
        state.x1 = x
        state.y2 = state.y1
        state.y1 = y
        return y
    }

    /***
     * Band-limited saw as a lookup table, oversampled well past its top
     * harmonic so linear interpolation between points stays inaudible.
     */
    static buildSawTable(harmonics) {
        const size = Math.min(16384, Math.max(1024,
            Math.pow(2, Math.ceil(Math.log2(harmonics * 8)))))
        // One guard point at the end so interpolation never wraps the index.
        const table = new Float64Array(size + 1)
        for (let i = 0; i < size; i++) {
            const w = (2 * Math.PI * i) / size
            let sum = 0
            for (let k = 1; k <= harmonics; k++) {
                sum += Math.sin(w * k) / k
            }
            table[i] = sum
        }
        table[size] = table[0]
        return table
    }

    static readTable(table, t) {
        const size = table.length - 1
        const position = t * size
        const index = Math.floor(position)
        const fraction = position - index
        return table[index] + (table[index + 1] - table[index]) * fraction
    }

    /***
     * Additive synthesis. Nothing above Nyquist is ever written, so the result
     * stays clean when the EPS transposes it upwards.
     */
    static sampleBandLimited(type, t, maxHarmonic, pulseWidth) {
        const w = 2 * Math.PI * t
        let sum = 0
        switch (type) {
            case 'sine':
                return Math.sin(w)
            case 'sawUp':
            case 'sawDown':
                for (let k = 1; k <= maxHarmonic; k++) {
                    sum += Math.sin(w * k) / k
                }
                return type === 'sawUp' ? sum : -sum
            case 'square':
                for (let k = 1; k <= maxHarmonic; k += 2) {
                    sum += Math.sin(w * k) / k
                }
                return sum
            case 'triangle':
                for (let k = 1; k <= maxHarmonic; k += 2) {
                    sum += (Math.pow(-1, (k - 1) / 2) * Math.sin(w * k)) / (k * k)
                }
                return sum
            case 'pulse':
                for (let k = 1; k <= maxHarmonic; k++) {
                    sum += ((2 / (k * Math.PI)) * Math.sin(Math.PI * k * pulseWidth)) * Math.cos(w * k)
                }
                return sum
            default:
                return 0
        }
    }

    /***
     * Naive shapes with hard corners. Aliases when transposed up, but some
     * people want exactly that buzz.
     */
    static sampleNaive(type, t, pulseWidth) {
        switch (type) {
            case 'sine': return Math.sin(2 * Math.PI * t)
            case 'triangle': return 1 - 4 * Math.abs(t - 0.5)
            case 'sawUp': return 2 * t - 1
            case 'sawDown': return 1 - 2 * t
            case 'square': return t < 0.5 ? 1 : -1
            case 'pulse': return t < pulseWidth ? 1 : -1
            default: return 0
        }
    }

    /***
     * Scale to a peak level and convert to signed 16 bit ints.
     */
    static normalize(values, amplitude) {
        let peak = 0
        for (const value of values) {
            const magnitude = Math.abs(value)
            if (magnitude > peak) peak = magnitude
        }
        const scale = peak > 0 ? (amplitude * 32767) / peak : 0
        return values.map(value => WaveGen.clamp(Math.round(value * scale), -32767, 32767))
    }
}
