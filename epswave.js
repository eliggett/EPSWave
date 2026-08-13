/***
 * The parts of the page that every EPSWave page needs: stored preferences, the
 * dark theme switch, the event log, the MIDI port pickers and the connection
 * test.
 *
 * These all began life inside index.html. They moved out when the librarian
 * became a second page, because the alternative was a second copy of each, and
 * a second copy of the event log is the kind of thing that is fine for a month
 * and then quietly stops matching.
 *
 * Everything here is markup driven: each function looks for a set of element
 * ids and does nothing at all if they are absent. A page therefore opts in to
 * the log by having a #log in it, and opts out by not having one, with no flags
 * to keep in step. The ids are listed in the comment above each function.
 *
 * jQuery and Bootstrap load at the end of the body, so nothing here may run at
 * parse time except bootTheme, which deliberately uses plain DOM calls.
 */
window.EPSWaveUI = {

    /***
     * Reads the stored theme preference and settles it before the first paint.
     *
     * Called from the <head>, in plain DOM, on purpose. The switch used to be
     * wired at the end of a long inline script where anything that threw
     * earlier left the page stuck in light mode, and the theme is the one thing
     * on a page that should never be able to break.
     *
     * <body class="dark"> ships in the markup so the first paint is already
     * dark and the page still themes correctly with scripting off; this strips
     * the class when the preference says otherwise.
     */
    bootTheme(){
        window.startDark = window.safeStorage.get("darkMode") != "0"
        return window.startDark
    },
    applyBootTheme(){
        if(!window.startDark) document.body.classList.remove("dark")
    },

    /***
     * Wires #darkMode, if the page has one.
     *
     * onChange is for pages that draw their own colours into a canvas and have
     * to repaint. index.html passes the wave editor's repaint; the librarian
     * has no canvas and passes nothing.
     */
    wireTheme(onChange){
        const toggle = document.getElementById("darkMode")
        if(!toggle) return
        toggle.checked = window.startDark
        toggle.addEventListener("change", () => {
            document.body.classList.toggle("dark", toggle.checked)
            window.safeStorage.set("darkMode", toggle.checked ? "1" : "0")
            if(onChange) onChange(toggle.checked)
        })
    },

    /***
     * Which machine is on the other end of the cable: #connectedModel.
     *
     * Nothing in the app branches on this yet, and that is on purpose. The
     * transport is identical across the Ensoniq samplers — same manufacturer
     * byte, same product ID, same word packing, same handshake — so every
     * command this app sends is already model independent, and the differences
     * that do exist are in parameter numbers and block layouts that have not
     * been measured yet.
     *
     * It is here anyway for two reasons. It goes into every probe capture, so a
     * file taken on someone else's machine says what that machine was without
     * depending on anyone remembering to write it down. And when the first real
     * difference does turn up, the switch it needs will already be wired, in
     * the interface and in storage, rather than being a change to two pages and
     * a class on the day it is least convenient.
     *
     * The unselectable entries are honest advertising: those machines are not
     * supported, and showing them greyed out says so more clearly than leaving
     * them out, which would just look like nobody had thought about them.
     */
    MODELS: [
        { id: "eps16plus", label: "EPS-16+", supported: true },
        { id: "epsclassic", label: "EPS Classic", supported: true },
        { id: "asr10", label: "ASR-10", supported: false },
        { id: "mirage", label: "Mirage", supported: false }
    ],
    DEFAULT_MODEL: "eps16plus",

    model(){
        const stored = window.safeStorage.get("connectedModel")
        return EPSWaveUI.MODELS.some(m => m.id == stored && m.supported)
            ? stored : EPSWaveUI.DEFAULT_MODEL
    },
    modelLabel(id){
        const found = EPSWaveUI.MODELS.find(m => m.id == (id || EPSWaveUI.model()))
        return found ? found.label : "unknown"
    },

    /***
     * Every part of the debug layer, wired so that it cannot take the rest of
     * the app down with it.
     *
     * THIS GUARD IS NOT THEORETICAL. These three calls sit part way through the
     * page's start up, before the editor builds its tabs. Rename one of the new
     * script files, or let one 404 out of a stale cache, and `EPSProbeUI` is
     * simply not defined: the ReferenceError propagates out of the ready
     * handler and everything after it never runs. Measured on a tree with
     * epsProbeUI.js removed, the editor came up with one tab instead of two,
     * one canvas instead of three and half its buttons missing — a page that
     * looks loaded and is not.
     *
     * The probes are a diagnostic aid for a handful of people characterising an
     * unfamiliar machine. Nobody's sampler transfer should ever fail because of
     * them, so a failure here costs the Debug switch and nothing else.
     */
    wireDebugTools(eps){
        // The model dropdown is part of this file and is wired on its own, so
        // it survives the probes being unavailable.
        try{
            EPSWaveUI.wireModel(eps)
        }catch(error){
            console.error("EPSWave: the model selector could not be wired.", error)
        }
        try{
            // Both, checked up front. A half wired panel is worse than none: the
            // switch would fold the page away and reveal an empty card, and the
            // failure would only show up later as a dead button.
            // EPSProbe is named bare, not as window.EPSProbe. A top level
            // `class` declaration lives in the global lexical scope, so the
            // name resolves but the window property is undefined — the same
            // trap that once silently skipped every canvas repaint. EPSProbeUI
            // is an object literal assigned to window, so either form works
            // there; this one matches how each is actually declared.
            if(!window.EPSProbeUI || typeof EPSProbe == "undefined"
                    || typeof EPSCapture == "undefined"){
                throw new Error("epsProbe.js or epsProbeUI.js did not load")
            }
            EPSProbeUI.init(eps)
            EPSWaveUI.wireDebug()
            return true
        }catch(error){
            console.error("EPSWave: the debug tools could not be set up, so they "
                + "have been switched off. The rest of the app is unaffected.", error)
            // Take the switch away rather than leave one that does nothing.
            const toggle = document.getElementById("debugMode")
            const holder = toggle ? toggle.closest(".custom-control") : null
            if(holder) holder.style.display = "none"
            const panel = document.getElementById("debugPanel")
            if(panel) panel.style.display = "none"
            return false
        }
    },

    /***
     * Fills and wires #connectedModel, if the page has one. onChange is for
     * anything that has to react; nothing does yet.
     */
    wireModel(eps, onChange){
        const select = document.getElementById("connectedModel")
        if(!select) return
        select.innerHTML = ""
        for(const model of EPSWaveUI.MODELS){
            const option = document.createElement("option")
            option.value = model.id
            option.textContent = model.supported
                ? model.label : `${model.label} (not yet)`
            option.disabled = !model.supported
            select.appendChild(option)
        }
        const apply = (id) => {
            if(eps && typeof eps.setModel == "function") eps.setModel(id)
            if(onChange) onChange(id)
        }
        select.value = EPSWaveUI.model()
        apply(select.value)
        select.addEventListener("change", () => {
            window.safeStorage.set("connectedModel", select.value)
            apply(select.value)
            if(window.log) window.log(`Connected model set to ${EPSWaveUI.modelLabel(select.value)}`)
        })
    },

    /***
     * The debug switch: #debugMode, showing #debugPanel and turning the two log
     * checkboxes on.
     *
     * One switch rather than three, because the three were always wanted
     * together. Anyone who opens the probe panel wants the MIDI traffic and the
     * debug lines in the log — that is what the panel is for — and anyone who
     * does not want the panel does not want a log full of packet dumps either.
     * The checkboxes stay in the log card so they can still be set
     * independently afterwards; this only moves them together.
     *
     * Deliberately not remembered across reloads. A page that came back with
     * the probe panel open and MIDI logging on, long after the session that
     * wanted it, is a page that looks broken.
     */
    wireDebug(onChange){
        const toggle = document.getElementById("debugMode")
        if(!toggle) return
        const apply = (on) => {
            const panel = document.getElementById("debugPanel")
            if(panel) panel.style.display = on ? "" : "none"
            for(const id of ["logMidi", "logDebug"]){
                const box = document.getElementById(id)
                if(box) box.checked = on
            }
            // Everything the page normally offers, out of the way. A probe
            // session needs the MIDI ports, the status panel, the probes and
            // the log, and nothing between them — and on the editor page what
            // sits between them is the entire wave editor, which is most of the
            // page. Leaving it there makes the panel something to hunt for.
            const status = document.getElementById("epsStatus")
            if(status && panel){
                EPSWaveUI.hideBetween(status.closest(".eps-lcd") || status, panel, on)
            }
            if(onChange) onChange(on)
        }
        toggle.checked = false
        apply(false)
        toggle.addEventListener("change", () => {
            apply(toggle.checked)
            if(window.log){
                window.log(toggle.checked
                    ? "Debug mode on: hardware probes shown, MIDI traffic and debug output "
                        + "are going to this log"
                    : "Debug mode off")
            }
        })
    },

    /***
     * Hides everything that sits visually between two elements, wherever they
     * are in the tree relative to each other.
     *
     * The two are at different depths — on the editor page the status panel is
     * buried inside a card while the probe panel is a top level row — so this
     * cannot be a walk over one set of siblings. It works outwards instead:
     * hide everything after `from` among its own siblings, then step up to its
     * parent and do the same, and again, until it reaches the level where `to`
     * lives and stops there.
     *
     * A class rather than an inline style, because several of the things it
     * covers carry a `style="display:none"` of their own — the browser support
     * warning, the collapsed cards — and writing over that would leave them
     * showing when debug mode is switched off again.
     */
    hideBetween(from, to, hidden){
        let node = from
        while(node && node.parentElement && node !== document.body){
            let sibling = node.nextElementSibling
            while(sibling){
                // Reaching `to`, or the branch holding it, means everything
                // between the two has been covered and anything further along
                // is past it.
                if(sibling === to || sibling.contains(to)) return
                sibling.classList.toggle("eps-debug-hidden", hidden)
                sibling = sibling.nextElementSibling
            }
            node = node.parentElement
        }
    },

    /***
     * The event log: #log, and optionally #clearLog, #expandLog with
     * #expandLogLabel and #expandLogIcon, and #exportLog.
     *
     * Installs window.log, so anything on the page can write a line without
     * being handed a reference. Returns the same function for callers that
     * would rather hold one.
     *
     * MIDI logging can produce a line per packet, so the log is capped and kept
     * scrolled to the newest entry.
     */
    LOG_MAX_LINES: 1000,

    logTimestamp(){
        const now = new Date()
        const pad = (value) => String(value).padStart(2, '0')
        return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
            + `--${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    },

    initLog(){
        const element = document.getElementById("log")
        if(!element) return (window.log = () => {})
        let lines = []

        const log = (message) => {
            lines.push(`${EPSWaveUI.logTimestamp()}: ${message}`)
            if(lines.length > EPSWaveUI.LOG_MAX_LINES){
                lines = lines.slice(-EPSWaveUI.LOG_MAX_LINES)
            }
            element.value = lines.join("\r\n") + "\r\n"
            element.scrollTop = element.scrollHeight
        }
        window.log = log

        // Clears the backing array too, otherwise the next line redraws the
        // textarea from everything that was supposedly cleared.
        $("#clearLog").click(() => {
            lines = []
            element.value = ""
        })

        // Grows the log to fill the screen. The preference sticks, because
        // anyone who wants a big log while chasing a transfer wants it again
        // next time. Scrolled into view on expanding, since the log sits at the
        // bottom of a long page and growing something off screen looks like
        // nothing happened.
        const setExpanded = (expanded, scroll) => {
            element.classList.toggle("log-expanded", expanded)
            $("#expandLogLabel").text(expanded ? "Collapse" : "Expand")
            // Replaced as markup rather than by editing the <i>'s class: Font
            // Awesome's script swaps each <i> for an <svg>, so by now there is
            // no <i> left to find. Writing a fresh one back in is what the
            // preview button does too, and the observer renders it.
            $("#expandLogIcon").html(expanded
                ? '<i class="fa-solid fa-down-left-and-up-right-to-center"></i>'
                : '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>')
            element.scrollTop = element.scrollHeight
            // The card, not the textarea: once expanded the textarea is taller
            // than the viewport, and bringing *it* into view puts its top off
            // screen along with these buttons.
            if(expanded && scroll){
                element.closest(".card").scrollIntoView({ block: "start", behavior: "smooth" })
            }
            window.safeStorage.set("logExpanded", expanded ? "1" : "0")
        }
        $("#expandLog").click(() => setExpanded(!element.classList.contains("log-expanded"), true))
        setExpanded(window.safeStorage.get("logExpanded") == "1", false)

        // Exports what is in the log, not what is on screen: the textarea holds
        // the same lines, but reading the array keeps the export independent of
        // anything the browser does to the field.
        $("#exportLog").click(() => {
            if(lines.length == 0){
                log("Error: The log is empty, nothing to export")
                return
            }
            // CRLF so the file opens sensibly in a plain Windows editor, which
            // is where a log emailed about a MIDI problem tends to go.
            EPSWaveUI.download(lines.join("\r\n") + "\r\n", "text/plain;charset=utf-8",
                `epswave-log-${EPSWaveUI.logTimestamp().replace(/[^0-9-]/g, "")}.txt`)
            log(`Exported ${lines.length} log lines`)
        })

        return log
    },

    /***
     * The status panel: #epsStatus for the line of text, #epsProgress for the
     * bar, and the class `eps-transfer` on every button that talks to the synth.
     *
     * There is one of these for the whole page rather than one per card,
     * because there is one MIDI cable. A transfer takes minutes and the card
     * that started it may well be behind another tab by the time it finishes,
     * so the place to look has to be somewhere that is always visible.
     */
    status(text, percent = null){
        const line = document.getElementById("epsStatus")
        if(line) line.innerHTML = text || "&nbsp;"
        const bar = document.getElementById("epsProgress")
        if(!bar) return
        // Coerced rather than type checked. Several of the transfer callbacks
        // grew up feeding a text field and hand out a string of digits, which a
        // `typeof` test reads as "no percentage known" — so the bar sat still
        // through entire uploads while the text beside it counted up.
        const value = percent === null || percent === "" ? NaN : Number(percent)
        const known = Number.isFinite(value)
        bar.style.width = known ? `${Math.max(0, Math.min(100, value))}%` : "0%"
        bar.parentElement.classList.toggle("eps-progress-idle", !known)
    },

    /***
     * One transfer at a time.
     *
     * Before the page had a card per wavesample there was one Get button and
     * one Upload button, so two overlapping transfers were impossible by
     * construction. With a button on every tab and two more for the batch
     * uploads it is a click away, and the EPS answers a sysex command with a
     * bare acknowledgement carrying nothing to say which command it belongs to.
     * Two conversations at once are therefore not slow or unreliable, they are
     * unreadable: each side reads the other's replies as its own.
     *
     * Returns null if something is already running, and otherwise the function
     * that ends it. Put that in a `finally` — a throw that left the page
     * permanently disabled would be a worse fault than the one being prevented.
     */
    startTransfer(what){
        if(EPSWaveUI.transferring) return null
        EPSWaveUI.transferring = what
        const release = EPSWaveUI.hold(what)
        for(const button of document.querySelectorAll(".eps-transfer")){
            button.disabled = true
        }
        EPSWaveUI.status(what, 0)
        return (outcome) => {
            EPSWaveUI.transferring = null
            release()
            for(const button of document.querySelectorAll(".eps-transfer")){
                button.disabled = false
            }
            EPSWaveUI.status(outcome || "Ready")
        }
    },

    /***
     * Asks a yes or no question and waits for the answer.
     *
     * window.confirm would do, and is deliberately not used: the question worth
     * asking here is "instrument 3 already holds STRINGS 1, 412 blocks, three
     * layers — overwrite it?", and that wants a name in a readable typeface and
     * a button that says Overwrite rather than one that says OK.
     *
     * The markup is built here rather than living in the page so that every
     * page gets the same dialog without carrying a copy of it.
     */
    async ask(title, bodyHtml, confirmLabel = "Overwrite", confirmClass = "btn-danger"){
        return new Promise((resolve) => {
            const id = "epsAskModal"
            $(`#${id}`).remove()
            const modal = $(`
                <div class="modal fade" id="${id}" tabindex="-1" role="dialog">
                    <div class="modal-dialog modal-dialog-centered" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">${title}</h5>
                            </div>
                            <div class="modal-body">${bodyHtml}</div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                                <button type="button" class="btn ${confirmClass}" id="${id}Ok">${confirmLabel}</button>
                            </div>
                        </div>
                    </div>
                </div>`)
            $("body").append(modal)
            let answer = false
            modal.find(`#${id}Ok`).click(() => { answer = true; modal.modal("hide") })
            // Resolved on the way out rather than on the button, so that the
            // Cancel button, the backdrop, the close box and the Escape key all
            // count as no without each needing to be wired.
            modal.on("hidden.bs.modal", () => { modal.remove(); resolve(answer) })
            modal.modal({ backdrop: "static", keyboard: true })
        })
    },

    /***
     * A question with more than two answers, and waits for one.
     *
     * `ask` above covers yes-or-no. This covers the case where "no" splits into
     * several different noes — skip this one, or stop altogether — which is
     * what a guided sequence needs at every step, since somebody working
     * through it may not have the control the step asks for, or may simply have
     * had enough.
     *
     * `buttons` is [{ id, label, class }] in the order they should appear, and
     * the resolved value is the id of whichever was pressed, or null if the
     * dialog was dismissed by the Escape key or the backdrop. Callers have to
     * treat null as "stop", because a dismissed dialog is not consent to carry
     * on doing things to somebody's synth.
     */
    async choose(title, bodyHtml, buttons){
        return new Promise((resolve) => {
            const id = "epsChooseModal"
            $(`#${id}`).remove()
            const modal = $(`
                <div class="modal fade" id="${id}" tabindex="-1" role="dialog">
                    <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">${title}</h5>
                            </div>
                            <div class="modal-body">${bodyHtml}</div>
                            <div class="modal-footer"></div>
                        </div>
                    </div>
                </div>`)
            const footer = modal.find(".modal-footer")
            let answer = null
            for(const button of buttons){
                $("<button>").attr("type", "button")
                    .addClass(`btn ${button.class || "btn-secondary"}`)
                    .html(button.label)
                    .click(() => { answer = button.id; modal.modal("hide") })
                    .appendTo(footer)
            }
            modal.on("hidden.bs.modal", () => { modal.remove(); resolve(answer) })
            modal.modal({ backdrop: "static", keyboard: true })
        })
    },

    /***
     * Hands the browser a file. Used by the log export and by anything that
     * saves an instrument.
     *
     * The anchor is appended to the document before it is clicked. Chrome will
     * follow a click on a detached anchor, and Firefox will not, which is a
     * difference that shows up as "the export button does nothing" on one
     * browser only.
     */
    download(content, mime, filename){
        const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
        const url = (window.URL || window.webkitURL).createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = filename
        link.style.display = "none"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        // Chrome keeps the blob alive for the life of the document otherwise,
        // and a long session can export several times.
        setTimeout(() => (window.URL || window.webkitURL).revokeObjectURL(url), 1000)
        return filename
    },

    /***
     * Sysex wavesample transfers run to thousands of bytes, so show the head of
     * each packet and the total rather than the whole thing.
     */
    formatMidiBytes(bytes){
        const shown = 24
        let text = Array.from(bytes).slice(0, shown)
            .map(byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(" ")
        if(bytes.length > shown) text += ` ... (${bytes.length} bytes)`
        return text
    },

    /***
     * Fills #midiIn and #midiOut from the ports the browser found, restores the
     * previously chosen ones and keeps the choice.
     *
     * Call this from the EPS16 set up callback, which is the only moment the
     * port lists are known.
     */
    fillMidiPorts(eps, inputs, outputs){
        const fill = (selector, ports, stored, apply) => {
            const select = $(selector)
            if(select.length == 0) return
            select.empty().append($("<option>"))
            for(const port of ports){
                select.append($("<option>").val(port.name).html(port.name))
            }
            // Only if the remembered port is still plugged in; selecting a name
            // that is not in the list leaves the box blank while the app
            // believes it is connected.
            if(stored && ports.some(port => port.name == stored)){
                select.val(stored)
                apply(stored)
            }
        }
        fill("#midiIn", inputs, window.safeStorage.get("midiIn"), name => eps.setInput(name))
        fill("#midiOut", outputs, window.safeStorage.get("midiOut"), name => eps.setOutput(name))
    },

    /***
     * The two MIDI activity lights, keyed by the direction strings EPS16
     * passes to its MIDI callback.
     */
    midiLeds: { "<-": "midiInLed", "->": "midiOutLed" },
    midiLedTimers: {},

    /***
     * Flashes one of the port lights.
     *
     * Held on for a fixed time after the last packet rather than for the
     * length of one: a block upload is hundreds of packets a few milliseconds
     * apart, and a light that tracked them exactly would be a strobe. Each
     * packet pushes the off back instead, so a transfer reads as one steady
     * light and a single command as a blink.
     */
    blinkMidi(direction){
        const id = EPSWaveUI.midiLeds[direction]
        if(!id) return
        const led = document.getElementById(id)
        if(!led) return
        led.classList.add("eps-led-on")
        clearTimeout(EPSWaveUI.midiLedTimers[id])
        EPSWaveUI.midiLedTimers[id] = setTimeout(() => {
            led.classList.remove("eps-led-on")
        }, 120)
    },

    /***
     * Wires the port pickers, the browser support warning and #testConnection.
     */
    wireMidi(eps){
        // Wrapping whatever is already installed, for the same reason
        // EPSProbe.attach does: the pages set their event logging up before
        // they call this, and replacing the callback would silence it. The
        // lights are unconditional — they are for the case where someone has
        // not found the debug panel and does not know there is a log.
        const previous = eps.midiCallback
        eps.setMidiCallback((direction, bytes) => {
            EPSWaveUI.blinkMidi(direction)
            if(previous) previous(direction, bytes)
        })

        $("#midiIn").change(event => {
            eps.setInput(event.target.value)
            window.safeStorage.set("midiIn", event.target.value)
        })
        $("#midiOut").change(event => {
            eps.setOutput(event.target.value)
            window.safeStorage.set("midiOut", event.target.value)
        })
        if(typeof navigator.requestMIDIAccess != "function") $("#midiUnsupported").show()

        // The connection test asks the EPS for one read only System-MIDI
        // parameter. Nothing on the synth needs to exist for that, which
        // matters because a freshly powered EPS has no instrument, layer or
        // wavesample.
        const button = $("#testConnection")
        if(button.length == 0) return
        button.click(async () => {
            const result = $("#testConnectionResult")
            const show = (text, kind) => result
                .removeClass("alert-secondary alert-success alert-danger alert-warning")
                .addClass(`alert-${kind}`).html(text).show()

            button.prop("disabled", true)
            $("#testConnectionSpinner").show()
            show("Testing ...", "secondary")

            const report = await eps.ping((status) => {
                show(status, "secondary")
                window.log(status)
            })
            window.log(report.message)
            show(report.message, report.ok ? "success" : (report.reachable ? "warning" : "danger"))

            $("#testConnectionSpinner").hide()
            button.prop("disabled", false)
        })
    },

    /***
     * Fills a modal body from the script that holds its text.
     *
     * The fallback matters because both of these boxes are the only place they
     * say what they say — where the project came from, or how to get the synth
     * talking — and an empty panel gives no clue that a file is missing.
     *
     * Filled once rather than on every open: neither changes while the page is
     * up. Missing the element is not an error, so a page can carry one box and
     * not the other.
     */
    initModalText(bodyId, html, file){
        const body = document.getElementById(bodyId)
        if(!body) return
        body.innerHTML = html
            || `<p class='mb-0'>This text could not be loaded. Check that `
             + `<code>${file}</code> is present next to this page.</p>`
    },

    /*** Fills #aboutBody from about.js. */
    initAbout(){
        EPSWaveUI.initModalText("aboutBody", window.ABOUT_HTML, "about.js")
    },

    /*** Fills #helpBody from help.js. */
    initHelp(){
        EPSWaveUI.initModalText("helpBody", window.HELP_HTML, "help.js")
    },

    /***
     * Warning before the page is closed while a transfer is running.
     *
     * A transfer of a large instrument takes tens of minutes, and it dies the
     * instant the page goes away — mid-restore that leaves a half built
     * instrument on the synth holding its memory, and mid-backup it throws away
     * everything read so far. A reload reflex or a stray Ctrl-W costs the whole
     * thing, and there is no way to resume.
     *
     * Browsers deliberately give no control over the wording: Chrome and
     * Firefox both show their own generic "changes you made may not be saved"
     * regardless of what is returned here, and only show anything at all if the
     * user has interacted with the page. Since every transfer starts with a
     * button press, that condition is always met by the time it matters.
     *
     * The three lines below are all required, and by different browsers:
     * preventDefault for the current standard, a non-empty returnValue for
     * Chrome, and a returned string for older Safari.
     */
    holds: new Set(),

    /*** What is on the wire, or null. See startTransfer. */
    transferring: null,

    guardUnload(){
        if(EPSWaveUI.guarding) return
        EPSWaveUI.guarding = true
        window.addEventListener("beforeunload", (event) => {
            if(EPSWaveUI.holds.size == 0) return undefined
            event.preventDefault()
            event.returnValue = ""
            return ""
        })
    },

    /***
     * Marks something as in flight. Returns the function that releases it, so
     * the caller can put it in a `finally` and cannot forget which token to
     * release:
     *
     *     const done = EPSWaveUI.hold("sending to the EPS")
     *     try{ ... }finally{ done() }
     *
     * A Set of labels rather than a counter, so that two overlapping transfers
     * cannot release each other's hold, and so the reason is inspectable.
     */
    hold(what){
        EPSWaveUI.guardUnload()
        const token = `${what} ${Date.now()} ${Math.random()}`
        EPSWaveUI.holds.add(token)
        return () => EPSWaveUI.holds.delete(token)
    },

    busy(){ return EPSWaveUI.holds.size > 0 }
}

/***
 * Firefox refuses localStorage outright in several configurations, most
 * relevantly on file:// pages, and it throws rather than returning null. Every
 * stored preference goes through here so that a refusal costs the preference
 * and nothing else. The dark mode switch was the first synchronous
 * localStorage read on the page in Firefox, because the MIDI callback that
 * reads the port names never fires there, so a throw took out dark mode alone
 * and left the rest of the page working.
 */
window.safeStorage = {
    get(key){
        try { return localStorage.getItem(key) } catch(error){ return null }
    },
    set(key, value){
        try { localStorage.setItem(key, value) } catch(error){}
    }
}
