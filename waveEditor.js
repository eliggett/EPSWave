/***
 * Canvas waveform display and editor.
 *
 * Replaces the read only Chart.js plot. Renders any buffer length: a min/max
 * envelope when there are more samples than pixels, a polyline once you zoom in
 * far enough. Editing works at any length because undo stores patches of the
 * range you touched rather than whole buffer snapshots.
 *
 * Samples are signed 16 bit ints, matching the rest of the app.
 */
class WaveEditor {

    static PEAK = 32767

    /***
     * Display height in CSS pixels, overridable per instance with
     * `options.height`. The graticule, the trace and the hit testing are all
     * derived from `this.height`, so this is the only place that needs to
     * change to resize a slot.
     */
    static DEFAULT_HEIGHT = 315

    /***
     * Screen colours. `trace` of null means the slot keeps its own colour; the
     * dark theme overrides it so every trace reads as scope phosphor.
     */
    static THEMES = {
        light: {
            background: '#fbfbfc',
            graticule: 'rgba(33,37,41,0.07)',
            ticks: 'rgba(33,37,41,0.18)',
            period: 'rgba(23,162,184,0.22)',
            zero: '#6c757d',
            empty: '#adb5bd',
            trace: null,
            selectionFill: 'rgba(23,162,184,0.16)',
            selectionEdge: 'rgba(23,162,184,0.9)'
        },
        dark: {
            background: '#0a0e0c',
            graticule: 'rgba(125,220,160,0.10)',
            ticks: 'rgba(125,220,160,0.22)',
            period: 'rgba(125,220,160,0.30)',
            zero: 'rgba(150,235,180,0.55)',
            empty: '#5d6b62',
            trace: '#3dff7a',
            selectionFill: 'rgba(90,220,255,0.14)',
            selectionEdge: 'rgba(120,230,255,0.85)'
        }
    }

    /*** Divisions across and down, as on a scope screen. */
    static GRATICULE_COLUMNS = 10
    static GRATICULE_ROWS = 8
    /*** Subdivisions per division, marked as ticks along the centre axes. */
    static GRATICULE_SUBDIVISIONS = 5

    /***
     * Most period boundary lines to draw at once. Past twenty or so they stop
     * being markers and become a hatch that hides the waveform, so the interval
     * steps up instead — every 2nd cycle, every 5th, every 10th — and the
     * readout says which, so the lines still mean something definite.
     */
    static MAX_PERIOD_LINES = 20

    /***
     * The smallest 1, 2, 5 x 10^n at or above `value`. Keeps the period marker
     * interval to numbers that are easy to count in your head.
     */
    static niceStep(value) {
        if (!(value > 1)) return 1
        const power = Math.pow(10, Math.floor(Math.log10(value)))
        for (const step of [1, 2, 5]) {
            if (power * step >= value) return power * step
        }
        return power * 10
    }

    static theme = 'light'
    static instances = []

    static palette() {
        return WaveEditor.THEMES[WaveEditor.theme] || WaveEditor.THEMES.light
    }

    /***
     * Repaints every live editor. Canvases that have been removed from the page
     * are dropped, so deleted soundscape slots do not pile up.
     */
    static setTheme(name) {
        WaveEditor.theme = WaveEditor.THEMES[name] ? name : 'light'
        WaveEditor.instances = WaveEditor.instances.filter(editor => editor.canvas.isConnected)
        for (const editor of WaveEditor.instances) editor.render()
    }

    /*** Tools */
    static PEN = 'pen'
    static LINE = 'line'
    static SMOOTH = 'smooth'
    static SELECT = 'select'

    /***
     * Undo is bounded by total stored samples rather than by a state count, so
     * a handful of whole buffer operations on a long wavesample cannot run away
     * with memory.
     */
    static MAX_UNDO_SAMPLES = 4000000

    constructor(canvas, toolbar, options = {}) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')
        this.color = options.color || 'rgb(75,192,192)'
        this.onChange = options.onChange || (() => {})
        this.readOnly = options.readOnly === true

        this.data = []
        this.viewStart = 0
        this.viewLength = 0
        this.periodSamples = 0
        // Only used to put a time on the horizontal divisions. Zero means the
        // host never said, and the readout leaves the time scale out.
        this.sampleRate = options.sampleRate > 0 ? options.sampleRate : 0

        this.tool = WaveEditor.PEN
        // Half open range of samples, [start, end), or null for no selection.
        this.selection = null
        // Where the last click hunt stopped, so repeat presses walk forwards.
        this.lastClickIndex = -1
        // Transient note shown in the readout under the plot after an operation.
        this.status = ''
        this.undoStack = []
        this.undoSamples = 0

        this.pointer = null

        this.canvas.style.width = '100%'
        this.canvas.style.height = (options.height || WaveEditor.DEFAULT_HEIGHT) + 'px'
        this.canvas.style.touchAction = 'none'
        this.canvas.style.cursor = this.readOnly ? 'default' : 'crosshair'

        WaveEditor.instances.push(this)

        // Before the toolbar, which reports through it as soon as it is wired.
        this.buildReadout()
        if (toolbar) this.buildToolbar(toolbar)
        this.attachPointerHandlers()

        this.resize()
        if (window.ResizeObserver) {
            this.observer = new ResizeObserver(() => this.resize())
            this.observer.observe(this.canvas)
        } else {
            window.addEventListener('resize', () => this.resize())
        }
    }

    /***
     * Data
     */
    setData(data, options = {}) {
        this.data = data ? Array.from(data) : []
        this.selection = null
        this.status = ''
        if (options.periodSamples !== undefined) this.periodSamples = options.periodSamples
        if (options.keepView && this.viewStart + this.viewLength <= this.data.length) {
            this.clampView()
        } else {
            this.zoomAll()
        }
        if (options.sampleRate > 0) this.sampleRate = options.sampleRate
        if (!options.keepUndo) this.clearUndo()
        this.render()
        this.syncControls()
    }

    getData() {
        return this.data
    }

    /*** The rate the buffer plays back at, which is what turns divisions into
     * milliseconds. Changing it redraws the readout without touching the data. */
    setSampleRate(hz) {
        this.sampleRate = hz > 0 ? hz : 0
        this.syncControls()
    }

    /***
     * View
     */
    zoomAll() {
        this.viewStart = 0
        this.viewLength = this.data.length
        this.clampView()
        this.render()
        this.syncControls()
    }

    zoomBy(factor, focusSample) {
        if (this.data.length === 0) return
        const focus = focusSample === undefined
            ? this.viewStart + this.viewLength / 2
            : focusSample
        // Two samples is the tightest useful view; below that there is nothing
        // left to draw between.
        const next = Math.max(2, Math.min(this.data.length, Math.round(this.viewLength * factor)))
        const ratio = this.viewLength > 0 ? (focus - this.viewStart) / this.viewLength : 0.5
        this.viewLength = next
        this.viewStart = Math.round(focus - ratio * next)
        this.clampView()
        this.render()
        this.syncControls()
    }

    scrollTo(start) {
        this.viewStart = Math.round(start)
        this.clampView()
        this.render()
        this.syncControls()
    }

    clampView() {
        if (this.data.length === 0) {
            this.viewStart = 0
            this.viewLength = 0
            return
        }
        if (this.viewLength <= 0 || this.viewLength > this.data.length) {
            this.viewLength = this.data.length
        }
        this.viewStart = Math.max(0, Math.min(this.data.length - this.viewLength, this.viewStart))
    }

    /***
     * Pixel <-> sample mapping
     */
    get width() { return this.canvas.clientWidth || 1 }
    get height() { return parseInt(this.canvas.style.height, 10) || WaveEditor.DEFAULT_HEIGHT }
    get padding() { return 6 }

    xToSample(x) {
        if (this.viewLength === 0) return 0
        return this.viewStart + (x / this.width) * this.viewLength
    }

    sampleToX(index) {
        if (this.viewLength === 0) return 0
        return ((index - this.viewStart) / this.viewLength) * this.width
    }

    valueToY(value) {
        const half = this.height / 2 - this.padding
        return this.height / 2 - (value / WaveEditor.PEAK) * half
    }

    yToValue(y) {
        const half = this.height / 2 - this.padding
        const value = ((this.height / 2 - y) / half) * WaveEditor.PEAK
        return Math.max(-WaveEditor.PEAK, Math.min(WaveEditor.PEAK, Math.round(value)))
    }

    /***
     * Screen scale
     *
     * What one division of the graticule is worth, for the readout under the
     * plot. Vertically that is a fixed fraction of full scale, since the rows
     * split the plot evenly and the outermost pair sit on the clipping limit.
     */
    divisionSamples() { return this.viewLength / WaveEditor.GRATICULE_COLUMNS }

    divisionCounts() {
        return WaveEditor.PEAK / (WaveEditor.GRATICULE_ROWS / 2)
    }

    /***
     * The level, in dB below full scale, of a signal whose peak reaches exactly
     * one division above the zero line.
     *
     * Worth being plain about what this is not: the trace is drawn on a linear
     * amplitude scale, so the divisions are not a ladder of equal decibels —
     * two divisions is 6 dB up from one, three is another 3.5, and so on. This
     * is the calibration of the screen, the way a scope's V/div is, and it is
     * constant because the row count is.
     */
    divisionDb() {
        return 20 * Math.log10(this.divisionCounts() / WaveEditor.PEAK)
    }

    /***
     * How many periods apart the cycle markers are drawn, or 0 for none. Steps
     * through 1, 2, 5, 10 ... so that no more than MAX_PERIOD_LINES land on
     * screen at once.
     */
    periodStride() {
        if (!(this.periodSamples > 1) || this.viewLength <= 0) return 0
        const visible = this.viewLength / this.periodSamples
        // n cycles on screen at a stride of s puts n/s intervals across it and
        // so n/s + 1 lines, counting the one at each end. The budget is lines,
        // hence the minus one.
        return WaveEditor.niceStep(visible / (WaveEditor.MAX_PERIOD_LINES - 1))
    }

    /***
     * Rendering
     */
    resize() {
        const dpr = window.devicePixelRatio || 1
        const width = this.width
        const height = this.height
        if (width === 0) return
        this.canvas.width = Math.round(width * dpr)
        this.canvas.height = Math.round(height * dpr)
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        this.render()
    }

    render() {
        const ctx = this.ctx
        const width = this.width
        const height = this.height
        if (width === 0) return

        const palette = WaveEditor.palette()

        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = palette.background
        ctx.fillRect(0, 0, width, height)

        this.renderGrid()

        if (this.data.length === 0) {
            ctx.fillStyle = palette.empty
            ctx.font = '12px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText('No wavesample loaded', width / 2, height / 2 - 8)
            ctx.textAlign = 'left'
            return
        }

        this.renderSelection()

        const trace = palette.trace || this.color
        ctx.strokeStyle = trace
        ctx.fillStyle = trace
        ctx.lineWidth = 1

        if (this.viewLength > width) {
            this.renderEnvelope()
        } else {
            this.renderPolyline()
        }
    }

    /***
     * Scope style screen: an even grid of divisions over the full plot area,
     * with finer ticks along the centre axes, then the period markers, then the
     * zero line last so it stays on top of everything.
     */
    renderGrid() {
        const ctx = this.ctx
        const palette = WaveEditor.palette()
        const width = this.width
        const height = this.height
        const top = this.padding
        const bottom = height - this.padding
        const plotHeight = bottom - top
        const columns = WaveEditor.GRATICULE_COLUMNS
        const rows = WaveEditor.GRATICULE_ROWS

        // Division lines. The outermost rows land on full scale, so these double
        // as the +/- limit markers.
        ctx.strokeStyle = palette.graticule
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let column = 0; column <= columns; column++) {
            const x = Math.round((column * width) / columns) + 0.5
            ctx.moveTo(x, top)
            ctx.lineTo(x, bottom)
        }
        for (let row = 0; row <= rows; row++) {
            const y = Math.round(top + (row * plotHeight) / rows) + 0.5
            ctx.moveTo(0, y)
            ctx.lineTo(width, y)
        }
        ctx.stroke()

        // Fine ticks along the centre axes, as on a scope faceplate.
        const centreY = Math.round(top + plotHeight / 2) + 0.5
        const centreX = Math.round(width / 2) + 0.5
        const tick = 3
        const acrossTicks = columns * WaveEditor.GRATICULE_SUBDIVISIONS
        const downTicks = rows * WaveEditor.GRATICULE_SUBDIVISIONS
        ctx.strokeStyle = palette.ticks
        ctx.beginPath()
        for (let step = 0; step <= acrossTicks; step++) {
            const x = Math.round((step * width) / acrossTicks) + 0.5
            ctx.moveTo(x, centreY - tick)
            ctx.lineTo(x, centreY + tick)
        }
        for (let step = 0; step <= downTicks; step++) {
            const y = Math.round(top + (step * plotHeight) / downTicks) + 0.5
            ctx.moveTo(centreX - tick, y)
            ctx.lineTo(centreX + tick, y)
        }
        ctx.stroke()

        // Period boundaries, so a generated wave shows where its cycles fall.
        // Only every nth cycle once there are more on screen than the marker
        // budget allows; the readout carries the n.
        const stride = this.periodStride()
        if (stride > 0) {
            const spacing = this.periodSamples * stride
            const end = this.viewStart + this.viewLength
            ctx.strokeStyle = palette.period
            ctx.beginPath()
            for (let p = Math.ceil(this.viewStart / spacing); p * spacing <= end; p++) {
                const x = Math.round(this.sampleToX(p * spacing)) + 0.5
                ctx.moveTo(x, 0)
                ctx.lineTo(x, this.height)
            }
            ctx.stroke()
        }

        // Zero line, kept clearly stronger than the graticule so it reads as the
        // reference the waveform swings about.
        ctx.strokeStyle = palette.zero
        ctx.beginPath()
        ctx.moveTo(0, centreY)
        ctx.lineTo(width, centreY)
        ctx.stroke()
    }

    /***
     * Shades the selected span and marks its edges. Drawn under the waveform so
     * the samples stay readable through it.
     */
    renderSelection() {
        if (!this.selection) return
        const ctx = this.ctx
        const left = this.sampleToX(this.selection.start)
        const right = this.sampleToX(this.selection.end)
        if (right < 0 || left > this.width) return

        const palette = WaveEditor.palette()
        ctx.fillStyle = palette.selectionFill
        ctx.fillRect(left, 0, Math.max(1, right - left), this.height)

        ctx.strokeStyle = palette.selectionEdge
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(left + 0.5, 0)
        ctx.lineTo(left + 0.5, this.height)
        ctx.moveTo(right - 0.5, 0)
        ctx.lineTo(right - 0.5, this.height)
        ctx.stroke()
    }

    /***
     * More samples than pixels: draw the min/max span of each column so no peak
     * is ever hidden between sample points.
     */
    renderEnvelope() {
        const ctx = this.ctx
        const width = this.width
        ctx.beginPath()
        for (let x = 0; x < width; x++) {
            const from = Math.floor(this.xToSample(x))
            const to = Math.min(this.data.length, Math.max(from + 1, Math.floor(this.xToSample(x + 1))))
            let min = Infinity
            let max = -Infinity
            for (let i = from; i < to; i++) {
                const value = this.data[i]
                if (value < min) min = value
                if (value > max) max = value
            }
            if (min === Infinity) continue
            // Reach back one sample, into the column to the left. Columns are
            // drawn independently, so without this the trace is a row of
            // disconnected strokes that only looks continuous because
            // neighbouring columns usually overlap anyway. They do not overlap
            // where the waveform jumps: at around one sample per column the two
            // ends of a square wave's edge land in different columns, neither
            // column sees both, and the edge is missing from the screen
            // entirely — the top and the bottom of the square get drawn and
            // nothing joins them. Including the previous column's last sample
            // guarantees consecutive columns share a value and so always meet.
            if (from > 0) {
                const previous = this.data[from - 1]
                if (previous < min) min = previous
                if (previous > max) max = previous
            }
            // Canvas antialiases paths whether you ask it to or not, and that is
            // exactly what used to swallow quiet passages: a column whose swing
            // covers a third of a pixel is drawn at a third of the trace's
            // alpha, and one that lands inside a single pixel row is drawn as a
            // zero length segment, which is to say not at all. Rounding the ends
            // to pixel edges and never letting a column be shorter than one
            // pixel puts every column on screen at full strength. It costs a
            // little accuracy on the height of the smallest wiggles, which is
            // the right trade when the alternative is not seeing them.
            let top = Math.round(this.valueToY(max))
            let bottom = Math.round(this.valueToY(min))
            if (bottom - top < 1) {
                top = Math.round((top + bottom) / 2)
                bottom = top + 1
            }
            ctx.moveTo(x + 0.5, top)
            ctx.lineTo(x + 0.5, bottom)
        }
        ctx.stroke()
    }

    /***
     * Fewer samples than pixels: a real polyline, with handles once individual
     * samples are far enough apart to aim at.
     */
    renderPolyline() {
        const ctx = this.ctx
        const first = Math.max(0, Math.floor(this.viewStart) - 1)
        const last = Math.min(this.data.length - 1, Math.ceil(this.viewStart + this.viewLength) + 1)

        ctx.beginPath()
        for (let i = first; i <= last; i++) {
            const x = this.sampleToX(i)
            const y = this.valueToY(this.data[i])
            if (i === first) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        ctx.stroke()

        const spacing = this.width / this.viewLength
        if (spacing >= 6) {
            for (let i = first; i <= last; i++) {
                ctx.beginPath()
                ctx.arc(this.sampleToX(i), this.valueToY(this.data[i]), 2, 0, Math.PI * 2)
                ctx.fill()
            }
        }
    }

    /***
     * Editing
     */
    attachPointerHandlers() {
        this.canvas.addEventListener('pointerdown', (event) => {
            if (this.readOnly || this.data.length === 0) return
            this.status = ''
            this.canvas.setPointerCapture(event.pointerId)
            const position = this.eventPosition(event)
            if (this.tool === WaveEditor.SELECT) {
                // Grabbing near an existing edge moves that edge and pins the
                // other, so a selection can be zoomed into and refined rather
                // than redrawn from scratch every time.
                const anchor = this.selectionAnchorFor(this.eventX(event), position.index)
                this.pointer = { selectAnchor: anchor }
                this.setSelection(anchor, position.index)
                return
            }
            this.pointer = {
                startIndex: position.index,
                startValue: position.value,
                lastIndex: position.index,
                lastValue: position.value,
                touched: new Map(),
                // Widest span the line preview has covered so far, so dragging
                // back the other way still clears what the last frame drew.
                dirtyMin: position.index,
                dirtyMax: position.index,
                // Line previews against a pristine copy so dragging can be
                // rubber banded without stacking edits.
                before: this.tool === WaveEditor.LINE ? Array.from(this.data) : null
            }
            if (this.tool !== WaveEditor.LINE) this.applyStroke(position.index, position.value, position.index, position.value)
            this.render()
        })

        this.canvas.addEventListener('pointermove', (event) => {
            if (!this.pointer) return
            const position = this.eventPosition(event)
            if (this.pointer.selectAnchor !== undefined) {
                this.setSelection(this.pointer.selectAnchor, position.index)
                return
            }
            if (this.tool === WaveEditor.LINE) {
                // Restore everything this drag has drawn so far, then lay the
                // preview line down again from the anchor.
                const from = Math.min(this.pointer.dirtyMin, position.index)
                const to = Math.max(this.pointer.dirtyMax, position.index)
                for (let i = from; i <= to; i++) {
                    this.recordTouch(i)
                    this.data[i] = this.pointer.before[i]
                }
                this.applyStroke(this.pointer.startIndex, this.pointer.startValue, position.index, position.value)
                this.pointer.dirtyMin = Math.min(this.pointer.startIndex, position.index)
                this.pointer.dirtyMax = Math.max(this.pointer.startIndex, position.index)
            } else {
                this.applyStroke(this.pointer.lastIndex, this.pointer.lastValue, position.index, position.value)
            }
            this.pointer.lastIndex = position.index
            this.pointer.lastValue = position.value
            this.render()
        })

        const finish = (event) => {
            if (!this.pointer) return
            if (this.canvas.hasPointerCapture && event.pointerId !== undefined
                && this.canvas.hasPointerCapture(event.pointerId)) {
                this.canvas.releasePointerCapture(event.pointerId)
            }
            const wasSelecting = this.pointer.selectAnchor !== undefined
            if (!wasSelecting) this.commitStroke()
            this.pointer = null
            if (wasSelecting) {
                // A click without a drag means "deselect" rather than a one
                // sample selection, which would be useless.
                if (this.selection && this.selection.end - this.selection.start < 2) {
                    this.selection = null
                }
                this.render()
                this.syncControls()
                return
            }
            this.render()
            this.onChange(this.data)
        }
        this.canvas.addEventListener('pointerup', finish)
        this.canvas.addEventListener('pointercancel', finish)

        this.canvas.addEventListener('wheel', (event) => {
            if (this.data.length === 0) return
            event.preventDefault()
            if (event.shiftKey) {
                this.scrollTo(this.viewStart + Math.sign(event.deltaY) * this.viewLength * 0.15)
            } else {
                const focus = this.xToSample(this.eventX(event))
                this.zoomBy(event.deltaY > 0 ? 1.25 : 0.8, focus)
            }
        }, { passive: false })
    }

    eventX(event) {
        return event.clientX - this.canvas.getBoundingClientRect().left
    }

    eventPosition(event) {
        const rect = this.canvas.getBoundingClientRect()
        const index = Math.max(0, Math.min(this.data.length - 1,
            Math.round(this.xToSample(event.clientX - rect.left))))
        return { index: index, value: this.yToValue(event.clientY - rect.top) }
    }

    /***
     * Writes a segment between two pointer positions, interpolating across the
     * gap so a fast drag does not leave holes. When zoomed out a single pixel
     * covers many samples, so the whole span under the pointer is written.
     */
    applyStroke(fromIndex, fromValue, toIndex, toValue) {
        let start = fromIndex
        let end = toIndex
        let startValue = fromValue
        let endValue = toValue
        if (start > end) {
            start = toIndex; end = fromIndex
            startValue = toValue; endValue = fromValue
        }
        const span = end - start

        // A pointer sitting still at low zoom should still fill its column.
        const samplesPerPixel = this.viewLength / this.width
        if (span === 0 && samplesPerPixel > 1) {
            const half = Math.floor(samplesPerPixel / 2)
            const from = Math.max(0, start - half)
            const to = Math.min(this.data.length - 1, start + half)
            for (let i = from; i <= to; i++) this.writeSample(i, startValue)
            return
        }

        for (let i = start; i <= end; i++) {
            const t = span === 0 ? 0 : (i - start) / span
            const value = Math.round(startValue + (endValue - startValue) * t)
            this.writeSample(i, value)
        }
    }

    writeSample(index, value) {
        if (index < 0 || index >= this.data.length) return
        this.recordTouch(index)
        if (this.tool === WaveEditor.SMOOTH) {
            // Pull towards the local average rather than to the pointer, so the
            // brush softens what is already there.
            const radius = 2
            let sum = 0
            let count = 0
            for (let i = index - radius; i <= index + radius; i++) {
                if (i < 0 || i >= this.data.length) continue
                sum += this.data[i]
                count++
            }
            const average = sum / count
            this.data[index] = Math.round(this.data[index] * 0.4 + average * 0.6)
        } else {
            this.data[index] = Math.max(-WaveEditor.PEAK, Math.min(WaveEditor.PEAK, value))
        }
    }

    recordTouch(index) {
        if (!this.pointer) return
        if (!this.pointer.touched.has(index)) {
            this.pointer.touched.set(index, this.data[index])
        }
    }

    commitStroke() {
        if (!this.pointer || this.pointer.touched.size === 0) return
        let min = Infinity
        let max = -Infinity
        for (const index of this.pointer.touched.keys()) {
            if (index < min) min = index
            if (index > max) max = index
        }
        const before = new Array(max - min + 1)
        for (let i = min; i <= max; i++) {
            before[i - min] = this.pointer.touched.has(i) ? this.pointer.touched.get(i) : this.data[i]
        }
        this.pushUndo({ kind: 'replace', start: min, before: before })
    }

    /***
     * Undo
     */
    pushUndo(patch) {
        this.undoStack.push(patch)
        this.undoSamples += patch.before.length
        while (this.undoStack.length > 1 && this.undoSamples > WaveEditor.MAX_UNDO_SAMPLES) {
            this.undoSamples -= this.undoStack.shift().before.length
        }
        this.syncControls()
    }

    /***
     * Snapshots a range before an operation that rewrites it without changing
     * the buffer length.
     */
    snapshot(start = 0, length = this.data.length) {
        this.pushUndo({ kind: 'replace', start: start, before: this.data.slice(start, start + length) })
    }

    /***
     * Whole buffer snapshot, for trims and deletes where the length changes and
     * a positional patch could not restore it. Costs a full copy, which the undo
     * budget already accounts for.
     */
    snapshotAll() {
        // The view travels with the snapshot so undo puts you back where the
        // edit was made, at the zoom you made it at.
        this.pushUndo({
            kind: 'whole',
            before: Array.from(this.data),
            viewStart: this.viewStart,
            viewLength: this.viewLength
        })
    }

    undo() {
        const patch = this.undoStack.pop()
        if (!patch) return false
        this.undoSamples -= patch.before.length
        if (patch.kind === 'whole') {
            // Restore in place rather than reassigning, so the owner's handle on
            // this array stays valid. No spread: it would blow the call stack on
            // a long wavesample.
            this.data.length = patch.before.length
            for (let i = 0; i < patch.before.length; i++) {
                this.data[i] = patch.before[i]
            }
            this.selection = null
            this.viewStart = patch.viewStart
            this.viewLength = patch.viewLength
            this.clampView()
        } else {
            for (let i = 0; i < patch.before.length; i++) {
                this.data[patch.start + i] = patch.before[i]
            }
            this.clampView()
        }
        this.render()
        this.syncControls()
        this.onChange(this.data)
        return true
    }

    clearUndo() {
        this.undoStack = []
        this.undoSamples = 0
        this.syncControls()
    }

    /***
     * Selection
     */
    /***
     * Which sample a new selection drag should pin. Within grab distance of an
     * existing edge that is the opposite edge, otherwise the pointer itself and
     * the old selection is replaced.
     */
    selectionAnchorFor(x, index) {
        if (!this.selection) return index
        const grab = 6
        const left = this.sampleToX(this.selection.start)
        const right = this.sampleToX(this.selection.end)
        if (Math.abs(x - left) <= grab) return this.selection.end - 1
        if (Math.abs(x - right) <= grab) return this.selection.start
        return index
    }

    setSelection(anchor, head) {
        const start = Math.max(0, Math.min(anchor, head))
        const end = Math.min(this.data.length, Math.max(anchor, head) + 1)
        this.selection = { start: start, end: end }
        this.render()
        this.syncControls()
    }

    selectAll() {
        if (this.data.length === 0) return
        this.selection = { start: 0, end: this.data.length }
        this.render()
        this.syncControls()
    }

    clearSelection() {
        this.selection = null
        this.render()
        this.syncControls()
    }

    /***
     * Nearest rising zero crossing to an index. Rising specifically, so that
     * snapping both edges of a selection leaves ends that meet cleanly when the
     * trimmed wavesample loops.
     */
    findZeroCrossing(index, limit = 8192) {
        const n = this.data.length
        for (let distance = 0; distance <= limit; distance++) {
            for (const candidate of [index - distance, index + distance]) {
                if (candidate <= 0 || candidate >= n) continue
                if (this.data[candidate - 1] <= 0 && this.data[candidate] > 0) return candidate
            }
        }
        return index
    }

    snapSelectionToZeroCrossings() {
        if (!this.selection) return
        const start = this.findZeroCrossing(this.selection.start)
        const end = this.findZeroCrossing(this.selection.end)
        if (end - start < 2) return
        this.selection = { start: start, end: end }
        this.render()
        this.syncControls()
    }

    /***
     * How much a slope mismatch counts against a candidate loop end, relative
     * to a value mismatch. Small on purpose: matching the sample value is what
     * stops the click, and slope only decides between candidates that already
     * match on value, where it picks the one without a kink.
     */
    static LOOP_SLOPE_WEIGHT = 0.25

    /*** Click detection */
    // Samples either side used as the local reference for "normal" motion.
    static CLICK_WINDOW = 32
    // How many times the local average curvature counts as a discontinuity.
    static CLICK_RATIO = 6
    // Jumps below this fraction of full scale are inaudible whatever their
    // surroundings, which keeps quiet passages from lighting up.
    static CLICK_FLOOR = 0.002
    // Two candidates closer than this are one click, not two.
    static CLICK_MERGE = 16
    // Below this spread in size, a group of candidates is one repeating feature
    // of the waveform rather than a set of unrelated defects.
    static CLICK_UNIFORM_CV = 0.25
    // What it takes to be reported anyway from inside such a group.
    static CLICK_STANDOUT = 2
    // How wide a view to open when jumping to one. Tight enough that individual
    // samples get drawn as handles, so the discontinuity is unmistakable.
    static CLICK_ZOOM_SAMPLES = 50

    /***
     * Finds discontinuities that stand out from their surroundings.
     *
     * Measures curvature, |d[i+1] - 2d[i] + d[i-1]|, not slope. A splice shows
     * up as curvature whatever the waveform was doing around it, whereas its
     * slope can be partly cancelled by the underlying motion: measuring slope
     * misses a 2% jump that lands on a falling edge, and curvature catches it.
     *
     * The reference is the local average rather than a global threshold, since
     * a click in busy material can sit well below the waveform's own peak.
     *
     * Steep but legitimate edges, such as a saw reset, are indistinguishable
     * from a splice locally, so they are rejected by their sameness instead: a
     * group of similarly sized candidates is a repeating feature of the
     * waveform, and only members standing well clear of it are reported.
     *
     * The loop join is not an interior sample, so it is never reported here.
     */
    findClicks() {
        const n = this.data.length
        if (n < 8) return { clicks: [], suppressedFamily: false }

        const curvature = new Float64Array(n)
        for (let i = 1; i < n - 1; i++) {
            curvature[i] = Math.abs(this.data[i + 1] - 2 * this.data[i] + this.data[i - 1])
        }
        // Running totals, so the local average costs the same at any window size.
        const prefix = new Float64Array(n + 1)
        for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + curvature[i]

        const floor = WaveEditor.CLICK_FLOOR * WaveEditor.PEAK
        const window = WaveEditor.CLICK_WINDOW
        const candidates = []

        for (let i = 1; i < n - 1; i++) {
            if (curvature[i] < floor) continue
            const low = Math.max(1, i - window)
            const high = Math.min(n - 2, i + window)
            const count = high - low
            if (count < 1) continue
            const neighbours = (prefix[high + 1] - prefix[low] - curvature[i]) / count
            const score = curvature[i] / Math.max(neighbours, floor)
            if (score >= WaveEditor.CLICK_RATIO) {
                candidates.push({ index: i, step: curvature[i], score: score })
            }
        }

        // One discontinuity can trip several neighbouring samples. Keep the
        // worst of each cluster so "next" moves to a genuinely new place.
        let clicks = []
        for (const candidate of candidates) {
            const previous = clicks[clicks.length - 1]
            if (previous && candidate.index - previous.index <= WaveEditor.CLICK_MERGE) {
                if (candidate.step > previous.step) clicks[clicks.length - 1] = candidate
            } else {
                clicks.push(candidate)
            }
        }

        let suppressedFamily = false
        if (clicks.length >= 4) {
            const sizes = clicks.map(click => click.step)
            const mean = sizes.reduce((total, size) => total + size, 0) / sizes.length
            let variance = 0
            for (const size of sizes) variance += (size - mean) * (size - mean)
            const spread = mean > 0 ? Math.sqrt(variance / sizes.length) / mean : 0
            if (spread < WaveEditor.CLICK_UNIFORM_CV) {
                const sorted = sizes.slice().sort((a, b) => a - b)
                const median = sorted[Math.floor(sorted.length / 2)]
                const kept = clicks.filter(click => click.step >= WaveEditor.CLICK_STANDOUT * median)
                suppressedFamily = kept.length < clicks.length
                clicks = kept
            }
        }
        return { clicks: clicks, suppressedFamily: suppressedFamily }
    }

    /***
     * Moves the view to the next discontinuity, wrapping around. Reports the
     * loop join instead when the interior is clean, since that is the other
     * place a click can come from.
     */
    jumpToNextClick() {
        const found = this.findClicks()
        const clicks = found.clicks
        if (clicks.length === 0) {
            const n = this.data.length
            const wrap = n > 1 ? Math.abs(this.data[0] - this.data[n - 1]) : 0
            if (wrap > this.steepestStep()) {
                this.status = `no clicks inside, but the loop join is ${WaveEditor.percentOfPeak(wrap)}`
                    + ` &mdash; try Remove Loop Click`
            } else {
                this.status = found.suppressedFamily
                    ? "no clicks found (the waveform's own repeating edges were ignored)"
                    : 'no clicks found'
            }
            this.syncControls()
            return null
        }

        let position = clicks.findIndex(click => click.index > this.lastClickIndex)
        if (position < 0) position = 0
        const target = clicks[position]
        this.lastClickIndex = target.index

        this.viewLength = Math.min(this.data.length, WaveEditor.CLICK_ZOOM_SAMPLES)
        this.viewStart = Math.round(target.index - this.viewLength / 2)
        this.clampView()
        this.render()

        this.status = `click ${position + 1} of ${clicks.length} at sample ${target.index}`
            + ` &middot; step ${Math.round(target.step)} (${WaveEditor.percentOfPeak(target.step)},`
            + ` ${target.score.toFixed(1)}&times; local)`
        this.syncControls()
        return target
    }

    static percentOfPeak(value) {
        return `${(value / WaveEditor.PEAK * 100).toFixed(1)}% FS`
    }

    /***
     * Largest step between neighbouring samples. A loop join at or below this
     * is indistinguishable from the waveform's own motion.
     */
    steepestStep() {
        let steepest = 0
        for (let i = 1; i < this.data.length; i++) {
            const step = Math.abs(this.data[i] - this.data[i - 1])
            if (step > steepest) steepest = step
        }
        return steepest
    }

    /***
     * Best place to cut the end so the wavesample loops without clicking.
     *
     * Looping plays ...data[end-1] then wraps to data[0], so the join is only
     * silent when those two samples nearly meet. Searches the last `fraction`
     * of the buffer and returns the cheapest cut, scanning backwards so that
     * candidates of equal cost resolve to the one that throws away least.
     */
    findLoopTrim(fraction = 0.1) {
        const n = this.data.length
        if (n < 8) return null
        const first = this.data[0]
        const startSlope = this.data[1] - this.data[0]
        // Never search below index 2, so the slope lookback stays in range.
        const earliest = Math.max(2, Math.floor(n * (1 - fraction)))

        let bestEnd = n
        let bestCost = Infinity
        for (let end = n; end >= earliest; end--) {
            const last = this.data[end - 1]
            const endSlope = last - this.data[end - 2]
            const cost = Math.abs(first - last)
                + WaveEditor.LOOP_SLOPE_WEIGHT * Math.abs(startSlope - endSlope)
            if (cost < bestCost) {
                bestCost = cost
                bestEnd = end
            }
        }

        // A join no bigger than the waveform's own steepest step is already
        // inaudible, so leave it alone rather than spending samples chasing a
        // smaller number. Without this, a cleanly generated wave that already
        // loops gets needlessly shortened.
        if (Math.abs(first - this.data[n - 1]) <= this.steepestStep()) {
            bestEnd = n
        }

        return {
            end: bestEnd,
            removed: n - bestEnd,
            wrapBefore: Math.abs(first - this.data[n - 1]),
            wrapAfter: Math.abs(first - this.data[bestEnd - 1])
        }
    }

    /***
     * Applies findLoopTrim. Intended for hand edited and imported material;
     * generated waveforms already hold a whole number of cycles and loop clean.
     */
    removeLoopClick(fraction = 0.1) {
        if (this.readOnly) return null
        const result = this.findLoopTrim(fraction)
        if (!result) return null
        if (result.removed > 0) {
            this.snapshotAll()
            this.data.splice(result.end, this.data.length - result.end)
            this.afterLengthChange()
        }
        this.status = result.removed > 0
            ? `trimmed ${result.removed}, join ${result.wrapBefore} &rarr; ${result.wrapAfter}`
            : `already the best join in the last ${Math.round(fraction * 100)}%`
        this.syncControls()
        return result
    }

    /***
     * Removes the selected samples and closes the gap.
     */
    deleteSelection() {
        if (!this.selection || this.data.length === 0) return
        const count = this.selection.end - this.selection.start
        if (count <= 0 || count >= this.data.length) return

        // Remember where the middle of the doomed span sits across the view, so
        // the splice that replaces it can be put back in the same place. Without
        // this the view zooms out and you lose your position after every cut.
        // Clamped in case the selection was made at a different zoom and its
        // centre is currently off screen.
        const centre = (this.selection.start + this.selection.end) / 2
        const fraction = this.viewLength > 0
            ? Math.max(0, Math.min(1, (centre - this.viewStart) / this.viewLength))
            : 0.5
        const spliceIndex = this.selection.start

        this.snapshotAll()
        this.data.splice(this.selection.start, count)
        this.afterLengthChange({ index: spliceIndex, fraction: fraction })
    }

    /***
     * Keeps only the selection, dropping everything either side. Trims the tail
     * first so the head offsets stay valid.
     */
    trimToSelection() {
        if (!this.selection || this.data.length === 0) return
        const start = this.selection.start
        const end = this.selection.end
        if (end - start < 2 || (start === 0 && end === this.data.length)) return
        this.snapshotAll()
        this.data.splice(end, this.data.length - end)
        this.data.splice(0, start)
        this.afterLengthChange()
    }

    /***
     * `focus` is optional: give it a sample index and the 0..1 position across
     * the view where that index should land, and the current zoom is kept.
     * Without it the view fits the whole buffer, which is what trims want.
     */
    afterLengthChange(focus) {
        this.selection = null
        this.status = ''
        // Period markers described the old buffer, so they no longer line up.
        this.periodSamples = 0
        if (focus && this.viewLength < this.data.length) {
            this.viewStart = Math.round(focus.index - focus.fraction * this.viewLength)
            this.clampView()
        } else {
            // Either no focus was asked for, or the buffer now fits the view
            // anyway and there is no zoom left to preserve.
            this.zoomAll()
        }
        this.render()
        this.syncControls()
        this.onChange(this.data)
    }

    /***
     * Whole buffer operations
     */
    apply(name) {
        if (this.readOnly || this.data.length === 0) return
        this.status = ''

        switch (name) {
            case 'selectAll': return this.selectAll()
            case 'clearSelection': return this.clearSelection()
            case 'snapZero': return this.snapSelectionToZeroCrossings()
            case 'trim': return this.trimToSelection()
            case 'delete': return this.deleteSelection()
            case 'loopTrim': return this.removeLoopClick()
            case 'findClick': return this.jumpToNextClick()
        }

        // Everything below works on the selection when there is one, so the
        // highlight means the same thing for every operation. Make Loopable is
        // the exception: it is about the loop join, which is always the ends of
        // the whole wavesample.
        const whole = name === 'loopable' || !this.selection
        const from = whole ? 0 : this.selection.start
        const to = whole ? this.data.length : this.selection.end
        const n = to - from

        this.snapshot(from, n)
        switch (name) {
            case 'normalize': {
                let peak = 0
                for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(this.data[i]))
                if (peak > 0) {
                    const scale = (WaveEditor.PEAK * 0.99) / peak
                    for (let i = from; i < to; i++) this.data[i] = Math.round(this.data[i] * scale)
                }
                break
            }
            case 'invert':
                // Clamped because a WAV can legitimately contain -32768, which
                // has no positive counterpart in 16 bit.
                for (let i = from; i < to; i++) this.data[i] = Math.min(WaveEditor.PEAK, -this.data[i])
                break
            case 'reverse':
                for (let i = 0; i < Math.floor(n / 2); i++) {
                    const head = from + i
                    const tail = to - 1 - i
                    const swap = this.data[head]
                    this.data[head] = this.data[tail]
                    this.data[tail] = swap
                }
                break
            case 'removeDC': {
                let sum = 0
                for (let i = from; i < to; i++) sum += this.data[i]
                const mean = Math.round(sum / n)
                for (let i = from; i < to; i++) {
                    this.data[i] = Math.max(-WaveEditor.PEAK, Math.min(WaveEditor.PEAK, this.data[i] - mean))
                }
                break
            }
            case 'fadeIn':
                for (let i = 0; i < n; i++) this.data[from + i] = Math.round(this.data[from + i] * (i / (n - 1)))
                break
            case 'fadeOut':
                for (let i = 0; i < n; i++) this.data[from + i] = Math.round(this.data[from + i] * (1 - i / (n - 1)))
                break
            case 'silence':
                for (let i = from; i < to; i++) this.data[i] = 0
                break
            case 'loopable': {
                // uploadWavToEPS loops the whole wavesample, so the click comes
                // from the step between the last and first sample. A half cosine
                // correction lands both endpoints on their midpoint without
                // changing the length or adding high frequency content.
                if (n < 2) break
                const half = (this.data[n - 1] - this.data[0]) / 2
                for (let i = 0; i < n; i++) {
                    const shaped = half * Math.cos((Math.PI * i) / (n - 1))
                    this.data[i] = Math.max(-WaveEditor.PEAK,
                        Math.min(WaveEditor.PEAK, Math.round(this.data[i] + shaped)))
                }
                break
            }
            default: {
                // Unknown operation, so drop the snapshot we speculatively took
                // and keep the undo accounting straight.
                const unused = this.undoStack.pop()
                if (unused) this.undoSamples -= unused.before.length
                this.syncControls()
                return
            }
        }
        this.render()
        this.onChange(this.data)
    }

    /***
     * Readout
     *
     * Sits directly under the canvas rather than in the toolbar, where its
     * changing length used to push the buttons about, and where it was a long
     * way from the thing it describes.
     *
     * Two rows, both of a height reserved in the stylesheet whether or not
     * they have anything in them. The top one is what is always there: the
     * length on the left, what the screen is calibrated at on the right. The
     * bottom one is everything that comes and goes — the selected range, and
     * whatever an edit had to say — kept off the top row so that its arrival
     * cannot lengthen a line that something else is sharing.
     */
    buildReadout() {
        const row = document.createElement('div')
        row.className = 'we-readout'

        const top = document.createElement('div')
        top.className = 'we-readout-row'

        this.infoEl = document.createElement('small')
        this.infoEl.className = 'text-muted we-info'

        this.scaleEl = document.createElement('small')
        this.scaleEl.className = 'text-muted we-scale'

        top.appendChild(this.infoEl)
        top.appendChild(this.scaleEl)

        this.detailEl = document.createElement('small')
        this.detailEl.className = 'text-muted we-detail'

        row.appendChild(top)
        row.appendChild(this.detailEl)
        this.canvas.insertAdjacentElement('afterend', row)
        this.readoutEl = row
    }

    /*** Milliseconds, or microseconds once a division is shorter than one. */
    static formatTime(ms) {
        if (ms >= 100) return `${ms.toFixed(0)} ms`
        if (ms >= 1) return `${ms.toPrecision(3)} ms`
        return `${(ms * 1000).toPrecision(3)} µs`
    }

    /***
     * What one division of the graticule is worth, for the right hand end of
     * the readout. The time scale needs a sample rate and is left out without
     * one; the level scale is always known.
     */
    scaleText() {
        if (this.data.length === 0) return ''
        const parts = []
        if (this.sampleRate > 0 && this.viewLength > 0) {
            const ms = (1000 * this.divisionSamples()) / this.sampleRate
            parts.push(`${WaveEditor.formatTime(ms)}/div`)
        }
        parts.push(`${this.divisionDb().toFixed(1)} dBFS/div`)
        const stride = this.periodStride()
        if (stride > 1) parts.push(`cycle marks every ${stride}`)
        return parts.join(' · ')
    }

    /***
     * Toolbar
     */
    buildToolbar(container) {
        const uid = `we${WaveEditor.uid = (WaveEditor.uid || 0) + 1}`
        this.uid = uid

        if (this.readOnly) {
            container.innerHTML = `
                <div class="btn-toolbar we-toolbar mb-1">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" id="${uid}_zoomIn" title="Zoom in"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
                        <button class="btn btn-outline-secondary" id="${uid}_zoomOut" title="Zoom out"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
                        <button class="btn btn-outline-secondary" id="${uid}_zoomAll" title="Fit"><i class="fa-solid fa-arrows-left-right"></i></button>
                    </div>
                    <span class="btn-group btn-group-sm ml-1" id="${uid}_extra"></span>
                </div>
                <input type="range" class="custom-range" id="${uid}_scroll" min="0" max="0" value="0" style="display:none">
            `
        } else {
            container.innerHTML = `
                <div class="btn-toolbar we-toolbar mb-1">
                    <div class="btn-group btn-group-sm mr-1" role="group">
                        <button class="btn btn-secondary" id="${uid}_pen" title="Draw"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-outline-secondary" id="${uid}_line" title="Straight line"><i class="fa-solid fa-ruler"></i></button>
                        <button class="btn btn-outline-secondary" id="${uid}_smooth" title="Smooth brush"><i class="fa-solid fa-water"></i></button>
                        <button class="btn btn-outline-secondary" id="${uid}_select" title="Select a range to trim or delete"><i class="fa-solid fa-arrows-left-right-to-line"></i></button>
                    </div>
                    <div class="btn-group btn-group-sm mr-1">
                        <button class="btn btn-outline-secondary" id="${uid}_zoomIn" title="Zoom in"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
                        <button class="btn btn-outline-secondary" id="${uid}_zoomOut" title="Zoom out"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
                        <button class="btn btn-outline-secondary" id="${uid}_zoomAll" title="Fit"><i class="fa-solid fa-arrows-left-right"></i></button>
                    </div>
                    <div class="btn-group btn-group-sm mr-1">
                        <button class="btn btn-outline-secondary dropdown-toggle" data-toggle="dropdown" id="${uid}_ops">Edit</button>
                        <div class="dropdown-menu">
                            <a class="dropdown-item" href="#" data-op="trim" data-needs-selection="1">Trim to Selection</a>
                            <a class="dropdown-item" href="#" data-op="delete" data-needs-selection="1">Delete Selection</a>
                            <a class="dropdown-item" href="#" data-op="snapZero" data-needs-selection="1">Snap Selection to Zero Crossings</a>
                            <a class="dropdown-item" href="#" data-op="selectAll">Select All</a>
                            <a class="dropdown-item" href="#" data-op="clearSelection" data-needs-selection="1">Clear Selection</a>
                            <div class="dropdown-divider"></div>
                            <a class="dropdown-item" href="#" data-op="normalize">Normalize</a>
                            <a class="dropdown-item" href="#" data-op="findClick">Find Next Click</a>
                            <a class="dropdown-item" href="#" data-op="loopTrim">Remove Loop Click (trim end)</a>
                            <a class="dropdown-item" href="#" data-op="loopable">Make Loopable</a>
                            <a class="dropdown-item" href="#" data-op="removeDC">Remove DC Offset</a>
                            <div class="dropdown-divider"></div>
                            <a class="dropdown-item" href="#" data-op="invert">Invert</a>
                            <a class="dropdown-item" href="#" data-op="reverse">Reverse</a>
                            <a class="dropdown-item" href="#" data-op="fadeIn">Fade In</a>
                            <a class="dropdown-item" href="#" data-op="fadeOut">Fade Out</a>
                            <a class="dropdown-item text-danger" href="#" data-op="silence">Silence</a>
                        </div>
                    </div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" id="${uid}_undo" title="Undo" disabled><i class="fa-solid fa-rotate-left"></i></button>
                    </div>
                    <span class="btn-group btn-group-sm ml-1" id="${uid}_extra"></span>
                </div>
                <input type="range" class="custom-range" id="${uid}_scroll" min="0" max="0" value="0" style="display:none">
            `
        }

        const byId = (suffix) => document.getElementById(`${uid}_${suffix}`)

        byId('zoomIn').addEventListener('click', () => this.zoomBy(0.5))
        byId('zoomOut').addEventListener('click', () => this.zoomBy(2))
        byId('zoomAll').addEventListener('click', () => this.zoomAll())

        this.scrollEl = byId('scroll')
        // Owner injects buffer level controls such as preview here, so they are
        // available whether or not the slot has a generator.
        this.extraEl = byId('extra')
        this.scrollEl.addEventListener('input', () => this.scrollTo(parseInt(this.scrollEl.value, 10)))

        if (!this.readOnly) {
            this.undoEl = byId('undo')
            this.undoEl.addEventListener('click', () => this.undo())

            const tools = [
                { id: 'pen', tool: WaveEditor.PEN },
                { id: 'line', tool: WaveEditor.LINE },
                { id: 'smooth', tool: WaveEditor.SMOOTH },
                { id: 'select', tool: WaveEditor.SELECT }
            ]
            for (const entry of tools) {
                byId(entry.id).addEventListener('click', () => {
                    this.tool = entry.tool
                    this.canvas.style.cursor = entry.tool === WaveEditor.SELECT ? 'text' : 'crosshair'
                    for (const other of tools) {
                        const element = byId(other.id)
                        element.classList.toggle('btn-secondary', other.tool === entry.tool)
                        element.classList.toggle('btn-outline-secondary', other.tool !== entry.tool)
                    }
                })
            }

            this.selectionItems = Array.from(container.querySelectorAll('[data-needs-selection]'))
            for (const item of container.querySelectorAll('[data-op]')) {
                item.addEventListener('click', (event) => {
                    event.preventDefault()
                    if (item.classList.contains('disabled')) return
                    this.apply(item.getAttribute('data-op'))
                })
            }
        }

        this.syncControls()
    }

    syncControls() {
        if (this.undoEl) this.undoEl.disabled = this.undoStack.length === 0
        if (this.selectionItems) {
            for (const item of this.selectionItems) {
                item.classList.toggle('disabled', this.selection == null)
            }
        }
        if (this.scrollEl) {
            const max = Math.max(0, this.data.length - this.viewLength)
            this.scrollEl.max = max
            this.scrollEl.value = this.viewStart
            this.scrollEl.style.display = max > 0 ? '' : 'none'
        }
        if (this.infoEl) {
            let text = ''
            if (this.data.length > 0) {
                text = `${this.data.length} samples`
                if (this.viewLength < this.data.length) {
                    text += ` &middot; viewing ${this.viewStart}–${this.viewStart + this.viewLength}`
                }
            }
            this.infoEl.innerHTML = text
        }
        if (this.detailEl) {
            // The second row: the two readings that are not always there. Empty
            // is the usual state and costs nothing, since the row is reserved.
            const parts = []
            if (this.data.length > 0 && this.selection) {
                parts.push(`selected ${this.selection.start}–${this.selection.end}`
                    + ` (${this.selection.end - this.selection.start})`)
            }
            if (this.data.length > 0 && this.status) parts.push(this.status)
            this.detailEl.innerHTML = parts.length ? `<b>${parts.join(' &middot; ')}</b>` : ''
        }
        if (this.scaleEl) {
            this.scaleEl.innerHTML = this.scaleText()
            // The linear scale caveat belongs somewhere, and a tooltip is the
            // one place it can live without crowding the number.
            this.scaleEl.title = this.data.length === 0 ? ''
                : `One division is ${Math.round(this.divisionCounts())} of `
                    + `${WaveEditor.PEAK}, so a waveform peaking exactly one `
                    + `division from the centre line sits at `
                    + `${this.divisionDb().toFixed(1)} dBFS. The vertical scale `
                    + `is linear, so the divisions above that are not evenly `
                    + `spaced in dB.`
        }
    }
}
