/* FINWSDATA.C
 * Fade in wavesample data.
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

/****** eps.lib/epsFadeInWSData ******************************************
*
*   NAME   
*	epsFadeInWSData -- fade in a wavesample data in a given range
*
*   SYNOPSIS
*	error = epsFadeInWSData( eps, inst, from, to, depth )
*
*	int epsFadeInWSData
*		( struct EPSdesc *, edit_spec *, ulong, ulong, int );
*
*   FUNCTION
*	Fade in the wavesample data of `inst', in the range `from'-`to'.
*	`depth' gives the scale ramp depth; it must be in the range 0-6,
*	corresponding to 3.0 dB - 6.0 dB respectively.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- the wavesample to fade in.
*	from		- data range start, [0..fffff].
*	to		- data range end, [0..fffff].
*	depth		- scale ramp depth, [0..6], 0=3.0 dB, 1=3.5 dB, ...
*			  6=6.0 dB.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   SEE ALSO
*	epsFadeOutWSData()
*
*****************************************************************************
*
*/
int epsFadeInWSData(eps,inst,from,to,depth)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which wavesample? */
ulong from, to;			/* Range */
int depth;			/* Scale ramp depth */
{
	uchar MsgBuf[22];	/* Buffer containing the message
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
	MsgByte(CMD_FIN_WSDATA);	/* Fade in wavesample data */
	Msg12(inst->inst_num);	/* Source instrument number */
	Msg12(inst->layer_num);	/* Source layer number */
	Msg12(inst->ws_num);	/* Source wavesample number */
	/* Wavesample offsets are 20-bit quantities, so they are sent
	 * as two 12-bit quantities.
	 */
	Msg12(from >> 12);	/* High half of 'from' */
	Msg12(from & 0x0fffL);	/* Low half of 'from' */
	Msg12(to >> 12);	/* High half of 'to' */
	Msg12(to & 0x0fffL);	/* Low half of 'to' */

	Msg12(depth);		/* Scale ramp depth */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);			/* Wait until the EPS is ready */
	SendMsg(eps,22,MsgBuf);

	/* Hack alert! Hack alert! This sleep is there to give the
	 * EPS time to process long fade-ins before acknowledging.
	 * The figure of 10000 samples/second is fairly arbitrary.
	 */
	isleep(eps,(to-from)/10);

	retval = epsRecvAck(eps);	/* Get an ACK from the EPS */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
