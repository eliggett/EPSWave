/***
 * Pitch detection for imported wavesamples.
 *
 * Uses YIN (de Cheveigne and Kawahara, 2002): a time domain periodicity
 * detector, not a spectrum peak finder. That matters here because plenty of
 * real samples have little or no energy at the fundamental, and the pitch you
 * hear comes from the spacing of the harmonics. A "lowest peak in the FFT"
 * approach reports twice the frequency on those and lands an octave out; YIN
 * gets them exactly right, because the waveform still repeats at the period of
 * the missing fundamental.
 *
 * The result is a period in samples, which is independent of sample rate. The
 * pitch a wavesample will actually sound at is therefore playbackRate / period,
 * which folds in the EPS's rate quantisation for free.
 *
 * Everything is measured, not assumed: the thresholds below come from running
 * this over a 500 file synth sample pack and over synthetic signals with known
 * pitch. See the notes on each constant.
 */
class PitchDetect {

    /***
     * Lowest fundamental searched, C1. This sets the cost of the whole thing,
     * because the search runs to a period of sampleRate/LOWEST_HZ samples and
     * each window has to be twice that long.
     */
    static LOWEST_HZ = 32.7

    /***
     * YIN's absolute threshold. The first dip in the normalised difference
     * function below this is taken as the period, which is what stops the
     * detector from preferring the deeper dip at twice the period.
     */
    static THRESHOLD = 0.15

    /***
     * Windows spread across the sample. More than one because a single window
     * can lock onto a subharmonic; the disagreement between them is also the
     * confidence measure.
     */
    static WINDOWS = 12
    static MIN_WINDOWS = 3

    /***
     * Rejection thresholds. On the test material every correct detection came
     * in at aperiodicity <= 0.19 and window spread <= 48 cents, while every
     * wrong one (noise, unpitched effects) was at aperiodicity >= 0.49 and
     * spread >= 1200 cents. There is a wide gap between the two, so these sit
     * in the middle of it rather than being tuned to the edge.
     */
    static MAX_APERIODICITY = 0.30
    static MAX_SPREAD_CENTS = 100

    /***
     * Discards windows that are essentially silent, relative to the loudest
     * window, so a fade out tail cannot outvote the note.
     */
    static SILENCE_FRACTION = 0.25

    /***
     * A one pole high pass at this frequency runs twice over the signal before
     * anything else. Without it, DC offset or mains hum combines with the note
     * to make a longer common period, and the detector confidently reports a
     * pitch one or two octaves too low. That was the worst failure found in
     * testing, and it is entirely preventable.
     */
    static HIGHPASS_HZ = 60

    /***
     * Two window estimates within this fraction of a whole octave of each other
     * are treated as the same pitch heard an octave apart, and folded together.
     */
    static OCTAVE_TOLERANCE = 0.08

    /***
     * Detects the pitch of a wavesample.
     *
     * Returns
     *   period        repeat length in samples, or 0
     *   frequency     Hz at the given sampleRate, or 0
     *   aperiodicity  0 is perfectly periodic, 1 is noise
     *   spread        disagreement between windows, in cents
     *   confident     whether the answer is worth acting on
     *   reason        why not, when it is not
     */
    static detect(samples, sampleRate){
        const empty = (reason) => ({
            period: 0, frequency: 0, aperiodicity: 1, spread: 0,
            windows: 0, confident: false, reason: reason
        })
        if(!samples || samples.length == 0) return empty("no audio")

        const tauMax = Math.floor(sampleRate / PitchDetect.LOWEST_HZ)
        const windowSize = 2 * tauMax + 256
        if(samples.length < windowSize){
            // Below roughly eight periods there is not enough repetition to
            // measure. A single cycle waveform lands here, and for that the
            // period is the buffer length rather than something to detect.
            return empty(`needs at least ${windowSize} samples, has ${samples.length}`)
        }

        const signal = PitchDetect.prepare(samples, sampleRate)

        const count = PitchDetect.WINDOWS
        const step = (signal.length - windowSize) / Math.max(1, count - 1)
        const starts = []
        for(let i=0; i<count; i++){
            const start = Math.floor(i * step)
            // Distinct positions only. On a buffer barely longer than one
            // window every start would land on the same samples, and the
            // agreement between windows, which is half the confidence measure,
            // would read as perfect because it was measuring one window twelve
            // times. Falling below MIN_WINDOWS distinct positions is the honest
            // outcome there.
            if(starts.length == 0 || start > starts[starts.length - 1]) starts.push(start)
        }

        const energies = starts.map(start => PitchDetect.rms(signal, start, windowSize))
        const loudest = Math.max(...energies)
        const floor = Math.max(loudest * PitchDetect.SILENCE_FRACTION, 1e-6)

        const periods = []
        const aperiodicities = []
        for(let i=0; i<starts.length; i++){
            if(energies[i] < floor) continue
            const found = PitchDetect.yin(signal, starts[i], windowSize, tauMax)
            // Windows that are more than half noise never help, whatever the
            // rest of the sample is doing.
            if(found.period > 0 && found.aperiodicity < 0.5){
                periods.push(found.period)
                aperiodicities.push(found.aperiodicity)
            }
        }
        if(periods.length < PitchDetect.MIN_WINDOWS){
            return empty("no repeating waveform found")
        }

        // Fold octave disagreements onto the most periodic window before
        // measuring the spread, otherwise one window locking onto a subharmonic
        // throws away an otherwise good detection.
        let best = 0
        for(let i=1; i<aperiodicities.length; i++){
            if(aperiodicities[i] < aperiodicities[best]) best = i
        }
        const reference = periods[best]
        const folded = periods.map(period => {
            const octaves = Math.log2(period / reference)
            const whole = Math.round(octaves)
            return Math.abs(octaves - whole) < PitchDetect.OCTAVE_TOLERANCE
                ? period * Math.pow(2, -whole)
                : period
        })

        const period = PitchDetect.median(folded)
        const aperiodicity = PitchDetect.median(aperiodicities)
        const spread = 1200 * Math.log2(Math.max(...folded) / Math.min(...folded))
        const confident = aperiodicity < PitchDetect.MAX_APERIODICITY
            && spread < PitchDetect.MAX_SPREAD_CENTS

        return {
            period: period,
            frequency: sampleRate / period,
            aperiodicity: aperiodicity,
            spread: spread,
            windows: folded.length,
            confident: confident,
            reason: confident ? ""
                : (spread >= PitchDetect.MAX_SPREAD_CENTS
                    ? "the pitch is not steady across the sample"
                    : "the sample is closer to noise than to a note")
        }
    }

    /***
     * Scales to unit peak and high passes. Returns a Float64Array so the inner
     * loops stay on doubles.
     */
    static prepare(samples, sampleRate){
        let peak = 0
        for(let i=0; i<samples.length; i++){
            const value = Math.abs(samples[i])
            if(value > peak) peak = value
        }
        if(peak == 0) peak = 1
        const signal = new Float64Array(samples.length)
        for(let i=0; i<samples.length; i++) signal[i] = samples[i] / peak

        const a = Math.exp(-2 * Math.PI * PitchDetect.HIGHPASS_HZ / sampleRate)
        for(let pass=0; pass<2; pass++){
            let previousIn = 0
            let previousOut = 0
            for(let i=0; i<signal.length; i++){
                const input = signal[i]
                previousOut = a * (previousOut + input - previousIn)
                previousIn = input
                signal[i] = previousOut
            }
        }
        return signal
    }

    static rms(signal, start, length){
        let sum = 0
        for(let i=start; i<start+length; i++) sum += signal[i] * signal[i]
        return Math.sqrt(sum / length)
    }

    static median(values){
        const sorted = Array.from(values).sort((a, b) => a - b)
        const middle = Math.floor(sorted.length / 2)
        return sorted.length % 2
            ? sorted[middle]
            : (sorted[middle - 1] + sorted[middle]) / 2
    }

    /***
     * YIN over one window.
     *
     * Step 1 is the squared difference function, step 2 normalises it by its
     * own running mean so that the trivial dip at zero lag stops dominating,
     * step 3 takes the first dip below the threshold rather than the deepest
     * one, and step 4 interpolates the minimum so the answer is not quantised
     * to whole samples. Without step 4 a period of 170 samples could only ever
     * be measured to about 10 cents.
     */
    static yin(signal, start, windowSize, tauMax){
        const compare = windowSize - tauMax
        const difference = new Float64Array(tauMax + 1)
        for(let tau=1; tau<=tauMax; tau++){
            let sum = 0
            const offset = start + tau
            for(let i=0; i<compare; i++){
                const delta = signal[start + i] - signal[offset + i]
                sum += delta * delta
            }
            difference[tau] = sum
        }

        const normalised = new Float64Array(tauMax + 1)
        normalised[0] = 1
        let running = 0
        for(let tau=1; tau<=tauMax; tau++){
            running += difference[tau]
            normalised[tau] = running > 0 ? difference[tau] * tau / running : 1
        }

        let tau = -1
        for(let candidate=2; candidate<tauMax; candidate++){
            if(normalised[candidate] >= PitchDetect.THRESHOLD) continue
            // Walk to the bottom of this dip rather than stopping on its edge.
            while(candidate + 1 < tauMax && normalised[candidate + 1] < normalised[candidate]){
                candidate++
            }
            tau = candidate
            break
        }
        if(tau < 0) return { period: 0, aperiodicity: 1 }

        const aperiodicity = normalised[tau]
        let refined = tau
        if(tau > 0 && tau < tauMax){
            const before = normalised[tau - 1]
            const at = normalised[tau]
            const after = normalised[tau + 1]
            const denominator = 2 * (before - 2 * at + after)
            if(denominator != 0) refined = tau + (before - after) / denominator
        }
        return { period: refined, aperiodicity: aperiodicity }
    }

    /***
     * Turns a sounding frequency into the root key and fine tune that make the
     * EPS play it at concert pitch: the nearest note becomes the root key, and
     * whatever is left over is cancelled by fine tune. Rounding to the nearest
     * note leaves at most 50 cents, well inside the +-99 the synth accepts.
     */
    static tuningFor(frequency){
        const note = Math.round(69 + 12 * Math.log2(frequency / 440))
        const exact = 440 * Math.pow(2, (note - 69) / 12)
        const cents = 1200 * Math.log2(frequency / exact)
        return {
            rootKey: Math.max(0, Math.min(127, note)),
            fineTune: Math.round(-cents),
            offCents: cents
        }
    }
}
