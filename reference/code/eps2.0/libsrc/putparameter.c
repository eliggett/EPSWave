/* PUTPARAMETER.C
 * Set a parameter value.
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

/****** eps.lib/epsPutParameter ******************************************
*
*   NAME   
*	epsPutParameter -- set a given parameter's value
*
*   SYNOPSIS
*	error = epsPutParameter( eps, inst, par, value )
*
*	int epsPutParameter( struct EPSdesc *, edit_spec *, par, value );
*
*   FUNCTION
*	Set the value of parameter `par' to the value `value'. The
*	instrument, layer and wavesample numbers are given in `inst'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- instrument, layer and wavesample numbers. These
*			  may be ignored, if irrelevant.
*	par		- parameter number.
*	value		- parameter value.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The parameter numbers are listed in "eps.h".
*	Some parameter numbers are different between the EPS Classic and
*	the EPS 16+. This routine does not try to figure out what the Right
*	Thing to do is.
*
*   SEE ALSO
*	eps.h, epsGetParameter()
*
*****************************************************************************
*
*	This command does not require an ACK, but waits for one anyway, in
*	case of error.
*/
int epsPutParameter(eps,inst,par,value)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which instrument? */
int par;			/* Parameter number */
long value;			/* Parameter value */
{
	uchar MsgBuf[18];	/* Buffer containing the message
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
	MsgByte(CMD_PUT_PARAM);	/* Send parameter value */
	Msg12(inst->inst_num);	/* Instrument number */
	Msg12(inst->layer_num);	/* Layer number */
	Msg12(inst->ws_num);	/* Wavesample number */
	Msg12(par);		/* Parameter number */
	Msg12((value >> 12) & 0x0fff);	/* High half of parameter value */
	Msg12(value & 0x0fff);	/* Low half of parameter value */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);		/* Wait until the EPS is ready */
	SendMsg(eps,18,MsgBuf);

	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	/* Normally, this does not require an ACK. No response is
	 * sent unless there was some problem with the message.
	 */
	if ((retval = epsRecvAck(eps)) >= 0)
	{
		return(retval);
	}
	return(0);
}
