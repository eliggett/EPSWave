/* PUTWSDATA.C
 * Put wavesample data.
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

/****** eps.lib/epsPutWSData ******************************************
*
*   NAME   
*	epsPutWSData -- send wavesample data to the EPS
*
*   SYNOPSIS
*	error = epsPutWSData( eps, inst, from, to, data )
*
*	int epsPutWSData
*		( struct EPSdesc *, edit_spec *, ulong, ulong, short * );
*
*   FUNCTION
*	Send the wavesample data given in `data' to the wavesample given
*	in `inst', in the range `from'-`to'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- wavesample to send the data to.
*	from		- start of data range, [0..fffff].
*	to		- end of data range, [0..fffff].
*	data		- pointer to an array of `short's containing the
*			  wavesample data.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The `to' parameter actually points one past the end of the range. If
*	you wanted to send the samples from 1000 to 1999 inclusive, you would
*	specify `from' and `to' as 1000 and 2000, respectively.
*
*   BUGS
*	I don't know what happens if you specify an invalid range. It may
*	barf, or it may extend the wavesample by the necessary amount.
*
*   SEE ALSO
*	epsGetWSData()
*
*****************************************************************************
*
*/
int epsPutWSData(eps,inst,from,to,data)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which wavesample? */
ulong from, to;			/* Range */
short *data;			/* Wavesample data */
{
	uchar *MsgBuf;		/* Buffer containing the message
				 * to be sent to the EPS.
				 */
	uchar AnswerBuf[12];	/* Message containing the answer from
				 * the EPS.
				 */
	uchar *MsgBufPtr;	/* Pointer to MsgBuf */
	ulong MsgBufLen;	/* Length of data in MsgBuf */
	int i,retval;
	long li, len;		/* Guaranteed-long counter, for 16-bit
				 * architectures, and range length
				 */

	/* Allocate space for the message to be sent out. We'll need 20
	 * bytes for the first message, and
	 *	header + (to - from)*3 + trailer
	 * bytes for the wavesample data, so we need to allocate the maximum
	 * of the two.
	 * The header takes 4 bytes, the trailer is 1 byte, and each sample
	 * is sent as 3 bytes.
	 */
	len = to - from;
	MsgBufLen = 4 + 1 + (3 * len);
	if ((MsgBuf = (uchar *) malloc(MAX(20,MsgBufLen))) == NULL)
		return(-1);	/* Out of memory */

	/* Construct the message to be sent */
	MsgBufPtr = MsgBuf;
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_PUT_WSDATA);	/* Send wavesample data */
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
		free(MsgBuf);
		return(retval);
	}

	/* Construct the message. See eps.h for a somewhat more complete
	 * description of what the fields mean.
	 */
	MsgBufPtr = MsgBuf;
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	for (li = 0; li <= len; li++)	/* Send the data */
		Msg16(data[li]);
	MsgByte(0xf7);			/* End of SysEx */
	SendMsg(eps,MsgBufLen,MsgBuf);

	retval = epsRecvAck(eps);
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
