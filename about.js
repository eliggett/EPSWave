/***
 * Everything the About box shows.
 *
 * This is the only file to edit to change that box. index.html holds an empty
 * modal and drops the string below straight into it, so adding a line here is
 * the whole job.
 *
 * It is HTML in a template string rather than a separate .html file fetched at
 * runtime, and that is deliberate. A fetch() of a file sitting next to the page
 * is blocked as a cross origin request when the page is opened straight from
 * disk as a file:// URL — which the README tells people they can do — so the
 * About box would work on the hosted site and come up empty for anyone who
 * cloned the repository. A script tag has no such restriction and works both
 * ways.
 *
 * Ordinary HTML goes in here. Mind two characters that mean something to a
 * template string: a backtick ends it, and a dollar sign immediately before a
 * brace starts a substitution. Both need a backslash in front of them.
 */
window.ABOUT_HTML = `
    <p class="lead mb-1">EPSWave</p>
    <p class="text-muted">
        A browser based utility for moving wavesamples to and from the Ensoniq
        EPS-16 PLUS sampling synthesizer over MIDI, with waveform generation,
        editing and pitch detection built in.
    </p>
    <p><img src="icon-192x192.png"></p>
    <p class="mb-0"><b>This version by Elliott Liggett</b></p>
    <p><a href="https://github.com/eliggett/EPSWave" target="_blank" rel="noopener">github.com/eliggett/EPSWave</a></p>
    <p><a href="https://github.com/eliggett/EPSWave/tree/main/reference/" target="_blank" rel="noopener">Reference Material</a></p>
    <p><a href="https://github.com/eliggett/EPSWave/tree/main/reference/disks/" target="_blank" rel="noopener">Example Patches</a></p>
    <p><a href="https://web.archive.org/web/20041024235453/http://soundcentral.com/cats/keyboard/ensoniq/" target="_blank" rel="noopener">Many Patches (soundcentral.com via the Wayback Machine)</a></p>
    <hr>

    <h6>Credit</h6>
    <ul class="mb-0">
        <li>
            Original author,
            <a href="https://github.com/summitt/EnsoniqEPS16Plus/" target="_blank" rel="noopener">'summitt' on Github</a>
        </li>
        <li>
            Original author,
            <a href="https://patreon.com/null0perat0r" target="_blank" rel="noopener">'null0perat0r' on Patreon</a>
        </li>
        <li>
            Ensoniq VFD Organic font (Futaba FIP 22AM5R 14-segment),
            used under the
            <a href="https://github.com/eliggett/EPSWave/blob/main/fonts/EnsoniqVFD-OFL.txt"
                target="_blank" rel="noopener">SIL Open Font License 1.1</a>.
            LCD14 by
            <a href="https://github.com/ctrlcctrlv/lcd-font" target="_blank" rel="noopener">'ctrlcctrlv' on Github</a>
            remains in the tree for comparison.
        </li>
        <li>
            Ensoniq's EPS-16 PLUS MIDI implementation manual,
            <a href="https://github.com/eliggett/EPSWave/tree/main/reference"
                target="_blank" rel="noopener">included in the repository</a>
        </li>
        <li>
            Anthropic's Claude Opus 5, which was instrumental in digesting the
            original code and the complete MIDI implementation.
        </li>
    </ul>
`
