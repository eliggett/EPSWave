/* PUTPITCH.C
 * Put pitch table.
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

/****** eps.lib/epsPutPitchTable ******************************************
*
*   NAME   
*	epsPutPitchTable -- send pitch data for a given layer
*
*   SYNOPSIS
*	error = epsPutPitchTable( eps, inst, ptab )
*
*	int epsPutPitchTable( struct EPSdesc *, edit_spec *, pitch_tab * );
*
*   FUNCTION
*	Send the pitch table given in `ptab' to the layer of `eps' described
*	in `inst'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- layer to send the pitch table data to.
*	ptab		- pitch table to send.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The `pitch_tab' structure is described in "eps.h".
*	This has not been thoroughly tested.
*
*   SEE ALSO
*	eps.h, epsGetPitchTable()
*
*****************************************************************************
*
*/
int epsPutPitchTable(eps,inst,ptab)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which instrument? */
pitch_tab *ptab;		/* Pitch table to send */
{
	uchar MsgBuf[326];	/* Buffer containing the message
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
	MsgByte(CMD_PUT_PITCHTAB);	/* Send pitch table */
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

	/* Construct the message. See eps.h for a somewhat more complete
	 * description of what the fields mean.
	 */
	MsgBufPtr = MsgBuf;
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	for (i = 0; i < 12; i++)	/* Name */
		Msg16(ptab->name[i]);
	for (i = 0; i < 88; i++)	/* Pitch table entries */
	{
		ushort raw;		/* Raw bits to be sent */

		raw = (((ptab->semi[i]) << 6) | (ptab->fract[i])) << 3;
		Msg16(raw);
	}
	for (i = 100; i <= 106; i++)	/* Unused */
		Msg16(0);
	MsgByte(0xf7);			/* End of SysEx */
	SendMsg(eps,326,MsgBuf);

	retval = epsRecvAck(eps);	/* Get an ACK from the EPS */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
