/***
 * Ensoniq .EFE files.
 *
 * An EFE is a 512 byte header followed by the EPS's own memory image, and
 * nothing else. There is no compression, no checksum and no per-object framing:
 * what follows the header is exactly what was in RAM.
 *
 * That is why this file is so short. All of the work of understanding an
 * instrument is in epsBlocks.js, and it is the same work whether the blocks
 * came off a disk or off the MIDI cable — see the note at the top of that file
 * for why the two layouts are identical. This file only opens the envelope.
 *
 * Everything below was read off a real EPS-16 PLUS instrument file rather than
 * taken from a format description. Where a field's meaning is not certain that
 * is said so, rather than guessed at.
 */
class EPSEfe {

    /***
     * Byte offsets within the 512 byte header.
     *
     * The two carriage return / line feed pairs and the $1A are what make the
     * header safe to TYPE at a DOS prompt: it prints the name and stops at the
     * end of file character. That also makes them a reliable signature, since
     * a file without them is not an EFE whatever its extension says.
     */
    static HEADER_BYTES = 512
    static NAME_AT = 0x12
    static NAME_LENGTH = 12
    static TYPE_NAME_AT = 0x22
    static TYPE_NAME_LENGTH = 12
    static TYPE_AT = 0x32
    static SIZE_BLOCKS_AT = 0x34
    static BLOCK_BYTES = 512

    /***
     * File types. Only the instrument is handled; the rest are recognised so
     * that opening a bank or an effects file says which it is instead of
     * failing with something unhelpful about the contents.
     *
     * The header also spells the type out in ASCII at TYPE_NAME_AT, and that
     * string is what gets shown. This table is only for deciding what to do.
     */
    static TYPE_INSTRUMENT = 3

    /***
     * Reads the header and returns the image, or throws with a reason a user
     * can act on.
     *
     * Takes an ArrayBuffer, which is what FileReader and fetch both give.
     */
    static parse(buffer){
        const bytes = new Uint8Array(buffer)
        if(bytes.length < EPSEfe.HEADER_BYTES){
            throw new Error("Too short to be an EFE file: "
                + `${bytes.length} bytes, the header alone is ${EPSEfe.HEADER_BYTES}`)
        }
        // \r\n at the start, \r\n\x1A closing the printable part.
        if(bytes[0] != 0x0D || bytes[1] != 0x0A
                || bytes[0x2F] != 0x0D || bytes[0x30] != 0x0A || bytes[0x31] != 0x1A){
            throw new Error("This is not an Ensoniq EFE file: the header signature is missing")
        }

        // Underscores are trimmed along with spaces because they are padding,
        // not part of the name. The original EPS pads its header fields with
        // "_" where the EPS-16 PLUS uses spaces, which is why an original EPS
        // file otherwise reads as holding an "Instrument___".
        const text = (at, length) => String.fromCharCode(...bytes.slice(at, at + length))
            .replace(/[^\x20-\x7E]/g, " ").replace(/[_\s]+$/, "").trim()
        const type = bytes[EPSEfe.TYPE_AT]
        const sizeBlocks = (bytes[EPSEfe.SIZE_BLOCKS_AT] << 8) | bytes[EPSEfe.SIZE_BLOCKS_AT + 1]
        const image = bytes.subarray(EPSEfe.HEADER_BYTES)

        // The size in the header and the size on disk should agree exactly. A
        // mismatch means a truncated download or a file recovered from a bad
        // disk, and every offset in the image is about to be trusted, so it is
        // worth refusing rather than reading rubbish.
        const expected = sizeBlocks * EPSEfe.BLOCK_BYTES
        if(image.length != expected){
            throw new Error(`Truncated or padded EFE: the header says ${sizeBlocks} blocks `
                + `(${expected} bytes) but the file holds ${image.length}`)
        }

        return {
            name: text(EPSEfe.NAME_AT, EPSEfe.NAME_LENGTH),
            typeName: text(EPSEfe.TYPE_NAME_AT, EPSEfe.TYPE_NAME_LENGTH),
            type,
            isInstrument: type == EPSEfe.TYPE_INSTRUMENT,
            sizeBlocks,
            image,
            words: EPSEfe.toWords(image)
        }
    }

    /***
     * The image as 16 bit words, big endian.
     *
     * Appendix B: "Assume Motorola (hi byte first) format". Every offset in the
     * instrument is a word offset, so working in words throughout avoids a
     * division at every use.
     */
    static toWords(image){
        const words = new Uint16Array(image.length >> 1)
        for(let i = 0; i < words.length; i++){
            words[i] = (image[i * 2] << 8) | image[i * 2 + 1]
        }
        return words
    }

    /***
     * Appendix B: "The data in a WaveSample follows immediately after the ws
     * data structure, which is $120 bytes long." So the audio begins this far
     * past the object's own offset, with no framing of any kind in between.
     */
    static WAVESAMPLE_HEADER_BYTES = 0x120

    /***
     * The audio of one wavesample, as signed 16 bit samples.
     *
     * Copies are followed to whichever wavesample actually holds the data, so
     * asking for the audio of a copy returns the audio it plays rather than
     * nothing. Section 7.3 words 12 and 13: a non-zero Copy Number is "the
     * number of the WaveSample containing the sample data".
     *
     * Everything about the extents was checked against the seven instrument
     * files in reference/disks. In all 21 wavesamples the sample start is 0 and
     * the sample end fits inside the gap to the next object, so the audio is
     * simply the first `sampleEnd` samples after the header. The few bytes of
     * slack at the end of each are the 16 byte chunking, not data.
     */
    static readWavedata(efe, inventory, number){
        let ws = inventory.wavesamples.find(w => w.number == number)
        if(!ws) throw new Error(`This instrument has no wavesample ${number}`)

        // Follow the copy chain. Bounded rather than trusted: a file with a
        // copy pointing at itself would otherwise hang the page, and this data
        // comes off strangers' floppy disks.
        const start = ws
        for(let hop = 0; ws.isCopy && hop <= EPSBlocks.WAVESAMPLE_COUNT; hop++){
            const source = inventory.wavesamples.find(w => w.number == ws.copyNumber)
            if(!source){
                throw new Error(`WaveSample ${start.number} is a copy of wavesample `
                    + `${ws.copyNumber}, which is not in this instrument`)
            }
            ws = source
        }
        if(ws.isCopy) throw new Error(`WaveSample ${start.number} copies itself`)

        const at = ws.offset + EPSEfe.WAVESAMPLE_HEADER_BYTES
        const needed = ws.sampleEnd * 2
        if(at + needed > efe.image.length){
            throw new Error(`WaveSample ${ws.number} claims ${ws.sampleEnd} samples but the `
                + `file ends ${Math.round((at + needed - efe.image.length) / 2)} samples short`)
        }
        // Motorola byte order, per Appendix B, and signed.
        const samples = new Int16Array(ws.sampleEnd)
        for(let i = 0; i < samples.length; i++){
            samples[i] = (efe.image[at + i * 2] << 8) | efe.image[at + i * 2 + 1]
        }
        return samples
    }

    /***
     * The section 7 parameter block of the object at a byte offset in the image.
     *
     * The offset is what the instrument's pointer tables hold. Skipping
     * OBJECT_HEADER_WORDS lands on the name, which is word 0 of the block as
     * section 7 numbers it, so the result can go straight into the decoders in
     * epsBlocks.js exactly as a MIDI response would.
     */
    static blockAt(words, byteOffset, length){
        const from = (byteOffset >> 1) + EPSBlocks.OBJECT_HEADER_WORDS
        // The length is not optional in practice. Without it the slice runs to
        // the end of the image, which reads correctly — every decoder indexes
        // from the front — and then hands a restore the whole rest of the file
        // to send as a parameter block.
        return words.subarray(from, length ? from + length : undefined)
    }

    /***
     * WRITING AN .EFE
     *
     * Reading one needs to understand the objects. Writing one needs to
     * understand the EPS's allocator as well, because every object carries five
     * words of bookkeeping ahead of the block in section 7 and those five words
     * have to be produced rather than copied. All of it was measured against
     * the 42 instrument files here rather than taken from a description.
     *
     * THE FIVE HEADER WORDS
     *
     * Words 0-1, the allocated size in bytes, are a 24 bit value split across
     * two words with each half shifted left 4 — the same "low three bits of
     * every word are unusable" habit as the packed offsets, with the halves in
     * the opposite order:
     *
     *     value = (word1 << 8) | (word0 >> 4)
     *
     * That reads correctly for **all 181 objects in all 42 files**: every
     * result is a multiple of 16, none overlaps the next object, a copy reads
     * 288 (the $120 header with no audio after it), a layer reads 224, and the
     * instrument's own figure is exactly the length of the image.
     *
     * Word 2 is the byte offset, times 16, of the pointer that points at this
     * object — so a layer's is 100 + 4*layer and a wavesample's is 132 + 4*n,
     * both counted from the start of the instrument object. For the instrument
     * itself Appendix B calls it `inst_self_ptr`, "used for relocation", and it
     * holds a RAM address between $C900 and $CCC0 that differs in every file.
     * **It is the one field here that is written blind**, on the reasoning that
     * a pointer the specification says is for relocation cannot survive being
     * loaded at a different address and must be rebuilt. A file written with
     * zero here loads on a real EPS-16 PLUS, which settles it.
     *
     * Words 3 and 4 are a doubly linked list of the wavesamples in each layer,
     * in the high bytes: on a layer, the first and last wavesample it plays; on
     * a wavesample, the next and previous. Walking that chain from every
     * layer's head reproduces exactly the set of wavesamples that layer's key
     * map plays, with the back links agreeing, in all 63 layers here. The low
     * bytes hold something else that varies and is zero throughout CS-80STR, so
     * zero is what gets written.
     *
     * THE HEADER
     *
     * 473 of the 512 bytes are identical in every file. What varies is the
     * signature, the name, the block count at $34 — repeated at $36, which is
     * the only reason to notice it — and byte $38, which is 0 in all 38
     * EPS-16 PLUS files and 2 in all 4 original EPS ones.
     *
     * WHAT IS NOT WRITTEN
     *
     * Pitch tables and the effect. Neither is captured by a backup — there is
     * no PUT for an effect and nothing yet reads a pitch table — so their
     * pointer tables are left empty rather than pointing at nothing. The caller
     * is told when this loses something.
     */

    /***
     * The inverse of unpackOffset. Appendix B's worked example is the test:
     * 0x123450 must pack as 0x2300 0x4510.
     */
    static packOffset(words, at, value){
        words[at] = ((value >> 12) & 0xFF) << 8
        words[at + 1] = (((value >> 4) & 0xFF) << 8) | (((value >> 20) & 0x0F) << 4)
    }

    /***
     * The allocator's block size, read and written. See the note above.
     */
    static unpackBlockSize(words, at){
        return (words[at + 1] << 8) | (words[at] >> 4)
    }
    static packBlockSize(words, at, value){
        words[at] = (value & 0x0FFF) << 4
        words[at + 1] = ((value >> 12) & 0x0FFF) << 4
    }

    /***
     * Where the pointer to an object sits inside the instrument object, in
     * bytes: the five word header, then the word offset section 7.1 prints.
     */
    static pointerAt(word){ return EPSBlocks.OBJECT_HEADER_WORDS * 2 + word * 2 }

    /***
     * Every object begins on a 16 byte boundary — Appendix B's "16 byte chunky"
     * — and the image is a whole number of 512 byte disk blocks.
     */
    static align(value, to){ return Math.ceil(value / to) * to }

    /***
     * The instrument object's own five words. Words 3 and 4 are constant in all
     * 42 files; word 2 is the relocation pointer described above.
     */
    static INSTRUMENT_SELF_PTR = 0
    static INSTRUMENT_LINK_WORDS = [0xFFD0, 0xFFF8]

    /***
     * Header layout. Everything not named here is zero in every file.
     */
    static SIGNATURE_AT = 0x02
    static SIGNATURE_BYTES = 16
    static SIGNATURE_16_PLUS = "Eps File:"
    static SIGNATURE_ORIGINAL = "EPS-16 File:"
    static SIZE_BLOCKS_REPEAT_AT = 0x36
    static MACHINE_AT = 0x38
    static MACHINE_16_PLUS = 0
    static MACHINE_ORIGINAL = 2

    /***
     * Writes an instrument out as an .EFE image.
     *
     * `audio` is a Map from wavesample number to samples, the same shape
     * downloadAudio returns and EPSWaveFile carries. Returns the bytes and a
     * list of anything that could not be represented, which the caller is
     * expected to show rather than swallow.
     */
    static write(inventory, audio = new Map(), options = {}){
        const lost = []
        const instrument = inventory.instrument
        const layers = inventory.layers
        const wavesamples = inventory.wavesamples
        if(layers.length == 0 || wavesamples.length == 0){
            throw new Error("An instrument needs at least one layer and one wavesample")
        }

        // --- how long is each object, and where does it go -------------------
        const samplesFor = (ws) => {
            if(ws.isCopy) return 0
            const held = audio.get(ws.number)
            // The block's own end offset and the audio in hand should agree.
            // Where they do not the longer wins, so nothing is truncated, and
            // the disagreement is reported.
            if(held && held.length != ws.sampleEnd){
                lost.push(`Wavesample ${ws.number}: the parameters say ${ws.sampleEnd} `
                    + `samples and ${held.length} are in hand`)
            }
            return Math.max(ws.sampleEnd, held ? held.length : 0)
        }

        let at = EPSBlocks.INSTRUMENT_OBJECT_BYTES
        const placed = new Map()
        for(const layer of layers){
            placed.set(`layer${layer.number}`, at)
            at += EPSEfe.align(
                (EPSBlocks.OBJECT_HEADER_WORDS + EPSBlocks.LAYER_BLOCK_WORDS) * 2, 16)
        }
        for(const ws of wavesamples){
            placed.set(`ws${ws.number}`, at)
            at += EPSEfe.align(
                EPSEfe.WAVESAMPLE_HEADER_BYTES + samplesFor(ws) * 2, 16)
        }
        const imageBytes = EPSEfe.align(at, EPSEfe.BLOCK_BYTES)
        const image = new Uint8Array(imageBytes)
        const words = new Uint16Array(imageBytes >> 1)
        const put = (byteOffset, block) => {
            const from = (byteOffset >> 1) + EPSBlocks.OBJECT_HEADER_WORDS
            for(let i = 0; i < block.length; i++) words[from + i] = block[i] & 0xFFFF
        }

        // --- the instrument --------------------------------------------------
        const instBlock = Array.from(instrument.words)
        // Pitch tables and the effect are not carried by a backup, so their
        // pointers are cleared rather than left pointing into nothing.
        for(let i = 0; i < EPSBlocks.PITCH_TABLE_COUNT; i++){
            const at = EPSBlocks.INST_PITCH_TABLE_PTRS + i * 2
            if(instBlock[at] || instBlock[at + 1]) lost.push(`Pitch table ${i + 1} is not saved`)
            instBlock[at] = 0
            instBlock[at + 1] = 0
        }
        if(instrument.hasEffect) lost.push("The effect is not saved: it cannot be read "
            + "back off the synth, so a backup does not hold one")
        instBlock[EPSBlocks.INST_EFFECT_PTR] = 0
        instBlock[EPSBlocks.INST_EFFECT_PTR + 1] = 0
        // Section 7.1 word 15, which the original EPS maintains and the
        // EPS-16 PLUS does not. Written correctly either way.
        instBlock[15] = Math.min(0xFFFF, Math.round(imageBytes / EPSEfe.BLOCK_BYTES))
        for(let i = 0; i < EPSBlocks.LAYER_COUNT; i++){
            EPSEfe.packOffset(instBlock, EPSBlocks.INST_LAYER_PTRS + i * 2,
                placed.has(`layer${i}`) ? placed.get(`layer${i}`) : 0)
        }
        for(let n = 0; n < EPSBlocks.WAVESAMPLE_COUNT; n++){
            EPSEfe.packOffset(instBlock, EPSBlocks.INST_WAVESAMPLE_PTRS + n * 2,
                placed.has(`ws${n}`) ? placed.get(`ws${n}`) : 0)
        }
        EPSEfe.packBlockSize(words, 0, imageBytes)
        words[2] = EPSEfe.INSTRUMENT_SELF_PTR
        words[3] = EPSEfe.INSTRUMENT_LINK_WORDS[0]
        words[4] = EPSEfe.INSTRUMENT_LINK_WORDS[1]
        put(0, instBlock)

        // --- layers, and the wavesample chain each one owns -------------------
        for(const layer of layers){
            const offset = placed.get(`layer${layer.number}`)
            const chain = wavesamples
                .filter(ws => (ws.layer == null ? layers[0].number : ws.layer) == layer.number)
                .map(ws => ws.number)
                .sort((a, b) => a - b)
            const word = offset >> 1
            EPSEfe.packBlockSize(words, word,
                (EPSBlocks.OBJECT_HEADER_WORDS + EPSBlocks.LAYER_BLOCK_WORDS) * 2)
            words[word + 2] = EPSEfe.pointerAt(EPSBlocks.INST_LAYER_PTRS + layer.number * 2) * 16
            words[word + 3] = (chain.length ? chain[0] : 0) << 8
            words[word + 4] = (chain.length ? chain[chain.length - 1] : 0) << 8
            put(offset, layer.words)

            for(let i = 0; i < chain.length; i++){
                const ws = placed.get(`ws${chain[i]}`) >> 1
                words[ws + 3] = (i + 1 < chain.length ? chain[i + 1] : 0) << 8
                words[ws + 4] = (i > 0 ? chain[i - 1] : 0) << 8
            }
        }

        // --- wavesamples, and the audio that follows each ---------------------
        for(const ws of wavesamples){
            const offset = placed.get(`ws${ws.number}`)
            const word = offset >> 1
            const samples = samplesFor(ws)
            EPSEfe.packBlockSize(words, word,
                EPSEfe.align(EPSEfe.WAVESAMPLE_HEADER_BYTES + samples * 2, 16))
            words[word + 2] =
                EPSEfe.pointerAt(EPSBlocks.INST_WAVESAMPLE_PTRS + ws.number * 2) * 16
            // Words 3 and 4 were set by the layer walk above.
            put(offset, ws.words)
            if(ws.isCopy) continue
            const held = audio.get(ws.number)
            if(!held || held.length == 0){
                lost.push(`Wavesample ${ws.number} has no audio and is written silent`)
                continue
            }
            const from = (offset + EPSEfe.WAVESAMPLE_HEADER_BYTES) >> 1
            for(let i = 0; i < held.length; i++) words[from + i] = held[i] & 0xFFFF
        }

        // Motorola byte order throughout, per Appendix B.
        for(let i = 0; i < words.length; i++){
            image[i * 2] = (words[i] >> 8) & 0xFF
            image[i * 2 + 1] = words[i] & 0xFF
        }

        // --- the 512 byte header ---------------------------------------------
        const header = new Uint8Array(EPSEfe.HEADER_BYTES)
        const write = (from, text, length, pad = " ") => {
            const padded = String(text).slice(0, length).padEnd(length, pad)
            for(let i = 0; i < length; i++) header[from + i] = padded.charCodeAt(i) & 0xFF
        }
        const original = !instrument.isEps16Plus
        header[0] = 0x0D
        header[1] = 0x0A
        write(EPSEfe.SIGNATURE_AT,
            original ? EPSEfe.SIGNATURE_ORIGINAL : EPSEfe.SIGNATURE_16_PLUS,
            EPSEfe.SIGNATURE_BYTES, original ? "_" : " ")
        // 16 bytes rather than 12: the four that follow the name are part of
        // the same space padded field in every file.
        write(EPSEfe.NAME_AT, options.name || instrument.name || "", 16,
            original ? "_" : " ")
        write(EPSEfe.TYPE_NAME_AT, "Instrument", 13, original ? "_" : " ")
        header[0x2F] = 0x0D
        header[0x30] = 0x0A
        header[0x31] = 0x1A
        header[EPSEfe.TYPE_AT] = EPSEfe.TYPE_INSTRUMENT
        const blocks = imageBytes / EPSEfe.BLOCK_BYTES
        header[EPSEfe.SIZE_BLOCKS_AT] = (blocks >> 8) & 0xFF
        header[EPSEfe.SIZE_BLOCKS_AT + 1] = blocks & 0xFF
        header[EPSEfe.SIZE_BLOCKS_REPEAT_AT] = (blocks >> 8) & 0xFF
        header[EPSEfe.SIZE_BLOCKS_REPEAT_AT + 1] = blocks & 0xFF
        header[EPSEfe.MACHINE_AT] = original
            ? EPSEfe.MACHINE_ORIGINAL : EPSEfe.MACHINE_16_PLUS

        const out = new Uint8Array(EPSEfe.HEADER_BYTES + imageBytes)
        out.set(header, 0)
        out.set(image, EPSEfe.HEADER_BYTES)
        return { bytes: out, lost, blocks }
    }

    /***
     * The effect, which a file can answer and the synth cannot.
     *
     * THE ALGORITHM NAME IS NOT READABLE OVER MIDI BY ANY ROUTE — see readEffect
     * in eps.js for the two places the specification says so. On disk it is
     * simply there: the effect is an object like any other, and word 5 onwards
     * is its name in the usual one character per high byte.
     *
     * Of the 42 instrument files here exactly one, JUCOSMOP.EFE, carries an
     * effect block, so everything below rests on a single specimen. It reads
     * cleanly and every field lands where Appendix B's `effect definition` says
     * it should, which is why it is here at all — but one specimen is one
     * specimen, and anything that does not look right is dropped rather than
     * shown.
     *
     * Byte offsets from the start of the object, per Appendix B:
     *
     *   0   effect_block_size, effect_ptr_offset, effect_ptr_more,
     *       effect_version_num — the same five words of header every object has
     *   10  effect_name, 12 characters
     *   34  effect_size, a 32 bit byte count "incl. ucode"
     *   38  the microcode and parameter page pointers, of no use here
     *   60  effect_fx1_name, effect_fx2_name, effect_fx3_name, 13 bytes each,
     *       NUL terminated plain ASCII rather than the high byte encoding
     *   99  effect_current_var
     */
    static EFFECT_NAME_WORD = 5
    static EFFECT_SIZE_AT = 34
    static EFFECT_INNER_NAMES_AT = 60
    static EFFECT_INNER_NAME_BYTES = 13
    static EFFECT_INNER_NAME_COUNT = 3
    static EFFECT_CURRENT_VARIATION_AT = 99
    static EFFECT_OBJECT_BYTES = 100

    static readEffect(file, instrument){
        if(!instrument.hasEffect) return null
        const at = instrument.effectOffset
        if(at + EPSEfe.EFFECT_OBJECT_BYTES > file.image.length) return null

        const words = file.words.subarray(at >> 1)
        const name = EPSBlocks.readName(words, EPSEfe.EFFECT_NAME_WORD)
        // An offset that survived the bounds check but points at audio would
        // still give a "name". Requiring it to be printable and non-empty is
        // what tells the two apart.
        if(!/^[\x20-\x7E]+$/.test(name) || name.trim() == "") return null

        const byte = (i) => file.image[at + i]
        const text = (from, length) => {
            let out = ""
            for(let i = 0; i < length; i++){
                const code = byte(from + i)
                if(code == 0) break
                out += (code >= 0x20 && code <= 0x7E) ? String.fromCharCode(code) : " "
            }
            return out.trim()
        }
        const inner = []
        for(let i = 0; i < EPSEfe.EFFECT_INNER_NAME_COUNT; i++){
            const one = text(EPSEfe.EFFECT_INNER_NAMES_AT
                + i * EPSEfe.EFFECT_INNER_NAME_BYTES, EPSEfe.EFFECT_INNER_NAME_BYTES)
            if(one) inner.push(one)
        }
        return {
            name: name.trim(),
            // Appendix B: "total size in bytes, incl. ucode".
            sizeBytes: (byte(EPSEfe.EFFECT_SIZE_AT) << 24)
                | (byte(EPSEfe.EFFECT_SIZE_AT + 1) << 16)
                | (byte(EPSEfe.EFFECT_SIZE_AT + 2) << 8) | byte(EPSEfe.EFFECT_SIZE_AT + 3),
            /***
             * The three names inside the block, reported as what they are and
             * not as what they look like.
             *
             * In the one file to hand they are "JUST REVERB", "MORE REVERB" and
             * "ALSO REVERB" inside an effect called "HALL REVERB", which reads
             * exactly like a list of variations. But section 9 gives the
             * Variation parameter as "0-3 (Variations 1-4)" and there are three
             * of these, so either the algorithm's own name is the fourth or
             * they are not the variations at all. One specimen cannot settle
             * it, so they are shown verbatim and left unlabelled.
             */
            innerNames: inner,
            currentVariation: byte(EPSEfe.EFFECT_CURRENT_VARIATION_AT),
            offset: at
        }
    }

    /***
     * Everything inside an instrument file, in the shape getInstrumentInventory
     * returns for the same instrument read over MIDI, so one renderer serves
     * both.
     *
     * Unlike the MIDI path this costs nothing: the whole image is already in
     * memory, so there is no progress to report and no reason to fetch lazily.
     */
    static readInstrument(file){
        if(!file.isInstrument){
            throw new Error(`This EFE holds ${file.typeName || "type " + file.type}, `
                + "not an instrument")
        }
        const words = file.words
        const instrumentBlock = EPSEfe.blockAt(words, 0, EPSBlocks.INSTRUMENT_BLOCK_WORDS)
        // The raw block travels with the decoded one, because a restore has to
        // write these words back and cannot reconstruct them from the fields.
        const instrument = { ...EPSBlocks.decodeInstrument(instrumentBlock),
            words: instrumentBlock }

        const layers = instrument.layers.filter(slot => slot.exists).map(slot => {
            const block = EPSEfe.blockAt(words, slot.offset, EPSBlocks.LAYER_BLOCK_WORDS)
            return { ...EPSBlocks.decodeLayer(block), number: slot.number, words: block }
        })

        const wavesamples = instrument.wavesamples.filter(slot => slot.exists).map(slot => {
            const block = EPSEfe.blockAt(words, slot.offset, EPSBlocks.WAVESAMPLE_BLOCK_WORDS)
            const ws = EPSBlocks.decodeWavesample(block)
            const owner = layers.find(layer => layer.wavesamplesUsed.includes(slot.number))
            return { ...ws, number: slot.number, words: block, offset: slot.offset,
                layer: owner ? owner.number : null,
                sampleRateHz: WaveGen.rateFromCode(ws.sampleRateCode) }
        })

        // A copy holds no audio of its own, so counting one would double the
        // size of every split that shares a sample between zones.
        const audioSamples = wavesamples.filter(ws => !ws.isCopy)
            .reduce((sum, ws) => sum + ws.sampleEnd, 0)

        return { source: "efe", file, instrument, layers, wavesamples, audioSamples,
            effect: EPSEfe.readEffect(file, instrument),
            // Three MIDI bytes carry one 16 bit sample, section 2.3. Only of
            // interest here as an estimate of what sending this to the synth
            // would cost.
            wireBytes: audioSamples * 3 }
    }
}

// Node runs the tests; the browser gets the class from the script tag.
if(typeof module != 'undefined' && module.exports) module.exports = EPSEfe
