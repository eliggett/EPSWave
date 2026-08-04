/* REPWSDATA.C
 * Replicate wavesample data.
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

/****** eps.lib/epsReplicateWSData ******************************************
*
*   NAME   
*	epsReplicateWSData -- make copies of wavesample data to fill a block
*
*   SYNOPSIS
*	error = epsReplicateWSData( eps, inst, from, to )
*
*	int epsReplicateWSData
*		( struct EPSdesc *, edit_spec *, ulong, ulong );
*
*   FUNCTION
*	Fills the wavesample given by `inst' by appending the wavesample
*	data in the range `from'-`to' to itself repeatedly until it fills
*	the entire sample (i.e., from `sstart_off' to `send_off' in the
*	`ws_par').
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- the wavesample to be replicated.
*	from		- data range start, [0..fffff].
*	to		- data range end, [0..fffff].
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	I'm not sure what happens if you choose a range in the middle of
*	a wavesample.
*
*****************************************************************************
*
*/
int epsReplicateWSData(eps,inst,from,to)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which wavesample? */
ulong from, to;			/* Range */
{
	uchar MsgBuf[20];	/* Buffer containing the message
				 * to be sent to the EPS.
				 */
	uchar AnswerBuf[12];	/* Message containing the answer from
				 * the EPS.
				 */
	uchar *MsgBufPtr;	/* Pointer to MsgBuf */
	int i,retval;

	/* Construct the message to be sent */
	MsgBufPtr = MsgBuf;
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_REP_WSDATA);	/* Replicate wavesample data */
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
	EndPause(eps);			/* Wait until the EPS is ready */
	SendMsg(eps,20,MsgBuf);

	retval = epsRecvAck(eps);	/* Get an ACK from the EPS */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
