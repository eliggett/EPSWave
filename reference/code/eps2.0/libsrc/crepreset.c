/* CREPRESET.C
 * Create preset.
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

/****** eps.lib/epsCreatePreset ******************************************
*
*   NAME   
*	epsCreatePreset -- create a preset
*
*   SYNOPSIS
*	error = epsCreatePreset( eps, pnum )
*
*	int epsCreatePreset( struct EPSdesc *, int );
*
*   FUNCTION
*	Create a preset with the current selection of instruments and
*	patches. The preset number is given by `pnum'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	pnum		- preset number, [0..7].
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	Not thoroughly tested.
*
*****************************************************************************
*
*/
int epsCreatePreset(eps,pnum)
struct EPSdesc *eps;		/* Which EPS? */
int pnum;			/* Preset number */
{
	uchar MsgBuf[12];	/* Buffer containing the message
				 * to be sent to the EPS.
				 */
	uchar AnswerBuf[12];	/* Message containing the answer from
				 * the EPS.
				 */
	uchar *MsgBufPtr = MsgBuf;	/* Pointer to MsgBuf */
	int i,retval;

	/* Construct the message to be sent */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_CRE_PRESET);	/* Create preset */
	Msg12(0x00);		/* Dummy instrument number */
	Msg12(0x00);		/* Dummy layer number */
	Msg12(pnum);		/* Preset number */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);		/* Wait until the EPS is ready */
	SendMsg(eps,12,MsgBuf);

	retval = epsRecvAck(eps);	/* Get an ACK from the EPS */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
