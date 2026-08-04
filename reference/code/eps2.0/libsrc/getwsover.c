/* GETWSOVER.C
 * Get wavesample overview.
 * Unfortunately, this command is broken: it hangs the EPS forever.
 */
/* Copyright (C) 1992 by Andrew Arensburger. Permission is granted to
 * use, copy and/or distribute this file freely for non-commercial purposes,
 * as long as this file and this notice remain intact. Any commercial use
 * is prohibited without express permission from the author.
 *
 * Disclaimer: this software is provided free of charge. The author
 * makes no guarantee, expressed or implied, with respect to its
 * quality, performance, merchantability, or fitness for any purpose.
 * In no case will the author be held liable for any direct, indirect
 * or incidental damages resulting from any defect or omission in this
 * file, its documentation, or any accompanying files.
 *
 * If you make any changes, fix bugs, etc., please send them to me that I
 * might coordinate fixes and improvements. I can be reached at
 *		arensb@kong.gsfc.nasa.gov
 */

#ifdef DEBUG
#include <stdio.h>
#endif
#include "eps.h"

extern struct MsgType sysexMsgType;

/****** eps.lib/epsGetWSOverview ******************************************
*
*   NAME   
*	epsGetWSOverview -- get an overview of a given wavesample
*
*   SYNOPSIS
*	error = epsGetWSOverview( eps, inst, from, to, out )
*
*	int epsGetWSOverview
*		( struct EPSdesc *, edit_spec *, ulong, ulong, short[512] );
*
*   FUNCTION
*	Get an overview of the wavesample described in `inst', in the range
*	`from'-`to'. This function fills an array of 512 shorts containing
*	the value of the maximum value, in absolute value, in the
*	corresponding chunk of the wavesample. That is to say, it chops the
*	range `from'-`to' into 512 chunks; for each chunk, it takes the
*	absolute value of each sample, and returns the maximum.
*	This function gives a nice, concise picture of the waveform, and is
*	primarily intended for people writing graphical editors.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- the wavesample whose overview is to be returned.
*	from		- start of data range, [0..fffff].
*	to		- end of data range, [0..fffff].
*	out		- pointer to an array of 512 `short's, into which
*			  the overview will be written.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	Apparently, this function does a simple right-shift 9 to get the
*	length of each chunk to be analyzed (probably in the interest of
*	simplicity), and regards all sample values past the end of the
*	wavesample as having value 0.
*	There is no corresponding `epsPutWSOverview()' function.
*
*   BUGS
*	I haven't managed to get this function to work without hanging my
*	EPS in a weird state. According to the folks at Ensoniq, this may
*	be because the OS has trouble recognizing the memory expansion.
*
*****************************************************************************
*
*/
int epsGetWSOverview(eps,inst,from,to,out)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which wavesample? */
ulong from,to;			/* Overview range */
short out[512];			/* Array of local maxima */
{
	uchar MsgBuf[20];	/* Message to be sent out */
	uchar AnswerBuf[1541];	/* Buffer containing the answer from
				 * the EPS.
				 */
	uchar *MsgBufPtr = MsgBuf;	/* Pointer to MsgBuf */
	int i,retval;

	/* Construct the message to be sent */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_GET_WSOVER);	/* Request wavesample overview */
	Msg12(inst->inst_num);	/* Instrument number */
	Msg12(inst->layer_num);	/* Layer number */
	Msg12(inst->ws_num);	/* Wavesample number */
	/* Wavesample offsets are 20-bit quantities, so they are sent
	 * as two 12-bit quantities.
	 */
	Msg12(from >> 12);	/* High half of 'from' */
	Msg12(from & 0x0fffL);	/* Low half of 'from' */
	Msg12(to >> 12);	/* High half of 'to' */
	Msg12(to & 0x0fffL);	/* Low half of 'to' */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);		/* Wait until the EPS is ready */
	SendMsg(eps,20,MsgBuf);
	if ((retval = epsRecvAck(eps)) != ACK)	/* Get an ACK from the EPS */
	{
		return(retval);
	}

	/* Receive the data, part 1 */
	if ((retval = RecvMsg(eps,&sysexMsgType,20,AnswerBuf,SHORT_TIMEOUT))
		< 0)
	{
		return(retval);
	}

	epsSendAck(eps,ACK);	/* Acknowledge data part 1 */

	if ((retval = RecvMsg(eps,&sysexMsgType,1541,AnswerBuf,SHORT_TIMEOUT))
		< 0)
	{
		return(retval);
	}

	epsSendAck(eps,ACK);		/* Acknowledge data part 2 */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	/* Copy the received data into 'out'.
	 */
	for (i = 0, MsgBufPtr = &(AnswerBuf[4]); i < 512; i++, MsgBufPtr += 3)
		out[i] = E16toi(MsgBufPtr);

	return(0);
}
