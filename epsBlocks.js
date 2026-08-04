/***
 * Decoders for the three parameter blocks of section 7: the instrument, the
 * layer and the wavesample.
 *
 * Nothing here talks to MIDI, to the DOM or to the rest of the app. Everything
 * takes a plain array of 16 bit words and returns a plain object, which is what
 * makes it testable without a synth attached.
 *
 * WHY THIS IS A SEPARATE FILE, AND WHY IT TAKES WORDS RATHER THAN BYTES
 *
 * The same layout arrives by two completely different routes.
 *
 * Over MIDI, GET INSTRUMENT and friends return the block described by sections
 * 7.1 to 7.3, and eps.js turns it into 16 bit words with convertFrom16BitMidi.
 * The array index is then the word offset the specification prints.
 *
 * On disk, an Ensoniq .EFE file is a 512 byte header followed by the EPS's own
 * memory image. Each object in that image opens with five words of allocator
 * bookkeeping — Appendix B calls them block size, self pointer and the list
 * links — and those five words are not transmitted over MIDI. Skip them and the
 * rest of the object is byte for byte the block in section 7.
 *
 * That was checked against a real instrument file rather than assumed. Reading
 * an EPS-16 PLUS .EFE as words and slicing each object at its offset plus five
 * words puts $FFFF exactly on word 25, which section 7.1 names as the field
 * whose value $FFFF identifies an EPS-16 PLUS; puts a sensible key range on
 * words 26 and 27; puts the pointer tables at word 29; and puts a wavesample's
 * Copy Number on word 12 pointing at a wavesample that does hold the audio.
 * Four independent landmarks agreeing is not a coincidence.
 *
 * So these functions are written against word offsets and know nothing about
 * where the words came from. Both callers slice, then decode.
 */
class EPSBlocks {

    /***
     * Section 7.1: eight pitch tables, eight layers, 128 wavesamples.
     *
     * Wavesamples are numbered from 1 on the front panel and slot 0 of the
     * table is never used, which is why a walk over it starts at 1. Appendix B
     * agrees, calling for "up to 127 WaveSamples" in a 128 entry table.
     */
    static PITCH_TABLE_COUNT = 8
    static LAYER_COUNT = 8
    static WAVESAMPLE_COUNT = 128

    static NAME_WORD = 0
    static NAME_LENGTH = 12

    /***
     * How long each parameter block is, in words.
     *
     * Section 7.1 runs to word 322, 7.2 to word 106 and 7.3 to word 138. These
     * are the lengths the EPS transmits and the lengths it expects back, so a
     * block sliced out of a disk image has to be cut to exactly these or a
     * restore offers the synth the entire rest of the file.
     */
    static INSTRUMENT_BLOCK_WORDS = 323
    static LAYER_BLOCK_WORDS = 107
    static WAVESAMPLE_BLOCK_WORDS = 139

    /***
     * Word offsets of the four pointer tables inside the instrument block,
     * section 7.1 words 29 to 317. Each entry is a packed offset occupying two
     * words, so a table of n entries is 2n words long.
     */
    static INST_PITCH_TABLE_PTRS = 29
    static INST_LAYER_PTRS = 45
    static INST_WAVESAMPLE_PTRS = 61
    static INST_EFFECT_PTR = 317

    /***
     * How much room the instrument's own object takes, and therefore the
     * smallest offset at which any other object can begin.
     *
     * Section 7.1 runs to word 322, and an object carries five words of header
     * ahead of word 0, so the instrument occupies 10 + 323*2 = 656 bytes. That
     * is already a multiple of the 16 byte chunking, so it needs no rounding.
     * Every instrument file examined places its first layer at exactly this
     * offset.
     *
     * Used to reject offsets that cannot be real. That is not paranoia: see
     * the effect pointer in decodeInstrument.
     */
    static INSTRUMENT_OBJECT_BYTES = 10 + 323 * 2

    /***
     * How far into an object on disk the transmitted block begins.
     *
     * Appendix B's structure listings open every object with block size (a long
     * word), a self or pointer offset, and two list link words: five words in
     * all before the name. Only the name onwards goes over the wire.
     */
    static OBJECT_HEADER_WORDS = 5

    /***
     * Section 7.2 word 19-106: one wavesample number per key, 88 of them.
     *
     * Which key the first entry stands for is not stated anywhere in the
     * specification, so it was measured. In a real two layer instrument the
     * occupied part of both maps runs from index 15 to index 75, and the
     * wavesamples those maps name declare key ranges 36-64 and 65-96. Index 15
     * against key 36, index 44 against key 65 and index 75 against key 96 all
     * give the same answer, at both ends of both layers: the map starts at MIDI
     * key 21. Which is what an 88 entry map ought to start at, 21 to 108 being
     * the 88 keys of a piano.
     *
     * Measured from one instrument, so treat a map that disagrees with its own
     * wavesample key ranges as the interesting case rather than as impossible.
     */
    static LAYER_MAP_WORD = 19
    static LAYER_MAP_LENGTH = 88
    static LAYER_MAP_BASE_KEY = 21

    /***
     * The MIDI key an entry of the layer map stands for, and the inverse.
     * Returns null outside the map, which is most of the MIDI range.
     */
    static keyForMapIndex(index){
        return index >= 0 && index < EPSBlocks.LAYER_MAP_LENGTH
            ? EPSBlocks.LAYER_MAP_BASE_KEY + index : null
    }
    static mapIndexForKey(key){
        const index = key - EPSBlocks.LAYER_MAP_BASE_KEY
        return index >= 0 && index < EPSBlocks.LAYER_MAP_LENGTH ? index : null
    }

    /***
     * A word carries its value in the high byte, which is the rule for all
     * three blocks. Section 7.1 and 7.2 say so in the table header, and 7.3
     * says so "unless otherwise specified", the exceptions being the handful of
     * words that pack a second parameter into the low byte.
     */
    static hi(words, at){ return (words[at] >> 8) & 0xFF }
    static lo(words, at){ return words[at] & 0xFF }

    /***
     * The same, as a signed byte. Transposition and fine tune are the ones that
     * need it; section 7.1 word 28 is "number of semitones (signed)".
     */
    static signedHi(words, at){
        const raw = EPSBlocks.hi(words, at)
        return raw > 127 ? raw - 256 : raw
    }

    /***
     * Twelve characters, one per word, in the high byte.
     *
     * Unprintable codes become spaces rather than disappearing, so the
     * characters keep the positions they occupy on the EPS display. On disk the
     * low bytes of these words are not always zero — real files have rubbish in
     * them — so only the high byte is ever looked at, and any caller writing a
     * block back must return those low bytes untouched.
     */
    static readName(words, at = EPSBlocks.NAME_WORD){
        let name = ''
        for(let i = 0; i < EPSBlocks.NAME_LENGTH; i++){
            const code = EPSBlocks.hi(words, at + i) & 0x7F
            name += (code >= 0x20 && code <= 0x7E) ? String.fromCharCode(code) : ' '
        }
        return name.replace(/ +$/, '')
    }

    /***
     * Unpacks one of the offsets in the instrument's pointer tables.
     *
     * Appendix B: an offset is 32 bits held in two words, with the low three
     * bits of every word unreadable on the original EPS, which is why the
     * packing is so odd. Of the four bytes, the first supplies bits 19-12, the
     * third supplies bits 11-4, the high nibble of the fourth supplies bits
     * 23-20, and the second byte is unused. Four zero bits are appended, which
     * is what makes every object start on a 16 byte boundary.
     *
     * Appendix B's own worked example is the test: $00123450 packs as $2300
     * $4510, and this returns 0x123450 for that input.
     *
     * OVER MIDI THE VALUE IS MEANINGLESS AND ONLY THE ZERO TEST MATTERS. These
     * are offsets into the EPS's RAM as it was arranged at the moment of the
     * dump. A zero offset means the object does not exist, which is the whole
     * inventory; a non-zero one says nothing that survives the trip.
     */
    static unpackOffset(words, at){
        const byte0 = EPSBlocks.hi(words, at)
        const byte2 = EPSBlocks.hi(words, at + 1)
        const byte3 = EPSBlocks.lo(words, at + 1)
        return ((byte3 >> 4) << 20) | (byte0 << 12) | (byte2 << 4)
    }

    /***
     * Reads a table of packed offsets into an array of {number, offset, exists}.
     */
    static readOffsetTable(words, at, count, firstNumber = 0){
        const entries = []
        for(let i = 0; i < count; i++){
            const offset = EPSBlocks.unpackOffset(words, at + i * 2)
            entries.push({ number: firstNumber + i, offset, exists: offset != 0 })
        }
        return entries
    }

    /***
     * Section 7.1. The parameters are the first 29 words; everything after them
     * is the directory of what the instrument contains.
     */
    static decodeInstrument(words){
        const layers = EPSBlocks.readOffsetTable(
            words, EPSBlocks.INST_LAYER_PTRS, EPSBlocks.LAYER_COUNT)
        const wavesamples = EPSBlocks.readOffsetTable(
            words, EPSBlocks.INST_WAVESAMPLE_PTRS, EPSBlocks.WAVESAMPLE_COUNT)
        const pitchTables = EPSBlocks.readOffsetTable(
            words, EPSBlocks.INST_PITCH_TABLE_PTRS, EPSBlocks.PITCH_TABLE_COUNT)
        /***
         * The effect pointer, and why it is checked rather than believed.
         *
         * Section 7.1 gives word 317 as the effect offset and calls 318-322
         * unused. Appendix B gives `inst_effect_ptr ds.l 1`, which is two
         * words, so 317 and 318. Every other offset in the block is two words,
         * which makes Appendix B the more likely reading.
         *
         * Real files say otherwise. In every original EPS instrument examined,
         * word 317 is zero and word 318 is `0x1000`; reading the pair as a
         * packed offset yields 0x100, which lands 400 bytes inside the
         * instrument's own object and cannot be anything. The original EPS had
         * no effects processor at all, so those instruments cannot have an
         * effect block by construction. Word 318 is something else that the
         * EPS-16 PLUS zeroes and the original EPS does not.
         *
         * Rather than pick a side, the offset is read as Appendix B describes
         * and then rejected if it points somewhere impossible. That is correct
         * under either reading and does not depend on which machine wrote the
         * file.
         */
        const rawEffectOffset = EPSBlocks.unpackOffset(words, EPSBlocks.INST_EFFECT_PTR)
        const effectOffset = rawEffectOffset >= EPSBlocks.INSTRUMENT_OBJECT_BYTES
            ? rawEffectOffset : 0
        const id = words[25]
        return {
            name: EPSBlocks.readName(words),
            midiChannel: EPSBlocks.hi(words, 12),
            midiProgram: EPSBlocks.hi(words, 13),
            pressureMode: EPSBlocks.hi(words, 14),
            // Section 7.1: "1 Block = 256 words". The same block as the free
            // memory figure ping() reads, which is what would make this the
            // pre-flight test for whether an instrument fits before spending
            // twenty minutes finding out that it does not.
            //
            // DO NOT TRUST IT FROM A FILE. In a 517 block instrument on disk
            // this field reads 1, and words 13 through 16 all read the same
            // 0x0100, which is what an unmaintained field looks like. The size
            // is presumably filled in when the instrument is loaded into RAM,
            // so the value may well be right over MIDI — untested, no hardware
            // here. For a file, count the image instead.
            sizeBlocks: EPSBlocks.hi(words, 15),
            midiStatus: EPSBlocks.hi(words, 16),
            patches: [EPSBlocks.hi(words, 17), EPSBlocks.hi(words, 18),
                      EPSBlocks.hi(words, 19), EPSBlocks.hi(words, 20)],
            keyDownLayers: EPSBlocks.hi(words, 21),
            keyUpLayers: EPSBlocks.hi(words, 22),
            patchSelectMode: EPSBlocks.hi(words, 23),
            // Word 25 is the one field read as a whole word rather than a high
            // byte, because section 7.1 defines it by its full value: "$FFFF
            // indicates EPS-16 PLUS", anything else an original EPS.
            id,
            isEps16Plus: id == 0xFFFF,
            keyRangeLo: EPSBlocks.hi(words, 26),
            keyRangeHi: EPSBlocks.hi(words, 27),
            transpose: EPSBlocks.signedHi(words, 28),
            pitchTables,
            layers,
            wavesamples,
            effectOffset,
            rawEffectOffset,
            hasEffect: effectOffset != 0
        }
    }

    /***
     * Section 7.2. Words 12 and 13 pack two parameters each; the rest of the
     * block is the key map.
     */
    static decodeLayer(words){
        const map = []
        for(let i = 0; i < EPSBlocks.LAYER_MAP_LENGTH; i++){
            map.push(EPSBlocks.hi(words, EPSBlocks.LAYER_MAP_WORD + i))
        }
        return {
            name: EPSBlocks.readName(words),
            glideMode: EPSBlocks.hi(words, 12),
            delayModByVelocity: EPSBlocks.lo(words, 12),
            glideTime: EPSBlocks.hi(words, 13),
            restrikeDecayTime: EPSBlocks.lo(words, 13),
            legatoLayer: EPSBlocks.hi(words, 14),
            velocityLo: EPSBlocks.hi(words, 15),
            velocityHi: EPSBlocks.hi(words, 16),
            pitchTable: EPSBlocks.hi(words, 17),
            delayTime: EPSBlocks.hi(words, 18),
            map,
            // Which wavesamples this layer actually plays. Section 7.2 calls a
            // map entry a wavesample number, while Appendix B's comment calls
            // it a 12 bit offset into the instrument's wavesample table; the
            // two disagree and section 7.2 is the one that matches real files,
            // where every value in the map is the number of a wavesample whose
            // pointer table slot is occupied. Zero means no wavesample on that
            // key and is not a wavesample number.
            wavesamplesUsed: [...new Set(map.filter(n => n != 0))].sort((a, b) => a - b)
        }
    }

    /***
     * The four sample position fields of section 7.3, words 115 to 130.
     *
     * Each is "a left justified 32 bit field using hi bytes of each word". The
     * three that address a sample shift right 9 to give a word offset into the
     * wavedata; the loop end shifts right 5 instead, keeping four extra bits as
     * a fraction, so it is returned both ways.
     */
    static readSampleOffset(words, at){
        return (EPSBlocks.hi(words, at) << 24) | (EPSBlocks.hi(words, at + 1) << 16)
             | (EPSBlocks.hi(words, at + 2) << 8) | EPSBlocks.hi(words, at + 3)
    }

    /***
     * The inverse of readSampleOffset: writes a sample count back into one of
     * the four 32 bit position fields.
     *
     * The value is left justified across the high bytes of four words, so a
     * word offset goes in shifted left 9. The low bytes are preserved, because
     * in a real block they are not always zero and nothing here knows what the
     * EPS keeps in them.
     */
    static writeSampleOffset(words, at, samples){
        const raw = samples * 512
        for(let i = 0; i < 4; i++){
            const byte = (raw / Math.pow(256, 3 - i)) & 0xFF
            words[at + i] = (words[at + i] & 0x00FF) | (byte << 8)
        }
    }

    /***
     * Section 7.3. Only the fields an inventory needs are decoded; the envelopes
     * of words 14 to 79 are left alone, since nothing yet displays them and a
     * backup keeps the raw block anyway.
     */
    static decodeWavesample(words){
        const copyNumber = EPSBlocks.hi(words, 12)
        const loopEndRaw = EPSBlocks.readSampleOffset(words, 127)
        return {
            name: EPSBlocks.readName(words),
            // Section 7.3: if non-zero this wavesample holds no audio of its
            // own and shares the data of the wavesample named here. Asking the
            // EPS for its wavedata answers with status $11, "Wavesample is a
            // copy", so a backup has to notice this and not ask.
            copyNumber,
            copyLayer: EPSBlocks.hi(words, 13),
            isCopy: copyNumber != 0,
            rootKey: EPSBlocks.hi(words, 80),
            fadecurve: EPSBlocks.lo(words, 80),
            fineTune: EPSBlocks.signedHi(words, 86),
            volume: EPSBlocks.hi(words, 99),
            outputBus: EPSBlocks.lo(words, 99),
            pan: EPSBlocks.lo(words, 105),
            loopMode: EPSBlocks.hi(words, 114),
            sampleStart: EPSBlocks.readSampleOffset(words, 115) >>> 9,
            sampleEnd: EPSBlocks.readSampleOffset(words, 119) >>> 9,
            loopStart: EPSBlocks.readSampleOffset(words, 123) >>> 9,
            loopEnd: loopEndRaw >>> 9,
            loopEndFraction: (loopEndRaw >>> 5) & 0x0F,
            // Section 7.3 word 131 gives a period of "rate * 1.6 microseconds".
            // Left as the raw code: WaveGen owns the conversion to Hz, and this
            // file deliberately depends on nothing.
            sampleRateCode: EPSBlocks.hi(words, 131),
            keyRangeLo: EPSBlocks.hi(words, 132),
            keyRangeHi: EPSBlocks.hi(words, 133)
        }
    }
}

// Node runs the tests; the browser gets the class from the script tag.
if(typeof module != 'undefined' && module.exports) module.exports = EPSBlocks
