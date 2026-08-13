/***
 * Everything the Help box shows.
 *
 * Same arrangement as about.js, and for the same reason: both pages hold an
 * empty modal and drop the string below straight into it, so this is the one
 * file to edit to change what Help says, and it says the same thing on both
 * pages. See the note at the top of about.js for why this is a script rather
 * than an .html file fetched at runtime — the short version is that fetch()
 * is blocked for a page opened from disk as a file:// URL, which the README
 * tells people they can do.
 *
 * Ordinary HTML goes in here. Mind two characters that mean something to a
 * template string: a backtick ends it, and a dollar sign immediately before a
 * brace starts a substitution. Both need a backslash in front of them.
 *
 * Where a control lives on only one of the two pages, say so. Test Connection,
 * the loopback test and the block size are on the wavesample editor; the event
 * log is on both.
 */
window.HELP_HTML = `
    <p class="lead">Getting the EPS talking</p>

    <h6>1. Switch sysex on at the synth</h6>
    <p>
        On the EPS-16 PLUS, press <b>Edit</b>, then <b>System-MIDI</b>, and set
        <b>Sysex-MIDI</b> to <b>ON</b>. Nothing here works until this is done,
        and the synth gives no hint that it is off — it simply ignores
        everything and stays silent.
    </p>
    <p class="text-muted">
        This setting is not remembered across a power cycle on every OS
        revision. If a session that worked yesterday is silent today, check
        this first.
    </p>

    <h6>2. Use a browser that supports Web MIDI with sysex</h6>
    <p>
        Chrome, Edge or another Chromium based browser. Firefox is picky about
        Web MIDI and will often refuse sysex when the page is self hosted or
        opened straight from disk. Everything that does not touch the synth —
        generating waveforms, drawing and editing them, the frequency display,
        audio preview and saving WAV files — works in any modern browser.
    </p>

    <h6>3. Allow MIDI when the browser asks</h6>
    <p>
        The first time the page loads, the browser asks for permission to
        control your MIDI devices. This has to be <b>allowed</b>, and it is the
        sysex part of that permission that matters here.
    </p>
    <p>
        If the prompt was dismissed or blocked, it will not appear again on its
        own. To put it back: click the icon at the left hand end of the address
        bar — a padlock, a slider, or <i>View site information</i> — choose
        <b>Site settings</b>, find <b>MIDI device control and reprogram</b> and
        set it to <b>Allow</b>, then reload the page. In Chrome the same list is
        at <code>chrome://settings/content/midiDevices</code>.
    </p>
    <p class="text-muted">
        A warning appears at the top of the wavesample editor if the browser has
        no Web MIDI at all. Permission being denied is quieter: the MIDI port
        pickers stay empty.
    </p>

    <hr>

    <p class="lead">Testing the connection</p>
    <p>
        On the wavesample editor page, pick your interface under <b>MIDI
        Input</b> and <b>MIDI Output</b> — both, and they are usually the same
        device — then press <b>Test Connection</b>.
    </p>
    <p>
        The two small lights beside those pickers show traffic as it happens:
        red when this page sends to the EPS, green when the EPS answers. If
        only the red one flickers, the synth is not being heard or is not
        replying — check the cable into the EPS and that both ends are set to
        the same base channel.
    </p>
    <p>
        The test asks the EPS how much free memory it has. Any answer at all
        proves the whole path in one go: the message reached the synth, sysex is
        switched on, the header parsed, and the return cable works.
    </p>
    <ul>
        <li>
            <b>Green.</b> Connected, with the free memory reported. Nothing more
            to do.
        </li>
        <li>
            <b>Amber.</b> The EPS answered but declined the request, or answered
            with something unexpected. Sysex is on and the cabling is right, so
            this is worth reporting.
        </li>
        <li>
            <b>Red.</b> No answer. The test has already tried every base channel
            before saying so, so a channel mismatch is ruled out — and if it
            finds the synth on a different channel it switches to it and tells
            you. What is left is the cables being the wrong way round, the wrong
            ports selected above, or Sysex-MIDI still set to OFF.
        </li>
    </ul>
    <p class="text-muted">
        MIDI Out on the computer goes to MIDI In on the EPS, and MIDI Out on the
        EPS goes back to MIDI In on the computer. Both cables are needed: the
        synth has to be able to answer.
    </p>

    <hr>

    <p class="lead">Block Size and the Loopback Test</p>
    <p>
        Both are on the wavesample editor, under <b>Transfer Settings and
        Diagnostics</b>. They exist because MIDI interfaces vary enormously in
        how much sysex they will pass without choking, and the right setting is
        a property of your interface rather than of any particular sample.
    </p>

    <h6>Block Size</h6>
    <p>
        How many samples go into a single sysex message. The EPS gives up on a
        message that takes longer than two seconds to arrive, which at MIDI
        speed is roughly 2000 samples on a good interface and far fewer on a
        slow USB adapter. Lower it if transfers are refused; raise it for more
        speed. The setting is remembered in this browser.
    </p>

    <h6>Loopback Test</h6>
    <p>
        Writes a known pattern into the selected instrument, layer and
        wavesample, waits five seconds, reads it back and compares every sample.
        It is the only check that exercises a transfer in both directions and
        proves the data survived intact.
    </p>
    <p>
        <b>It overwrites whatever is in that wavesample, so point it at a
        scratch one.</b>
    </p>

    <h6>Tuning the block size</h6>
    <ol>
        <li>Run the loopback test at the default block size.</li>
        <li>
            If it fails or stalls, halve the block size and run it again. Keep
            halving until it passes cleanly.
        </li>
        <li>
            If it passes, try raising the block size and running it again.
            Transfers of a large instrument take many minutes, so the largest
            size that passes reliably is worth finding once.
        </li>
        <li>
            Settle on a value a little below the largest that worked, rather
            than exactly at it. A size that only just passes will fail on a
            busier day.
        </li>
    </ol>
    <p class="text-muted">
        A cheap interface that drops or mangles sysex will fail this test at
        every block size. That is worth knowing before you blame the synth —
        <a href="https://llamamusic.com/fb01/index.html#cheapmidi"
            target="_blank" rel="noopener">some inexpensive interfaces handle
        sysex badly</a>.
    </p>

    <hr>

    <p class="lead">The Event Log</p>
    <p>
        At the bottom of both pages. It is where anything that goes wrong will
        have left a trace, and it is what to attach when reporting a problem.
    </p>
    <ul>
        <li>
            <b>Show MIDI traffic</b> logs every sysex message in both
            directions, <code>-&gt;</code> for sent and <code>&lt;-</code> for
            received. This is verbose during a transfer, which is the point: it
            shows exactly what the synth was asked and what it said back.
        </li>
        <li>
            <b>Debug output</b> adds the running commentary from the transfer
            code itself — which instrument and layer are being addressed, what
            each step is doing, and why a step was skipped.
        </li>
        <li>
            <b>Clear Log</b> empties it, which is worth doing immediately before
            reproducing a problem so that what follows is only the problem.
        </li>
        <li>
            <b>Expand</b> grows the log to fill the window.
        </li>
        <li>
            <b>Export...</b> saves the whole log to a text file.
        </li>
    </ul>
    <p>
        For a problem worth reporting, the useful sequence is: tick both
        checkboxes, press Clear Log, do the thing that fails, then press
        Export.
    </p>

    <hr>

    <p class="lead">Still stuck?</p>
    <p>
        Please open an issue. Say which browser and MIDI interface you are
        using, what you expected, what happened instead, and attach an exported
        event log with <b>Show MIDI traffic</b> and <b>Debug output</b> both
        switched on.
    </p>
    <p class="mb-0">
        <a href="https://github.com/eliggett/EPSWave/issues"
            target="_blank" rel="noopener">github.com/eliggett/EPSWave/issues</a>
    </p>
`
