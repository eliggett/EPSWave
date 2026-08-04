/* NORMGAIN.C
 * Normalize gain.
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

/****** eps.lib/epsNormalizeGain ******************************************
*
*   NAME   
*	epsNormalizeGain -- amplify a wavesample to the full signal range
*
*   SYNOPSIS
*	error = epsNormalizeGain( eps, inst )
*
*	int epsNormalizeGain( struct EPSdesc *, edit_spec * );
*
*   FUNCTION
*	Normalize the gain of the wavesample described in `inst', i.e.,
*	amplify it up to the full signal range.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- the wavesample to be normalized.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   BUGS
*	On an EPS Classic running OS 2.49, this function never returns
*	any response. Consequently, this function returns 0 in case of
*	timeout.
*
*****************************************************************************
*
*/
int epsNormalizeGain(eps,inst)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which wavesample? */
{
	uchar MsgBuf[12];	/* Buffer containing the message
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
	MsgByte(CMD_NORM_GAIN);	/* Normalize Gain */
	Msg12(inst->inst_num);	/* Source instrument number */
	Msg12(inst->layer_num);	/* Source layer number */
	Msg12(inst->ws_num);	/* Source wavesample number */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);			/* Wait until the EPS is ready */
	SendMsg(eps,12,MsgBuf);

	retval = epsRecvAck(eps);	/* Get an ACK from the EPS */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

/*** It looks as if this function is broken: the EPS never
 *** seems to return an ACK, so that 'RecvMsg()' always times out.
 *** This problem exists with the Classic under OS 2.49 . It may
 *** work better with a 16+.
 ***/
/***	return(retval);*/
if (retval == -1)
	return(0);
else
	return(retval);
}
