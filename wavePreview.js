/***
 * Web Audio preview of a wavesample, so you can hear a waveform before
 * committing to a slow MIDI upload.
 *
 * The buffer is created at the EPS's own sample rate and the browser resamples
 * it, which means a wave generated for 22.3kHz previews at the pitch it will
 * actually play on the synth.
 */
class WavePreview {

    static context = null

    /***
     * Only one slot previews at a time, otherwise several looping waveforms
     * stack on top of each other.
     */
    static current = null

    static getContext() {
        if (!WavePreview.context) {
            WavePreview.context = new (window.AudioContext || window.webkitAudioContext)()
        }
        return WavePreview.context
    }

    constructor() {
        this.source = null
        this.gain = null
        // Set by the owner so its play/stop button can follow the real state,
        // including when this preview is interrupted by another one.
        this.onStateChange = () => {}
    }

    get isPlaying() {
        return this.source != null
    }

    /***
     * Loop the whole wavesample, matching how uploadWavToEPS() sets loop start
     * to 0 and loop end to the sample length.
     */
    async play(wavesample, sampleRate) {
        if (WavePreview.current && WavePreview.current !== this) {
            WavePreview.current.stop()
        }
        this.stop()
        if (!wavesample || wavesample.length < 2) return false

        const context = WavePreview.getContext()
        if (context.state === 'suspended') {
            await context.resume()
        }

        const buffer = context.createBuffer(1, wavesample.length, sampleRate)
        const channel = buffer.getChannelData(0)
        for (let i = 0; i < wavesample.length; i++) {
            channel[i] = wavesample[i] / 32767
        }

        // Short ramps either side, otherwise starting and stopping clicks.
        this.gain = context.createGain()
        this.gain.gain.setValueAtTime(0, context.currentTime)
        this.gain.gain.linearRampToValueAtTime(0.8, context.currentTime + 0.01)
        this.gain.connect(context.destination)

        const source = context.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.loopStart = 0
        source.loopEnd = buffer.duration
        source.connect(this.gain)
        // Compare identity, otherwise a quick stop/restart lets the old source's
        // ended event tear down the new one.
        source.onended = () => {
            if (this.source === source) {
                this.source = null
                this.onStateChange(false)
            }
        }
        source.start()
        this.source = source
        WavePreview.current = this
        this.onStateChange(true)
        return true
    }

    stop() {
        if (WavePreview.current === this) WavePreview.current = null
        if (!this.source) return
        const context = WavePreview.getContext()
        const source = this.source
        const gain = this.gain
        this.source = null
        this.gain = null
        this.onStateChange(false)
        if (gain) {
            gain.gain.cancelScheduledValues(context.currentTime)
            gain.gain.setValueAtTime(gain.gain.value, context.currentTime)
            gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.01)
        }
        try {
            source.stop(context.currentTime + 0.02)
        } catch (e) {
            // already stopped
        }
    }

    async toggle(wavesample, sampleRate) {
        if (this.isPlaying) {
            this.stop()
            return false
        }
        return await this.play(wavesample, sampleRate)
    }
}
