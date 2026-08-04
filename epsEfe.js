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
            // Three MIDI bytes carry one 16 bit sample, section 2.3. Only of
            // interest here as an estimate of what sending this to the synth
            // would cost.
            wireBytes: audioSamples * 3 }
    }
}

// Node runs the tests; the browser gets the class from the script tag.
if(typeof module != 'undefined' && module.exports) module.exports = EPSEfe
