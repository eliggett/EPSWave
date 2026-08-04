/* GETWSDATA.C
 * Get wavesample data.
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

/****** eps.lib/epsGetWSData ******************************************
*
*   NAME   
*	epsGetWSData -- get wavesample data
*
*   SYNOPSIS
*	error = epsGetWSData( eps, inst, from, to, out )
*
*	int epsGetWSData
*		( struct EPSdesc *, edit_spec *, ulong, ulong, short * );
*
*   FUNCTION
*	Get the wavesample data for the wavesample described in `inst', in
*	the range `from'-`to'. The sample values are returned in `out'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- wavesample whose values are to be read.
*	from		- start of range, [0..fffff].
*	to		- end of range, [0..fffff].
*	out		- pointer to an array of `short's, to which the
*			  sample values will be written.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The `to' parameter actually points one beyond the end of the data
*	range. Thus, if you wanted to retrieve the samples in the range
*	1000-2000 inclusive, you would specify `from' and `to' as 1000 and
*	2001, respectively.
*
*   BUGS
*	I'm not sure what happens when you specify an invalid data range.
*
*   SEE ALSO
*	epsPutWSData()
*
*****************************************************************************
*
*/
int epsGetWSData(eps,inst,from,to,out)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which instrument? */
ulong from,to;			/* Sample range */
short *out;			/* Wavesample data will be put here */
{
	uchar MsgBuf[20];	/* Message to be sent out */
	uchar *AnswerBuf;	/* Buffer containing the answer from the EPS. */
	ulong AnswerLen;	/* Anticipated length of 'AnswerBuf' */
	uchar *MsgBufPtr = MsgBuf;	/* Pointer to MsgBuf */
	int i,retval;
	long li, len;		/* Guaranteed-long counter, for 16-bit
				 * architectures, and range length
				 */

	/* Allocate space for the messages coming in from the EPS. We'll
	 * need 20 bytes for the ACK, and
	 *	header + (to - from)*3 + trailer
	 * for the wavesample data, so we need to allocate the maximum
	 * of the two (just in case someone tries to get just one sample
	 * point).
	 * The header takes 5 bytes, the trailer is 1 byte, and each
	 * sample is sent as 3 bytes.
	 */
	len = to - from;
	AnswerLen = 5 + 1 + (3*len);
	if ((AnswerBuf = (uchar *) malloc(MAX(20,AnswerLen))) == NULL)
		return(-1);	/* Out of memory */

	/* Construct the message to be sent */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_GET_WSDATA);	/* Request instrument parameters */
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
	EndPause(eps);		/* Wait until EPS is ready */
	SendMsg(eps,20,MsgBuf);
	if ((retval = epsRecvAck(eps)) != ACK)	/* Get an ACK from the EPS */
	{
		free(AnswerBuf);
		return(retval);
	}

	/* Receive the data, part 1 */
	if ((retval = RecvMsg(eps,&sysexMsgType,20,AnswerBuf,SHORT_TIMEOUT))
		< 0)
	{
		free(AnswerBuf);
		return(retval);
	}

	epsSendAck(eps,ACK);	/* Acknowledge data part 1 */

	if ((retval = RecvMsg(eps,&sysexMsgType,AnswerLen,AnswerBuf,
		SHORT_TIMEOUT)) < 0)
	{
		free(AnswerBuf);
		return(retval);
	}

	epsSendAck(eps,ACK);		/* Acknowledge data part 2 */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	/* Copy the received data into 'out'.
	 */
	MsgBufPtr = &(AnswerBuf[4]);
	for (i = 0; i < len; i++, MsgBufPtr += 3)
		out[i] = E16toi(MsgBufPtr);

	free(AnswerBuf);

	return(0);
}
