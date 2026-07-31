class EPS16 {
    /***
     * Most samples accepted from a WAV file, matching the EPS16+'s standard
     * memory. Longer files are truncated to this on import.
     */
    static MAX_IMPORT_SAMPLES = 512900

    inputs = []
    outputs = []
    constructor(setUpCallback, errorCallback, successCallback){
        this.inputs = []
        this.outputs = []
        this.instNum = 0
        this.layerNum = 0
        this.wsBytes = [0x00, 0x01]
        this.midiInput = NaN
        this.midiOutput = NaN
        this.midiMessages = []
        this.setUpCallback = setUpCallback
        this.errorCallback = errorCallback
        this.successCallback = successCallback
        // Optional log sinks. Both default to no-ops so the class works without
        // any UI attached.
        this.midiCallback = () => {}
        this.debugCallback = () => {}
        // Never let a missing or refused Web MIDI implementation escape the
        // constructor. This runs before the rest of the page is wired up, so a
        // throw here would take the editor, the generator and every button with
        // it, and the page would look dead rather than merely disconnected.
        // Firefox does not always expose requestMIDIAccess; Chrome always does.
        if(typeof navigator.requestMIDIAccess != 'function'){
            this.errorCallback("Error: This browser does not support Web MIDI, so the EPS16+ "
                + "cannot be reached. Generating, editing, previewing and saving WAV files still work. "
                + "Chrome or a Chromium based browser is needed for transfers.")
            return
        }
        try{
            navigator.requestMIDIAccess({sysex: true}).then( (midiAccess) => {
                for(let input of midiAccess.inputs.values()){
                    this.inputs.push(input)
                }
                for(let output of midiAccess.outputs.values()){
                    this.outputs.push(output)
                }
                this.setUpCallback(this.inputs, this.outputs)

            }, (error) => {
                this.errorCallback(`Error: Web MIDI access was refused (${error}). `
                    + "Sysex permission is required to talk to the EPS16+.")
            });
        }catch(error){
            this.errorCallback(`Error: Could not request Web MIDI access (${error})`)
        }

    }
    /***
     * EPS Sysex Commands
     */
    async getWavesampleParams(){
        let cmd = this.createMIDIMessage(0x05)
        await this.sendData(cmd);
        let messages = await this.readMessages()
        for(let msg of messages){
            if(await this.isAck(msg)){
                await this.sendAck()
                let responses = await this.readMessages()
                for(let resp of responses){
                    return this.convertFrom16BitMidi(resp, true)
                }
            }
        }
        this.errorCallback("Error: Unable to get WaveSample Parameters")
        return []
        
    }
    async deleteInstrument(){
        const msg = this.createMIDIMessage(0x1C)
        await this.sendData(msg)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Deleted instrument")
        }else{
            this.errorCallback("Error: Unable to delete instrument")
        }
    }
    async sendAck(){
        const data = [
            0x01,
            0x00,
            0x00
        ]
        await this.sendData(data) 
    }
    async createInstrument(){
        let message = this.createMIDIMessage(0x15)
        await this.sendData(message)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Created instrument")
            return true
        }else{
            this.errorCallback("Error: Unable to create instrument")
            return false
        }

    }
    async createLayer(){
        let message = this.createMIDIMessage(0x16)
        await this.sendData(message)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Created layer")
            return true
        }else{
            this.errorCallback("Error: Unable to create layer")
            return false
        }
    }
    async createSqrWave(){
        let message = this.createMIDIMessage(0x19)
        await this.sendData(message)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Created SQR")
            return true
        }else{
            this.errorCallback("Error: Unable to create SQR wavesample")
            return false;
        }
    }
    async clearWavesample(){
        let params = await this.getWavesampleParams()
        if(params.length == 0) return false
        let length = this.getEndOffset(params)
        let offsets = this.convertTo12BitMidi([length])
        let data = [
            0x00, // start offset
            0x00, // start offset
            0x00, // start offset
            0x00, // start offset
        ]
        data.concat(offsets)
        let cmd = this.createMIDIMessage(0x1f, data)
        await this.sendData(cmd)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Cleared wavesample")
            return true
        }else{
            this.errorCallback("Error: Ubnable to clear wavesample")
            return false
        }

    }
    async truncateWavesample(){
        let cmd = this.createMIDIMessage(0x1E)
        await this.sendData(cmd)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Truncated wavesample")
            return true
        }else{
            this.errorCallback("Error: Unable to Truncate wavesample")
            return false
        }
    }
    async getWavesampleDataChunked(chunkSize, plotCallback){
        let wavedata = []
        const params = await this.getWavesampleParams()
        if(params.length == 0 ) return []
        const offset = this.getEndOffset(params)
        const iter = Math.floor(offset/chunkSize)
        for(let i=0; i<=iter; i++){
            let start = chunkSize * i
            let end = (chunkSize *i) + chunkSize
            let wavePart = await this.getWavesampleData(start, end)
            wavedata = wavedata.concat(wavePart)
            this.debug("WAVE", wavedata.length)

            plotCallback(wavedata, Math.min(100, Math.round((wavedata.length / offset) * 100)))
        }
        if(wavedata.length < offset){
            let start = wavedata.length
            let end = offset
            let wavePart = await this.getWavesampleData(start,end)

            wavedata = wavedata.concat(wavePart)
            this.debug("WAVE Last", wavedata.length)

            plotCallback(wavedata, Math.min(100, Math.round((wavedata.length / offset) * 100)))
        }
        
        return wavedata
    }
    async getWavesampleData(start, end){
        let startOffset = this.convertTo12BitMidi([start],4)
        let endOffset = this.convertTo12BitMidi([end],4)
        let sampleOffsets = startOffset.concat(endOffset)
        let cmd = this.createMIDIMessage(0x06, sampleOffsets)
        await this.sendData(cmd)
        let responses = await this.readMessages()
        this.debug("#####################Responses", responses)
        for(let resp of responses){
            if(await this.isAck(resp)){
                await this.sleep(1000)
                await this.sendAck()
                let messages = await this.readMessages()
                this.debug("#####################", messages)
                for(let msg of messages){
                    if(msg.length > 4){
                        let waveData = this.convertFrom16BitMidi(msg)
                        for(let i=0; i<waveData.length; i++){
                            waveData[i] = this.convertToSignedInt(waveData[i]) 

                        }
                        this.successCallback("Success: Getting wavesample data from EPS")
                        return waveData
                    }
                }

            }
        }
        this.errorCallback("Error: Unable to get wavesample data from EPS")
        return []
    }
    async setParameter(paramGroup, paramByte, paramValue){
        this.debug(`Setting Value ${paramValue.toString(16)}, ${paramValue} for group ${paramGroup.toString(16)}, ${paramByte.toString(16)}`)
        let header = [paramGroup, paramByte]
        let midiValue = this.convertTo12BitMidi([paramValue],4)
        this.debug(`Converted 12 bit midi value is ${midiValue.map(val => val.toString(16))}`)
        let msg = header.concat(midiValue)
        let cmd = this.createMIDIMessage(0x11,msg)
        this.debug("Set Parameter", cmd)
        await this.sendData(cmd)
    }
    async putWavesampleDataInChunks(audio, chunkSize, numWaves=1, waveIndex=0, progressCallback=()=>{}){
        this.debug("Total Size: ", audio.length)
        let chunks = []
        for (let i = 0; i < audio.length; i += chunkSize) {
            const chunk = audio.slice(i, i + chunkSize);
            /*if(chunk.length < chunkSize){
                while(chunk.length < chunkSize){
                    chunk.push(0)
                }
            }*/
            chunks.push(chunk)
        }
        this.debug(chunks)

        let start = 0;
        for(let chunk of chunks){
            if(!await this.putWavesampleData(chunk, start)){
                //try again
                if(!await this.putWavesampleData(chunk, start)){
                    this.errorCallback("Error: Unable to upload a portion of the wavesample")
                    return false
                }
                await this.sleep(2000)
            } 
            this.debug( "Percent Complete:", ((start+chunk.length)/audio.length) * 100)
            progressCallback(
                `${ Math.round(
                    (waveIndex + ((start+chunk.length)/audio.length))/numWaves*100)
                }`)
            start+=chunkSize
        }
        await this.sendAck()
        let messages = await this.readMessages()
        await this.sendAck()
        await this.sleep(1000)
        await this.setParameter(0x20, 0x18, audio.length)
        return true

    }
    async putWavesampleData(audio, start=0){
        this.debug("OFFSETS", start, audio.length, audio.length + start)
        let midiData = this.convertTo16BitMidi(audio)
        let startOffset = this.convertTo12BitMidi([start], 4)
        let endOffset = this.convertTo12BitMidi([audio.length + start], 4)
        let sampleOffsets = startOffset.concat(endOffset)
        let cmd = this.createMIDIMessage(0x0f,sampleOffsets)
        //send offset command
        await this.sendData(cmd)
        let messages = await this.readMessages()
        if(messages.length == 0){
            this.errorCallback("Error: Unable to initiate pushing a wavesample to the the EPS")
            return false
        }
        for(let msg of messages){
            if(await this.isAck(msg)){
                //send midi data
                //await this.sendAck()
                await this.sendData(midiData)
                let responses = await this.readMessages()
                if(responses.length == 0 ){
                    this.successCallback("Success: Wavesample data successfully sent")
                    return true
                }
                for(let resp of responses){
                    if(await this.isAck(resp)){
                        this.successCallback("Success: Wavesample data successfully sent")
                        return true
                    }
                }
            }
        }
        this.errorCallback("Error: Unable to send wavesample data to EPS")
        return false


    }

    async uploadWavToEPS(audio, numWaves=1, waveIndex=0, progressCallback=()=>{}){
        await this.setParameter(0x20, 0x00, 2) // set loop forward
        await this.setParameter(0x20, 0x19, 0) // set loop pos
        await this.setParameter(0x20, 0x17, 0) // set loop start
        //await this.setParameter(0x20, 0x18, 1) // set loop end
        await this.setParameter(0x20, 0x15, 0) // set sample start
        await this.setParameter(0x20, 0x16, 1) // set sample end
        
        if(await this.truncateWavesample() && await this.putWavesampleDataInChunks(audio,5000, numWaves, waveIndex, progressCallback)){
            //this.sendAck()
            return true
        }else{
            return false
        }
    }
    /**
     * Utility Commands for midi data coversions
     */
    convertToSignedInt(data){
        if(data > 32767) {data = data - 65536;}
        return data
    }
    saveFile(samples, sampleRate=44100){
        // Stolen from Recorder.js
        // https://github.com/mattdiamond/Recorderjs
        let buffer = new ArrayBuffer(44 + samples.length * 2);
        let view = new DataView(buffer);
        /* RIFF identifier */
        this.writeString(view, 0, 'RIFF');
        /* RIFF chunk length */
        view.setUint32(4, 36 + samples.length * 2, true);
        /* RIFF type */
        this.writeString(view, 8, 'WAVE');
        /* format chunk identifier */
        this.writeString(view, 12, 'fmt ');
        /* format chunk length */
        view.setUint32(16, 16, true);
        /* sample format (raw) */
        view.setUint16(20, 1, true);
        /* channel count */
        view.setUint16(22, 1, true);
        /* sample rate */
        view.setUint32(24, sampleRate, true);
        /* byte rate (sample rate * block align) */
        view.setUint32(28, sampleRate * 2, true);
        /* block align (channel count * bytes per sample) */
        view.setUint16(32, 1 * 2, true);
        /* bits per sample */
        view.setUint16(34, 16, true);
        /* data chunk identifier */
        this.writeString(view, 36, 'data');
        /* data chunk length */
        view.setUint32(40, samples.length * 2, true);
        let offset = 44
        for(let i=0; i<samples.length; i++, offset +=2){
            view.setInt16(offset, samples[i], true)
        }
        let audioBlob = new Blob([view], {type: 'audio/x-wav'});
        let url = (window.URL || window.webkitURL).createObjectURL(audioBlob);
        let link = window.document.createElement('a');
        link.href = url;
        link.download = 'output.wav';
        link.innerHTML="Download"
        link.click();
    }
    readTag(view, offset){
        return String.fromCharCode(
            view.getUint8(offset), view.getUint8(offset + 1),
            view.getUint8(offset + 2), view.getUint8(offset + 3))
    }
    /***
     * Reads a mono 16 bit WAV file.
     *
     * Returns {audio, sampleRate, available, truncated} or null if the file
     * cannot be used. Oversized files are truncated rather than refused, so a
     * long recording can be brought in and trimmed down in the editor.
     */
    parseWavFile(buffer){
        const reject = (message, popup) => {
            this.errorCallback(`Error: ${message}`)
            alert(popup || message)
            return null
        }
        const view = new DataView(buffer)
        if(buffer.byteLength < 12 || this.readTag(view, 0) != "RIFF" || this.readTag(view, 8) != "WAVE"){
            return reject("Not a RIFF/WAVE file", "Not a WAV file")
        }

        // Walk the chunk list rather than assuming audio starts at byte 44.
        // Files carrying LIST/INFO metadata put other chunks ahead of the data,
        // and reading from a fixed offset turns those bytes into a burst of
        // noise at the start and shifts everything after it.
        let format = null
        let dataStart = -1
        let dataBytes = 0
        let offset = 12
        while(offset + 8 <= buffer.byteLength){
            const tag = this.readTag(view, offset)
            const size = view.getUint32(offset + 4, true)
            const body = offset + 8
            if(tag == "fmt " && size >= 16 && body + 16 <= buffer.byteLength){
                format = {
                    encoding: view.getUint16(body, true),
                    channels: view.getUint16(body + 2, true),
                    sampleRate: view.getUint32(body + 4, true),
                    bits: view.getUint16(body + 14, true)
                }
            }else if(tag == "data"){
                dataStart = body
                // Trust the file's real length over the header, so a truncated
                // file cannot make us read past the end of the buffer.
                dataBytes = Math.max(0, Math.min(size, buffer.byteLength - body))
            }
            // Chunks are padded to an even length. This always advances by at
            // least 8, so a corrupt size cannot spin the loop.
            offset = body + size + (size % 2)
        }

        if(!format) return reject("WAV file has no fmt chunk", "Not a valid WAV file")
        if(dataStart < 0) return reject("WAV file has no data chunk", "Not a valid WAV file")
        // 1 is PCM, 0xFFFE is extensible, which is still PCM for our purposes.
        if(format.encoding != 1 && format.encoding != 0xFFFE){
            return reject("Only uncompressed PCM WAV files are supported", "Only PCM files allowed")
        }
        if(format.bits != 16) return reject("Only 16 bit WAV files are supported", "Only 16 bit files allowed")
        if(format.channels != 1) return reject("Only mono WAV files are supported", "Only Mono Files allowed")

        const available = Math.floor(dataBytes / 2)
        const length = Math.min(available, EPS16.MAX_IMPORT_SAMPLES)
        const audio = []
        let position = dataStart
        for(let i=0; i<length; i++, position += 2){
            audio.push(view.getInt16(position, true))
        }
        return {
            audio: audio,
            sampleRate: format.sampleRate,
            available: available,
            truncated: available > length
        }
    }
    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    async isAck(message){
        if(typeof message != 'undefined' && message.length >0 && message[0] == 1 && message[message.length-1] == 1){ /// Wait message
            this.sleep(30000) /// manual sais wait up to 30 seconds 
            let messages = await this.readMessages()
            return messages.reduce( (acc, msg) => acc || this.isAck(msg), false)
        }else if(typeof message != 'undefined' && message.length >0 && message[0] == 1 && message[message.length-1] == 0){ /// ACK message
            return true
        }else{
            return false
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /***
     * Logging hooks
     */
    setMidiCallback(callback){
        this.midiCallback = callback
    }
    setDebugCallback(callback){
        this.debugCallback = callback
    }
    /***
     * Goes to the browser console always, and to the event log only when debug
     * output is switched on there.
     */
    debug(...parts){
        console.log(...parts)
        this.debugCallback(parts.map(part => this.describe(part)).join(" "))
    }
    describe(value){
        if(typeof value == 'string') return value
        if(Array.isArray(value) || ArrayBuffer.isView(value)){
            return `[${Array.from(value).join(", ")}]`
        }
        return String(value)
    }
    async readMessages(){ 
        let readMessages = []
        const startTime = Date.now()
        let timeout=0;
        while(this.midiMessages.length == 0 &&  timeout < 5000){
            timeout = Date.now() - startTime;
            await this.sleep(500)
        }
        while(this.midiMessages.length > 0){
            const msg = this.midiMessages.pop()
            const striped = this.stripSysexHeader(msg)
            readMessages.push(striped)
        }
        return readMessages
    }
    onMIDIFailure() {
        alert('Could not access your MIDI devices.');
    }
    stripSysexHeader(message){
        let sliced = message.slice(4,message.length -1)
        return sliced
    }
    setInput(value){
        this.input = value
        this.midiInput = this.inputs.find((input) => input.name == this.input)
        this.midiInput.onmidimessage = (midiMessage) => {
            console.log("Received <-", midiMessage.data)
            this.midiCallback("<-", midiMessage.data)
            if(midiMessage.data[0] == 0xF0){ //Sysex Data
                this.midiMessages.push(midiMessage.data)
            }
            if(midiMessage.data[4] == 0x1){
                let message = this.getResponseMessage(this.stripSysexHeader(midiMessage.data))
                if(message.indexOf("Error") != -1){
                    this.errorCallback(message)
                }
                this.debug(message)
            }
        }
    }
    setOutput(value){
        this.output = value
        this.midiOutput = this.outputs.find((output) => output.name == this.output)
    }
    async sendData(message){
        if(!this.midiOutput || typeof this.midiOutput.send != 'function'){
            this.errorCallback("Error: No MIDI output selected, cannot send to the EPS16+")
            return false
        }
        let packet = [
            0xF0,
            0x0F,
            0x03,
            0x00
        ]
        packet = packet.concat(message)
        packet.push(0xf7)
        console.log("Send ->", packet)
        this.midiCallback("->", packet)
        await this.midiOutput.send(packet)
        await this.sleep(700)

    }
    createMIDIMessage(command, data=[]){
        let header = [
            command,
            0x00,
            this.instNum,
            0x00,
            this.layerNum,
        ].concat(this.wsBytes)
        let msg = header.concat(data)
        return msg
    }
    getResponseMessage(message){
        const code = message[2]
        switch(code){
            case 0x00: return "SUCCESS: ACK"
            case 0x01: return "INFO: WAIT" 
            case 0x02: return "Error: Insert System Disk"
            case 0x03: return "Error: Invalid Param Number"
            case 0x04: return "Error: Invalid Param Value"
            case 0x05: return "Error: Invalid Instrument"
            case 0x06: return "Error: Invalid Layer"
            case 0x07: return "Error: Layer In Use"
            case 0x08: return "Error: Invalid Wavesample"
            case 0x09: return "Error: Wavesample in Use"
            case 0x0a: return "Error: Invalid Wavesammple data range"
            case 0x0b: return "Error: File Not Found"
            case 0x0c: return "Error: Memory Full"
            case 0x0d: return "Error: Instrument in Use"
            case 0x0e: return "Error: No More Layers"
            case 0x0f: return "Error: No More Samples"
            case 0x10: return "Error: reserved"
            case 0x11: return "Error: Wavesample is a copy"
            case 0x12: return "Error: Zone Too Big"
            case 0x13: return "Error: Sequencer Must Be Stopped"
            case 0x14: return "Error: Disk Access in Progress"
            case 0x15: return "Error: Disk Full"
            case 0x16: return "Error: Loop is too long"
            case 0x17: return "Error: NAK"
            case 0x18: return "Error: No Layer To Edit"
            case 0x19: return "Error: No More Pitch Tables"
            case 0x1a: return "Error: Cross Fade length is zero"
            case 0x1b: return "Error: Cross Fade Length is greater than 50%"
            case 0x1c: return "Error: Loop Start is to close to sample start"
            case 0x1d: return "Error: Loop End is to close to sample end"
            case 0x1e: return "Error: Quiet Layer"
            default: return "Unknown!"
        }
    }

    convertTo12BitMidi(data, minSize=2){
        let binString = ''
        for( let byte of data){

            binString += byte.toString(2).padStart(16,0)
        }
        let stop = binString.length/6
        let midiArray = []
        for(let i=0; i<stop; i++){
            let last6Bits = binString.substring(binString.length - 6, binString.length)
            if(binString.length < 6 && parseInt(last6Bits,2) == 0){
                continue
            }else{
                binString = binString.substring(0, binString.length -6)
                midiArray.push(parseInt(last6Bits,2))
            }
        }
        while(midiArray.length < minSize){
            midiArray.push(0)
        }
        midiArray.reverse()
        return midiArray
        
    }
    convertTo16BitMidi(data){
        // Copy rather than adding the bias in place, otherwise the caller's
        // wavesample is corrupted and cannot be uploaded a second time.
        let biased = new Array(data.length)
        for(let i=0; i<data.length;i++){
            biased[i] = data[i] +2**16
        }
        let midiArray=[]
        for(let byte of biased){
            let byte3 = byte & 0x003F
            let byte2 = (byte & 0x00C0) >> 6
            byte2 = (byte & 0x0F00) >> 6 | byte2
            let byte1 = (byte & 0xF000) >> 12
            midiArray.push(byte1)
            midiArray.push(byte2)
            midiArray.push(byte3)
        }
        return midiArray
    }
    convertFrom16BitMidi(data){
        let midiArray=[]
        for(let i=0; i< data.length; i=i+3){
            const word = (data[i]&0x0F) << 12  |  (data[i+1]&0x3F) << 6  | data[i+2] &0x3F
            midiArray.push(word)
        }
        return midiArray
    }
    getEndOffset(bit16Params){
        let word1 = bit16Params[119] << 16
        let word2 = bit16Params[120] << 8
        let word3 = bit16Params[121]
        let word4 = bit16Params[122] >> 8
        let offset = (word1 | word2 |  word3 | word4) >> 9
        this.debug("OFFSET", offset)
        return offset
    }
    setInstrumentNumber(num){
        this.instNum = num
    }
    setLayerNumber(num){
        this.layerNum = num
    }
    setWavesampleNumber(num){
        this.wsBytes = this.convertTo12BitMidi([num],2)
        return true
    }
    getCrossFadeBreakPoints(length, step){
        const sectionLength = Math.floor( 128 / ((length -1)*2) )
        const halfSectionLength = Math.floor(sectionLength/2)
        
        let breakPoints = { pointA:0, pointB:0, pointC:127, pointD:127}
        if(step == 0){
            breakPoints.pointC = halfSectionLength
            breakPoints.pointD = halfSectionLength + sectionLength
        }else if(step == (length-1)){
            let prev = this.getCrossFadeBreakPoints(length, step -1)
            breakPoints.pointA = prev.pointC
            breakPoints.pointB = prev.pointD 
        }
        else{
            let prev = this.getCrossFadeBreakPoints(length, step -1)
            breakPoints.pointA = prev.pointC
            breakPoints.pointB = prev.pointD 
            breakPoints.pointC = breakPoints.pointB + sectionLength 
            breakPoints.pointD = breakPoints.pointC + sectionLength
        }
        return breakPoints
    }

    /***
     * Macros
     */
    async uploadAsTranswave(arrayOfWaveTables, progressCallback){
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        let isSuccess = false
        for(let i=this.instNum; i<8; i++){
            if(await this.createInstrument() && await this.createLayer() &&await this.createSqrWave()){
                isSuccess = true
                break;
            }else{
                this.setInstrumentNumber(i)
            }
        }
        if(!isSuccess) {
            this.errorCallback("Error: Could not create an instrument for the transwave")
            return
        }
        let transwave = []
        for(let wave of arrayOfWaveTables){
            transwave = transwave.concat(wave)
        }
        isSuccess = await this.uploadWavToEPS(transwave, 1,0,progressCallback)
        if(!isSuccess){
            this.errorCallback("Error: Unable to upload transwave to EPS16")
            return
        }
        //set loop end
        await this.sleep(1000)
        await this.setParameter(0x20,0x18,arrayOfWaveTables[0].length)
        //set modulation to transwave
        await this.setParameter(0x20,0x06,0x07)
        //set modulation source to wheel
        await this.setParameter(0x20,0x07,0x0A)
        //set modulation ammount
        await this.setParameter(0x20,0x08,arrayOfWaveTables.length+1)
        let messages = await this.readMessages()
        if(messages.length = 0){
            this.successCallback("Complete: Uploaded Transwave")
        }else{
            this.errorCallback("Error: Error occured when uploading the transwave")
        }

    }
    async uploadToDifferentInstruments(arrayOfWaveTables, progressCallback){
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        let index =0
        for(let wave of arrayOfWaveTables){
            //find an empty instrument
            for(let i=this.instNum; i<8; i++){
                if(await this.createInstrument() && await this.createLayer() && await this.createSqrWave()){
                    await this.uploadWavToEPS(wave, arrayOfWaveTables.length, index, progressCallback)
                    this.successCallback("Success: Adding new instrument")
                    index++
                    await this.sleep(500)
                    break;
                }else{
                    this.setInstrumentNumber(i)
                }

            }
        }
        this.successCallback("Complete: Uploading samples")
    }
    async createMorphingWaveTable(arrayOfWaveTables, progressCallback){
        //enable all patche
        let isSuccess = false
        for(let i=this.instNum; i<8; i++){
            if(await this.createInstrument()){
                isSuccess = true
                break;
            }else{
                this.setInstrumentNumber(i)
            }

        }
        if(!isSuccess){
            this.errorCallback("Error:  Unable to create instrument for morphing wave forms")
            return false
        }
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        await this.setParameter(0x28, 0x00, 0xFF) // enable all patches
        for(let i=0; i< arrayOfWaveTables.length; i++){
            if(i==8) break
            const bp = this.getCrossFadeBreakPoints(arrayOfWaveTables.length,i)
            let wave = arrayOfWaveTables[i]
            this.setLayerNumber(i)
            //this.setWavesampleNumber(1)
            if( !(await this.createLayer() && await this.createSqrWave() && this.setWavesampleNumber(i+1) && await this.uploadWavToEPS(wave, arrayOfWaveTables.length, i, progressCallback))){
                this.errorCallback("Error: Unable to update instrument parameters")
                return false
            }
            await this.sleep(500)
            await this.setParameter(0x18,0x05, 1) // crossfade to linier
            await this.setParameter(0x18,0x03, bp.pointA)
            await this.setParameter(0x18,0x0B, bp.pointB)
            await this.setParameter(0x18,0x04, bp.pointC)
            await this.setParameter(0x18,0x0C, bp.pointD)
            await this.setParameter(0x18,0x07, 0) // modulation source to LFO
            await this.setParameter(0x18,0x0A, 127) // modulation amount
            await this.setParameter(0x1C,0x02, 15) // LFO speed
            await this.setParameter(0x1C,0x03, 127) // LFO depth
            await this.setParameter(0x1C,0x04, 0) // LFO Delay
            await this.setParameter(0x1C,0x05, 1) // LFO Reset
            await this.setParameter(0x1C,0x08, 0x0F) // LFO Modulation source
            await this.setParameter(0x1C,0x07, 0x0F) // LFO Modulation source

            this.setWavesampleNumber(1)
            await this.sleep(1000)

        }
        this.successCallback("Complete: Uploading samples")
    }


}
