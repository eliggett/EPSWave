/* GETPITCH.C
 * Get pitch table.
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

/****** eps.lib/epsGetPitchTable ******************************************
*
*   NAME   
*	epsGetPitchTable -- get pitch table data for a layer
*
*   SYNOPSIS
*	error = epsGetPitchTable( eps, inst, ptab )
*
*	int epsGetPitchTable( struct EPSdesc *, edit_spec *, pitch_tab * );
*
*   FUNCTION
*	Get the pitch table for the layer described in `inst'. The pitch
*	table is returned by filling in `*ptab'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- the layer whose pitch table is to be retrieved.
*	ptab		- pointer to a `pitch_tab' structure which will be
*			  filled in with the layer's pitch table.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	I don't really know whether this works, since I don't know what
*	a pitch table is or what it does. I do know that if I fiddle with
*	the pitch table on the EPS, then something different comes out on
*	this end.
*
*   SEE ALSO
*	eps.h, epsPutPitchTable()
*
*****************************************************************************
*
*/
/* EPSGETPITCHTABLE
 * Get the pitch table for the layer described in 'inst'. The pitch
 * table is returned in 'ptab'.
 * Returns 0 on no error, otherwise either a negative value, or the last
 * response received from the EPS.
 * Note: I don't really know whether this works, since I don't know what
 * a pitch table is or what it does. I do know that if I fiddle with the
 * pitch table on the EPS, then something different comes out on this end.
 */
int epsGetPitchTable(eps,inst,ptab)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which instrument? */
pitch_tab *ptab;		/* Pitch table will be put here */
{
	uchar MsgBuf[12];	/* Message to be sent out */
	uchar AnswerBuf[326];	/* Buffer containing the answer from
				 * the EPS.
				 */
	uchar *MsgBufPtr = MsgBuf;	/* Pointer to MsgBuf */
	int i,retval;

	/* Construct the message to be sent */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_GET_PITCHTAB);	/* Request pitch table */
	Msg12(inst->inst_num);	/* Instrument number */
	Msg12(inst->layer_num);	/* Layer number */
	Msg12(inst->ws_num);	/* Wavesample number */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);		/* Wait until the EPS is ready */
	SendMsg(eps,12,MsgBuf);
	if ((retval = epsRecvAck(eps)) != ACK)	/* Get an ACK from the EPS */
	{
		return(retval);
	}

	/* Receive the data, part 1 */
	if ((retval = RecvMsg(eps,&sysexMsgType,12,AnswerBuf,SHORT_TIMEOUT))
		< 0)
	{
		return(retval);
	}

	epsSendAck(eps,ACK);	/* Acknowledge data part 1 */

	/* Receive data part 2 */
	if ((retval = RecvMsg(eps,&sysexMsgType,327,AnswerBuf,SHORT_TIMEOUT))
		< 0)
	{
		return(retval);
	}

	epsSendAck(eps,ACK);		/* Acknowledge data part 2 */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	/* Copy the received data into 'ptab'. See 'eps.h' for a description
	 * of the various fields
	 */
	for (i = 0, MsgBufPtr = &(AnswerBuf[4]); i < 12; i++, MsgBufPtr += 3)
		ptab->name[i] = E16toi(MsgBufPtr) >> 8;
	for (i = 0; i < 88; i++)
	{
		ushort raw;		/* Raw entry */

		raw = E16toi(MsgBufPtr);
		MsgBufPtr += 3;

		ptab->semi[i] = raw >> 9;		/* Semitone */
		ptab->fract[i] = (raw >> 3) & 0x3f;	/* Fraction */
	}

	return(0);
}
