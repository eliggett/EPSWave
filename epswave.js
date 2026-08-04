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
     * Wires the port pickers, the browser support warning and #testConnection.
     */
    wireMidi(eps){
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
     * Fills #aboutBody from about.js. The fallback matters because the About
     * box is the one place that says where the project came from, and an empty
     * panel gives no clue that a file is missing.
     */
    initAbout(){
        const body = document.getElementById("aboutBody")
        if(!body) return
        body.innerHTML = window.ABOUT_HTML
            || "<p class='mb-0'>The About text could not be loaded. "
             + "Check that <code>about.js</code> is present next to this page.</p>"
    }
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
