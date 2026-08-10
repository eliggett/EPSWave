/***
 * The debug panel: the controls that drive the probes in epsProbe.js.
 *
 * Built from JavaScript rather than written into both pages, for the reason
 * given at the top of epswave.js — two copies of a hundred and fifty lines of
 * markup stay in step for about a week. Each page carries an empty
 * `<div id="debugPanel">` and this fills it.
 *
 * WHAT THE LAYOUT IS FOR
 *
 * The panel is arranged in the order a session should actually run, top to
 * bottom, because the person driving it may be reading these controls for the
 * first time with a borrowed synth in front of them and no second chance:
 *
 *   1. Session — who and what, written into the capture before anything else.
 *   2. Capture — started first, so nothing that follows goes unrecorded.
 *   3. Probe A, blocks — read-only, so it runs before anything can go wrong.
 *   4. Probe B, parameters — read-only, and the differential controls with it.
 *   5. Probe C, wavedata — the read half safe, the write half behind a
 *      confirmation because it destroys the audio it is pointed at.
 *   6. Manual — the escape hatch for the question nobody anticipated.
 *
 * Every control that a probe reads is a field here rather than a constant in
 * the source, because the values that matter most are exactly the ones nobody
 * can be sure of in advance: how long to wait for a machine that may be slower,
 * how much of the parameter space to sweep, how many samples are enough. Being
 * able to change those without an edit and a reload is the difference between
 * following a hunch during the session and writing it down for next time.
 */
window.EPSProbeUI = {

    eps: null,
    capture: null,
    probe: null,
    lastBlocks: null,
    // Page/item pairs that answered in the most recent full sweep. Snapshots
    // re-read just these; see the sweep() helper for why only full sweeps are
    // allowed to write it.
    liveSet: null,
    snapshots: {},

    /***
     * Builds and wires the panel, if the page has somewhere to put it.
     *
     * Called unconditionally from page start up; a page without a #debugPanel
     * simply gets nothing, which is the same opt-in-by-markup rule the rest of
     * EPSWaveUI follows.
     */
    init(eps){
        const host = document.getElementById("debugPanel")
        if(!host) return
        this.eps = eps
        host.innerHTML = EPSProbeUI.markup()
        this.wire()
    },

    /*** Shorthand for the fields, since every handler reads several. */
    val(id, fallback = ""){
        const element = document.getElementById(id)
        if(!element) return fallback
        return element.value
    },
    num(id, fallback){
        const parsed = parseInt(this.val(id), 10)
        return isNaN(parsed) ? fallback : parsed
    },
    hex(id, fallback){
        const text = String(this.val(id)).trim().replace(/^[$#]|^0x/i, "")
        const parsed = parseInt(text, 16)
        return isNaN(parsed) ? fallback : parsed
    },
    checked(id){
        const element = document.getElementById(id)
        return element ? element.checked : false
    },

    say(message){
        if(window.log) window.log(message)
    },

    /***
     * The status line and the progress bar are one call in EPSWaveUI and two
     * hooks in EPSProbe, so the two halves are held here and both are always
     * passed.
     *
     * Without this they erase each other: `status(text)` defaults the
     * percentage to null and sends the bar back to idle, and `status(null,
     * percent)` blanks the line. A probe that reports its step and its
     * percentage separately — which is every probe, because the step changes
     * once per command and the percentage changes constantly — would spend the
     * whole run flickering between a bar with no caption and a caption with no
     * bar.
     */
    shown: { text: "", percent: null },

    showStatus(text, percent){
        if(text !== undefined) this.shown.text = text
        if(percent !== undefined) this.shown.percent = percent
        EPSWaveUI.status(this.shown.text, this.shown.percent)
    },

    /***
     * Everything that talks to the synth goes through here.
     *
     * startTransfer is the page-wide "one conversation at a time" lock: the EPS
     * answers a command with a bare acknowledgement carrying nothing to say
     * which command it belongs to, so two overlapping exchanges are not slow,
     * they are unreadable. The probes are the longest running things on the
     * page and would be the easiest to start twice.
     */
    async guarded(what, body){
        const release = EPSWaveUI.startTransfer(what)
        if(!release){
            this.say(`Error: ${EPSWaveUI.transferring} is already running`)
            return null
        }
        $("#probeStop").prop("disabled", false)
        // startTransfer has already put `what` on the line and the bar at zero;
        // matching them here means the probe's first status call does not
        // inherit a percentage from the run before it.
        this.shown = { text: what, percent: 0 }
        try{
            return await body()
        }catch(error){
            this.say(`Error: ${error.message}`)
            this.showStatus(`Stopped: ${error.message}`, null)
            return null
        }finally{
            $("#probeStop").prop("disabled", true)
            release(`${what} finished`)
        }
    },

    /***
     * A probe cannot run before there is somewhere to record it.
     *
     * This is the one piece of enforced sequencing in the panel. Everything
     * else is advice; this is a refusal, because a probe run that was not
     * captured has produced nothing at all and the person running it would have
     * no way to know that until they got home.
     */
    ready(){
        if(this.capture && this.capture.open) return true
        this.say("Error: start the capture first — a probe that is not being recorded "
            + "produces nothing to take away.")
        this.showStatus("Start the capture first", null)
        return false
    },

    /*** "04 08 0C" from a list of page bytes. */
    pageList(bytes){
        return bytes.map(byte => EPSProbeUI.h2(byte)).join(" ")
    },

    /***
     * The guided sequence: what to ask somebody to change, and why.
     *
     * WHY EACH OF THESE AND NOT SOMETHING EASIER
     *
     * Turning any knob at all would produce a diff, and most of them would tell
     * us nothing we do not already have written down. Each step here settles a
     * specific place where the two references we have actively contradict each
     * other, ordered by how much damage the disagreement does if we guess wrong.
     * `why` is shown to the operator, because somebody who understands what a
     * step is for makes better judgement calls than somebody following a list —
     * they notice when the synth does something unexpected, and they say so.
     *
     * `button` is what to press on the front panel, named as the panel names it.
     * Taken from the button table in reference/code/eps2.0/include/eps.h, which
     * is the Classic's own layout.
     */
    GUIDED_STEPS: [
        {
            id: "ws-pan",
            title: "Wavesample pan",
            button: "6 &middot; Amp",
            what: "Change <b>Pan</b> by a good distance &mdash; from centre to hard "
                + "left, say, or from 0 to -50.",
            why: "This is the disagreement that matters most. Section 7.3 of the "
                + "EPS-16 PLUS manual puts pan in the low half of the wavesample's "
                + "105th word and says the high half is unused. The 1992 library, "
                + "written against a Classic, reads it from the high half. Both "
                + "cannot be right, and if we guess wrong then every instrument "
                + "this app restores to your synth comes back with its stereo "
                + "image scrambled."
        },
        {
            id: "env-l1s",
            title: "Envelope 1, Level 1 Soft",
            button: "1 &middot; Env 1",
            what: "Find <b>Level 1</b> and change its <b>soft</b> value &mdash; the one "
                + "that applies when you play gently. Move it a long way.",
            why: "The 1992 library gives Level 1 Soft and Level 4 Hard the same "
                + "parameter number, which cannot be true of both. The EPS-16 PLUS "
                + "manual says that number is Level 4 Hard and that Level 1 Soft is "
                + "the next one along, a number the library does not list at all. "
                + "This step and the next one together say which is which on your "
                + "machine."
        },
        {
            id: "env-l4h",
            title: "Envelope 1, Level 4 Hard",
            button: "1 &middot; Env 1",
            what: "Now change <b>Level 4</b>'s <b>hard</b> value &mdash; the sustain "
                + "level when you play firmly. Again, move it a long way.",
            why: "The other half of the previous question. If the two steps move "
                + "different numbers, the manual is right and the library has a "
                + "typo. If they move the same number, something stranger is going "
                + "on and we very much want to know."
        },
        {
            id: "root-key",
            title: "Root key",
            button: "4 &middot; Pitch",
            what: "Change the <b>root key</b> by an octave or so.",
            why: "The app writes this every time it sends a wavesample, so it has "
                + "to be right. Both references agree on where it lives, which "
                + "makes this the step that confirms the others are being read "
                + "correctly rather than a step that discovers anything."
        },
        {
            id: "layer-velocity",
            title: "Layer velocity range",
            button: "9 &middot; Layer",
            what: "Change <b>velocity low</b> from 0 to something well above it, 64 "
                + "for instance.",
            why: "On the EPS-16 PLUS the layer's settings are packed two to a word, "
                + "with parameters the Classic never had sharing space with ones it "
                + "did. If that packing differs on your machine, every layer this "
                + "app writes would land wrong, and the key ranges are where it "
                + "would show first."
        },
        {
            id: "inst-transpose",
            title: "Instrument transpose",
            button: "Instrument",
            what: "Change the <b>transpose</b> amount by a few semitones.",
            why: "Transposition is stored as a signed value, and signed values are "
                + "where two machines most often disagree about which half of a "
                + "word a number lives in. It is also the last instrument-level "
                + "setting before the block turns into a table of memory "
                + "addresses."
        }
    ],

    wire(){
        const eps = this.eps

        // Filled from the class rather than written into the markup, so the
        // field and EPS16.PARAMETER_PAGES cannot drift apart.
        $("#sweepPages").val(EPSProbeUI.pageList(EPS16.instrumentPages()))
        $("#sweepPagesInstrument").click(() =>
            $("#sweepPages").val(EPSProbeUI.pageList(EPS16.instrumentPages())))
        $("#sweepPagesAll").click(() =>
            $("#sweepPages").val(EPSProbeUI.pageList(EPS16.allParameterPages())))

        $("#captureStart").click(async () => {
            if(this.capture && this.capture.open){
                this.say("The capture is already running")
                return
            }
            this.capture = new EPSCapture({
                rawBudget: this.num("captureBudget", 16) * 1024 * 1024,
                onError: (message) => this.say(`Error: ${message}`)
            })
            const meta = {
                model: EPSWaveUI.model(),
                modelLabel: EPSWaveUI.modelLabel(),
                operator: this.val("sessionOperator"),
                osVersion: this.val("sessionOs"),
                instrumentLoaded: this.val("sessionInstrument"),
                efeFile: this.val("sessionEfe"),
                notes: this.val("sessionNotes"),
                baseChannel: eps.baseChannel,
                midiIn: eps.input || null,
                midiOut: eps.output || null,
                blockSizeSamples: eps.chunkSize
            }
            const started = await this.capture.begin(meta)
            if(this.probe){
                // A second capture in the same session reuses the probe and
                // only swaps where it writes. Building a new one would call
                // attach() again, and attach() wraps the page's MIDI callback:
                // wrapping a wrapper means every packet recorded twice, and the
                // duplicate would look like the synth had answered twice.
                this.probe.capture = this.capture
            }else{
                this.probe = new EPSProbe(eps, this.capture, {
                    status: (text) => this.showStatus(text, undefined),
                    progress: (percent) => this.showStatus(undefined, percent),
                    log: (text) => this.say(text)
                })
                // Wrapping has to happen after the page installed its own
                // callbacks, which it does at start up, so it happens here and
                // not in init.
                this.probe.attach()
            }
            $("#captureState").html(started.live
                ? "Recording to the file you chose, as it goes."
                : "Recording in memory. The browser would not open a file, so use "
                    + "<b>Download capture</b> at every checkpoint and before closing this tab.")
                .removeClass("alert-secondary").addClass(started.live ? "alert-success" : "alert-warning")
            this.say(`Capture started (${started.live ? "live file" : "in memory"})`)
            this.showStatus("Capture started", null)
            this.refreshStats()
        })

        $("#captureDownload").click(() => {
            if(!this.capture) return this.say("Error: no capture has been started")
            const name = this.capture.download()
            this.say(`Capture written to ${name}`)
        })

        $("#captureFinish").click(async () => {
            if(!this.capture || !this.capture.open) return this.say("Error: no capture is running")
            await this.capture.finish(this.val("sessionNotes"))
            if(!this.capture.stats().live) this.capture.download()
            this.say("Capture closed")
            $("#captureState").html("Closed.").removeClass("alert-success alert-warning")
                .addClass("alert-secondary")
            this.refreshStats()
        })

        $("#captureNoteAdd").click(() => {
            if(!this.capture || !this.capture.open) return this.say("Error: no capture is running")
            const text = this.val("captureNote").trim()
            if(!text) return
            this.capture.note(text, { source: "operator" })
            this.say(`Noted: ${text}`)
            $("#captureNote").val("")
            this.refreshStats()
        })

        $("#probeStop").click(() => {
            if(this.probe) this.probe.abort()
            this.say("Stop requested — the probe will end after the command in flight")
        })

        // ---- Probe A ----------------------------------------------------
        $("#probeBlocks").click(async () => {
            if(!this.ready()) return
            const which = this.val("blocksInstruments", "current").trim()
            const instruments = which.toLowerCase() == "all"
                ? Array.from({ length: EPS16.INSTRUMENT_COUNT }, (_, i) => i)
                : (which.toLowerCase() == "current" || which == ""
                    ? [eps.instNum]
                    : which.split(/[,\s]+/).map(n => parseInt(n, 10) - 1)
                        .filter(n => n >= 0 && n < EPS16.INSTRUMENT_COUNT))
            if(instruments.length == 0) return this.say("Error: no valid instrument numbers")

            await this.guarded("Block dump", async () => {
                this.lastBlocks = await this.probe.probeBlocks({
                    instruments,
                    gapMs: this.num("blocksGap", 150),
                    wsScanLimit: this.num("blocksScan", 8)
                })
                $("#probeCompare").prop("disabled", false)
                this.refreshStats()
                return this.lastBlocks
            })
        })

        $("#probeCompare").click(() => $("#compareEfeFile").click())
        $("#compareEfeFile").change(function(){
            if(this.files && this.files[0]) EPSProbeUI.compare(this.files[0])
            this.value = ""
        })

        // ---- Probe B ----------------------------------------------------
        /***
         * One sweep.
         *
         * `narrow` asks for the shortcut: re-read only the numbers a previous
         * full sweep found to be live. It is honoured only once such a sweep
         * has happened, so the first press is always a full one and establishes
         * the set — which means the buttons work in any order without anybody
         * having to press a particular one first.
         *
         * Only full sweeps update the remembered set. A narrowed sweep can by
         * construction only return a subset, so letting one write the set back
         * would shrink it a little on every press until there was nothing left
         * to compare.
         */
        const sweep = async (label, narrow = false) => {
            if(!this.ready()) return null
            const only = narrow && this.liveSet && this.liveSet.length ? this.liveSet : null
            if(narrow && !only){
                this.say("No full sweep yet, so this one covers the whole range and "
                    + "becomes the baseline for the quick ones after it.")
            }
            const result = await this.guarded(
                `Parameter sweep (${label})${only ? " — narrowed" : ""}`, () =>
                this.probe.probeParameters({
                    pages: EPSProbeUI.parseBytes(this.val("sweepPages")).length
                        ? EPSProbeUI.parseBytes(this.val("sweepPages")) : undefined,
                    itemFrom: this.hex("sweepItemFrom", 0x00),
                    itemTo: this.hex("sweepItemTo", 0x1F),
                    timeoutMs: this.num("sweepTimeout", 400),
                    gapMs: this.num("sweepGap", 150),
                    only, label
                }))
            if(result && !result.narrowed){
                this.liveSet = result.live
                $("#sweepLiveCount").text(result.live.length
                    ? `${result.live.length} live parameter numbers remembered; `
                        + `snapshots will re-read just those.`
                    : "No parameters answered, so snapshots will cover the full range.")
            }
            return result
        }

        $("#probeParams").click(async () => {
            const result = await sweep(this.val("sweepLabel", "sweep") || "sweep")
            if(result) this.showSweep(result)
        })

        /***
         * Guided mode: the whole of probe B behind one button.
         *
         * The manual buttons below it do the same work and are how this was
         * built, but they ask somebody to hold a procedure in their head —
         * sweep, then A, then change one thing, then note it, then B, and
         * remember that B becomes the next A. That is four things to get right
         * per control, on a borrowed machine, probably once.
         *
         * Here the app holds the procedure and the operator holds the synth.
         * Each step says what to change and why it matters, and offers to skip
         * it, because somebody may not have that control, may not find it, or
         * may simply have had enough — and a skipped step recorded as skipped
         * is worth far more than a step somebody guessed at.
         */
        $("#probeGuided").click(async () => {
            if(!this.ready()) return
            await this.guarded("Guided testing", async () => {
                const options = () => ({
                    pages: EPSProbeUI.parseBytes(this.val("sweepPages")).length
                        ? EPSProbeUI.parseBytes(this.val("sweepPages")) : undefined,
                    itemFrom: this.hex("sweepItemFrom", 0x00),
                    itemTo: this.hex("sweepItemTo", 0x1F),
                    timeoutMs: this.num("sweepTimeout", 400),
                    gapMs: this.num("sweepGap", 150)
                })

                const full = await this.probe.probeParameters({ ...options(), label: "guided" })
                if(!full) return null
                if(full.crashedAt){
                    this.say("Guided testing stopped: the synth stopped answering during the "
                        + "first sweep. Nothing further was attempted.")
                    return full
                }
                this.liveSet = full.live
                this.showSweep(full)
                $("#sweepLiveCount").text(`${full.live.length} live parameter numbers `
                    + `remembered; each step below re-reads just those.`)

                const where = this.probe.addressing()
                const target = `instrument ${where.instrument + 1}, layer ${where.layer + 1}, `
                    + `wavesample ${where.wavesample}`

                let baseline = await this.probe.probeParameters(
                    { ...options(), only: this.liveSet, label: "guided-start" })
                if(!baseline) return null

                const done = []
                for(let index = 0; index < EPSProbeUI.GUIDED_STEPS.length; index++){
                    const step = EPSProbeUI.GUIDED_STEPS[index]
                    this.showStatus(`Guided testing: waiting for you — ${step.title}`, null)
                    const choice = await EPSWaveUI.choose(
                        `Step ${index + 1} of ${EPSProbeUI.GUIDED_STEPS.length}: `
                            + EPSProbeUI.escape(step.title),
                        `<p class="mb-2"><b>On the synth, press `
                            + `<span class="text-info">${step.button}</span>.</b></p>`
                        + `<p class="mb-3">${step.what}</p>`
                        + `<div class="alert alert-secondary py-2 mb-3"><small>`
                            + `<b>Make sure you are editing ${EPSProbeUI.escape(target)}</b> `
                            + `&mdash; that is what this app is reading, and a change made to a `
                            + `different wavesample will simply not show up.</small></div>`
                        + `<p class="mb-2"><small><b>Why this one:</b> ${step.why}</small></p>`
                        + `<p class="mb-0"><small>When you have changed it, press Continue and `
                            + `the app will work out which number moved. It takes a few `
                            + `seconds.</small></p>`,
                        [
                            { id: "stop", label: "Stop guided testing", class: "btn-outline-danger" },
                            { id: "skip", label: "Skip this one", class: "btn-outline-secondary" },
                            { id: "go", label: "I changed it &mdash; Continue", class: "btn-primary" }
                        ])

                    if(choice != "go"){
                        // Recorded either way. "Nobody tried this" and "somebody
                        // tried it and nothing moved" are different results, and
                        // a capture that cannot tell them apart is misleading.
                        this.capture.note(choice == "skip"
                            ? `Skipped: ${step.title}` : `Stopped guided testing at: ${step.title}`,
                            { step: step.id, outcome: choice || "dismissed" })
                        this.say(choice == "skip"
                            ? `Skipped ${step.title}`
                            : `Guided testing stopped at ${step.title}`)
                        if(choice == "skip") continue
                        break
                    }

                    const after = await this.probe.probeParameters(
                        { ...options(), only: this.liveSet, label: step.id })
                    if(!after) break
                    const diff = this.probe.diffParameters(baseline, after, step.title)
                    this.showDiff(diff)
                    done.push({ step: step.id, moved: diff.changes.length })
                    if(diff.changes.length == 0){
                        this.say(`Nothing moved for ${step.title}. That is a result too — it may `
                            + `mean this control is not reachable over MIDI on this machine, or `
                            + `that the change landed on a different wavesample.`)
                    }
                    // Each sweep becomes the starting point for the next, so
                    // every further step costs one sweep rather than two.
                    baseline = after
                    if(after.crashedAt){
                        this.say("Guided testing stopped: the synth stopped answering.")
                        break
                    }
                }

                this.capture.event("finding", { probe: "guided", steps: done,
                    offered: EPSProbeUI.GUIDED_STEPS.length })
                this.say(`Guided testing finished: ${done.length} of `
                    + `${EPSProbeUI.GUIDED_STEPS.length} steps completed`
                    + (done.length ? `, ${done.filter(d => d.moved > 0).length} of which `
                        + `moved something.` : "."))
                return full
            })
        })

        $("#probeSnapshotA").click(async () => {
            const result = await sweep("A", this.checked("sweepNarrow"))
            if(!result) return
            this.snapshots.A = result
            this.say(`Snapshot A taken: ${result.answered} parameters answered. `
                + `Now change ONE thing on the synth's front panel, write down what it was `
                + `in the note box, then take snapshot B.`)
            $("#probeSnapshotB").prop("disabled", false)
        })

        $("#probeSnapshotB").click(async () => {
            if(!this.snapshots.A) return this.say("Error: take snapshot A first")
            const result = await sweep("B", this.checked("sweepNarrow"))
            if(!result) return
            this.snapshots.B = result
            // Filed with the comparison rather than as a note of its own, so
            // the numbers that moved and the thing that moved them are one
            // record. A note added separately is a note that can end up next to
            // the wrong diff.
            const changed = this.val("sweepChange").trim()
            if(!changed){
                this.say("No change note given. The diff below records which numbers moved, "
                    + "but not what you moved — which is the half that cannot be recovered later.")
            }
            const diff = this.probe.diffParameters(this.snapshots.A, result, changed)
            this.showDiff(diff)
            // Cleared so the next control cannot inherit this one's description,
            // which would be worse than having no description at all.
            $("#sweepChange").val("")
            // B becomes the new baseline, so a run of changes can be walked one
            // at a time without re-sweeping twice for each. Fifteen of these is
            // the realistic budget for a session and halving the sweeps is the
            // difference between fifteen and seven.
            this.snapshots.A = result
            this.say("Snapshot B is now the baseline — change the next thing and press B again.")
        })

        // ---- Probe C ----------------------------------------------------
        $("#probeWaveRead").click(async () => {
            if(!this.ready()) return
            const result = await this.guarded("Wavedata read probe", () =>
                this.probe.probeWavedata({
                    write: false,
                    instrument: this.num("waveInstrument", 1) - 1,
                    length: this.num("waveLength", 4096)
                }))
            if(result) this.showWavedata(result)
        })

        $("#probeWaveWrite").click(async () => {
            if(!this.ready()) return
            // The target is found before the question is asked, not after, so
            // that the dialog can name the wavesample it is about to destroy.
            // Asking "overwrite something in instrument 1?" and working out
            // what only afterwards is asking consent for an unknown.
            const result = await this.guarded("Wavedata round trip", async () => {
                const target = await this.probe.findWavedataTarget(
                    this.num("waveInstrument", 1) - 1)
                const ok = await EPSWaveUI.ask("Overwrite this wavesample?",
                    `<p>The round trip test writes a test pattern over the audio in:</p>`
                    + `<p class="pl-3 mb-2"><b>Instrument ${target.instrument + 1}, `
                    + `layer ${target.layer + 1}, wavesample ${target.wavesample}`
                    + `${target.name ? ` &mdash; &ldquo;${EPSProbeUI.escape(target.name)}&rdquo;` : ""}`
                    + `</b><br><small>${target.sampleEnd.toLocaleString()} samples</small></p>`
                    + `<p class="mb-0">This changes the synth's memory only. Nothing is `
                    + `written to any disk, and reloading this instrument from disk puts `
                    + `the audio back exactly as it was.</p>`,
                    "Overwrite it", "btn-danger")
                if(!ok){
                    this.probe.capture.note("Round trip cancelled at the confirmation",
                        { target: { instrument: target.instrument, layer: target.layer,
                            wavesample: target.wavesample } })
                    this.say("Round trip cancelled — nothing was written")
                    return null
                }
                return this.probe.probeWavedata({
                    write: true, target,
                    length: this.num("waveLength", 4096)
                })
            })
            if(result) this.showWavedata(result)
        })

        // ---- Manual -----------------------------------------------------
        $("#manualGet").click(async () => {
            if(!this.ready()) return
            const page = this.hex("manualPage", 0x0D)
            const item = this.hex("manualItem", 0x00)
            await this.guarded("Get parameter", async () => {
                const answer = await eps.getParameterAt(page, item,
                    this.num("manualTimeout", 1000))
                this.capture.event("manual-get", { page, item, ...answer,
                    statusText: eps.statusText(answer.status) })
                this.say(`GET $${EPSProbeUI.h2(page)}${EPSProbeUI.h2(item)} → `
                    + (answer.value === null
                        ? `no value (${eps.statusText(answer.status)})`
                        : `${answer.value}`))
                return answer
            })
        })

        $("#manualPut").click(async () => {
            if(!this.ready()) return
            const page = this.hex("manualPage", 0x0D)
            const item = this.hex("manualItem", 0x00)
            const value = this.num("manualValue", 0)
            await this.guarded("Put parameter", async () => {
                const before = await eps.getParameterAt(page, item, this.num("manualTimeout", 1000))
                const accepted = await eps.setParameterAt(page, item, value)
                const after = await eps.getParameterAt(page, item, this.num("manualTimeout", 1000))
                this.capture.event("manual-put", { page, item, value, accepted,
                    before: before.value, after: after.value })
                this.say(`PUT $${EPSProbeUI.h2(page)}${EPSProbeUI.h2(item)} = ${value}: `
                    + `${accepted ? "accepted" : "refused"}, value ${before.value} → ${after.value}`)
                return after
            })
        })

        $("#manualSend").click(async () => {
            if(!this.ready()) return
            const bytes = EPSProbeUI.parseBytes(this.val("manualBytes"))
            if(bytes.length == 0) return this.say("Error: no bytes to send")
            const ok = await EPSWaveUI.ask("Send a raw command?",
                `<p>This sends <code>${bytes.map(b => EPSProbeUI.h2(b)).join(" ")}</code> `
                + `inside a sysex frame, with no idea what it does.</p>`
                + `<p class="mb-0">Some command numbers delete instruments or clear wavedata. `
                + `Check the number against section 4 of the specification first.</p>`,
                "Send it", "btn-danger")
            if(!ok) return
            await this.guarded("Raw command", async () => {
                this.capture.event("manual-send", { bytes })
                await eps.sendData(bytes)
                const replies = await eps.readMessages(this.num("manualTimeout", 1000))
                this.capture.event("manual-reply", {
                    replies: replies.map(r => Array.from(r)) })
                this.say(`Raw command sent, ${replies.length} repl${replies.length == 1 ? "y" : "ies"}`
                    + (replies.length ? `: ${replies.map(r => eps.statusText(
                        eps.responseStatus(r))).join("; ")}` : ""))
                return replies
            })
        })

        setInterval(() => this.refreshStats(), 2000)
    },

    refreshStats(){
        if(!this.capture) return
        const stats = this.capture.stats()
        $("#captureStats").html(`${stats.events.toLocaleString()} events, `
            + `${(stats.bytes / 1024).toFixed(0)} KB written, `
            + `${(stats.rawBytes / 1024).toFixed(0)} KB of raw MIDI`
            + (stats.rawTruncated ? " <b>(raw budget reached)</b>" : ""))
    },

    /***
     * The closed loop: what the synth just said against what the same
     * instrument looks like in a file this project already reads.
     */
    compare(file){
        if(!this.lastBlocks) return this.say("Error: run the block dump first")
        const reader = new FileReader()
        reader.onload = () => {
            try{
                const efe = EPSEfe.parse(reader.result)
                const instrument = EPSEfe.readInstrument(efe)
                this.capture.note(`Comparing against ${file.name}`,
                    { efe: { name: efe.name, blocks: efe.sizeBlocks } })
                const report = this.probe.compareWithEfe(this.lastBlocks, instrument)
                this.showCompare(report, file.name)
            }catch(error){
                this.say(`Error: ${file.name}: ${error.message}`)
            }
        }
        reader.onerror = () => this.say(`Error: could not read ${file.name}`)
        reader.readAsArrayBuffer(file)
    },

    showCompare(report, filename){
        const row = (entry) => `<tr><td>${entry.label}</td>`
            + `<td>${entry.missing ? "&mdash;" : entry.synthWords + " / " + entry.fileWords}</td>`
            + `<td>${entry.missing ? "not in the file"
                : (entry.identical ? "<b>identical</b>"
                    : entry.differing.slice(0, 12).map(d => d.word).join(", ")
                        + (entry.differing.length > 12 ? ` &hellip; (${entry.differing.length})` : ""))}</td></tr>`
        $("#probeOutput").html(`<h6 class="mb-2">Synth vs ${EPSProbeUI.escape(filename)}</h6>`
            + `<p class="mb-2"><small>${EPSProbeUI.escape(report.summary)}. `
            + `Instrument words 29 and up are RAM pointers and are expected to differ.</small></p>`
            + `<table class="table table-sm table-bordered mb-0"><thead><tr>`
            + `<th>Block</th><th>Words synth / file</th><th>Differing word offsets</th>`
            + `</tr></thead><tbody>`
            + row(report.instrument)
            + report.layers.map(row).join("")
            + report.wavesamples.map(row).join("")
            + `</tbody></table>`).show()
    },

    showSweep(result){
        const live = result.values.filter(v => v.value !== null)
        const byPage = {}
        for(const record of live){
            byPage[record.page] = byPage[record.page] || []
            byPage[record.page].push(record)
        }
        const pages = Object.keys(byPage).map(page => `<tr><td>$${EPSProbeUI.h2(page)}</td>`
            + `<td>${byPage[page].length}</td>`
            + `<td><small>${byPage[page].map(r => `$${EPSProbeUI.h2(r.item)}=${r.value}`)
                .join(", ")}</small></td></tr>`).join("")
        $("#probeOutput").html(`<h6 class="mb-2">Parameter sweep "${EPSProbeUI.escape(result.label)}"</h6>`
            + `<p class="mb-2"><small>${live.length} of ${result.tried} numbers returned a value.</small></p>`
            + (pages
                ? `<table class="table table-sm table-bordered mb-0"><thead><tr>`
                    + `<th>Page</th><th>Live</th><th>Item = value</th></tr></thead>`
                    + `<tbody>${pages}</tbody></table>`
                : `<p class="mb-0">Nothing answered. Check the base channel and that sysex is on.</p>`))
            .show()
    },

    showDiff(diff){
        const where = diff.addressing || {}
        $("#probeOutput").html(`<h6 class="mb-2">What moved between sweeps</h6>`
            + (where.same === false
                ? `<p class="mb-2 text-danger"><b>These two sweeps were taken against `
                    + `different instruments, layers or wavesamples.</b> What moved below is `
                    + `that change of subject, not the control you changed. Re-take both `
                    + `snapshots without changing the selection in between.</p>`
                : "")
            + (diff.changed
                ? `<p class="mb-2">You changed: <b>${EPSProbeUI.escape(diff.changed)}</b></p>`
                : `<p class="mb-2 text-warning"><small>No change note was given, so this table `
                    + `records which numbers moved but not what moved them.</small></p>`)
            + (diff.changes.length == 0
                ? `<p class="mb-0">Nothing changed. Either the control does not go over MIDI, `
                    + `or it is outside the swept page range.</p>`
                : `<table class="table table-sm table-bordered mb-0"><thead><tr>`
                    + `<th>Parameter</th><th>Was</th><th>Now</th><th>Change</th></tr></thead><tbody>`
                    + diff.changes.map(c => `<tr><td>$${EPSProbeUI.h2(c.page)}${EPSProbeUI.h2(c.item)}</td>`
                        + `<td>${c.from}</td><td>${c.to}</td>`
                        + `<td>${c.delta === null ? "&mdash;" : (c.delta > 0 ? "+" : "") + c.delta}</td></tr>`).join("")
                    + `</tbody></table>`
                    + `<p class="mt-2 mb-0"><small>Values that drift on their own — free memory, `
                    + `anything the sequencer touches — turn up here every time. The one you want `
                    + `is the one that moved by the amount you moved the control.</small></p>`))
            .show()
    },

    /***
     * The wavedata result, on screen as well as in the log.
     *
     * Shown because this is the one probe whose answer is a table of numbers
     * rather than a sentence, and because the person running it may want to
     * decide there and then whether to try a different wavesample. The per-bit
     * table is the evidence; the line above it is the conclusion, and they are
     * separated on purpose — see the note in EPSBitDepth.compareRoundTrip about
     * why the bit table alone cannot be read as the answer.
     */
    showWavedata(result){
        const before = result.before
        const t = result.target
        let html = `<h6 class="mb-2">Wavesample data</h6>`
            + `<p class="mb-2"><small>Found and used: instrument ${t.instrument + 1}, `
            + `layer ${t.layer + 1}, wavesample ${t.wavesample}`
            + `${t.name ? ` &mdash; &ldquo;${EPSProbeUI.escape(t.name)}&rdquo;` : ""}. `
            + `${t.sampleEnd.toLocaleString()} samples in it, `
            + `${result.length.toLocaleString()} used.</small></p>`
            + (before.lowestSetBit < 0
                ? `<p class="mb-2"><b>As stored:</b> every sample is zero, which says nothing `
                    + `about the machine. Point the probe at a wavesample holding audio.</p>`
                : `<p class="mb-2"><b>As stored:</b> lowest bit ever set is `
                    + `${before.lowestSetBit}, so about ${before.effectiveBits} significant bits. `
                    + `Low three bits always zero: <b>${before.lowThreeBitsAlwaysZero}</b>.</p>`)

        if(result.roundTrip){
            const c = result.roundTrip.comparison
            html += `<p class="mb-2"><b>Round trip:</b> quantised to ${c.quantum}, `
                + `so ${c.effectiveBits} bits, and the synth <b>${c.behaviour}</b>. `
                + `${c.identical.toLocaleString()} of ${c.compared.toLocaleString()} samples `
                + `came back untouched; error ${c.error.min} to ${c.error.max} `
                + `(99th percentile ${c.error.typicalError}).</p>`
                + `<table class="table table-sm table-bordered mb-0"><thead><tr>`
                + `<th>Bit</th>${c.bits.map(b => `<th>${b.bit}</th>`).join("")}</tr></thead><tbody>`
                + `<tr><td>Altered %</td>${c.bits.map(b =>
                    `<td>${(b.alteredRate * 100).toFixed(0)}</td>`).join("")}</tr>`
                + `</tbody></table>`
                + `<p class="mt-2 mb-0"><small>A machine that rounds carries into higher bits, `
                + `so this row tails off gradually rather than stopping dead. The quantum above `
                + `is the measurement; this row is what it was measured from.</small></p>`
        }
        $("#probeOutput").html(html).show()
    },

    h2(value){ return Number(value).toString(16).toUpperCase().padStart(2, "0") },

    escape(text){
        return String(text).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
    },

    /*** "F0 0F 03" or "f0,0f,03" or "$F0 $0F" — whatever a tired person types. */
    parseBytes(text){
        return String(text).trim().split(/[\s,]+/).filter(part => part.length)
            .map(part => parseInt(part.replace(/^[$#]|^0x/i, ""), 16))
            .filter(value => !isNaN(value) && value >= 0 && value <= 0xFF)
    },

    markup(){
        return `
        <div class="col-sm">
        <div class="card border-warning">
            <div class="card-header d-flex align-items-center">
                <i class="fa-solid fa-flask mr-2"></i>
                <span>Hardware probes</span>
                <button id="probeStop" class="btn btn-outline-danger btn-sm ml-auto py-0" disabled>
                    <i class="fa-solid fa-stop"></i> Stop
                </button>
            </div>
            <div class="card-body">

                <p class="mb-3"><small>Three probes, for the three things about an
                unfamiliar Ensoniq that reading cannot settle: whether its parameter
                blocks are laid out the way this app assumes, what its parameter page
                and item numbers are, and how many bits of each sample it really keeps.
                Everything is recorded as raw MIDI, both directions, so the capture can
                contradict this app's own decoding rather than merely agree with it.
                <b>Work top to bottom.</b></small></p>

                <h6 class="text-uppercase"><small>1 &middot; Session</small></h6>
                <div class="form-row">
                    <div class="col-md-3 mb-2">
                        <input type="text" class="form-control form-control-sm" id="sessionOperator"
                            placeholder="Who is running this">
                    </div>
                    <div class="col-md-3 mb-2">
                        <input type="text" class="form-control form-control-sm" id="sessionOs"
                            placeholder="Synth OS version (boot screen)">
                    </div>
                    <div class="col-md-3 mb-2">
                        <input type="text" class="form-control form-control-sm" id="sessionInstrument"
                            placeholder="Instrument loaded, and from where">
                    </div>
                    <div class="col-md-3 mb-2">
                        <input type="text" class="form-control form-control-sm" id="sessionEfe"
                            placeholder="Matching .EFE file name, if any">
                    </div>
                    <div class="col-12 mb-2">
                        <textarea class="form-control form-control-sm" id="sessionNotes" rows="2"
                            placeholder="Anything else about this machine: memory fitted, SCSI, expansion, quirks"></textarea>
                    </div>
                </div>
                <p class="mb-3"><small><i>The OS version matters. If two captures ever
                disagree, the first question will be whether they came from the same
                firmware, and nothing else in the file can answer it.</i></small></p>

                <h6 class="text-uppercase"><small>2 &middot; Capture</small></h6>
                <div class="form-row align-items-center">
                    <div class="col-auto mb-2">
                        <button id="captureStart" class="btn btn-success btn-sm">
                            <i class="fa-solid fa-record-vinyl"></i> Start capture
                        </button>
                    </div>
                    <div class="col-auto mb-2">
                        <button id="captureDownload" class="btn btn-outline-secondary btn-sm">
                            <i class="fa-solid fa-file-arrow-down"></i> Download capture
                        </button>
                    </div>
                    <div class="col-auto mb-2">
                        <button id="captureFinish" class="btn btn-outline-secondary btn-sm">
                            <i class="fa-solid fa-stop"></i> Finish capture
                        </button>
                    </div>
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="captureBudget">Raw MIDI budget MB</label>
                            </div>
                            <input type="number" class="form-control" id="captureBudget"
                                value="16" min="1" max="256" style="max-width:6rem">
                        </div>
                    </div>
                </div>
                <div id="captureState" class="alert alert-secondary py-2 mb-2">
                    Not started. Chrome will offer to save a file; that file is written to
                    as the session runs and survives a crash. If it does not, the capture
                    is held in memory and must be downloaded before the tab closes.
                </div>
                <div class="form-row align-items-center mb-3">
                    <div class="col">
                        <input type="text" class="form-control form-control-sm" id="captureNote"
                            placeholder="Note into the capture — what you just changed, what the synth displayed, anything odd">
                    </div>
                    <div class="col-auto">
                        <button id="captureNoteAdd" class="btn btn-outline-primary btn-sm">
                            <i class="fa-solid fa-plus"></i> Add note
                        </button>
                    </div>
                    <div class="col-12"><small id="captureStats" class="text-muted"></small></div>
                </div>

                <h6 class="text-uppercase"><small>3 &middot; Probe A &mdash; parameter blocks</small></h6>
                <p class="mb-2"><small>Reads the instrument, every layer and every
                wavesample block, raw. Read-only. Then load the same instrument's
                <code>.EFE</code> file to compare: an EFE is the synth's own RAM image
                on disk, so the two should match word for word, and where they do not
                is exactly what needs knowing.</small></p>
                <div class="form-row align-items-center mb-3">
                    <div class="col-auto mb-2">
                        <button id="probeBlocks" class="btn btn-primary btn-sm eps-transfer">
                            <i class="fa-solid fa-download"></i> Dump blocks
                        </button>
                    </div>
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="blocksInstruments">Instruments</label>
                            </div>
                            <input type="text" class="form-control" id="blocksInstruments"
                                value="current" style="max-width:9rem"
                                title="current, all, or a list like 1,2,5">
                        </div>
                    </div>
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="blocksGap">Gap ms</label>
                            </div>
                            <input type="number" class="form-control" id="blocksGap"
                                value="150" min="0" max="3000" style="max-width:6rem"
                                title="Pause between commands. The reference library uses 200 ms for a Classic; raise this if the machine starts refusing.">
                        </div>
                    </div>
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="blocksScan">Cross-check WS</label>
                            </div>
                            <input type="number" class="form-control" id="blocksScan"
                                value="8" min="0" max="127" style="max-width:6rem"
                                title="Also ask for wavesamples 1..N regardless of what the instrument's offset table claims, so the capture can contradict the table.">
                        </div>
                    </div>
                    <div class="col-auto mb-2">
                        <button id="probeCompare" class="btn btn-outline-primary btn-sm" disabled>
                            <i class="fa-solid fa-code-compare"></i> Compare with .EFE&hellip;
                        </button>
                        <input type="file" id="compareEfeFile" accept=".efe,.EFE" style="display:none">
                    </div>
                </div>

                <h6 class="text-uppercase"><small>4 &middot; Probe B &mdash; parameter numbers</small></h6>
                <p class="mb-2"><small>Asks GET PARAMETER for every page and item in the
                range and records which ones answer. Read-only, and the only probe that
                can find a parameter map &mdash; block dumps never mention a parameter
                number. Then: <b>Snapshot A</b>, change one control on the synth, note
                what you changed, <b>Snapshot B</b>. The number that moved is that
                control.</small></p>
                <p class="mb-2"><small>Reading and writing whole instruments and
                wavesamples goes over the block commands and hardly uses parameter
                numbers at all &mdash; about eleven of them, none of which differ between
                the two machines. So for that purpose this probe is confirmation rather
                than discovery, and probe A above is the one that matters. It earns its
                place on the pages where the two references contradict each other:
                wavesample word 105, and the envelope levels.</small></p>
                <div class="form-row align-items-center mb-2">
                    <div class="col-auto mb-2">
                        <button id="probeGuided" class="btn btn-success eps-transfer">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Start guided testing
                        </button>
                    </div>
                    <div class="col mb-2">
                        <small><b>This is the one to press.</b> It runs the whole of this
                        section: the first sweep, the starting point, and then one dialog per
                        control telling you what to change on the synth and why it matters.
                        Each step can be skipped. Everything below is the same work done by
                        hand, for when you want to chase something specific.</small>
                    </div>
                </div>
                <div class="form-row align-items-center mb-3">
                    <div class="col-auto mb-2">
                        <button id="probeParams" class="btn btn-outline-primary btn-sm eps-transfer">
                            <i class="fa-solid fa-magnifying-glass"></i> Sweep
                        </button>
                    </div>
                    <div class="col-auto mb-2">
                        <button id="probeSnapshotA" class="btn btn-outline-primary btn-sm eps-transfer">
                            Snapshot A
                        </button>
                    </div>
                    <div class="col-auto mb-2">
                        <button id="probeSnapshotB" class="btn btn-outline-primary btn-sm eps-transfer" disabled>
                            Snapshot B &amp; diff
                        </button>
                    </div>
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text">Items $</label>
                            </div>
                            <input type="text" class="form-control" id="sweepItemFrom" value="00"
                                style="max-width:4rem">
                            <input type="text" class="form-control" id="sweepItemTo" value="1F"
                                style="max-width:4rem">
                        </div>
                    </div>
                    <div class="col-12 mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="sweepPages">
                                    Pages (SysEx high bytes) $
                                </label>
                            </div>
                            <input type="text" class="form-control" id="sweepPages"
                                title="Which of section 9's parameter pages to ask about. The default is the pages an instrument is made of.">
                            <div class="input-group-append">
                                <button class="btn btn-outline-secondary" id="sweepPagesInstrument"
                                    type="button" title="Envelopes, pitch, filter, amp, LFO, wavesample, layer and instrument — everything an instrument is made of, and nothing else.">
                                    Instrument &amp; wavesample
                                </button>
                                <button class="btn btn-outline-warning" id="sweepPagesAll"
                                    type="button" title="Adds the track, sequencer, effects, system/MIDI and edit context pages. None of them affect reading or writing instruments, and the effects page is where this synth has crashed.">
                                    Everything
                                </button>
                            </div>
                        </div>
                        <small class="text-muted">The default is <b>the pages an instrument is
                        made of</b>: its envelopes, pitch, filter, amp and LFO pages, the
                        wavesample, the layer and the instrument. Reading and writing
                        instruments and wavesamples does not depend on the sequencer, the
                        system settings or the effects &mdash; and the effects page
                        <code>$30</code> is where an EPS-16 PLUS crashed with
                        <b>Error 129</b>, twice. <b>Everything</b> adds those pages back if you
                        are deliberately exploring; the effects page stays capped at item
                        <code>$09</code> either way.</small>
                    </div>
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="sweepTimeout">Timeout ms</label>
                            </div>
                            <input type="number" class="form-control" id="sweepTimeout"
                                value="400" min="50" max="5000" style="max-width:6rem"
                                title="An invalid parameter number is refused immediately, so this is only paid on numbers the synth ignores entirely. Too generous and a sweep takes an hour; too tight and a slow machine looks empty.">
                        </div>
                    </div>
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="sweepGap">Gap ms</label>
                            </div>
                            <input type="number" class="form-control" id="sweepGap"
                                value="150" min="0" max="1000" style="max-width:6rem"
                                title="Idle pause after each answer, before the next question. An EPS-16 PLUS answered consistently anywhere above about 75 ms; 150 doubles that for margin on a machine nobody has measured. The reference library pauses 200 ms between commands.">
                        </div>
                    </div>
                    <div class="col-auto mb-2">
                        <input type="text" class="form-control form-control-sm" id="sweepLabel"
                            value="sweep" placeholder="Label" style="max-width:10rem">
                    </div>
                    <div class="col-12 mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="sweepChange">
                                    Note what has been changed here:
                                </label>
                            </div>
                            <input type="text" class="form-control" id="sweepChange"
                                placeholder="e.g. master tune 0 to +25 — filed with the diff when you press Snapshot B"
                                title="Written into the capture alongside the comparison, so the numbers that moved are recorded next to what moved them. Cleared after each diff so it cannot be left over from the previous control.">
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="sweepNarrow" checked>
                            <label class="form-check-label" for="sweepNarrow"><small>
                                <b>Snapshots re-read only the numbers that answered.</b> Of the 512
                                numbers a full sweep asks about, only some tens ever answer, so
                                without this each snapshot spends nearly all its time re-confirming
                                the same several hundred refusals. With it a snapshot takes seconds
                                instead of a minute, which is what makes it practical to work
                                through a dozen controls rather than three. The first sweep is
                                always a full one and establishes the set. The trade: a number that
                                only becomes valid later is never revisited.
                            </small></label>
                        </div>
                        <small id="sweepLiveCount" class="text-muted"></small>
                    </div>
                </div>

                <h6 class="text-uppercase"><small>5 &middot; Probe C &mdash; wavesample data</small></h6>
                <p class="mb-2"><small>Reads samples out of a wavesample and reports which
                bit positions ever carry a one. If bits 0&ndash;2 are clear across
                thousands of samples, the machine keeps thirteen bits &mdash; a
                measurement, not a quotation from Appendix B. The round trip additionally
                <b>writes a test pattern over that wavesample's audio</b> and compares it
                back, which also says whether the machine rounds or truncates.</small></p>
                <p class="mb-2"><small><b>You do not have to choose a wavesample.</b> Both
                buttons look inside the instrument named below, find which layers exist
                and which wavesamples hold audio of their own, and use the largest. The
                round trip names what it found and waits for you to confirm before it
                writes anything. It changes the synth's memory only &mdash; reloading the
                instrument from disk puts it back.</small></p>
                <div class="form-row align-items-center mb-3">
                    <div class="col-auto mb-2">
                        <button id="probeWaveRead" class="btn btn-primary btn-sm eps-transfer">
                            <i class="fa-solid fa-wave-square"></i> Read &amp; analyse
                        </button>
                    </div>
                    <div class="col-auto mb-2">
                        <button id="probeWaveWrite" class="btn btn-danger btn-sm eps-transfer">
                            <i class="fa-solid fa-triangle-exclamation"></i> Round trip (overwrites audio)
                        </button>
                    </div>
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="waveInstrument">Instrument</label>
                            </div>
                            <input type="number" class="form-control" id="waveInstrument"
                                value="1" min="1" max="8" style="max-width:5rem"
                                title="Which instrument slot to look inside. Change this only if slot 1 is empty or holds nothing sampled.">
                        </div>
                    </div>
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="waveLength">Samples</label>
                            </div>
                            <input type="number" class="form-control" id="waveLength"
                                value="4096" min="64" max="200000" style="max-width:8rem"
                                title="Enough to be statistically convincing about the low bits without spending the session on it. The pattern itself only needs 35.">
                        </div>
                    </div>
                </div>

                <h6 class="text-uppercase"><small>6 &middot; Manual</small></h6>
                <p class="mb-2"><small>For the question nobody thought of in advance,
                which on a one-session-only machine is the question that matters. Reading
                a parameter is safe; writing one is not, and sending a raw command is
                whatever that command does.</small></p>
                <div class="form-row align-items-center mb-2">
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text">Page/item $</label>
                            </div>
                            <input type="text" class="form-control" id="manualPage" value="0D"
                                style="max-width:4rem">
                            <input type="text" class="form-control" id="manualItem" value="00"
                                style="max-width:4rem">
                        </div>
                    </div>
                    <div class="col-auto mb-2">
                        <button id="manualGet" class="btn btn-outline-primary btn-sm eps-transfer">
                            Get parameter
                        </button>
                    </div>
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="manualValue">Value</label>
                            </div>
                            <input type="number" class="form-control" id="manualValue" value="0"
                                style="max-width:7rem">
                        </div>
                    </div>
                    <div class="col-auto mb-2">
                        <button id="manualPut" class="btn btn-outline-warning btn-sm eps-transfer">
                            Put parameter
                        </button>
                    </div>
                    <div class="col-auto mb-2">
                        <div class="input-group input-group-sm">
                            <div class="input-group-prepend">
                                <label class="input-group-text" for="manualTimeout">Timeout ms</label>
                            </div>
                            <input type="number" class="form-control" id="manualTimeout"
                                value="1000" min="50" max="30000" style="max-width:6rem">
                        </div>
                    </div>
                </div>
                <div class="form-row align-items-center mb-3">
                    <div class="col">
                        <input type="text" class="form-control form-control-sm" id="manualBytes"
                            placeholder="Raw command bytes in hex, after the F0 0F 03 nn header and before the F7 — e.g. 03 00 00 00 00 00 01">
                    </div>
                    <div class="col-auto">
                        <button id="manualSend" class="btn btn-outline-danger btn-sm eps-transfer">
                            Send raw
                        </button>
                    </div>
                </div>

                <div id="probeOutput" class="border rounded p-2" style="display:none"></div>
            </div>
        </div>
        </div>`
    }
}
