/***
 * Frequency domain view of a wavesample.
 *
 * The wavesample is played as a loop — WavePreview sets loopStart 0 and loopEnd
 * to the buffer length, and uploadWavToEPS sets the synth's loop the same way —
 * so the signal really is periodic with period exactly N, the buffer length.
 * That single fact settles most of the design:
 *
 *   - The DFT of the whole buffer is the exact Fourier series of the looped
 *     signal. Bin k is harmonic k. There is no leakage, because the analysis
 *     frame is a whole number of periods by construction.
 *   - So there is no window, and applying one would be a mistake rather than a
 *     refinement: a Hann window would smear each exact harmonic line across
 *     three or four bins and destroy the thing this view exists to show.
 *   - And no zero padding to reach a convenient length, ever. Padding computes
 *     the spectrum of a one shot burst rather than a loop, and sprays sinc
 *     skirts across the whole display.
 *
 * The resolution is therefore the fundamental itself: df = rate/N, and for a
 * generated wave that is f0/periods. A one cycle wave gives a few dozen exact
 * lines with genuinely nothing between them — not "below the resolution", but
 * zero energy. A multi cycle wave with drift or random phase does put energy
 * between the note's harmonics, and that is real and worth seeing.
 */

/***
 * Complex FFT, no dependencies.
 *
 * Buffer lengths here are set by the note and the sample rate, so they are
 * essentially never powers of two: a one cycle C3 at 44.6kHz is 341 samples, a
 * one cycle C2 is 683. Radix-2 alone would not cover the common case, and
 * rounding the length to suit would change the answer, so arbitrary lengths go
 * through Bluestein's algorithm, which is exact and still O(n log n).
 *
 * After Nayuki's public domain reference implementation.
 */
class FFT {

    /*** In place forward transform, exp(-i*2*pi*k*n/N). Any length. */
    static transform(real, imag) {
        const n = real.length
        if (n <= 1) return
        if ((n & (n - 1)) === 0) FFT.transformRadix2(real, imag)
        else FFT.transformBluestein(real, imag)
    }

    /*** Unscaled inverse: the forward transform with the parts swapped. */
    static inverseTransform(real, imag) {
        FFT.transform(imag, real)
    }

    static reverseBits(x, bits) {
        let y = 0
        for (let i = 0; i < bits; i++) {
            y = (y << 1) | (x & 1)
            x >>>= 1
        }
        return y >>> 0
    }

    static transformRadix2(real, imag) {
        const n = real.length
        if (n === 1) return
        let levels = -1
        for (let i = 0; i < 32; i++) if ((1 << i) === n) levels = i
        if (levels < 0) throw new RangeError('length is not a power of 2')

        const cosTable = new Float64Array(n / 2)
        const sinTable = new Float64Array(n / 2)
        for (let i = 0; i < n / 2; i++) {
            cosTable[i] = Math.cos((2 * Math.PI * i) / n)
            sinTable[i] = Math.sin((2 * Math.PI * i) / n)
        }

        for (let i = 0; i < n; i++) {
            const j = FFT.reverseBits(i, levels)
            if (j > i) {
                let temp = real[i]; real[i] = real[j]; real[j] = temp
                temp = imag[i]; imag[i] = imag[j]; imag[j] = temp
            }
        }

        for (let size = 2; size <= n; size *= 2) {
            const halfsize = size / 2
            const tablestep = n / size
            for (let i = 0; i < n; i += size) {
                for (let j = i, k = 0; j < i + halfsize; j++, k += tablestep) {
                    const l = j + halfsize
                    const tpre = real[l] * cosTable[k] + imag[l] * sinTable[k]
                    const tpim = -real[l] * sinTable[k] + imag[l] * cosTable[k]
                    real[l] = real[j] - tpre
                    imag[l] = imag[j] - tpim
                    real[j] += tpre
                    imag[j] += tpim
                }
            }
        }
    }

    /***
     * Arbitrary length, by rewriting the transform as a convolution with a
     * chirp and doing that convolution with a radix-2 FFT of the next power of
     * two at or above 2N+1.
     *
     * The angle is built from (i*i) % (2n) rather than i*i so that the doubles
     * stay exact: i*i reaches 4.3e9 for the longest buffer the generator will
     * make, and the modulus keeps the argument small enough that the cosine is
     * accurate right across the buffer.
     */
    static transformBluestein(real, imag) {
        const n = real.length
        let m = 1
        while (m < n * 2 + 1) m *= 2

        const cosTable = new Float64Array(n)
        const sinTable = new Float64Array(n)
        for (let i = 0; i < n; i++) {
            const j = (i * i) % (n * 2)
            const angle = (Math.PI * j) / n
            cosTable[i] = Math.cos(angle)
            sinTable[i] = Math.sin(angle)
        }

        const areal = new Float64Array(m)
        const aimag = new Float64Array(m)
        for (let i = 0; i < n; i++) {
            areal[i] = real[i] * cosTable[i] + imag[i] * sinTable[i]
            aimag[i] = -real[i] * sinTable[i] + imag[i] * cosTable[i]
        }

        const breal = new Float64Array(m)
        const bimag = new Float64Array(m)
        breal[0] = cosTable[0]
        bimag[0] = sinTable[0]
        for (let i = 1; i < n; i++) {
            breal[i] = breal[m - i] = cosTable[i]
            bimag[i] = bimag[m - i] = sinTable[i]
        }

        const creal = new Float64Array(m)
        const cimag = new Float64Array(m)
        FFT.convolve(areal, aimag, breal, bimag, creal, cimag)

        for (let i = 0; i < n; i++) {
            real[i] = creal[i] * cosTable[i] + cimag[i] * sinTable[i]
            imag[i] = -creal[i] * sinTable[i] + cimag[i] * cosTable[i]
        }
    }

    /*** Circular convolution of two complex sequences of equal power of two length. */
    static convolve(xreal, ximag, yreal, yimag, outreal, outimag) {
        const n = xreal.length
        xreal = xreal.slice()
        ximag = ximag.slice()
        yreal = yreal.slice()
        yimag = yimag.slice()
        FFT.transform(xreal, ximag)
        FFT.transform(yreal, yimag)

        for (let i = 0; i < n; i++) {
            const temp = xreal[i] * yreal[i] - ximag[i] * yimag[i]
            ximag[i] = ximag[i] * yreal[i] + xreal[i] * yimag[i]
            xreal[i] = temp
        }
        FFT.inverseTransform(xreal, ximag)

        for (let i = 0; i < n; i++) {
            outreal[i] = xreal[i] / n
            outimag[i] = ximag[i] / n
        }
    }
}

/***
 * Turns a wavesample into harmonic levels in dBFS.
 *
 * Phase is discarded, as asked. The scaling is chosen so that a full scale sine
 * reads exactly 0.0 dBFS, which is what makes the display teach something: a
 * sawtooth's harmonics then fall on a dead straight -6.02 dB/octave line, a
 * square shows the same line with the even harmonics missing, and switching
 * Band limited on cuts the line off partway across instead of letting it run to
 * the right hand edge.
 */
class Spectrum {

    /*** Full scale for the signed 16 bit samples used everywhere in the app. */
    static PEAK = 32767

    /*** 16 bit quantisation floor, and the bottom of the display. */
    static FLOOR_DB = -96

    /***
     * Top of the display. Above 0 dBFS on purpose: a full scale square wave's
     * fundamental is 4/pi of full scale, which is +2.1 dBFS, so a ceiling of
     * exactly 0 would clip the most ordinary waveform in the list.
     */
    static CEILING_DB = 6

    /*** Bottom of the frequency axis, locked. */
    static MIN_HZ = 10

    /***
     * Harmonic levels for a buffer, indexed by harmonic number.
     *
     * Returns db[0..N/2], where db[k] is the level of harmonic k at k*rate/N.
     * db[0] is DC, which a logarithmic frequency axis cannot show and which the
     * view reports separately. Silent bins come back as -Infinity rather than a
     * large negative number, so callers can tell "nothing here" from "quiet".
     */
    static analyse(data) {
        const n = data.length
        if (n < 4) return null

        const real = new Float64Array(n)
        const imag = new Float64Array(n)
        for (let i = 0; i < n; i++) real[i] = data[i]
        FFT.transform(real, imag)

        const bins = Math.floor(n / 2)
        const db = new Float64Array(bins + 1)
        for (let k = 0; k <= bins; k++) {
            const magnitude = Math.hypot(real[k], imag[k])
            // DC and, for an even length, the Nyquist bin have no partner to
            // fold in, so they take half the scaling of the rest.
            const alone = k === 0 || (n % 2 === 0 && k === bins)
            const amplitude = (alone ? magnitude / n : (2 * magnitude) / n) / Spectrum.PEAK
            db[k] = amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity
        }
        return { db, bins, length: n }
    }
}

/***
 * The display itself: a log/log plot beside the waveform, sharing its height
 * and its theme.
 *
 * It owns its own canvas rather than drawing into half of the editor's, because
 * every one of the editor's coordinate helpers and pointer handlers is written
 * against the full width of its canvas. Sitting beside it instead means the
 * editor simply becomes narrower, which its ResizeObserver already handles, and
 * nothing about editing has to change.
 */
class WaveSpectrum {

    /***
     * Longest buffer that is re-analysed while the pointer is still down.
     * Above this the drawing keeps the last spectrum until the stroke ends,
     * which costs nothing anyone can see: at that length the display is a
     * dense envelope rather than countable lines.
     */
    static LIVE_MAX = 8192

    /*** Used only to label the axis if the host never set a rate. */
    static FALLBACK_RATE = 44643

    /*** Closest two harmonic markers may be drawn, in pixels. */
    static MARKER_SPACING = 5

    /*** Tightest zoom, as a fraction of the full scale span. */
    static MAX_ZOOM = 256

    constructor(canvas, editor) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')
        this.editor = editor

        this.cache = null
        // What the framing was last chosen for. A new buffer length or a new
        // sample rate reframes; panning and editing do not.
        this.fittedLength = -1
        this.fittedRate = -1

        this.fLow = Spectrum.MIN_HZ
        this.fHigh = WaveSpectrum.FALLBACK_RATE / 2
        this.dbTop = Spectrum.CEILING_DB
        this.dbBottom = Spectrum.FLOOR_DB

        this.hover = null
        this.drag = null

        this.canvas.style.width = '100%'
        this.canvas.style.touchAction = 'none'
        this.canvas.style.cursor = 'grab'

        this.attachPointerHandlers()

        if (window.ResizeObserver) {
            this.observer = new ResizeObserver(() => this.resize())
            this.observer.observe(this.canvas)
        }
    }

    get width() { return this.canvas.clientWidth || 1 }
    get height() { return this.editor.height }
    get padding() { return 6 }

    rate() {
        return this.editor.sampleRate > 0
            ? this.editor.sampleRate
            : WaveSpectrum.FALLBACK_RATE
    }

    /*** Top of the frequency axis: the whole band the buffer can carry. */
    maxHz() { return this.rate() / 2 }

    /*** Spacing of the harmonic lines, which is also the resolution. */
    deltaHz() {
        const n = this.editor.data.length
        return n > 0 ? this.rate() / n : 0
    }

    /*** Fundamental of the generated wave, if the host said what it was. */
    fundamentalHz() {
        return this.editor.periodSamples > 0
            ? this.rate() / this.editor.periodSamples
            : 0
    }

    /***
     * Opening framing: from just under the first line that can exist up to
     * Nyquist, so a single cycle wave fills the panel instead of leaving the
     * left third of the axis permanently empty. The 10Hz limit is still the
     * limit — zooming out walks back to it.
     */
    fit() {
        const top = this.maxHz()
        const delta = this.deltaHz()
        this.fHigh = top
        this.fLow = Math.max(Spectrum.MIN_HZ, Math.min(delta / 2, top / 2))
        this.dbTop = Spectrum.CEILING_DB
        this.dbBottom = Spectrum.FLOOR_DB
        this.fittedLength = this.editor.data.length
        this.fittedRate = this.rate()
    }

    /***
     * View
     *
     * Both axes are clamped to the full scale limits, so panning and zooming
     * can never wander off the data: 10Hz to Nyquist across, and the 16 bit
     * floor to a little over full scale down.
     */
    clampView() {
        const fullLow = Math.log10(Spectrum.MIN_HZ)
        const fullHigh = Math.log10(this.maxHz())
        const fullSpan = fullHigh - fullLow
        let low = Math.log10(this.fLow)
        let high = Math.log10(this.fHigh)
        let span = Math.min(high - low, fullSpan)
        span = Math.max(span, fullSpan / WaveSpectrum.MAX_ZOOM)
        const middle = (low + high) / 2
        low = middle - span / 2
        high = middle + span / 2
        if (low < fullLow) { low = fullLow; high = low + span }
        if (high > fullHigh) { high = fullHigh; low = high - span }
        this.fLow = Math.pow(10, low)
        this.fHigh = Math.pow(10, high)

        const fullDb = Spectrum.CEILING_DB - Spectrum.FLOOR_DB
        let dbSpan = Math.min(this.dbTop - this.dbBottom, fullDb)
        dbSpan = Math.max(dbSpan, fullDb / WaveSpectrum.MAX_ZOOM)
        const centre = (this.dbTop + this.dbBottom) / 2
        this.dbTop = centre + dbSpan / 2
        this.dbBottom = centre - dbSpan / 2
        if (this.dbTop > Spectrum.CEILING_DB) {
            this.dbTop = Spectrum.CEILING_DB
            this.dbBottom = this.dbTop - dbSpan
        }
        if (this.dbBottom < Spectrum.FLOOR_DB) {
            this.dbBottom = Spectrum.FLOOR_DB
            this.dbTop = this.dbBottom + dbSpan
        }
    }

    /*** Frequency zoom about a point on screen, or about the middle. */
    zoomFrequency(factor, aboutX) {
        const low = Math.log10(this.fLow)
        const high = Math.log10(this.fHigh)
        const at = aboutX === undefined
            ? (low + high) / 2
            : low + (aboutX / this.width) * (high - low)
        this.fLow = Math.pow(10, at - (at - low) * factor)
        this.fHigh = Math.pow(10, at + (high - at) * factor)
        this.clampView()
        this.render()
    }

    zoomAmplitude(factor) {
        const centre = (this.dbTop + this.dbBottom) / 2
        const half = ((this.dbTop - this.dbBottom) / 2) * factor
        this.dbTop = centre + half
        this.dbBottom = centre - half
        this.clampView()
        this.render()
    }

    panBy(dx, dy) {
        const low = Math.log10(this.fLow)
        const high = Math.log10(this.fHigh)
        const shift = (dx / this.width) * (high - low)
        this.fLow = Math.pow(10, low - shift)
        this.fHigh = Math.pow(10, high - shift)

        const plotHeight = Math.max(1, this.height - 2 * this.padding)
        const dbShift = (dy / plotHeight) * (this.dbTop - this.dbBottom)
        this.dbTop += dbShift
        this.dbBottom += dbShift

        this.clampView()
        this.render()
    }

    /***
     * Mapping
     */
    xForHz(hz) {
        const low = Math.log10(this.fLow)
        const high = Math.log10(this.fHigh)
        return ((Math.log10(hz) - low) / (high - low)) * this.width
    }

    hzForX(x) {
        const low = Math.log10(this.fLow)
        const high = Math.log10(this.fHigh)
        return Math.pow(10, low + (x / this.width) * (high - low))
    }

    yForDb(db) {
        const top = this.padding
        const bottom = this.height - this.padding
        const clamped = Math.max(this.dbBottom, Math.min(this.dbTop, db))
        return top + ((this.dbTop - clamped) / (this.dbTop - this.dbBottom)) * (bottom - top)
    }

    dbForY(y) {
        const top = this.padding
        const bottom = this.height - this.padding
        return this.dbTop - ((y - top) / (bottom - top)) * (this.dbTop - this.dbBottom)
    }

    /***
     * Analysis, cached against the editor's buffer version so that zooming,
     * panning, resizing and repainting for a theme change all redraw from the
     * numbers already worked out. Only an edit costs a transform.
     */
    ensureAnalysis() {
        const version = this.editor.dataVersion
        if (this.cache && this.cache.version === version) return this.cache.analysis
        const stillDrawing = this.editor.pointer != null
            && this.editor.data.length > WaveSpectrum.LIVE_MAX
        if (stillDrawing && this.cache) return this.cache.analysis
        const analysis = Spectrum.analyse(this.editor.data)
        this.cache = { version, analysis }
        return analysis
    }

    invalidate() {
        this.cache = null
        this.fittedLength = -1
    }

    /***
     * Rendering
     */
    resize() {
        const dpr = window.devicePixelRatio || 1
        const width = this.width
        const height = this.height
        if (width === 0) return
        this.canvas.style.height = height + 'px'
        this.canvas.width = Math.round(width * dpr)
        this.canvas.height = Math.round(height * dpr)
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        this.render()
    }

    render() {
        if (!this.canvas.isConnected || this.canvas.offsetParent === null) return
        const ctx = this.ctx
        const width = this.width
        const height = this.height
        if (width === 0) return

        const palette = WaveEditor.palette()
        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = palette.background
        ctx.fillRect(0, 0, width, height)

        const analysis = this.ensureAnalysis()
        if (!analysis) {
            ctx.fillStyle = palette.empty
            ctx.font = '12px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText('No wavesample loaded', width / 2, height / 2 - 8)
            ctx.textAlign = 'left'
            return
        }

        if (analysis.length !== this.fittedLength || this.rate() !== this.fittedRate) {
            this.fit()
        }

        this.renderGrid()
        this.renderHarmonicMarkers()
        this.renderStems(analysis)
        this.renderLabels(analysis)
    }

    /***
     * A 1-2-5 grid across, because that is how a logarithmic frequency axis
     * reads, and a nice step in dB down. The dB step is chosen from the visible
     * span so that zooming in gives finer lines rather than the same eight.
     */
    renderGrid() {
        const ctx = this.ctx
        const palette = WaveEditor.palette()
        const width = this.width
        const top = this.padding
        const bottom = this.height - this.padding

        ctx.lineWidth = 1
        ctx.font = '10px sans-serif'

        const firstDecade = Math.floor(Math.log10(this.fLow))
        const lastDecade = Math.ceil(Math.log10(this.fHigh))
        for (let decade = firstDecade; decade <= lastDecade; decade++) {
            for (let multiple = 1; multiple <= 9; multiple++) {
                const hz = multiple * Math.pow(10, decade)
                if (hz < this.fLow || hz > this.fHigh) continue
                const x = Math.round(this.xForHz(hz)) + 0.5
                ctx.strokeStyle = multiple === 1 ? palette.ticks : palette.graticule
                ctx.beginPath()
                ctx.moveTo(x, top)
                ctx.lineTo(x, bottom)
                ctx.stroke()
                if (multiple === 1 || multiple === 2 || multiple === 5) {
                    ctx.fillStyle = palette.empty
                    ctx.fillText(WaveSpectrum.formatHz(hz), x + 2, bottom - 2)
                }
            }
        }

        const span = this.dbTop - this.dbBottom
        const step = span > 60 ? 12 : span > 30 ? 6 : span > 12 ? 3 : 1
        for (let db = Math.ceil(this.dbBottom / step) * step; db <= this.dbTop; db += step) {
            const y = Math.round(this.yForDb(db)) + 0.5
            ctx.strokeStyle = db === 0 ? palette.zero : palette.graticule
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(width, y)
            ctx.stroke()
            ctx.fillStyle = palette.empty
            ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 2, y - 2)
        }
    }

    /***
     * Where the note's harmonics fall, drawn like the period markers in the
     * time view and for the same reason. With drift or detune on, the energy
     * spreads off these lines, which is the whole point of being able to see
     * them. Skipped once they crowd closer than a few pixels.
     */
    renderHarmonicMarkers() {
        const fundamental = this.fundamentalHz()
        if (!(fundamental > 0)) return
        const ctx = this.ctx
        const palette = WaveEditor.palette()
        const top = this.padding
        const bottom = this.height - this.padding
        let lastX = -Infinity
        ctx.strokeStyle = palette.period
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let k = 1; k * fundamental <= this.fHigh; k++) {
            const hz = k * fundamental
            if (hz < this.fLow) continue
            const x = Math.round(this.xForHz(hz)) + 0.5
            if (x - lastX < WaveSpectrum.MARKER_SPACING) continue
            lastX = x
            ctx.moveTo(x, top)
            ctx.lineTo(x, bottom)
        }
        ctx.stroke()
    }

    /***
     * The lines themselves.
     *
     * A logarithmic axis is sparse at the left and dense at the right at the
     * same time, so there is no useful point at which to switch between drawing
     * every line and drawing an envelope. Instead every bin is folded into the
     * pixel column it lands in, keeping the loudest, and the result is drawn as
     * stems: countable lines where they are far apart, a filled envelope where
     * they are not, with no branch and no threshold.
     */
    renderStems(analysis) {
        const ctx = this.ctx
        const palette = WaveEditor.palette()
        const width = Math.max(1, Math.round(this.width))
        const bottom = this.height - this.padding
        const delta = this.deltaHz()
        if (!(delta > 0)) return

        const columns = new Float64Array(width).fill(-Infinity)
        for (let k = 1; k <= analysis.bins; k++) {
            const hz = k * delta
            if (hz < this.fLow) continue
            if (hz > this.fHigh) break
            const db = analysis.db[k]
            if (!(db > this.dbBottom)) continue
            const x = Math.round(this.xForHz(hz))
            if (x < 0 || x >= width) continue
            if (db > columns[x]) columns[x] = db
        }

        ctx.strokeStyle = palette.trace || this.editor.color
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let x = 0; x < width; x++) {
            if (columns[x] === -Infinity) continue
            const y = this.yForDb(columns[x])
            ctx.moveTo(x + 0.5, y)
            ctx.lineTo(x + 0.5, bottom)
        }
        ctx.stroke()
    }

    /***
     * Readings drawn onto the canvas rather than into the page, so that a
     * pointer moving across the display cannot change the height of anything
     * and shuffle the tabs underneath it.
     */
    renderLabels(analysis) {
        const ctx = this.ctx
        const palette = WaveEditor.palette()
        const width = this.width
        const top = this.padding
        ctx.font = '11px sans-serif'
        ctx.fillStyle = palette.empty

        const parts = [`${analysis.bins} harmonics`]
        const delta = this.deltaHz()
        if (delta > 0) parts.push(`${WaveSpectrum.formatHz(delta)} apart`)
        const span = this.dbTop - this.dbBottom
        parts.push(`${span > 60 ? 12 : span > 30 ? 6 : span > 12 ? 3 : 1} dB/div`)
        ctx.textAlign = 'left'
        ctx.fillText(parts.join(' · '), 2, top + 10)

        const dc = analysis.db[0]
        if (dc > Spectrum.FLOOR_DB) {
            ctx.fillText(`DC ${dc.toFixed(1)} dB`, 2, this.height - this.padding - 12)
        }

        if (this.hover) {
            const hz = this.hzForX(this.hover.x)
            const fundamental = this.fundamentalHz()
            const nearest = delta > 0 ? Math.round(hz / delta) : 0
            const level = nearest >= 1 && nearest <= analysis.bins
                ? analysis.db[nearest] : -Infinity
            const reading = [WaveSpectrum.formatHz(hz)]
            if (level > -Infinity) reading.push(`${level.toFixed(1)} dB`)
            if (fundamental > 0) {
                const harmonic = hz / fundamental
                if (harmonic >= 0.5) reading.push(`h${Math.round(harmonic)}`)
            }
            ctx.textAlign = 'right'
            ctx.fillStyle = palette.zero
            ctx.fillText(reading.join(' · '), width - 2, top + 10)
            ctx.textAlign = 'left'

            const x = Math.round(this.hover.x) + 0.5
            ctx.strokeStyle = palette.ticks
            ctx.beginPath()
            ctx.moveTo(x, top)
            ctx.lineTo(x, this.height - this.padding)
            ctx.stroke()
        }
    }

    /***
     * Interaction: drag to pan, wheel to zoom the frequency axis about the
     * pointer, shift wheel for the amplitude axis.
     */
    attachPointerHandlers() {
        const positionOf = (event) => {
            const box = this.canvas.getBoundingClientRect()
            return { x: event.clientX - box.left, y: event.clientY - box.top }
        }

        this.canvas.addEventListener('pointerdown', (event) => {
            this.canvas.setPointerCapture(event.pointerId)
            this.drag = positionOf(event)
            this.canvas.style.cursor = 'grabbing'
        })

        this.canvas.addEventListener('pointermove', (event) => {
            const at = positionOf(event)
            if (this.drag) {
                this.panBy(at.x - this.drag.x, at.y - this.drag.y)
                this.drag = at
                return
            }
            this.hover = at
            this.render()
        })

        const release = () => {
            this.drag = null
            this.canvas.style.cursor = 'grab'
        }
        this.canvas.addEventListener('pointerup', release)
        this.canvas.addEventListener('pointercancel', release)
        this.canvas.addEventListener('pointerleave', () => {
            release()
            this.hover = null
            this.render()
        })

        this.canvas.addEventListener('wheel', (event) => {
            event.preventDefault()
            const factor = event.deltaY > 0 ? 1.2 : 1 / 1.2
            if (event.shiftKey) this.zoomAmplitude(factor)
            else this.zoomFrequency(factor, positionOf(event).x)
        }, { passive: false })
    }

    /*** Hz below a kilohertz, kHz above, so the axis labels stay short. */
    static formatHz(hz) {
        if (hz >= 10000) return `${(hz / 1000).toFixed(0)}k`
        if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`
        if (hz >= 100) return `${hz.toFixed(0)}`
        if (hz >= 10) return `${hz.toFixed(0)}`
        return `${hz.toFixed(1)}`
    }
}
