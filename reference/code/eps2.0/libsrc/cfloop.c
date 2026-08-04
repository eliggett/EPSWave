/* CFLOOP.C
 * Cross-fade loop.
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

/****** eps.lib/epsCrossFadeLoop ******************************************
*
*   NAME   
*	epsCrossFadeLoop -- create a cross-fade loop
*
*   SYNOPSIS
*	error = epsCrossFadeLoop( eps, inst, fzone, depth )
*
*	int epsCrossFadeLoop( struct EPSdesc *, edit_spec *, ulong, int );
*
*   FUNCTION
*	Create a cross-fade loop in the wavesample described by `inst'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- wavesample in which to make the loop.
*	fzone		- size of fade zone, [0..fffff]
*	depth		- scale ramp depth [0..6], 0=3.0 dB, 1=3.5 dB, ...
*			  6=3.0 dB.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	See bugs.
*
*   BUGS
*	Doesn't work, as yet. Or rather, doesn't work without requiring
*	the user to physically press a button on the front panel: this
*	function sends the command, the EPS displays "Use default values"
*	on the display, waits for the user to press either `Yes' or `No',
*	executes the command, then returns an ACK to the caller.
*	In the meantime, it (seemingly) refuses all other input, including
*	virtual button presses.
*
*   SEE ALSO
*	<all the other loop commands>
*
*****************************************************************************
*
*/
/* EPSCROSSFADELOOP
 * Create a cross-fade loop in the wavesample described in 'inst'.
 * 'fzone' gives the size of the fade zone, as a wavesample offset
 * (*NOT* a percentage, like on the display!), and 'depth' gives the
 * scale ramp depth; 'depth' must be in the range 0..6, corresponding
 * to 3.0 dB - 6.0 dB, respectively.
 * Returns 0 on no error, otherwise either a negative value, or the last
 * response received from the EPS.
 *** This only works in the sense that it does not crash every time. I
 *** can't figure out how it ought to work, much less how to make it work
 *** that way.
 */
int epsCrossFadeLoop(eps,inst,fzone,depth)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which wavesample? */
ulong fzone;			/* Fade zone size */
int depth;			/* Scale ramp depth */
{
	uchar MsgBuf[18];	/* Buffer containing the message
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
	MsgByte(CMD_CF_LOOP);	/* Cross-fade loop */
	Msg12(inst->inst_num);	/* Instrument number */
	Msg12(inst->layer_num);	/* Layer number */
	Msg12(inst->ws_num);	/* Wavesample number */
	/* Wavesample offsets are 20-bit quantities, so they are sent
	 * as two 12-bit quantities.
	 */
	Msg12(fzone >> 12);	/* High half of 'fzone' */
	Msg12(fzone & 0x0fffL);	/* Low half of 'fzone' */
	Msg12(depth);		/* Scale ramp depth */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);			/* Wait until the EPS is ready */
	SendMsg(eps,18,MsgBuf);
/*for (i = 0; i < 10; i++)
{
	int j;

	RecvMsg(eps, &sysexMsgType, 2048,ButMsg,LONG_TIMEOUT);
	for (j = 0; (j < 100) && (ButMsg[j] != 0xf7); j++)
		printf("%02x ", ButMsg[j]);
	printf("\n");
}*/

	retval = epsRecvAck(eps);	/* Get an ACK from the EPS */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
