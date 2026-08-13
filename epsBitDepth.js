/***
 * Reducing the resolution of wavesample data, and working out what resolution a
 * synth actually kept.
 *
 * The EPS-16 PLUS stores sixteen bits per sample. The original EPS does not:
 * Appendix B says "the low 3 bits of the 16 bit word are always read as zeros
 * in the Original EPS", so the bottom three bits of anything sent to a Classic
 * are thrown away by the machine whatever we put in them.
 *
 * MEASURED, not just read. Across the four original EPS instrument files in
 * reference/disks/EPS-original, every sample is a multiple of 8 — 100% of them
 * clear at one, two and three bits — while bit 3 varies in about half. The same
 * test on EPS-16 PLUS files gives 50%, 25%, 12.5%, which is what ordinary
 * sixteen bit audio looks like. Thirteen significant bits, exactly.
 *
 * That leaves a choice about *how* they are dropped. Truncation is a shift;
 * rounding is a shift plus a decision at the halfway point; dither trades a
 * little noise for the removal of the correlated distortion that plain
 * quantisation adds to quiet material.
 *
 * THE UPLOAD PATH TRUNCATES. Neither specification covers the conversion,
 * because getting from sixteen bits to thirteen is the sender's business and
 * not part of the instrument format — so this is a decision rather than a
 * finding. Truncating matches what the machine does to whatever we send it,
 * which makes the data we send equal to the data that comes back and turns a
 * round trip into an exact comparison. See EPS16.quantiseForModel, which calls
 * quantise() with ROUND_TRUNCATE and no dither.
 *
 * to13() below keeps the nicer defaults — nearest with TPDF dither — for
 * anyone who would rather have the fidelity than the exact round trip. It is
 * one argument away.
 *
 * `analyse()` is the other half of the probe work: given samples read back from
 * a synth, it reports which bit positions ever carry a one, so the effective
 * word length can be read off a real capture rather than assumed.
 */
class EPSBitDepth {

    /*** Sixteen bit signed, the range every EPS sample lives in. */
    static MAX = 32767
    static MIN = -32768
    static WORD_BITS = 16

    /***
     * Rounding behaviour. `nearest` is what a sane resampler does; `truncate`
     * is what a machine that simply ignores the low bits does, and is here so a
     * capture can be reproduced exactly once the probe says that is what the
     * Classic is doing.
     */
    static ROUND_NEAREST = "nearest"
    static ROUND_TRUNCATE = "truncate"

    /***
     * Reduces `samples` to `bits` significant bits, keeping them in the same
     * sixteen bit signed range.
     *
     * The result is not scaled down: 13 bit output still spans -32768..32760,
     * it just only ever lands on multiples of 8. That is the representation the
     * EPS wants — the wire format is sixteen bits either way, and the synth is
     * the thing that ignores the bottom of each word — so scaling into a
     * smaller range here would quieten the sample by 8x for no reason.
     *
     * Options:
     *   round   ROUND_NEAREST (default) or ROUND_TRUNCATE
     *   dither  false (default), or true for TPDF dither at one step peak
     *   seed    PRNG seed, so a dithered result is reproducible. A probe that
     *           cannot be re-run byte for byte is much harder to reason about
     *           than one that can, which is why this is not Math.random.
     */
    static quantise(samples, bits, options = {}){
        const round = options.round || EPSBitDepth.ROUND_NEAREST
        const step = 1 << (EPSBitDepth.WORD_BITS - bits)
        if(step <= 1) return Array.from(samples)

        // The largest multiple of `step` that still fits. Rounding 32767 to the
        // nearest multiple of 8 gives 32768, which is not a sixteen bit signed
        // number at all and wraps to -32768 the moment it is packed — a full
        // scale positive peak coming back as a full scale negative one. MIN is
        // already a multiple of every power of two, so only the top needs care.
        const ceiling = EPSBitDepth.MAX - (EPSBitDepth.MAX % step)
        const random = EPSBitDepth.prng(options.seed || 1)
        const out = new Array(samples.length)

        for(let i = 0; i < samples.length; i++){
            let value = samples[i]
            // Triangular PDF, two independent uniforms, one step peak to peak
            // either side. Added before quantising, not after: the point is to
            // decorrelate the quantiser's error from the signal, which only
            // works if the quantiser sees the noise.
            if(options.dither) value += (random() + random() - 1) * step
            const scaled = round == EPSBitDepth.ROUND_TRUNCATE
                ? Math.floor(value / step)
                : Math.round(value / step)
            out[i] = Math.max(EPSBitDepth.MIN, Math.min(ceiling, scaled * step))
        }
        return out
    }

    /***
     * Thirteen bits, which is what the original EPS keeps.
     *
     * Dithered by default. The alternative is that every sample below about
     * -60 dBFS quantises to a handful of distinct values and quiet passages
     * pick up the buzzing that is the characteristic sound of undithered
     * truncation. One step of TPDF noise is inaudible next to that.
     */
    static to13(samples, options = {}){
        return EPSBitDepth.quantise(samples, 13, { dither: true, ...options })
    }

    /***
     * Eight bits.
     *
     * Nothing needs this yet — no EPS reads eight bit data — so it is the
     * simple version: the same quantiser with a bigger step. If it is ever
     * pointed at a machine that really is eight bit (a Mirage, say) it will
     * want revisiting, because at eight bits plain TPDF dither is audible in
     * its own right and noise shaping starts to be worth the trouble.
     */
    static to8(samples, options = {}){
        return EPSBitDepth.quantise(samples, 8, { dither: true, ...options })
    }

    /***
     * What resolution is actually present in a block of samples.
     *
     * Point this at data read back from a synth. `lowestSetBit` is the answer
     * the Classic question turns on: if no sample anywhere in a large capture
     * has bit 0, 1 or 2 set, the machine is keeping thirteen bits, and that is
     * a measurement rather than a reading of Appendix B.
     *
     * Bit positions are of the sixteen bit two's complement pattern, so
     * negative samples count the same as positive ones. `& 0xFFFF` rather than
     * a sign test because -8 and 8 should both report bit 3 as the lowest set
     * bit, and they do.
     */
    static analyse(samples){
        let setMask = 0
        let clearMask = 0
        let min = EPSBitDepth.MAX
        let max = EPSBitDepth.MIN
        for(const sample of samples){
            const pattern = sample & 0xFFFF
            setMask |= pattern
            clearMask |= (~pattern) & 0xFFFF
            if(sample < min) min = sample
            if(sample > max) max = sample
        }

        const bitsUsed = []
        for(let bit = 0; bit < EPSBitDepth.WORD_BITS; bit++){
            if(setMask & (1 << bit)) bitsUsed.push(bit)
        }
        // -1 for "no sample had any bit set", which means the block is all
        // zeros and says nothing about the machine. Reported honestly rather
        // than folded into "16 bits clean", which is what a naive count would
        // claim about a block of silence.
        const lowestSetBit = bitsUsed.length == 0 ? -1 : bitsUsed[0]

        return {
            samples: samples.length,
            setMask, clearMask, bitsUsed, lowestSetBit,
            min, max,
            // The plain statement of the result, for a log line a human reads.
            effectiveBits: lowestSetBit < 0
                ? null : EPSBitDepth.WORD_BITS - lowestSetBit,
            lowThreeBitsAlwaysZero: (setMask & 0x0007) == 0,
            // Stuck bits are the other failure this catches: a bit that is set
            // in every single sample is far more likely to be a broken decode
            // on our side than anything the synth did.
            stuckHigh: (clearMask ^ 0xFFFF) & 0xFFFF
        }
    }

    /***
     * A test pattern designed to say which bits survive a round trip, rather
     * than merely whether the data came back.
     *
     * A ramp is the obvious pattern and it is nearly useless here: consecutive
     * values differ in the low bits, so a machine that drops three bits returns
     * a ramp that still looks like a ramp and the fault shows up only as a
     * slightly wrong value. What is wanted instead is a pattern where each bit
     * position is exercised *alone*, so the readback answers "did bit 2
     * survive" directly with no arithmetic.
     *
     * Three sections, in this order:
     *   1. one sample per bit position, that bit alone set, positive
     *   2. one sample per bit position, that bit alone clear, all others set
     *   3. a ramp across the full range to fill the remaining length, which is
     *      what catches scaling and endianness faults that a bit pattern misses
     *
     * Section 2 matters because a machine can drop a bit by forcing it low, in
     * which case section 1 shows it missing, or by forcing it high, in which
     * case only section 2 shows anything wrong.
     */
    static bitProbePattern(length){
        const pattern = []
        for(let bit = 0; bit < EPSBitDepth.WORD_BITS - 1; bit++){
            pattern.push(1 << bit)
        }
        for(let bit = 0; bit < EPSBitDepth.WORD_BITS - 1; bit++){
            pattern.push(EPSBitDepth.MAX & ~(1 << bit))
        }
        // Both rails explicitly, because clamping faults live at the ends.
        pattern.push(EPSBitDepth.MAX, EPSBitDepth.MIN, 0, -1, 1)

        const header = pattern.length
        for(let i = header; i < length; i++){
            const position = (i - header) / Math.max(1, length - header)
            pattern.push(Math.round(EPSBitDepth.MIN + position * 65535))
        }
        return pattern.slice(0, Math.max(header, length))
    }

    /***
     * Compares what was sent with what came back, bit by bit.
     *
     * Reports per bit position how often that bit was sent as a one and came
     * back as a zero, and the reverse. A machine that keeps thirteen bits shows
     * bits 0-2 lost on roughly half the samples and bits 3-15 never lost at
     * all, and that shape is unmistakable in a table of sixteen numbers.
     */
    /***
     * How much alteration of a bit still counts as that bit surviving. Used
     * only for the bit table, which is evidence rather than the conclusion —
     * see the note in compareRoundTrip about why.
     */
    static STABLE_BIT_TOLERANCE = 0.01

    /***
     * What a synth did to a block of samples that was sent to it and read back.
     *
     * WHY THIS IS NOT A BIT COMPARISON, which is what it was at first and what
     * it looks like it should be.
     *
     * Comparing the sent and received bit patterns position by position gives
     * the right answer for a machine that discards low bits by masking them
     * off, and a badly wrong one for a machine that rounds. Rounding carries:
     * a value whose low three bits are 111 rounds up into bit 3, which if it
     * was set carries into bit 4, and so on. So bit 3 differs about half the
     * time, bit 4 a quarter, bit 5 an eighth — a geometric tail that is still
     * above any sane tolerance seven bits up. A simulated 13 bit machine that
     * rounds was measured by that method as keeping six bits.
     *
     * The measurement that is actually wanted lives in the values, not the
     * bits. Whatever the machine does internally, what comes back is quantised
     * to some step, and the step is read straight off the returned data: the
     * lowest bit position that is ever set in any received sample. That is
     * correct for masking, rounding and truncation alike, and it needs no
     * tolerance.
     *
     * Which of the three is happening then follows from the size and sign of
     * the error, and matters because it decides what uploads should do:
     *
     *   |error| <= step/2 ................ rounds. Send rounded, dithered data.
     *   |error| up to step-1, error >= 0 .. masks. Every sample is biased down
     *                                      by up to a full step; dither first.
     *   |error| up to step-1, mean ~ 0 .... truncates toward zero. Same remedy.
     */
    static compareRoundTrip(sent, received){
        const shared = Math.min(sent.length, received.length)
        const bits = EPSBitDepth.compareBits(sent, received)
        const after = EPSBitDepth.analyse(received.slice(0, shared))

        // The step the returned data actually lands on. A block that came back
        // all zeros says nothing, so it is reported as unknown rather than as
        // a 16 bit machine, which is what a naive reading of an empty mask is.
        const quantum = after.lowestSetBit < 0 ? null : (1 << after.lowestSetBit)
        let min = Infinity, max = -Infinity, sum = 0, absMax = 0, negatives = 0
        const magnitudes = []
        for(let i = 0; i < shared; i++){
            const error = sent[i] - received[i]
            if(error < min) min = error
            if(error > max) max = error
            if(error < 0) negatives++
            const magnitude = Math.abs(error)
            if(magnitude > absMax) absMax = magnitude
            magnitudes.push(magnitude)
            sum += error
        }
        const mean = shared == 0 ? 0 : sum / shared
        const negativeRate = shared == 0 ? 0 : negatives / shared

        // The 99th percentile rather than the maximum, and the reason is the
        // top rail. A machine that rounds still cannot represent 32767 when its
        // step is 8, so the handful of samples at full scale come back up to a
        // whole step low however carefully it rounds everything else. Judging
        // by the largest error alone, those few samples make a rounding machine
        // indistinguishable from a truncating one — which is what the test
        // against a simulated synth showed before this line existed.
        const sorted = magnitudes.slice().sort((a, b) => a - b)
        const typicalError = sorted.length == 0
            ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]

        let behaviour = "unclear"
        if(quantum == null){
            behaviour = "nothing came back"
        }else if(quantum == 1 && absMax == 0){
            behaviour = "exact"
        }else if(typicalError <= quantum / 2){
            behaviour = "rounds"
        }else if(negativeRate < 0.01){
            // error = sent - received is never negative when the machine floors
            // the value, because flooring can only move a sample down.
            behaviour = "masks"
        }else{
            behaviour = "truncates toward zero"
        }

        return {
            compared: shared,
            sentLength: sent.length,
            receivedLength: received.length,
            identical: bits.identical,
            differing: bits.differing,
            firstDifference: bits.firstDifference,
            // The headline, and the only number here that needs no tolerance.
            quantum,
            effectiveBits: quantum == null
                ? null : EPSBitDepth.WORD_BITS - after.lowestSetBit,
            behaviour,
            error: { min, max, mean, absMax, typicalError, negativeRate },
            // Kept as raw evidence. Read the geometric tail above before
            // drawing anything from it on a machine that rounds.
            bits: bits.bits,
            lowestCleanBit: bits.lowestCleanBit,
            lowestStableBit: bits.lowestStableBit,
            tolerance: EPSBitDepth.STABLE_BIT_TOLERANCE,
            analysis: after
        }
    }

    /***
     * The per bit table. Evidence for compareRoundTrip rather than a conclusion
     * on its own; see the note there.
     */
    static compareBits(sent, received){
        const shared = Math.min(sent.length, received.length)
        const bits = []
        for(let bit = 0; bit < EPSBitDepth.WORD_BITS; bit++){
            bits.push({ bit, sentOne: 0, lost: 0, gained: 0 })
        }
        let identical = 0
        let firstDifference = -1
        for(let i = 0; i < shared; i++){
            const a = sent[i] & 0xFFFF
            const b = received[i] & 0xFFFF
            if(a == b){ identical++; continue }
            if(firstDifference < 0) firstDifference = i
            for(let bit = 0; bit < EPSBitDepth.WORD_BITS; bit++){
                const mask = 1 << bit
                if((a & mask) && !(b & mask)) bits[bit].lost++
                if(!(a & mask) && (b & mask)) bits[bit].gained++
            }
        }
        for(let i = 0; i < shared; i++){
            for(let bit = 0; bit < EPSBitDepth.WORD_BITS; bit++){
                if(sent[i] & (1 << bit)) bits[bit].sentOne++
            }
        }
        for(const record of bits){
            record.altered = record.lost + record.gained
            record.alteredRate = shared == 0 ? 0 : record.altered / shared
        }
        // The lowest bit that survived perfectly, and the lowest that survived
        // well enough to call it kept. They agree on a machine that masks the
        // low bits away and differ on one that rounds, and which of those is
        // happening is itself worth knowing, so both are reported.
        const lowestCleanBit = bits.findIndex(b => b.altered == 0)
        const lowestStableBit = bits.findIndex(b =>
            b.alteredRate <= EPSBitDepth.STABLE_BIT_TOLERANCE)

        return {
            compared: shared,
            sentLength: sent.length,
            receivedLength: received.length,
            identical,
            differing: shared - identical,
            firstDifference,
            bits,
            lowestCleanBit,
            lowestStableBit,
            tolerance: EPSBitDepth.STABLE_BIT_TOLERANCE,
            // Masking loses bits and never gains any; rounding does both.
            gainsBits: bits.some(b => b.gained > 0)
        }
    }

    /***
     * mulberry32. Small, fast, and good enough for dither, and above all
     * deterministic from a seed so a probe run can be repeated exactly.
     */
    static prng(seed){
        let state = seed >>> 0
        return function(){
            state = (state + 0x6D2B79F5) >>> 0
            let t = state
            t = Math.imul(t ^ (t >>> 15), t | 1)
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
    }
}

// Node runs the tests; the browser gets the class from the script tag.
if(typeof module != 'undefined' && module.exports) module.exports = EPSBitDepth
