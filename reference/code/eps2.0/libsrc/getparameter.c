/* GETPARAMETER.C
 * Get a parameter value
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

/****** eps.lib/epsGetParameter ******************************************
*
*   NAME   
*	epsGetParameter -- get the value of a given parameter
*
*   SYNOPSIS
*	error = epsGetParameter( eps, inst, par, out )
*
*	int epsGetParameter( struct EPSdesc *, edit_spec *, int, ulong * );
*
*   FUNCTION
*	Get the value of parameter `par'. The relevant instrument, layer and
*	wavesample numbers are passed in `inst'. The value of the parameter
*	is returned in `out'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- instrument, layer and wavesample numbers. May be
*			  ignored if irrelevant.
*	par		- parameter number.
*	out		- points to a `ulong' which will be set to the value
*			  of the parameter.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The parameter numbers are listed in "eps.h".
*	Parameter numbers are sometimes different between the EPS Classic
*	and the EPS 16+. This routine does not try to figure out what the
*	user meant.
*
*   SEE ALSO
*	eps.h, epsPutParameter()
*
*****************************************************************************
*
*/
int epsGetParameter(eps,inst,par,out)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which instrument? */
int par;			/* Parameter number */
ulong *out;			/* Parameter value will be put here */
{
	uchar MsgBuf[14];	/* Message to be sent out */
	uchar AnswerBuf[18];	/* Buffer containing the answer from
				 * the EPS.
				 */
	uchar *MsgBufPtr = MsgBuf;	/* Pointer to MsgBuf */
	int i,retval;

	/* Construct the message to be sent */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_GET_PARAM);	/* Request parameter value */
	Msg12(inst->inst_num);	/* Instrument number */
	Msg12(inst->layer_num);	/* Layer number */
	Msg12(inst->ws_num);	/* Wavesample number */
	Msg12(par);		/* Parameter value */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);		/* Wait until the EPS is ready */
	SendMsg(eps,14,MsgBuf);
	if ((retval = epsRecvAck(eps)) != ACK)	/* Get an ACK from the EPS */
	{
		return(retval);
	}

	/* Receive the data */
	if ((retval = RecvMsg(eps,&sysexMsgType,18,AnswerBuf,SHORT_TIMEOUT))
		< 0)
	{
		return(retval);
	}

	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	/* Copy the received data into 'out'. See 'eps.h' for a description
	 * of the various fields
	 */
	MsgBufPtr = &(AnswerBuf[13]);
	*out = E12toi(MsgBufPtr) << 12;	MsgBufPtr += 2;
	*out |= E12toi(MsgBufPtr);

	return(0);
}
