Ensoniq Performance Sampler External Command Specification

June 12, 1989 MKB2

Table of Contents

| 1 Introduction and Overview ................................................................................................................. 1    |
|----------------------------------------------------------------------------------------------------------------------------------------------------|
| 2 MIDI System Exclusive Packet Pieces .......................................................................................................... 2 |
| 2.1 MIDI System Exclusive Packet Head .......................................................................................................... 2 |
| 2.2 MIDI System Exclusive Packet Tail .......................................................................................................... 2 |
| 2.3 Message Format ......................................................................................................................... 3     |
| 3 Rules of the Game ......................................................................................................................... 4    |
| 3.1 General Command Exchange (NORMAL mode) ................................................................................. 4                     |
| 3.2 Special WAIT Command Exchange (WAIT mode) .......................................................................... 4                         |
| 4 Command List ......................................................................................................................... 6         |
| 4.1 General Communication Commands ........................................................................................ 6                      |
| 4.2 Parameter and Wavesample Data Transfer Commands ................................................................ 7                             |
| 4.3 Instrument Editing Commands ........................................................................................ 13                        |
| 4.4 Wavesample Digital Sample Processing Commands ................................................................ 17                              |
| 5 Command Status Codes ................................................................................................................. 29        |
| 6 Button Numbers ......................................................................................................................... 32      |
| 7 Parameter Block Data Descriptions ........................................................................................ 33                    |
| 7.1 Instrument Parameter Block ........................................................................................................ 33         |
| 7.2 Layer Parameter Block ........................................................................................................ 34              |
| 7.3 Wavesample Parameter Block ................................................................................................ 35                 |
| 7.3.1 Wavesample Envelope Description ........................................................................................ 37                  |
| 7.4 Pitch Table Block ................................................................................................................ 38          |
| 8 Example of a Wavedata Transfer ................................................................................................ 39               |
| 9 Parameter Numbers ......................................................................................................................... 40   |
| 9.1 SYSTEM PARAMETERS ......................................................................................................................... 40 |
| 9.2 MIDI PARAMETERS ......................................................................................................................... 40   |
| 9.3 INSTRUMENT PARAMETERS ................................................................................................................. 40     |
| 9.4 LAYER PARAMETERS ......................................................................................................................... 41  |
| 9.5 WAVESAMPLE PARAMETERS .......................................................................................................... 41            |
| 9.6 ENVELOPE 1 PARAMETERS ................................................................................................................. 42     |
| 9.7 PITCH PARAMETERS .................................................................................................................. 42         |
| 9.8 FILTER PARAMETERS .................................................................................................................. 42        |
| 9.9 VOLUME PARAMETERS .................................................................................................................. 43        |
| 9.10 LFO PARAMETERS .................................................................................................................. 43          |
| 9.11 EDIT PARAMETERS .................................................................................................................. 43         |

## 1 Introduction and Overview

This manual describes the communication protocol and external commands used when the Enso-niq Performance Sampler (the EPS) is communicating with an external computer (the EXT). The protocol is designed to aid the implementation of editing programs running on EXT, and so this information is especially relevant to designers and programmers of editing programs.

The commands described here allow visual editing programs to collect information about instru-ments, layers, and wavesamples within the EPS, alter parameters, and process wavesample data. Since the primary function of a visual editor is viewing data, most existing editors spend a lot of time transferring data between EXT and EPS. Also, in many existing editors, one machine will process the data while the other waits for the processing machine before transferring the data to see the results. The data processing commands described in this manual save editing time while allowing EPS and EXT to independently process data and achieve the same results without the need for lots of data transfers. The GET WAVESAMPLE OVERVIEW command is designed to allow a visual editor running on a machine with few memory resources to view wavesample data without storing wavesample data in the editing machine.

The protocol can be used with MIDI System Exclusive or SCSI (Small Computer Systems Inter-face) messages. This manual contains the details for implementing this protocol using a MIDI interface. When a SCSI cable is connected between EXT and EPS, all data transfers to and from sound RAM (parameter and wavedata blocks) would occur using SCSI. This design will make the SCSI implementation easier when SCSI is available for the EPS.

## 2 MIDI System Exclusive Packet Pieces

A packet is a bunch of information, i.e. a message, in the form of a data stream. Each packet can be divided into three sections or pieces. The first and last packet pieces form the frame for a message. The message contains the commands described in section 4. Every message must be preceded with a SYSEX head and followed with a SYSEX tail. A complete packet looks like this:

| SYSEX Head   | Message   | SYSEX Tail   |
|--------------|-----------|--------------|

## 2.1 MIDI System Exclusive Packet Head

This is the common system exclusive header which must be used on all SYSEX messages to and from the EPS. These four bytes are always sent preceding the message.

| 11110000   | FO   | System Exclusive status byte        |
|------------|------|-------------------------------------|
| 00001111   | OF   | ENSONIQ Code                        |
| 00000011   | 03   | Ensoniq Performance Sampler ID Code |
| 0000nnnn   | 0x   | nnn = x = Base MIDI channel number  |

## 2.2 MIDI System Exclusive Packet Tail

For every head there is a tail. This byte follows every message.

| 11110111   | F7   | End of System Exclusive   |
|------------|------|---------------------------|

## 2.3 Message Format

The EPS message format within the packet frame consists of a command byte followed by any number of data words. There are two word formats implemented in order to speed up message transfer by minimizing unneccessary data bytes.

The 12 bit format is used for data in most of the messages and consists of two 6 bit bytes. The 12 bits are right justified within a 16 bit register.

## 3 Rules of the Game

These rules describe the communications protocol between the transmitter and the receiver. In general, for each command message sent by the transmitter, there is a response command sent by the receiver. Either device (EPS or EXT) can be transmitter and receiver simultaneously so that each one can be processing a command while waiting for a response from a command that it sent. However, a transmitter cannot send another command before receiving a response from a previous command except in WAIT mode which will be described in section 3.2.

## 3.1 General Command Exchange (NORMAL mode)

This set of rules describes how 99% of the commands should be processed. These rules allow an open or closed loop between the transmitter and receiver. An open loop exists when there is one cable from the transmitter to the receiver so that the transmitter will not receive response commands from the receiver. A closed loop uses two cables between the transmitter and receiver so that two-way communication is possible. A closed loop is more efficient since the transmitter can resume its operation immediately after receiving a response command rather than waiting for a timeout.

- · The transmitter sends the message containing a command and parameters (except the response command) and starts the 2 second command timer. The transmitter should not send another command until it gets a response from the receiver or it times out. A few specific commands do not need responses and are noted in section 4, but the transmitter must still wait 2 seconds before sending another command.
- · The receiver processes the command and sends a response command with the proper status code. The receiver should ignore all other commands while it is processing one or send a negative acknowledge (NAK) if another message is received during processing.
- · If the transmitter times out, the link may be broken or it is an open loop. The transmitter must use its own discretion when processing a timeout error.

## 3.2 Special WAIT Command Exchange (WAIT mode)

This set of rules should be followed when the receiver sends a response command with the WAIT status code which initiates WAIT mode.

- · The transmitter restarts the command timer with a 30 second value and sends a response command with the ACK status code, or it sends the CANCEL command. The receiver should wait for the transmitter's response before doing whatever it is that requires the WAIT mode.
- · If the transmitter sent the CANCEL command, the receiver should abort the orignal command and return an ACK.
- · If the transmitter sent an ACK, the receiver should process the original command and send the appropriate response command as soon as possible.
- · If the receiver needs more time, it can send a response command with the WAIT status code again. The transmitter should re-enter wait mode by resetting the 30 second

## command timer.

- If the transmitter times out, it must use its own discretion when handling the error. An error message to the user or a longer wait are two possible timeout error responses.

## 4 Command List

This is the list of commands to be used in messages between EXT and EPS. These commands are the detailed description of the message which is enclosed in the SYSEX packet frame described in section 2. Unless otherwise specified, all command parameter words use the 12 bit word format as described in section 2.3.

## 4.1 General Communication Commands

|   Code and parameters | Name     | Description                                                                                                                                        |
|-----------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------|
|                    00 | unused   | not used                                                                                                                                           |
|                    01 | RESPONSE | Send response to a received command. Status Code hi byte, (always 0) a = Status Code lo byte, see section 5 for a description of the Status Codes. |
|                    02 | CANCEL   | Abort current command processing. This is only valid in WAIT mode (it should be ignored in normal mode)                                            |

## 4.2 Parameter and Wavesample Data Transfer Commands

This set of commands are used to GET and PUT parameter values and transfer wavesample data. A GET command transmitted by EXT will prompt the EPS to transmit a PUT command. The EPS does not transmit GET commands.

NOTE on wavedata offsets: Wavedata offset address parameters are used internally as long words (20 bits). They are transmitted as two 12 bit words, e.g. the offset 00200 hex would be sent as the four parameter bytes 00, 00, 40, and 00 hex. Likewise, the offset OAAAA hex would be sent as 00, 0A, 2A, and 2A hex.

NOTE: All parameter modification commands contain the current edit context defined by the edit instrument, layer, and wavesample.

| 03   | GET                                         | Request for instrument parameters.         |
|------|---------------------------------------------|--------------------------------------------|
| 00   | INSTRUMENT                                  | Instrument number hi byte (always 0)       |
| 0a   | a = Instrument number lo byte, # = [0..7]   | Layer number hi byte (always 0)            |
| 00   | b = Layer number lo byte, Layer # = [0..7]  | c = Wavesample number hi byte              |
| 0c   | d = Wavesample number lo byte, # = [1..127] | GET LAYER                                  |
| 04   | Request for layer parameters.               | Instrument number hi byte (always 0)       |
| 00   | a = Instrument number lo byte, # = [0..7]   | Layer number hi byte (always 0)            |
| 0a   | b = Layer number lo byte, Layer # = [0..7]  | c = Wavesample number hi byte              |
| 00   | d = Wavesample number lo byte, # = [1..127] | GET                                        |
| 05   | Request for wavesample parameters.          | WAVESAMPLE                                 |
| 00   | Instrument number hi byte (always 0)        | a = Instrument number lo byte, # = [0..7]  |
| 0a   | Layer number hi byte (always 0)             | b = Layer number lo byte, Layer # = [0..7] |
| 00   | c = Wavesample number hi byte               | 0c                                         |
| 0d   | d = Wavesample number lo byte, # = [1..127] | 0d                                         |

|   06 | GET  WAVESAMPLE  DATA                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Request for wavesample data. See the example in sec- tion 8 of a data transfer between EXT and EPS.                                                                                                                                                                                                         |
|------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|   00 | Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7] Layer number hi byte (always 0) b = Layer number lo byte, Layer # = [0..7] c = Wavesample number hi byte d = Wavesample number lo byte, # = [1..127] Data range start offset (from beginning of wavesample data), Data offset = [0..FFFFF] Start Offset = 0efgh (long word, 20 bits) see note at top of section 4.2 Data range end offset (from beginning of wavesample data), Data offset = [0..FFFFF] End Offset = 0ijkl (long word, 20 bits) see note at top of section 4.2 |                                                                                                                                                                                                                                                                                                             |
|   08 | GET PARAMETERS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Request for the pitch table data within the requested layer. Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7] Layer number hi byte (always 0) b = Layer number lo byte, Layer # = [0..7] c = Wavesample number hi byte d = Wavesample number lo byte, # = [1..127]            |
|   00 | GET PARAMETERS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Request for a parameter value. See section 9 for the parameter numbers. Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7] Layer number hi byte (always 0) b = Layer number lo byte, Layer # = [0..7] c = Wavesample number hi byte d = Wavesample number lo byte, # = [1..127] |
|   00 | 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Unused code                                                                                                                                                                                                                                                                                                 |

| OA   | GET                                                                                                                                                                                                                                                                                                                                                                   | Request for wavesample data overview. This is never transmitted by EPS.                                        |
|------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| 00   | WAVESAMPLE OVERVIEW                                                                                                                                                                                                                                                                                                                                                   | Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7] Layer number hi byte (always 0) |
| 00   | b                                                                                                                                                                                                                                                                                                                                                                     | b = Layer number lo byte, Layer # = [0..7]                                                                     |
| 0c   | c = Wavesample number hi byte                                                                                                                                                                                                                                                                                                                                         |                                                                                                                |
| 0d   | d = Wavesample number lo byte, # = [1..127] Data range start offset (from beginning of wavesample data), Data offset = [0..FFFFF] Start Offset = 0efgh (long word, 20 bits) see note at top of section 4.2 Data range end offset (from beginning of wavesample data), Data offset = [0..FFFFF] End Offset = 0ijkl (long word, 20 bits) see note at top of section 4.2 |                                                                                                                |
| 0g   | data)                                                                                                                                                                                                                                                                                                                                                                 | Data                                                                                                           |
| 0h   | see note at top of section 4.2                                                                                                                                                                                                                                                                                                                                        |                                                                                                                |
| 0i   | end offset (from beginning of wavesample data), Data offset = [0..FFFFF]                                                                                                                                                                                                                                                                                              |                                                                                                                |
| 0j   | See note at top of section 4.2                                                                                                                                                                                                                                                                                                                                        |                                                                                                                |
| 0k   | end code                                                                                                                                                                                                                                                                                                                                                              |                                                                                                                |
| 0l   | unused                                                                                                                                                                                                                                                                                                                                                                |                                                                                                                |

Note on PUT Commands: All PUT commands which contain parameter blocks or wavedata are transmitted in two messages. The first message contains the command code and the edit context (instrument, layer, and wavesample) . The second message is only the data. An ACK or a timeout after the first piece will cause the second piece to be sent as described in section 3.1. Refer to section 7 for the descriptions of the data in the second message.

NOTE: All parameter modification commands contain the current edit context defined by the edit instrument, layer, and wavesample.

| 0C   | PUT                                                                                                                  | Instrument parameter block dump.                                                                               |
|------|----------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| 00   | INSTRUMENT                                                                                                           | Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7] Layer number hi byte (always 0) |
| 0a   | b                                                                                                                    | Layer number lo byte, Layer # = [0..7]                                                                         |
| 00   | c                                                                                                                    | c = Wavesample number hi byte                                                                                  |
| 0d   | d = Wavesample number lo byte, # = [1..127]                                                                          |                                                                                                                |
|      | Instrument parameter data block as described in sec- tion 7.1 using the 16 bit word format described in section 2.3. |                                                                                                                |

| OD   | PUT LAYER             | Layer parameter block dump. Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7]         |
|------|-----------------------|--------------------------------------------------------------------------------------------------------------------|
| 00   |                       |                                                                                                                    |
| 0a   |                       |                                                                                                                    |
| 00   |                       |                                                                                                                    |
| 0b   |                       |                                                                                                                    |
| 0c   |                       |                                                                                                                    |
| 0d   |                       |                                                                                                                    |
|      |                       | Layer parameter data block as described in section 7.2 using the 16 bit word format described in section 2.3.      |
| OE   | PUT                   | Wavesample parameter block dump.                                                                                   |
|      | WAVESAMPLE PARAMETERS | Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7]                                     |
| 00   |                       |                                                                                                                    |
| 0a   |                       |                                                                                                                    |
| 00   |                       |                                                                                                                    |
| 0b   |                       |                                                                                                                    |
| 0c   |                       |                                                                                                                    |
| 0d   |                       |                                                                                                                    |
|      |                       | Layer number hi byte (always 0) a = Instrument number lo byte, # = [0..7]                                          |
| OF   | WAVESAMPLE DATA       | Wavesample data block dump.  See the example of a data transfer in section 8.                                      |
| 00   |                       |                                                                                                                    |
| 0a   |                       |                                                                                                                    |
| 00   |                       |                                                                                                                    |
| 0b   |                       |                                                                                                                    |
| 0c   |                       |                                                                                                                    |
| 0d   |                       |                                                                                                                    |
| 0e   |                       |                                                                                                                    |
| 0f   |                       |                                                                                                                    |
| 0g   |                       |                                                                                                                    |
| 0h   |                       |                                                                                                                    |
| 0i   |                       |                                                                                                                    |
| 0j   |                       |                                                                                                                    |
| 0k   |                       |                                                                                                                    |
| 01   |                       |                                                                                                                    |
|      |                       | All 16 bit signed sample data words within the data range using the 16 bit word format described in sec- tion 2.3. |

| 10   | PUT PITCH TABLE                                                     | Transmit the pitch table data for the specified layer.                                                                                                                                                       |
|------|---------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 00   | a                                                                   | Instrument number hi byte (always 0)                                                                                                                                                                         |
| 0a   | a                                                                   | a = Instrument number lo byte, # = [0..7]                                                                                                                                                                    |
| 00   | b                                                                   | Layer number hi byte (always 0)                                                                                                                                                                              |
| 0b   | c                                                                   | b = Layer number lo byte, Layer # = [0..7]                                                                                                                                                                   |
| 0c   | c = Wavesample number hi byte                                       |                                                                                                                                                                                                              |
| 0d   | d = Wavesample number lo byte, # = [1..127]                         | Pitch table block described in section 7.4 using the 16                                                                                                                                                      |
| 11   | PUT PARAMETER Update a parameter value for an instrument, layer, or | wavesample. If this is a system parameter, the instru- ment, layer, and wavesample are irrelevant. See sec- tion 9 for the parameter numbers. NOTE: This does not need a response. A response is sent if the |
| 00   | not need a response.                                                | parameter number or value is erroneous.                                                                                                                                                                      |
| 0a   | Instrument number hi byte (always 0)                                |                                                                                                                                                                                                              |
| 00   | a = Instrument number lo byte, # = [0..7]                           | Layer number hi byte (always 0)                                                                                                                                                                              |
| 0b   | b = Layer number lo byte, Layer # = [0..7]                          | c = Wavesample number hi byte                                                                                                                                                                                |
| 0c   | d = Wavesample number lo byte, # = [1..127]                         |                                                                                                                                                                                                              |
| 0d   | e = Parameter number hi byte                                        |                                                                                                                                                                                                              |
| 0e   | f = Parameter number lo byte, # = [0..255]                          |                                                                                                                                                                                                              |
| 0g   | g = Parameter value hi byte of hi word                              |                                                                                                                                                                                                              |
| 0h   | h = Parameter value lo byte of hi word                              |                                                                                                                                                                                                              |
| 0i   | i = Parameter value hi byte of lo word                              |                                                                                                                                                                                                              |
| 0j   | j = Parameter value lo byte of lo word                              |                                                                                                                                                                                                              |

| 13   | PUT  WAVESAMPLE  OVERVIEW                                                                                                                                                                     | Wavesample data overview dump.  NOTE: This is not received by the EPS.   |
|------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| 00   | Instrument number hi byte (always 0)                                                                                                                                                          | a = Instrument number lo byte, # = [0..7]                                |
| 0a   | Layer number hi byte (always 0)                                                                                                                                                               | b = Layer number lo byte, Layer # = [0..7]                               |
| 0b   | c = Wavesample number hi byte                                                                                                                                                                 | d = Wavesample number lo byte, # = [1..127]                              |
| 0c   | Data range start offset (from beginning of wavesample                                                                                                                                         | data), Data offset = [0..FFFFF]                                          |
| 0e   | Start Offset = 0efgh (long word, 20 bits)                                                                                                                                                     | 0g                                                                       |
| 0h   | see note at top of section 4.2                                                                                                                                                                | 0i                                                                       |
| 0i   | Data range end offset (from beginning of wavesample                                                                                                                                           | 0j                                                                       |
| 0j   | data), Data offset = [0..FFFFF]                                                                                                                                                               | 0k                                                                       |
| 0k   | End Offset = 0ijkl (long word, 20 bits)                                                                                                                                                       | 0l                                                                       |
| 0l   | see note at top of section 4.2                                                                                                                                                                | 0l                                                                       |
|      | 512 data words. The data range is divided into 512  sections and the maximum 16 bit absolute sample  value within each section is transmitted using the 16  bit word format described in 2.3. |                                                                          |
| 14   | unused code                                                                                                                                                                                   |                                                                          |

## 4.3 Instrument Editing Commands

This set of commands is used when editing an instrument and any of the objects within an instrument including layers and wavesamples.

NOTE: All instrument editing commands contain the current edit context of instrument, layer, and wavesample.

| 15   | CREATE  INSTRUMENT                                                                                                                                                         | Create a new instrument with no layers or wavesam- ples. The instrument must not already exist. New instrument number hi byte (always 0) a = New instrument number lo byte, # = [0..7] Layer number hi byte (always 0)   |
|------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 00   | b                                                                                                                                                                          | Layer number lo byte, Layer # = [0..7]                                                                                                                                                                                   |
| 00   | b                                                                                                                                                                          | c = Wavesample number hi byte                                                                                                                                                                                            |
| 0c   | d                                                                                                                                                                          | d = Wavesample number lo byte, # = [1..127]                                                                                                                                                                              |
| 1C   | DELETE  INSTRUMENT                                                                                                                                                         | Delete the instrument and free up memory in the EPS. The instrument must already exist. Instrument number hi byte (always 0)                                                                                             |
| 00   | a                                                                                                                                                                          | a = Instrument number lo byte, # = [0..7] Layer number hi byte (always 0)                                                                                                                                                |
| 00   | b                                                                                                                                                                          | b = Layer number lo byte, Layer # = [0..7] c = Wavesample number hi byte                                                                                                                                                 |
| 0c   | d                                                                                                                                                                          | d = Wavesample number lo byte, # = [1..127]                                                                                                                                                                              |
| 12   | COPY  INSTRUMENT                                                                                                                                                           | Copy the source instrument to the destination instru- ment. The source instrument must already exist, and the destination must not already exist.                                                                        |
| 00   | a                                                                                                                                                                          | a = Source instrument number lo byte, # = [0..7] Source layer number hi byte (always 0)                                                                                                                                  |
| 00   | b                                                                                                                                                                          | b = Source layer number lo byte, # = [0..7] c = Source wavesample number hi byte                                                                                                                                         |
| 0c   | d                                                                                                                                                                          | d = Source wavesample number lo byte, # = [1..127]                                                                                                                                                                       |
| 00   | e                                                                                                                                                                          | Destination instrument number hi byte (=0) e = Destination instrument number lo byte                                                                                                                                     |
| 00   | Destination layer number hi byte (always 0) f = Destination layer number lo byte, # = [0..7] Dumm y destination wavesample hi byte. Dumm y destination wavesample lo byte. |                                                                                                                                                                                                                          |

| 16   | CREATE LAYER                                                                    | Define a new layer with one wavesample in an instru- ment. The new layer must not already exist. Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7]   |
|------|---------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 00   | a                                                                               | New layer number hi byte (always 0)                                                                                                                                               |
| 00   | b                                                                               | b = New layer number lo byte, # = [0..7]                                                                                                                                          |
| 0c   | c = Wavesample number hi byte                                                   | c = Wavesample number hi byte                                                                                                                                                     |
| 0d   | d = Wavesample number lo byte, # = [1..127]                                     | d = Wavesample number lo byte, # = [1..127]                                                                                                                                       |
| 17   | DELETE LAYER                                                                    | Undefine a layer in an instrument. All wavesamples in the layer are deleted too. The layer must already exist. Instrument number hi byte (always 0)                               |
| 00   | a = Instrument number lo byte, # = [0..7]                                       | a = Instrument number lo byte, # = [0..7]                                                                                                                                         |
| 0a   | a = Layer number lo byte, Layer # = [0..7]                                      | a = Layer number lo byte, Layer # = [0..7]                                                                                                                                        |
| 00   | b = Layer number lo byte, Layer # = [0..7]                                      | b = Layer number lo byte, Layer # = [0..7]                                                                                                                                        |
| 0c   | c = Wavesample number hi byte                                                   | c = Wavesample number hi byte                                                                                                                                                     |
| 0d   | d = Wavesample number lo byte, # = [1..127]                                     | d = Wavesample number lo byte, # = [1..127]                                                                                                                                       |
| 18   | COPY LAYER                                                                      | Copy the source layer to the destination layer. Source instrument number hi byte (always 0) a = Source instrument number lo byte, # = [0..7]                                      |
| 00   | Source Layer number hi byte (always 0)                                          | Source Layer number hi byte (always 0)                                                                                                                                            |
| 0a   | b = Source Layer number lo byte, # = [0..7]                                     | b = Source Layer number lo byte, # = [0..7]                                                                                                                                       |
| 00   | c = Source wavesample number hi byte                                            | c = Source wavesample number hi byte                                                                                                                                              |
| 0c   | d = Source wavesample number lo byte,                                           | d = Source wavesample number lo byte,                                                                                                                                             |
| 0d   | # = [1..127]                                                                    | # = [1..127]                                                                                                                                                                      |
| 00   | Destination instrument number hi byte (=0)                                      | Destination instrument number hi byte (=0)                                                                                                                                        |
| 0e   | e = Destination instrument number lo byte                                       | e = Destination instrument number lo byte                                                                                                                                         |
| 00   | Destination layer number hi byte (always 0)                                     | Destination layer number hi byte (always 0)                                                                                                                                       |
| 0f   | f = Destination layer number lo byte,                                           | f = Destination layer number lo byte,                                                                                                                                             |
| 00   | # = [0..7]                                                                      | # = [0..7]                                                                                                                                                                        |
| 00   | Dummy destination wavesample hi byte.                                           | Dummy destination wavesample hi byte.                                                                                                                                             |
| 00   | Dummy destination wavesample lo byte.                                           | Dummy destination wavesample lo byte.                                                                                                                                             |
| 00   | Copy data flag hi byte. (always 0)                                              | Copy data flag hi byte. (always 0)                                                                                                                                                |
| 0g   | g = Copy data flag lo byte. When set, data will be copied. clear = 00, set = 01 | g = Copy data flag lo byte. When set, data will be copied. clear = 00, set = 01                                                                                                   |

| 19   | CREATE WAVE- SAMPLE   | Create a new wavesample in a layer with a single cycle square wave for data. The wavesample must not already exist. Instrument number hi byte (always 0)                                               |
|------|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 00   |                       | a = Instrument number lo byte,# = [0..7]                                                                                                                                                               |
| 0a   |                       | Layer number hi byte (always 0)                                                                                                                                                                        |
| 00   |                       | b = Layer number lo byte, Layer # = [0..7]                                                                                                                                                             |
| 0b   |                       | c = New wavesample number hi byte                                                                                                                                                                      |
| 0c   |                       | d = New wavesample number lo byte,                                                                                                                                                                     |
| 0d   |                       | # = [1..127]                                                                                                                                                                                           |
| 1A   | DELETE WAVE- SAMPLE   | Undefine a wavesample in a layer and free up RAM. The wavesample must already exist. Instrument number hi byte (always 0)                                                                              |
| 00   |                       | a = Instrument number lo byte, # = [0..7]                                                                                                                                                              |
| 0a   |                       | Layer number hi byte (always 0)                                                                                                                                                                        |
| 00   |                       | b = Layer number lo byte, Layer # = [0..7]                                                                                                                                                             |
| 0b   |                       | c = Wavesample number hi byte                                                                                                                                                                          |
| 0c   |                       | d = Wavesample number lo byte, # = [1..127]                                                                                                                                                            |
| 1B   | COPY WAVE- SAMPLE     | Copy wavesample parameters from the source wave- sample to a new wavesample on the destination layer. The wavedata is copied if the data copy flag is set. Source instrument number hi byte (always 0) |
| 00   |                       | a = Source instrument number lo byte, # = [0..7]                                                                                                                                                       |
| 0a   |                       | Source layer number hi byte (always 0)                                                                                                                                                                 |
| 00   |                       | b = Source layer number lo byte, # = [0..7]                                                                                                                                                            |
| 0b   |                       | c = Source wavesample number hi byte                                                                                                                                                                   |
| 0c   |                       | d = Source wavesample number lo byte,                                                                                                                                                                  |
| 0d   |                       | Destination instrument number hi byte (=0)                                                                                                                                                             |
| 00   |                       | e = Destination instrument number lo byte                                                                                                                                                              |
| 0e   |                       | Destination layer number hi byte (always 0)                                                                                                                                                            |
| 00   |                       | f = Destination layer number lo byte,                                                                                                                                                                  |
| 0g   |                       | # = [0..7]                                                                                                                                                                                             |
| 0h   |                       | g = Destination wavesample number hi byte                                                                                                                                                              |
| 00   |                       | h = Destination wavesample number lo byte                                                                                                                                                              |
| 0i   |                       | Copy data flag hi byte, (always 0)                                                                                                                                                                     |
|      |                       | i = Copy data flag lo byte. When set, data will be copied. clear = 00, set = 01                                                                                                                        |

| 1D   | AUDITION WAVESAMPLES                                                                                                                                                           | Audition an old and new wavesample using the audi- tion utilities of the EPS. After the command is executed, EPS will send a DELETE WAVESAMPLE command specifying the wavesample that was not kept. The EPS never transmits this command. Old instrument number hi byte (always 0) a = Old instrument number lo byte, # = [0..7] Old layer number hi byte (always 0)   |
|------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 00   | Old layer number hi byte (always 0)                                                                                                                                            |                                                                                                                                                                                                                                                                                                                                                                        |
| 0a   | b = Old layer number lo byte, # = [0..7]                                                                                                                                       |                                                                                                                                                                                                                                                                                                                                                                        |
| 00   | c = Old wavesample number hi byte                                                                                                                                              |                                                                                                                                                                                                                                                                                                                                                                        |
| 0c   | d = Old wavesample number lo byte,                                                                                                                                             |                                                                                                                                                                                                                                                                                                                                                                        |
| 0d   | # = [1..127]                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                                        |
| 00   | New instrument number hi byte (always 0)                                                                                                                                       |                                                                                                                                                                                                                                                                                                                                                                        |
| 0e   | e = New instrument number lo byte, # = [0..7]                                                                                                                                  |                                                                                                                                                                                                                                                                                                                                                                        |
| 00   | New layer number hi byte (always 0)                                                                                                                                            |                                                                                                                                                                                                                                                                                                                                                                        |
| 0f   | f = New layer number lo byte, # = [0..7]                                                                                                                                       |                                                                                                                                                                                                                                                                                                                                                                        |
| 0g   | g = New wavesample number hi byte                                                                                                                                              |                                                                                                                                                                                                                                                                                                                                                                        |
| 0h   | h = New wavesample number lo byte,                                                                                                                                             |                                                                                                                                                                                                                                                                                                                                                                        |
| 40   | Send a virtual button press. This should only be used if the desired operation cannot be done using the exis- ting commands. See the list of valid button numbers in section 6 |                                                                                                                                                                                                                                                                                                                                                                        |
| 00   | a = Button number lo byte. # = [00..35]                                                                                                                                        |                                                                                                                                                                                                                                                                                                                                                                        |
| 44   | Create a preset with the current selection of instru- ments and patches. Refer to the user's manual for more information on presets.                                           |                                                                                                                                                                                                                                                                                                                                                                        |
| 00   | Instrument number hi byte (always 0)                                                                                                                                           |                                                                                                                                                                                                                                                                                                                                                                        |
| 0a   | a = Instrument number lo byte, # = [0..7]                                                                                                                                      |                                                                                                                                                                                                                                                                                                                                                                        |
| 00   | Layer number hi byte (always 0)                                                                                                                                                |                                                                                                                                                                                                                                                                                                                                                                        |
| 0b   | b = Layer number lo byte, Layer # = [0..7]                                                                                                                                     |                                                                                                                                                                                                                                                                                                                                                                        |
| 0c   | c = Wavesample number hi byte                                                                                                                                                  |                                                                                                                                                                                                                                                                                                                                                                        |
| 0d   | d = Wavesample number lo byte, # = [1..127]                                                                                                                                    |                                                                                                                                                                                                                                                                                                                                                                        |
| 00   | Preset number hi byte (always 0)                                                                                                                                               |                                                                                                                                                                                                                                                                                                                                                                        |
| 0e   | e = Preset number lo byte, # = [0..7]                                                                                                                                          |                                                                                                                                                                                                                                                                                                                                                                        |

## 4.4 Wavesample Digital Sample Processing Commands

These commands alter wavesample data using the EPS Digital Sample Processing functions. See the EPS Digital Sample Processing specification for details on how the functions alter the data including the manipulation algorithms.

NOTE on wavedata offsets: See the note at the top of section 4.2 for a description of the use of wavedata offsets.

NOTE on scale factors: Scale factors are stored internally as a 16 bit word where the hi byte is an integer [0..255] and the lo byte is a 7 bit fraction [0..127]. The factor is transmitted using two words in the 12 bit format so that all 16 bits of the value can be sent. For example, scale factor 255.99 (hexadecimal FF7F) is transmitted by the four bytes 00, OF, 3D, and 3F hex. Likewise, the scale factor 1.0 (hexadecimal 0100) is transmitted by 00, 00, 04, and 00. The 16 bit scale factor must be converted to two 12 bit numbers before being transmitted, and so they are similar to transmitting 20 bit data offsets using the 12 bit format.

NOTE on fade zones: The cross fade zone parameter must not be greater than the loop length nor greater than the length of data preceding the loop or following the loop. Thus, FZ &lt;= (LE-LS), FZ &lt;= (LS-WS), and FZ &lt;= (WE-LE) where FZ is the cross fade zone, WS is the start of the wavedata, WE is the end of the wavedata, LS is the start of the loop, and LE is the end of the loop.

| IE   | TRUNCATE                                                                              | Delete any unused wavesample data before sample  start and after sample end.                                   |
|------|---------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| 00   | WAVESAMPLE                                                                            | Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7] Layer number hi byte (always 0) |
| 0a   | b                                                                                     | Layer number lo byte,  Layer # = [0..7]                                                                        |
| 00   | c                                                                                     | Wavesample number hi byte                                                                                      |
| 0d   | d                                                                                     | Wavesample number lo byte,  # = [1..127]                                                                       |
| IF   | CLEAR                                                                                 | Clear the wavesample data in the source range.                                                                 |
| 00   | WAVEDATA                                                                              | Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7] Layer number hi byte (always 0) |
| 0b   | b                                                                                     | Layer number lo byte,  Layer # = [0..7]                                                                        |
| 0c   | c                                                                                     | Wavesample number hi byte                                                                                      |
| 0d   | d                                                                                     | Wavesample number lo byte,  # = [1..127] Data range start offset (from beginning of wavesample                 |
| 0f   | data),  Data offset = [0..FFFFF]                                                      | Start Offset = 0efgh (long word, 20 bits) see note at top of section 4.2                                       |
| 0g   | Data range end offset (from beginning of wavesample  data),  Data offset = [0..FFFFF] | End Offset = 0ijkl (long word, 20 bits) see note at top of section 4.2                                         |
| 0j   | see note at top of section 4.2                                                        |                                                                                                                |
| 0k   | see note at top of section 4.2                                                        |                                                                                                                |

| 20   | COPY  WAVEDATA                                  | Copy the wavesample data from the source to the des- tination. The destination wavesample must already exist.   |
|------|-------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| 00   | a                                               | Source instrument number hi byte (always 0)                                                                     |
| 0a   | a                                               | a = Source instrument number lo byte, # = [0..7]                                                                |
| 00   | b                                               | Source layer number hi byte (always 0)                                                                          |
| 0b   | c                                               | c = Source wavesample number hi byte                                                                            |
| 0d   | d                                               | Source wavesample number lo byte,                                                                               |
| 00   | #                                               | [1..127]                                                                                                        |
| 0e   | e                                               | Destination instrument number hi byte (=0)                                                                      |
| 00   | e                                               | Destination instrument number lo byte                                                                           |
| 0f   | f                                               | Destination layer number lo byte,                                                                               |
| 0g   | g                                               | Destination wavesample number hi byte                                                                           |
| 0h   | h                                               | Destination wavesample number lo byte                                                                           |
| 0i   | i                                               | Source data range start offset (from beginning of                                                               |
| 0j   | j                                               | source wavesample data),                                                                                        |
| 0k   | Data offset = [0..FFFFF]                        | Start Offset = Oijkl (long word, 20 bits)                                                                       |
| 0l   | Source data range end offset (from beginning of | source wavesample data),                                                                                        |
| 0m   | Data offset = [0..FFFFF]                        | End Offset = Omnop (long word, 20 bits)                                                                         |
| 0o   | Data offset = [0..FFFFF]                        | Destination data range start offset (from beginning of                                                          |
| 0p   | destination wavesample data),                   | destination                                                                                                     |
| 0q   | Data offset = [0..FFFFF]                        | Start Offset = Oqrst (long word, 20 bits)                                                                       |
| 0s   | Start Offset = 0qrst (long word, 20 bits)       | 0                                                                                                               |

| 21   | ADD WAVEDATA Add the source data to the destination and store the   |
|------|---------------------------------------------------------------------|
| 00   | result in the destination.                                          |
| 0a   | Source instrument number hi byte (always 0)                         |
| 00   | a = Source instrument number lo byte, # = [0..7]                    |
| 0b   | Source layer number hi byte (always 0)                              |
| 0c   | c = Source wavesample number hi byte                                |
| 0d   | d = Source wavesample number lo byte,                               |
| 00   | # = [1..127]                                                        |
| 0e   | Destination instrument number hi byte (=0)                          |
| 00   | e = Destination instrument number lo byte                           |
| 0f   | Destination layer number hi byte (always 0)                         |
| 0g   | f = Destination layer number lo byte,                               |
| 0h   | g = Destination wavesample number hi byte                           |
| 0i   | h = Destination wavesample number lo byte                           |
| 0j   | Source data range start offset (from beginning of                   |
| 0k   | source wavesample data),                                            |
| 0l   | Data offset = [0..FFFFF]                                            |
| 0m   | Start Offset = Oijkl (long word, 20 bits)                           |
| 0n   | Source data range end offset (from beginning of                     |
| 0o   | source wavesample data),                                            |
| 0p   | End Offset = Omnop (long word, 20 bits)                             |
| 0q   | Destination data range start offset (from beginning of              |
| Or   | destination wavesample data),                                       |
| 0s   | Data offset = [0..FFFFF]                                            |
| 0t   | Start Offset = 0qrst (long word, 20 bits)                           |
| 00   | Clip prevention flag hi byte, (always 0)                            |
| 0u   | u = Clip prevention flag lo byte,                                   |
|      | clear = 00, set = 01                                                |

|   22 | SCALE    | Scale the data based on a scaling ramp between the                                                                              |
|------|----------|---------------------------------------------------------------------------------------------------------------------------------|
|      | WAVEDATA | scale factor points. Instrument number hi byte (always 0)                                                                       |
|      | a        | = Instrument number lo byte, # = [0..7]                                                                                         |
|      | 0a       | Layer number hi byte (always 0)                                                                                                 |
|      | 0b       | b = Layer number lo byte, Layer # = [0..7]                                                                                      |
|      | 0c       | c = Wavesample number hi byte                                                                                                   |
|      | 0d       | d = Wavesample number lo byte, # = [1..127]                                                                                     |
|      | 0e       | Data range start offset (from beginning of wavesample data), Data offset = [0..FFFFF] Start Offset = 0efgh (long word, 20 bits) |
|      | 0g       | Start Offset = 0efgh (long word, 20 bits)                                                                                       |
|      | 0h       | Data range end offset (from beginning of wavesample data), Data offset = [0..FFFFF] End Offset = 0ijkl (long word, 20 bits)     |
|      | 0j       | Scale factor start point. (stored as 2 bytes, hi = 8 bit                                                                        |
|      | 0k       | integer, lo = 7 bit fraction), factor = mno. see note at                                                                        |
|      | 0m       | top of section 4.4. start point = [0.0..255.99]                                                                                 |
|      | 0n       | Scale factor end point. (stored as 2 bytes, hi = 8 bit                                                                          |
|      | 0o       | integer, lo = 7 bit fraction), factor = pqr. see note at                                                                        |
|      | 0p       | top of section 4.4. end point = [0.0..255.99]                                                                                   |
|      | 0q       | Scale ramp depth hi byte (always 0)                                                                                             |
|      | 0r       | s = Scale ramp depth lo byte                                                                                                    |
|      | 0s       | depth = [0..6] (0=3.0dB, 1=3.5db, 6=6.0dB)                                                                                      |
|   23 | INVERT   | Invert the wavesample data in the source range, i.e. negate the sample values.                                                  |
|      | 00       | Instrument number hi byte (always 0)                                                                                            |
|      | 0a       | a = Instrument number lo byte, # = [0..7]                                                                                       |
|      | 00       | Layer number hi byte (always 0)                                                                                                 |
|      | 0b       | b = Layer number lo byte, Layer # = [0..7]                                                                                      |
|      | 0c       | c = Wavesample number hi byte                                                                                                   |
|      | 0d       | d = Wavesample number lo byte, # = [1..127]                                                                                     |
|      | 0e       | Data range start offset (from beginning of wavesample data), Data offset = [0..FFFFF] Start Offset = 0efgh (long word, 20 bits) |
|      | 0g       | Data range end offset (from beginning of wavesample data), Data offset = [0..FFFFF]                                             |
|      | 0i       | End Offset = 0ijkl (long word, 20 bits)                                                                                         |
|      | 0j       | Data range start offset = [0..FFFFF]                                                                                            |
|      | 0k       | End Offset = 0ijkl (long word, 20 bits)                                                                                         |

| 24   | REVERSE  WAVEDATA                                     | Reverse the wavesample data in the source range.   |
|------|-------------------------------------------------------|----------------------------------------------------|
| 00   | Instrument number hi byte (always 0)                  |                                                    |
| 0a   | a = Instrument number lo byte, # = [0..7]             |                                                    |
| 00   | Layer number hi byte (always 0)                       |                                                    |
| 0b   | b = Layer number lo byte, Layer # = [0..7]            |                                                    |
| 0c   | c = Wavesample number hi byte                         |                                                    |
| 0d   | d = Wavesample number lo byte, # = [1..127]           |                                                    |
| 0e   | Data range start offset (from beginning of wavesample |                                                    |
| 0f   | data), Data offset = [0..FFFFF]                       |                                                    |
| 0g   | Start Offset = 0efgh (long word, 20 bits)             |                                                    |
| Oh   | Data range end offset (from beginning of wavesample   |                                                    |
| 0i   | data), Data offset = [0..FFFFF]                       |                                                    |
| 0j   | End Offset = 0ijkl (long word, 20 bits)               |                                                    |
| Ok   | Append the wavesample data in the source range to     |                                                    |
| 0l   | itself repeatedly until the whole wavesample data     |                                                    |
| 25   | REPLICATE  WAVEDATA                                   | Append the wavesample data in the source range to  |
| 00   | block is filled.                                      |                                                    |
| 0a   | Instrument number hi byte (always 0)                  |                                                    |
| 00   | a = Instrument number lo byte, # = [0..7]             |                                                    |
| 0b   | b = Layer number lo byte, # = [0..7]                  |                                                    |
| 0c   | c = Wavesample number hi byte                         |                                                    |
| 0d   | d = Wavesample number lo byte, # = [1..127]           |                                                    |
| 0e   | Data range start offset (from beginning of wavesample |                                                    |
| 0f   | data), Data offset = [0..FFFFF]                       |                                                    |
| 0g   | Start Offset = 0efgh (long word, 20 bits)             |                                                    |
| Oh   | Data range end offset (from beginning of wavesample   |                                                    |
| 0i   | data), Data offset = [0..FFFFF]                       |                                                    |
| 0j   | End Offset = 0ijkl (long word, 20 bits)               |                                                    |

| 26   | CROSS FADE  LOOP                                      | Make a cross fade loop of a certain size based on a  scaling ramp.  Instrument number hi byte (always 0)   |
|------|-------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| 00   | a                                                     | a = Instrument number lo byte, # = [0..7]                                                                  |
| 00   | b                                                     | Layer number hi byte (always 0)                                                                            |
| 0c   | b                                                     | b = Layer number lo byte, # = [0..7]                                                                       |
| 0d   | c                                                     | c = Wavesample number hi byte                                                                              |
| 0e   | d                                                     | d = Wavesample number lo byte, # = [1..127]                                                                |
| 0f   | Size = [0..FFFFF], same as wavedata offset 0e         | Fade zone size (see note at top of section 4.4)                                                            |
| 0g   | Fade zone = 0efgh (long word, 20 bits)                |                                                                                                            |
| 0h   | Scale ramp depth hi byte (always 0)                   |                                                                                                            |
| 00   | i = Scale ramp depth lo byte                          |                                                                                                            |
| 0i   | depth = [0..6] (0=3.0dB, 1=3.5db, 6=6.0dB)            |                                                                                                            |
| 27   | FADE IN  WAVEDATA                                     | Fade in the wavesample data in the source range.                                                           |
| 00   | Instrument number hi byte (always 0)                  |                                                                                                            |
| 0a   | a = Instrument number lo byte, # = [0..7]             |                                                                                                            |
| 00   | Layer number hi byte (always 0)                       |                                                                                                            |
| 0b   | b = Layer number lo byte, # = [0..7]                  |                                                                                                            |
| 0c   | c = Wavesample number hi byte                         |                                                                                                            |
| 0d   | d = Wavesample number lo byte, # = [1..127]           |                                                                                                            |
| 0e   | Data range start offset (from beginning of wavesample |                                                                                                            |
| 0f   | data),  Data offset = [0..FFFFF]                      |                                                                                                            |
| 0g   | Start Offset = 0efgh (long word, 20 bits)             |                                                                                                            |
| 0h   | Data range end offset (from beginning of wavesample   |                                                                                                            |
| 0i   | data),  Data offset = [0..FFFFF]                      |                                                                                                            |
| 0j   | End Offset = 0ijkl (long word, 20 bits)               |                                                                                                            |
| 0k   | Scale ramp depth hi byte (always 0)                   |                                                                                                            |
| 01   | m = Scale ramp depth lo byte                          |                                                                                                            |
| 00   | depth = [0..6] (0=3.0dB, 1=3.5db, 6=6.0dB)            |                                                                                                            |

| 28   | FADE OUT WAVEDATA                                        | Fade out the wavesample data in the source range.   |
|------|----------------------------------------------------------|-----------------------------------------------------|
| 00   | Instrument number hi byte (always 0)                     |                                                     |
| 0a   | a = Instrument number lo byte, # = [0..7]                |                                                     |
| 00   | Layer number hi byte (always 0)                          |                                                     |
| 0b   | b = Layer number lo byte, # = [0..7]                     |                                                     |
| 0c   | c = Wavesample number hi byte                            |                                                     |
| 0d   | d = Wavesample number lo byte, # = [1..127]              |                                                     |
| 0e   | Data range start offset (from beginning of wavesample    |                                                     |
| 0f   | data), Data offset = [0..FFFFF]                          |                                                     |
| 0g   | Start Offset = 0efgh (long word, 20 bits)                |                                                     |
| 0h   | Data range end offset (from beginning of wavesample      |                                                     |
| 0i   | data), Data offset = [0..FFFFF]                          |                                                     |
| 0j   | End Offset = 0ijkl (long word, 20 bits)                  |                                                     |
| 0k   | Scale ramp depth hi byte (always 0)                      |                                                     |
| 00   | m = Scale ramp depth lo byte                             |                                                     |
| 0m   | depth = [0..6] (0=3.0dB, 1=3.5db, 6=6.0dB)               |                                                     |
| 29   | The whole loop section is faded out, reversed, added     |                                                     |
| 00   | to itself, and then a normal cross fade loop is created. |                                                     |
| 0a   | Instrument number hi byte (always 0)                     |                                                     |
| 00   | a = Instrument number lo byte, # = [0..7]                |                                                     |
| 0b   | Layer number hi byte (always 0)                          |                                                     |
| 0c   | b = Layer number lo byte, # = [0..7]                     |                                                     |
| 0d   | c = Wavesample number hi byte                            |                                                     |
| 0e   | d = Wavesample number lo byte, # = [1..127]              |                                                     |
| 0f   | Fade zone size (see note at top of section 4.4)          |                                                     |
| 0g   | Size = [0..FFFFF], same as wavedata offset               |                                                     |
| 0h   | Fade zone = 0efgh (long word, 20 bits)                   |                                                     |
| 00   | Scale ramp depth hi byte (always 0)                      |                                                     |
| 0i   | i = Scale ramp depth lo byte                             |                                                     |
|      | depth = [0..6] (0=3.0dB, 1=3.5db, 6=6.0dB)               |                                                     |

| 2A   | ENSEMBLE CROSS FADE LOOP                                                                                                                                                                                                                 | A normal cross fade loop is created where the cross fade zone equals the loop length.   |
|------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| 00   | Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7] Layer number hi byte (always 0)                                                                                                                           |                                                                                         |
| 00   | b = Layer number lo byte, # = [0..7]                                                                                                                                                                                                     |                                                                                         |
| 0c   | c = Wavesample number hi byte                                                                                                                                                                                                            |                                                                                         |
| 0d   | d = Wavesample number lo byte, # = [1..127]                                                                                                                                                                                              |                                                                                         |
| 00   | Fade zone size (see note at top of section 4.4)                                                                                                                                                                                          |                                                                                         |
| 00   | Fade zone = 00000 (long word, 20 bits)                                                                                                                                                                                                   |                                                                                         |
| 00   | Scale ramp depth hi byte (always 0)                                                                                                                                                                                                      |                                                                                         |
| 00   | e = Scale ramp depth lo byte                                                                                                                                                                                                             |                                                                                         |
| 0e   | depth = [0..6] (0=3.0dB, 1=3.5db, 6=6.0dB)                                                                                                                                                                                               |                                                                                         |
| 2B   | A cross fade loop is created such that the data at each of the loop points is the same. The drawing of the fade lines forms a bowtie shape, hence the name. The cross fade zone length must not be greater than half of the loop length. |                                                                                         |
| 00   | the Instrument number hi byte (always 0)                                                                                                                                                                                                 |                                                                                         |
| 0a   | a = Instrument number lo byte, # = [0..7]                                                                                                                                                                                                |                                                                                         |
| 00   | Layer number hi byte (always 0)                                                                                                                                                                                                          |                                                                                         |
| 0b   | b = Layer number lo byte, # = [0..7]                                                                                                                                                                                                     |                                                                                         |
| 0c   | c = Wavesample number hi byte                                                                                                                                                                                                            |                                                                                         |
| 0d   | d = Wavesample number lo byte, # = [1..127]                                                                                                                                                                                              |                                                                                         |
| 0e   | Fade zone size (see note at top of section 4.4)                                                                                                                                                                                          |                                                                                         |
| 0f   | Size = [0..FFFFF], same as wavedata offset,                                                                                                                                                                                              |                                                                                         |
| 0g   | Fade zone = 0efgh (long word, 20 bits)                                                                                                                                                                                                   |                                                                                         |
| 0h   | Scale ramp depth hi byte (always 0)                                                                                                                                                                                                      |                                                                                         |
| 00   | i = Scale ramp depth lo byte                                                                                                                                                                                                             |                                                                                         |
| 0i   | depth = [0..6] (0=3.0dB, 1=3.5db, 6=6.0dB)                                                                                                                                                                                               |                                                                                         |

| 2C   | LENGTHEN  LOOP                                  | The data at the end of the loop is faded out, reversed,  and added such that the faded sections overlap.                                                                                                                                                         |
|------|-------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 00   | a                                               | Instrument number hi byte (always 0)                                                                                                                                                                                                                             |
| 0a   | a                                               | = Instrument number lo byte, # = [0..7]                                                                                                                                                                                                                          |
| 00   | Layer number hi byte (always 0)                 | b = Layer number lo byte, # = [0..7]                                                                                                                                                                                                                             |
| 0b   | c = Wavesample number hi byte                   | d = Wavesample number lo byte, # = [1..127]                                                                                                                                                                                                                      |
| 0d   | Fade zone size (see note at top of section 4.4) | Size = [0..FFFFF], same as wavedata offset,                                                                                                                                                                                                                      |
| 0e   | Fade zone = 0efgh (long word, 20 bits)          | i = Scale ramp depth hi byte (always 0)                                                                                                                                                                                                                          |
| 0h   | Depth = [0..6] (0=3.0dB, 1=3.5db, 6=6.0dB)      | Scale ramp depth lo byte                                                                                                                                                                                                                                         |
| 0i   | depth = [0..6] (0=3.0dB, 1=3.5db, 6=6.0dB)      | i = Scale ramp depth lo byte                                                                                                                                                                                                                                     |
| 2D   | MIX WAVEDATA                                    | Mix the data of the source wavesample into the desti- nation wavesample. If there is any pitch difference  between the wavesamples, the command will fail  because there is no way to correct the pitch difference.  Source instrument number hi byte (always 0) |
| 00   | a                                               | a = Source instrument number lo byte, # = [0..7]                                                                                                                                                                                                                 |
| 0a   | Source layer number hi byte (always 0)          | Source layer number hi byte                                                                                                                                                                                                                                      |
| 0b   | b = Source layer number lo byte, # = [0..7]     | c = Source wavesample number hi byte                                                                                                                                                                                                                             |
| 0c   | d = Source wavesample number lo byte,           | # = [1..127]                                                                                                                                                                                                                                                     |
| 0d   | Destination instrument number hi byte (=0)      | Destination layer number hi byte                                                                                                                                                                                                                                 |
| 00   | e = Destination instrument number lo byte       | Destination layer number hi byte (always 0)                                                                                                                                                                                                                      |
| 0e   | f = Destination layer number lo byte,           | f = Destination layer number lo byte                                                                                                                                                                                                                             |
| 0f   | # = [0..7]                                      | g = Destination wavesample number hi byte                                                                                                                                                                                                                        |
| 0g   | h = Destination wavesample number lo byte       | i = Balance control hi byte (always 0)                                                                                                                                                                                                                           |
| 0h   | j = Balance control lo byte, # = [-127..127]    | (-127 is all source, 0 = equal balance, and 127 is all                                                                                                                                                                                                           |

| 2E   | MERGE/SPLICE  WAVEDATA                           | Merge the data of the source wavesample into the des- tination wavesample using a variable cross-fade. A  splice is achieved using a zero length cross-fade. If  there is any pitch difference between the wavesam- ples, the command will fail because there is no way to  correct the pitch difference.   |                                            |                                        |
|------|--------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------|----------------------------------------|
| 00   | a Source instrument number lo byte, # = [0..7]   | Source instrument number hi byte (always 0)                                                                                                                                                                                                                                                                 |                                            |                                        |
| 0a   | a = Source instrument number lo byte, # = [0..7] | Source layer number hi byte (always 0)                                                                                                                                                                                                                                                                      |                                            |                                        |
| 00   | b Source layer number lo byte, # = [0..7]        | c Source wavesample number hi byte                                                                                                                                                                                                                                                                          |                                            |                                        |
| 0c   | d Source wavesample number lo byte,              | # = [1..127]                                                                                                                                                                                                                                                                                                |                                            |                                        |
| 0d   | Destination instrument number hi byte (=0)       | Destination instrument number lo byte                                                                                                                                                                                                                                                                       |                                            |                                        |
| 00   | e Destination instrument number lo byte          | Destination layer number hi byte (always 0)                                                                                                                                                                                                                                                                 |                                            |                                        |
| 00   | f Destination layer number lo byte,              | # = [0..7]                                                                                                                                                                                                                                                                                                  |                                            |                                        |
| 0f   | g Destination wavesample number hi byte          | h Destination wavesample number lo byte                                                                                                                                                                                                                                                                     |                                            |                                        |
| 0g   | fade zone [loop size > size                      | 0i                                                                                                                                                                                                                                                                                                          | Size = [0..FFFFF], same as wavedata offset | Fade zone = 0ijkl (long word, 20 bits) |
| 0k   | Scale ramp depth hi byte (always 0)              | m = Scale ramp depth lo byte                                                                                                                                                                                                                                                                                |                                            |                                        |
| 00   | depth = [0..6] (0=3.0dB, 1=3.5db, ... 6=6.0dB)   | n = Balance control hi byte                                                                                                                                                                                                                                                                                 |                                            |                                        |
| 0n   | o = Balance control lo byte, # = [-127..127]     | (-127 is all source, 0 = equal balance, and 127 is all                                                                                                                                                                                                                                                      |                                            |                                        |

| 2F   | VOLUME  SMOOTHING                                            | The amplitude of a section of data is made the same as  the amplitude at the beginning of the section. This is  a functions like a digital dynamic compressor.   |
|------|--------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 00   | Instrument number hi byte (always 0)                         | a = Instrument number lo byte, # = [0..7]                                                                                                                        |
| 0a   | Layer number hi byte (always 0)                              | b = Layer number lo byte, # = [0..7]                                                                                                                             |
| 00   | c = Wavesample number hi byte                                | d = Wavesample number lo byte, # = [1..127]                                                                                                                      |
| 0c   | Start offset (from beginning of wavesample                   | Data range start offset (from beginning of wavesample                                                                                                            |
| 0e   | data), Data offset = [0..FFFFF]                              | Start Offset = 0efgh (long word, 20 bits)                                                                                                                        |
| 0g   | (long word, 20 bits)                                         | Data range end offset (from beginning of wavesample                                                                                                              |
| 0h   | data), Data offset = [0..FFFFF]                              | End Offset = 0ijkl (long word, 20 bits)                                                                                                                          |
| 0j   | (long word, 20 bits)                                         | Scale ramp depth lo byte                                                                                                                                         |
| 0l   | m = Scale ramp depth lo byte                                 | m = Scale ramp depth lo byte                                                                                                                                     |
| 00   | depth = [0..6] (0=3.0dB, 1=3.5db, 6=6.0dB)                   | Smoothness parameter hi byte (always 0)                                                                                                                          |
| 00   | n = Smoothness lo byte, #=[0..4] (0 is very fine, 4 is       | very coarse)                                                                                                                                                     |
| 41   | The wavedata is scaled up to the full digital signal  range. | The waredata is scaled up to the full digital signal                                                                                                             |
| 00   | Instrument number hi byte (always 0)                         | a = Instrument number lo byte, # = [0..7]                                                                                                                        |
| 0a   | Layer number hi byte (always 0)                              | b = Layer number lo byte, # = [0..7]                                                                                                                             |
| 00   | c = Wavesample number hi byte                                | d = Wavesample number lo byte, # = [1..127]                                                                                                                      |
| 0c   | (long word, 20 bits)                                         | June 12, 1989                                                                                                                                                    |

| 42   | SYNTHESIZED  LOOP                                                                             | Given the current loop points in the specified  wave- sample and the smoothness parameter, a loop is  generated using an intelligent randomized algorithm. Instrument number hi byte (always 0) a = Instrument number lo byte, # = [0..7]   |
|------|-----------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 00   | 0a                                                                                            | Layer number hi byte (always 0)                                                                                                                                                                                                             |
| 00   | 0b                                                                                            | b = Layer number lo byte, # = [0..7]                                                                                                                                                                                                        |
| 0c   | c =  Wavessample number hi byte                                                               | c =  Wavessample number hi byte                                                                                                                                                                                                             |
| 0d   | d =  Wavessample number lo byte, # = [1..127] Smoothness parameter hi byte (always 0)         | d =  Wavessample number lo byte, # = [1..127] Smoothness parameter hi byte (always 0)                                                                                                                                                       |
| 00   | e =  Smoothness lo byte, #=[0..4] (0 is very fine, 4 is                                       | e =  Smoothness lo byte, #=[0..4] (0 is very fine, 4 is                                                                                                                                                                                     |
| 0e   | very coarse)                                                                                  | very coarse)                                                                                                                                                                                                                                |
| 43   | This is a variation of the normal cross fade for bidirec-                                     |                                                                                                                                                                                                                                             |
| 00   | cross fade zone length must not be                                                            | cross fade zone length must not be                                                                                                                                                                                                          |
| 00   | greater than half of the loop length. Instrument number hi byte (always 0)                    | greater than half of the loop length. Instrument number hi byte (always 0)                                                                                                                                                                  |
| 0a   | a = Instrument number lo byte, # = [0..7]                                                     | a = Instrument number lo byte, # = [0..7]                                                                                                                                                                                                   |
| 00   | Layer number hi byte (always 0)                                                               | Layer number hi byte (always 0)                                                                                                                                                                                                             |
| 0b   | b = Layer number lo byte, # = [0..7]                                                          | b = Layer number lo byte, # = [0..7]                                                                                                                                                                                                        |
| 0c   | c =  Wavessample number hi byte                                                               | c =  Wavessample number hi byte                                                                                                                                                                                                             |
| 0d   | d =  Wavessample number lo byte, # = [1..127] Fade zone size (see note at top of section 4.4) | d =  Wavessample number lo byte, # = [1..127] Fade zone size (see note at top of section 4.4)                                                                                                                                               |
| 0e   | Size = [0..FFFFF], same as wavedata offset, Fade zone = 0efgh (long word, 20 bits)            | Size = [0..FFFFF], same as wavedata offset, Fade zone = 0efgh (long word, 20 bits)                                                                                                                                                          |
| 0g   | Scale ramp depth hi byte (always 0)                                                           | Scale ramp depth hi byte (always 0)                                                                                                                                                                                                         |
| 00   | i = Scale ramp depth lo byte                                                                  | i = Scale ramp depth lo byte                                                                                                                                                                                                                |
| 0i   | depth = [0..6] (0=3.0dB, 1=3.5db, ... 6=6.0dB)                                                | depth = [0..6] (0=3.0dB, 1=3.5db, ... 6=6.0dB)                                                                                                                                                                                              |

## 5 Command Status Codes

These codes are the low byte of the data word in a response command. Each code indicates how the receiver processed the preceding command or if it was able to process it at all. Each status code is sent in 12 bit word format as described in 2.3. The given meaning is intended as an explanation of the error and possible error recovery actions.

| #   | Name                            | Meaning                                                                                                                                                                                           |
|-----|---------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 00  | ACK                             | Yes, OK, it worked, cool, and it's jammin'.                                                                                                                                                       |
| 01  | WAIT                            | The receiver needs extra time to process the command, load an overlay, etc. The transmitter should reset its message timer for 30 seconds. Chill...                                               |
| 02  | INSERT SYSTEM DISK              | The system disk must be inserted in the EPS drive before the command is executed. The transmitter should prompt the user to insert the disk, and after the user is done, re-transmit the command. |
| 03  | INVALID PARAMETER NUMBER        | A parameter number in the last GET or PUT parameter command doesn't exist.                                                                                                                        |
| 04  | INVALID PARAMETER VALUE         | A parameter value in the last GET or PUT parameter command is out of range.                                                                                                                       |
| 05  | INVALID INSTRUMENT              | The instrument(s) specified doesn't exist, i.e. is not loaded.                                                                                                                                    |
| 06  | INVALID LAYER IN USE            | The LAYER(s) specified doesn't exist.                                                                                                                                                             |
| 07  | LAYER IN USE                    | The destination LAYER already exists and cannot be used.                                                                                                                                          |
| 08  | INVALID WAVE- SAMPLE            | The wavesample(s) specified doesn't exist.                                                                                                                                                        |
| 09  | WAVESAMPLE IN USE               | The destination wavesample already exists and cannot be used.                                                                                                                                     |
| OA  | INVALID WAVE- SAMPLE DATA RANGE | The data range specified doesn't exist within the specified wavesample.                                                                                                                           |
| OB  | FILE NOT FOUND                  | The filename in the command cannot be found in the directory.                                                                                                                                     |
| OC  | MEMORY FULL                     | There is not enough RAM needed to execute the command.                                                                                                                                            |

| 0D   | INSTRUMENT  IN USE          | The specified instrument cannot be used for the given  command.                                                                                                                                                         |
|------|-----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| OE   | NO MORE  LAYERS             | All eight layers are in use.                                                                                                                                                                                            |
| OF   | NO MORE  WAVESAMPLES        | All 127 wavesamples are in use.                                                                                                                                                                                         |
| 10   | reserved                    | Reserved for internal EPS use.                                                                                                                                                                                          |
| 11   | WAVESAMPLE  IS A COPY       | The wavedata in the specified wavesample is a copy of  data in another wavesample.  The command can only be  executed on the wavesample containing the data.                                                            |
| 12   | ZONE TOO BIG                | The cross fade zone is too big.  Make it smaller or move  the loop points away from the ends of the wavesample  data.                                                                                                   |
| 13   | SEQUENCER  MUST BE  STOPPED | The command could not be executed because the  sequencer was running.  Stop the sequencer and redo the  command.                                                                                                        |
| 14   | DISK ACCESS  IN PROGRESS    | Current disk activity prevented the execution of the com- mand.                                                                                                                                                         |
| 15   | DISK FULL                   | The disk is full and no files can be stored.                                                                                                                                                                            |
| 16   | LOOP IS TOO  LONG           | The processing command could not be completed because  the loop length is too long.  This is currently used only by  the synthesized loop command.                                                                      |
| 17   | NAK                         | Something was wrong with the last data transfer which  could not be processed.                                                                                                                                          |
| 18   | NO LAYER EDIT               | When the wavesample number is zero, a PUT PARAME- TER message will effect all wavesamples on the given  layer.  This status code is used when this type of editing is  not allowed, especially wavedata offset editing. |
| 19   | NO MORE  PITCH TABLES       | Only eight pitch tables can be created within an instru- ment.                                                                                                                                                          |
| 1A   | CROSS FADE  LENGTH IS  ZERO | The cross fade length cannot be zero in this command.                                                                                                                                                                   |

| 1B   | CROSS FADE  LENGTH IS GREATER THAN  50%   | The cross fade zone must be less than or equal to fifty  percent of the loop length.                                   |
|------|-------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| 1C   | LOOP START  TOO CLOSE TO  SAMPLE START    | The processing command could not be completed because  there was not enough room between sample start and loop  start. |
| 1D   | LOOP END TOO  CLOSE TO  SAMPLE END        | The processing command could not be completed because  there was not enough room between loop end and sample  end.     |
| 1E   | QUIET LAYER                               | The layer being edited is not in the patch so any parame- ter changes will not be heard.                               |

## 6 Button Numbers

The following table lists the valid key numbers for use in the VIRTUAL BUTTON PRESS command.

|   Logical Key Number | Front Panel Button Name              |
|----------------------|--------------------------------------|
|                    0 | Instrument 1                         |
|                    1 | Instrument 2                         |
|                    2 | Instrument 3                         |
|                    3 | Instrument 4                         |
|                    4 | Instrument 5                         |
|                    5 | Instrument 6                         |
|                    6 | Instrument 7                         |
|                    7 | Instrument 8                         |
|                   16 | Sample                               |
|                   17 | Command Mode                         |
|                   18 | Key Range (instrument or wavesample) |
|                   19 | Edit Mode                            |
|                   20 | Load Mode                            |
|                   21 | MIDI                                 |
|                   22 | Seq· Song                            |
|                   23 | Instrument                           |
|                   24 | System                               |

|   Logical Key Number | Front Panel Button Name    |
|----------------------|----------------------------|
|                   32 | Up Arrow (increment)       |
|                   33 | Down Arrow (decrement)     |
|                   34 | Left Arrow (scroll left)   |
|                   35 | Cancel· No                 |
|                   36 | Right Arrow (scroll right) |
|                   37 | Enter· Yes                 |
|                   48 | 0· Track                   |
|                   49 | 1· Env1                    |
|                   50 | 2· Env2                    |
|                   51 | 3· Env3                    |
|                   52 | 4· Pitch                   |
|                   53 | 5· Filter                  |
|                   54 | 6· Amp                     |
|                   55 | 7· LFO                     |
|                   56 | 8· Wave                    |
|                   57 | 9· Layer                   |

## 7 Parameter Block Data Descriptions

The parameter blocks transmitted in the PUT INSTRUMENT, PUT LAYER, PUT WAVESAMPLE, and PUT PITCH TABLE commands are described here. See section 4.2 for detailed descriptions of the commands.

## 7.1 Instrument Parameter Block

This table describes the data transmitted by the second message of the PUT INSTRUMENT command. All data in the data block is transmitted using the 16 bit word format described in section 2.3. The table describes the data as it exists in RAM, i.e. the given words offsets are the RAM offsets not the MIDI data offsets. Refer to section 9 for the parameter value ranges.

| Word Offset decimal   | Data Word Description (all values in hi byte of word)                  |
|-----------------------|------------------------------------------------------------------------|
| 00-11                 | Name - 12 ASCII bytes, one byte per word                               |
| 12                    | MIDI Channel - (outbound)                                              |
| 13                    | MIDI Program Number - (outbound)                                       |
| 14                    | MIDI Pressure - (outbound)                                             |
| 15                    | Total Instrument Size in Blocks (1 Block = 256 words)                  |
| 16                    | Key Destination (LOCAL, MIDI, or BOTH)                                 |
| 17                    | Patch 0 (bit map of layers, bit 0=LYR 1, bit 1=LYR 2, ...)             |
| 18                    | Patch 1 (bit map of layers, bit 0=LYR 1, bit 1=LYR 2, ...)             |
| 19                    | Patch 2 (bit map of layers, bit 0=LYR 1, bit 1=LYR 2, ...)             |
| 20                    | Patch 3 (bit map of layers, bit 0=LYR 1, bit 1=LYR 2, ...)             |
| 21                    | Key Down Layers (bit map of layers, bit 0=LYR 1, bit 1=LYR 2, ...)     |
| 22                    | Key Up Layers (bit map of layers, bit 0=LYR 1, bit 1=LYR 2, ...)       |
| 23-25                 | used                                                                   |
| 26                    | Key Range - Lo Key                                                     |
| 27                    | Key Range - Hi Key                                                     |
| 28                    | Transposition - number of semitones (signed)                           |
| 29-44                 | Pitch Table Offsets - (relative to instrument base address in EPS RAM) |
| 45-60                 | Layer Offsets - (relative to instrument base address in EPS RAM)       |
| 61-316                | Wavesample Offsets - (relative to instrument base address in EPS RAM)  |
| 317-322               | unused                                                                 |

## 7.2 Layer Parameter Block

This table describes the data transmitted by the second message of the PUT LAYER command. All data in the data block is transmitted using the 16 bit word format described in section 2.3. The table describes the data as it exists in RAM, i.e. the given words offsets are the RAM offsets not the MIDI data offsets. Refer to section 9 for the parameter value ranges.

| Word Offset decimal   | Data Word Description (all values in hi byte of word)   |
|-----------------------|---------------------------------------------------------|
| 00-11                 | Name - 12 ASCII bytes, one byte per word                |
| 12                    | Glide Mode                                              |
| 13                    | Glide Time                                              |
| 14                    | Legato Layer Number                                     |
| 15                    | Velocity Lo                                             |
| 16                    | Velocity Hi                                             |
| 17                    | Pitch Table Number                                      |
| 18                    | unused                                                  |
| 19-106                | Layer Map - (one wavesample number per key in hi byte)  |

## 7.3 Wavesample Parameter Block

This table describes the data transmitted by the second message of the PUT WAVESAMPLE command. All data in the data block is transmitted using the 16 bit word format described in section 2.3. The table describes the data as it exists-in RAM, i.e. the given words offsets are the RAM offsets not the MIDI data offsets. Refer to section 9 for the parameter value ranges.

| Word  Offset  decimal   | Data Word Description  (all values in hi byte of word)                                                   |
|-------------------------|----------------------------------------------------------------------------------------------------------|
| 00-11                   | Name - 12 ASCII bytes, one byte per word                                                                 |
| 12                      | Wavesample Copy Number - if non-zero, this is the number of the wavesample  containing the sample data   |
| 13                      | Wavesample Copy Layer - if non-zero, this is the number of the layer containing  the original wavesample |
| 14-35                   | Patch Envelope #1 - see section 7.3.1                                                                    |
| 36-57                   | Filter Envelope #2 - see section 7.3.1                                                                   |
| 58-79                   | Amplitude Envelope #3 - see section 7.3.1                                                                |
| 80                      | Root Key - MIDI key number                                                                               |
| 81                      | Patch Envelope Amount                                                                                    |
| 82                      | LFO Amount                                                                                               |
| 83                      | Random Modulation Amount                                                                                 |
| 84                      | Pitch Wheel Bend Range                                                                                   |
| 85                      | Modulation Source                                                                                        |
| 86                      | Fine Tune - signed 7 bit fraction in hi byte                                                             |
| 87                      | Modulation Amount                                                                                        |
| 88                      | Filter Mode                                                                                              |
| 89                      | FC #1 Cutoff                                                                                             |
| 90                      | FC #2 Cutoff                                                                                             |
| 91                      | FC #1 Keyboard Amount                                                                                    |
| 92                      | FC #2 Keyboard Amount                                                                                    |
| 93                      | FC #1 Filter Envelope Amount                                                                             |
| 94                      | FC #2 Filter Envelope Amount                                                                             |
| 95                      | FC #1 Modulation Source                                                                                  |
| 96                      | FC #2 Modulation Source                                                                                  |
| 97                      | FC #1 Modulation Amount                                                                                  |
| 98                      | FC #2 Modulation Amount                                                                                  |
| 99                      | Volume                                                                                                   |
| 100                     | Amplitude Modulation Source                                                                              |
| 101                     | Amplitude Crossfade Curve Point A                                                                        |
| 102                     | Amplitude Crossfade Curve Point B                                                                        |
| 103                     | Amplitude Crossfade Curve Point C                                                                        |
| 104                     | Amplitude Crossfade Curve Point D                                                                        |

| 105     | Pan Position - including separate out assignment                                                                |
|---------|-----------------------------------------------------------------------------------------------------------------|
| 106     | Amplitude Modulation Amount                                                                                     |
| 107     | LFO Waveform                                                                                                    |
| 108     | LFO Speed                                                                                                       |
| 109     | LFO Depth                                                                                                       |
| 110     | LFO Delay Time                                                                                                  |
| 111     | LFO Modulation Source                                                                                           |
| 112     | LFO Mode                                                                                                        |
| 113     | Random Modulator Frequency                                                                                      |
| 114     | Loop Mode                                                                                                       |
| 115-118 | Sample Start Offset (left justified 32 bit field using hi bytes of each word - shift 9 for word offset)         |
| 119-122 | Sample End Offset (left justified 32 bit field using hi bytes of each word - shift 9 for word offset)           |
| 123-126 | Loop Start Offset (left justified 32 bit field using hi bytes of each word - shift 9 for word offset)           |
| 127-130 | Loop End Offset (left justified 32 bit field using hi bytes of each word - shift 5 for 4 bit loop end fraction) |
| 131     | Sample Rate - sample period = rate * 1.6 microseconds                                                           |
| 132     | Key Range - Lo Key                                                                                              |
| 133     | Key Range - Hi Key                                                                                              |
| 134     | Start or Loop Modulation Source                                                                                 |
| 135     | Start or Loop Modulation Amount                                                                                 |
| 136     | Start or Loop Modulation Range                                                                                  |
| 137     | Modulation Type (none, sample start, loop, or both)                                                             |
| 138     | unused                                                                                                          |

## 7.3.1 Wavesample Envelope Description

This table describes the structure of each of the three envelopes in each wavesample. All offsets are given from the base of the envelope, e.g. the base of the filter envelope is offset 36 words from the start of the data block in a PUT WAVESAMPLE command. Refer to section 9 for the parameter value ranges.

|   Word  Offset  decimal | Data Word Description  (all values in hi byte of word)       |
|-------------------------|--------------------------------------------------------------|
|                       0 | Envelope Type (default envelopes)                            |
|                       1 | Soft Level 0 - initial level                                 |
|                       2 | Hard Level 0 - initial level                                 |
|                       3 | Time 1 - attack time; time from initial level to level 1     |
|                       4 | Soft Level 1 - peak level                                    |
|                       5 | Hard Level 1 - peak level                                    |
|                       6 | Time 2 - first decay time; time from level 1 to level 2      |
|                       7 | Soft Level 2                                                 |
|                       8 | Hard Level 2                                                 |
|                       9 | Time 3 - second decay; time from level 2 to level 3          |
|                      10 | Soft Level 3                                                 |
|                      11 | Hard Level 3                                                 |
|                      12 | Time 4 - third decay; time from level 3 to level 4           |
|                      13 | Soft Level 4 - sustain                                       |
|                      14 | Hard Level 4 - sustain                                       |
|                      15 | Time 5 - release time; time from level 4 to level 5          |
|                      16 | Velocity Switch - soft level on/off                          |
|                      17 | Level 5 - release breakpoint relative to sustain level (+/-) |
|                      18 | Time 6 - second release time; time from level 5 to 0         |
|                      19 | Time 1 velocity sensitivity                                  |
|                      20 | Keyboard Time Scaling                                        |
|                      21 | Mode (0=normal, 1=cycle, 2=repeat)                           |

## 7.4 Pitch Table Block

This table describes the data transmitted by the second message of the PUT PITCH TABLE command. All data in the data block is transmitted using the 16 bit word format described in section 2.3. The table describes the data as it exists in RAM, i.e. the words offsets given are the RAM offsets not the MIDI data offsets.

| Word  Offset  decimal   | Data Word Description  (all values in hi byte of word)                                                         |
|-------------------------|----------------------------------------------------------------------------------------------------------------|
| 00-11                   | Name - 12 ASCII bytes, one byte per word                                                                       |
| 12-99                   | Key Map - 88 key values, one key per word (for each word, bits 15:9=semitone,  and bits 8:3=semitone fraction) |
| 100-106                 | unused                                                                                                         |

## 8 Example of a Wavedata Transfer

Assume that EXT wants to receive a portion of wavesample data from the EPS. This is one of the most common data transfers, and the following steps describe the commands sent to and-from the EPS to affect the data transfer.

## 1. to EPS from EXT:

GET WAVESAMPLE DATA: specify the instrument, layer, wavesample, and the start and end offsets.

## 2. to EXT from EPS:

RESPONSE: if all the parameters of the GET WAVESAMPLE DATA command were OK, then the ACK status code is used, otherwise an error status code is used and the data transfer is complete.

## 3. to EXT from EPS:

PUT WAVESAMPLE DATA (first part): the parameters here are the same as the GET WAVESAMPLE DATA command.

## 4. to EPS from EXT:

RESPONSE: if EXT still wants the data, the ACK status code should be used, otherwise the data transfer is complete.

## 5. to EXT from EPS:

PUT WAVESAMPLE DATA (second part): all the samples within the data range given in the GET WAVESAMPLE DATA are transmitted using the 16 bit word format described in section 2.3. The block of samples forms the message within the system exclusive packet according to section 2.

## 6. to EPS from EXT:

RESPONSE: if the data was successfully received, the ACK status code should be used. If an error occurred during the second part of the PUT WAVESAMPLE DATA command, the data transfer must be started again from step 1 since the EPS will not retransmit the second part of the PUT WAVESAMPLE DATA again regardless of the status code.

## 9 Parameter Numbers

The following table of parameter numbers is used in the GET and PUT PARAMETER commands. The complete parameter number word consists of two bytes: the page number (high byte) and the item number (low byte). The number is transmitted using the 12 bit word format descirbed in section 2.3. An easy way to remember parameter numbers in a MIDI data dump is high byte times four followed by the low byte. For example, Free System Blocks is transmitted via MIDI bytes $34 $00 not $0D $00. Parameter values are right justified within a 24 bit binary word and transmitted as two 12 bit words according to section 2.3.

## 9.1 SYSTEM PARAMETERS

SYSEX HIGH BYTE: 13

|                    |   LOW BYTE | RANGE                               |
|--------------------|------------|-------------------------------------|
| Free System Blocks |          0 | 0-10000 (Read Only)                 |
| Free Disk Blocks   |          1 | 0-10000 (Read Only)                 |
| Master Tune        |          2 | -127 to +127                        |
| Global Bend Range  |          3 | 0-12                                |
| Touch Sensitivity  |          4 | 0-15 (Table 1)                      |
| Mod Pedal Mode     |          5 | 0-1 (Volume-Modulator)              |
| Sustain Pedal Mode |          6 | 0-1 (Sustain-Left Patch Select)     |
| Aux Pedal Mode     |          7 | 0-1 (Start/Stop-Right Patch Select) |
| Autoloop Switch    |          8 | 0-1 (Off-On)                        |

## 9.2 MIDI PARAMETERS

SYSEX HIGH BYTE: 12

|                            |   LOW BYTE | RANGE                               |
|----------------------------|------------|-------------------------------------|
| Base Channel               |          0 | 0-15 (Channels 1-16)                |
| Midi Transmit Mode         |          1 | 0-1 (Base or Instrument Channels)   |
| Base Channel Pressure Mode |          2 | 0-2 (Off-Key-Channel)               |
| Midi In Mode               |          3 | 0-4 (Omni-Poly-Multi-Mono A-Mono B) |
| Midi Controllers Enable    |          4 | 0-1 (Off-On)                        |
| Midi SYSEX Enable          |          5 | 0-1 (Off-On)                        |
| Midi Program Change Enable |          6 | 0-1 (Off-On)                        |
| Midi Song Position Enable  |          7 | 0-1 (Off-On)                        |
| Midi XCTRL Value           |          8 | 0-127                               |

## 9.3 INSTRUMENT PARAMETERS

SYSEX HIGH BYTE: 10

|                 |   LOW BYTE | RANGE   |
|-----------------|------------|---------|
| Patch           |          0 | 0-255   |
| Key Down Layers |          1 | 0-255   |
| Key Up Layers   |          2 | 0-255   |

Description: The above values select the layers in each parameter. Each layer is represented by a bit; if the bit is set, that layer will sound.

| Midi Channel              |   3 | 0-15 (Channels 1-16)   |
|---------------------------|-----|------------------------|
| Midi Program              |   4 | 1-127                  |
| Pressure Mode             |   5 | 0-2 (Off-Key-Channel)  |
| Instrument Size           |   7 | 0-10000 (Read Only)    |
| Send Keys To              |   6 | 0-2 (Both-Local-Midi)  |
| Range Low Key             |  10 | 0-127                  |
| Range High Key            |  11 | 0-127                  |
| Transpose Amount-Octave   |  12 | 0-5                    |
| Transpose Amount-Semitone |  13 | 0-12                   |

## 9.4 LAYER PARAMETERS

SYSEX HIGH BYTE: 9

|               |   LOW BYTE | RANGE                |
|---------------|------------|----------------------|
| Glide Mode    |          0 | 0-2 (Off-Mono-Pedal) |
| Glide Time    |          1 | 0-127                |
| Legato Layer  |          2 | 0-7                  |
| Velocity Low  |          3 | 0-127                |
| Velocity High |         10 | 0-127                |
| Pitch Table   |          4 | 0-7                  |

## 9.5 WAVESAMPLE PARAMETERS

SYSEX HIGH BYTE: 8

|                   |   LOW BYTE | RANGE                     |
|-------------------|------------|---------------------------|
| Loop Mode         |          0 | 0-4 (Table 8)             |
| Loop Mod Type     |          6 | 0-3 (Off-Loop-Start-Both) |
| Loop Mod Source   |          7 | 0-17 (Table 2)            |
| Loop Mod Amount 1 |          8 | 0-127                     |
| Loop Mod Amount 2 |          9 | 0-21 (Table 7)            |
| Wavedata Start    |         21 | 0-FFFFFFFh                |
| Wavedata End      |         22 | 0-FFFFFFFh                |
| Loop Start        |         23 | 0-FFFFFFFh                |
| Loop End          |         24 | 0-FFFFFFFh                |

| Loop End Fractional   |   10 | 0-127     |
|-----------------------|------|-----------|
| Key Range Low         |   11 | 0-127     |
| Key Range High        |   12 | 0-127     |
| Loop Position         |   25 | 0-FFFFFFh |
| Sample Rate           |   13 | 0-127     |

## 9.6 ENVELOPE PARAMETERS

SYSEX HIGH BYTE: 1-2-3 (ENV1 = 1, ENV2 = 2, ENV3 = 3)

| LOW BYTE             | RANGE                       |
|----------------------|-----------------------------|
| Envelope Type        | 0 0-15 (Table 3)            |
| Level 0 Hard         | 1 0-127                     |
| Level 0 Soft         | 2 0-127                     |
| Level 1 Hard         | 11 0-127                    |
| Level 1 Soft         | 15 0-127                    |
| Level 2 Hard         | 12 0-127                    |
| Level 2 Soft         | 16 0-127                    |
| Level 3 Hard         | 13 0-127                    |
| Level 3 Soft         | 17 0-127                    |
| Level 4 Hard         | 14 0-127                    |
| Level 4 Soft         | 18 0-127                    |
| Time 1               | 3 0-99                      |
| Time 2               | 19 0-99                     |
| Time 3               | 20 0-99                     |
| Time 4               | 21 0-99                     |
| Time 5               | 22 0-99                     |
| 2nd Release Time     | 4 0-127                     |
| 2nd Release Level    | 23 -127 to +127             |
| Attack Time Velocity | 5 0-99                      |
| Keyboard Scaling     | 6 0-127                     |
| Soft Velocity On/Off | 7 0-1 (Off-On)              |
| Envelope Mode        | 8 0-2 (Normal-Cycle-Repeat) |

## 9.7 PITCH PARAMETERS

SYSEX HIGH BYTE: 4

| Root Key          | 1 0-127          |
|-------------------|------------------|
| Fine Tune         | 10  -127 to +127 |
| LFO Amount        | 2 0-127          |
| Envelope 1 Amount | 3  -127 to +127  |
| Random Frequency  | 5 0-127          |
| Random Amount     | 12  -127 to +127 |

| Bend Range        |   6 | 0-13 (13=global)   |
|-------------------|-----|--------------------|
| Modulation Source |   7 | 0-18 (Table 2)     |
| Modulation Amount |  11 | -127 to +127       |

## 9.8 FILTER PARAMETERS

SYSEX HIGH BYTE: 5

|                            |   LOW BYTE | RANGE          |
|----------------------------|------------|----------------|
| Filter Mode                |          0 | 0-3 (Table 4)  |
| Filter 1 Cutoff            |          1 | 0-127          |
| Filter 2 Cutoff            |         11 | 0-127          |
| Filter 1 Envelope 2 Amount |          2 | -127 to +127   |
| Filter 2 Envelope 2 Amount |         12 | -127 to +127   |
| Filter 1 Keyboard Amount   |          3 | -127 to +127   |
| Filter 2 Keyboard Amount   |         13 | -127 to +127   |
| Filter 1 Modulation Source |          7 | 0-18 (Table 2) |
| Filter 1 Modulation Amount |         14 | -127 to +127   |
| Filter 2 Modulation Source |          8 | 0-18 (Table 2) |
| Filter 2 Modulation Amount |         15 | -127 to +127   |

## 9.9 VOLUME PARAMETERS

SYSEX HIGH BYTE: 6

|                   |   LOW BYTE | RANGE          |
|-------------------|------------|----------------|
| Wavesample Volume |          1 | 0-127          |
| Pan               |          2 | 0-17 (Table 5) |
| Modulation A      |          3 | 0-127          |
| Modulation B      |         11 | 0-127          |
| Modulation C      |          4 | 0-127          |
| Modulation D      |         12 | 0-127          |
| Modulation Source |          7 | 0-18 (Table 2) |
| Modulation Amount |         10 | 0-127          |

## 9.10 LFO PARAMETERS

SYSEX HIGH BYTE: 7

|                       |   LOW BYTE | RANGE                             |
|-----------------------|------------|-----------------------------------|
| LFO Wave              |          1 | 0-6 (Table 6)                     |
| LFO Speed             |          2 | 0-99                              |
| LFO Depth             |          3 | 0-127                             |
| LFO Delay             |          4 | 0-99                              |
| LFO Mode              |          5 | 0-2 (Reset Off-Reset On-Humanize) |
| LFO Modulation Source |          7 | 0-18 (Table 2)                    |

## 9.11 EDIT PARAMETERS

SYSEX HIGH BYTE: 14

|                 |   LOW BYTE | RANGE                 |
|-----------------|------------|-----------------------|
| Edit Instrument |          0 | 0-7 (Instruments 1-8) |
| Edit Layer      |          1 | 0-7 (Layers 1-8)      |
| Edit Wavesample |          2 | 0-128 (0=ALL)         |

## PARAMETER TABLES

TABLE 1

| 0 = SOFT 1   |
|--------------|
| 1 = SOFT 2   |
| 2 = SOFT 3   |
| 3 = SOFT 4   |
| 4 = MEDIUM 1 |
| 5 = MEDIUM 2 |
| 6 = MEDIUM 3 |
| 7 = MEDIUM 4 |
| 8 = FIRM 1   |
| 9 = FIRM 2   |
| 10= FIRM 3   |
| 11= FIRM 4   |
| 12= HARD 1   |
| 13= HARD 2   |
| 14= HARD 3   |
| 15= HARD 4   |

4 = MEDIUM 1

5 = MEDIUM 2

6 = MEDIUM 3

7 = MEDIUM 4

8 = FIRM 1

9 = FIRM 2

10= FIRM 3

11= FIRM 4

12= HARD 1

13= HARD 2

14= HARD 3

15= HARD 4

TABLE 2

| 0 = LFO   |
|-----------|
| 1 = RANDM |
| 2 = ENV1  |
| 3 = ENV2  |
| 4 = PR+VL |
| 5 = VEL   |
| 6 = VEL 1 |
| 7 = VEL 2 |
| 8 = KBD   |
| 9 = PITCH |
| 10= WHEL  |
| 11= PEDAL |
| 12= XCTRL |
| 13= PRES  |
| 14= WL+PR |
| 15= OFF   |

2 = ENV1

3 = ENV2

4 = PR+VL

5 = VEL

6 = VEL 1

7 = VEL 2

8 = KBD

9 = PITCH

10= WHEL

11= PEDAL

12= XCTRL

13= PRES

14= WL+PR

15= OFF

0 = CURRENT VALUE

1 = FULL ON

2 = ALL ZEROS

3 = FULL VELRANGE

4 = SLOW STRING

5 = PIANO DECAY

June 13, 1989

```
6 = PERCUSSION
7 = RAMP UP
8 = RAMP DOWN
9 = SHORT BLIP
10= BRASS FILTER
11= REPEAT TRIANG
12= REPEAT RAMP
13= WIND DRIVEN
14= REVERB
15= SAVED
```

## TABLE 4

```
0 = F1=2/LP F2=2/HP
1 = F1=3/LP F2=1/HP
2 = F1=2/LP F2=2/LP
3 = F1=3/LP F2=1/LP
```

## TABLE 5

```
0 = WAVESAMPLE
1 = *
2 = *
3 = *
4 = *
5 = *
6 = *
7 = *
8 = *
9 = SOLO OUT 1
10= SOLO OUT 2
11= SOLO OUT 3
12= SOLO OUT 4
13= SOLO OUT 5
14= SOLO OUT 6
15= SOLO OUT 7
16= SOLO OUT 8
17= RANDOM PAN
18= KEYBOARD
```

## TABLE 6

```
0 = TRIANGLE
1 = SIN/TRIANGLE
2 = SIN WAVE
3 = POS/TRIANGLE
```

```
4 = POS/SIN WAVE
5 = SAWTOOTH
6 = SQUARE
TABLE 7

0 = 2 MG
1 = 1 MG
2 = 512 K
3 = 256 K
4 = 128 K
5 = 64 K
6 = 32 K
7 = 16 K
8 = 8 K
9 = 4 K
10= 2 K
11= 1 K
12= 512 B
13= 256 B
14= 128 B
15= 64 B
16= 32 B
17= 16 B
18= 8 B
19= 4 B
20= 2 B
21= 1 B
```

5 = 64 K

6 = 32 K

7 = 16 K

8 = 8 K

9 = 4 K

10= 2 K

11= 1 K

12= 512 B

13= 256 B

14= 128 B

15= 64 B

16= 32 B

17= 16 B

18= 8 B

19= 4 B

20= 2 B

21= 1 B

## TABLE 8

0 = FORWARD-NO LOOP

1 = BACKWARD-NO LOOP

2 = LOOP FORWARD

3 = LOOP BIDIRECTION

4 = LOOP AND RELEASE

## Index

ADD WAVEDATA, 19 AUDITION WAVESAMPLES, 16

BIDIRECTIONAL CROSS FADE LOOP, 28 BOWTIE CROSS FADE LOOP, 24

CANCEL, 6

CLEAR WAVEDATA, 17

Commands

ADD WAVEDATA, 19

AUDITION WAVESAMPLES, 16

BIDIRECTIONAL CROSS FADE LOOP, 28

BOWTIE CROSS FADE LOOP, 24

CANCEL, 6

CLEAR WAVEDATA, 17

COPY INSTRUMENT, 13

COPY LAYER, 14

COPY WAVEDATA, 18

COPY WAVESAMPLE, 15

CREATE INSTRUMENT, 13

CREATE LAYER, 14

CREATE PRESET, 16

CREATE WAVESAMPLE, 15

CROSS FADE LOOP, 22

DELETE INSTRUMENT, 13

DELETE LAYER, 14

DELETE WAVESAMPLE, 15

ENSEMBLE CROSS FADE LOOP, 24

FADE IN WAVEDATA, 22

FADE OUT WAVEDATA, 23

GET INSTRUMENT, 7

GET LAYER, 7

GET PARAMETER, 8

GET PITCH TABLE, 8

GET WAVESAMPLE DATA, 8

GET WAVESAMPLE OVERVIEW, 9

GET WAVESAMPLE PARAMETERS, 7

INVERT WAVEDATA, 20

LENGTHEN LOOP, 25

MERGE/SPLICE WAVEDATA, 26

MIX WAVEDATA, 25

NORMALIZE GAIN, 27

PUT INSTRUMENT, 9

PUT LAYER, 10

PUT PARAMETER, 11

PUT PITCH TABLE, 11

PUT WAVESAMPLE DATA, 10

PUT WAVESAMPLE OVERVIEW, 12

PUT WAVESAMPLE PARAMETERS, 10

REPLICATE WAVEDATA, 21

RESPONSE, 6

REVERSE CROSS FADE LOOP, 23

REVERSE WAVEDATA, 21

SCALE WAVEDATA, 20

SYNTHESIZED LOOP, 28

TRUNCATE WAVESAMPLE, 17

VIRTUAL BUTTON PRESS, 16

VOLUME SMOOTHING, 27

COPY INSTRUMENT, 13

COPY LAYER, 14

COPY WAVEDATA, 18

COPY WAVESAMPLE, 15

CREATE INSTRUMENT, 13

CREATE LAYER, 14

CREATE PRESET, 16

CREATE WAVESAMPLE, 15

CROSS FADE LOOP, 22

cross fade zone, 17

DELETE INSTRUMENT, 13

DELETE LAYER, 14

DELETE WAVESAMPLE, 15

ENSEMBLE CROSS FADE LOOP, 24

FADE IN WAVEDATA, 22

FADE OUT WAVEDATA, 23

fade zone, 17

GET INSTRUMENT, 7

GET LAYER, 7

GET PARAMETER, 8

GET PITCH TABLE, 8

GET WAVESAMPLE DATA, 8

GET WAVESAMPLE OVERVIEW, 9

GET WAVESAMPLE PARAMETERS, 7