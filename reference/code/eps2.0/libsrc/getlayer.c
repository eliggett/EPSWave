/* GETLAYER.C
 * Get layer parameters.
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

/****** eps.lib/epsGetLayer ******************************************
*
*   NAME   
*	epsGetLayer -- get layer parameters
*
*   SYNOPSIS
*	error = epsGetLayer( eps, inst, out )
*
*	int epsGetLayer( struct EPSdesc *, edit_spec *, layer_par * );
*
*   FUNCTION
*	Get the layer parameters for the layer given in `inst'. The result
*	will be put in `out'. The parameters are described in "eps.h".
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- layer whose parameters are to be retrieved.
*	out		- pointer to a `layer_par' structure whose fields
*			  will be filled in with the layer parameters.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The fields of `out' are documented in "eps.h"
*	In case of error, the value of the fields in `out' are undefined.
*
*   SEE ALSO
*	eps.h, epsPutLayer()
*
*****************************************************************************
*
*/
int epsGetLayer(eps,inst,out)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which instrument? */
layer_par *out;			/* Description will be put here */
{
	uchar MsgBuf[12];	/* Message to be sent out */
	uchar AnswerBuf[326];	/* Buffer containing the answer from
				 * the EPS. The size is completely
				 * ad hoc: according to the spec, it
				 * should be 323 bytes.
				 */
	uchar *MsgBufPtr = MsgBuf;	/* Pointer to MsgBuf */
	int i,retval,temp;

	/* Construct the message to be sent */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_GET_LAYER);	/* Request instrument parameters */
	Msg12(inst->inst_num);	/* Instrument number */
	Msg12(inst->layer_num);	/* Layer number */
	Msg12(inst->ws_num);	/* Wavesample number */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);		/* Wait until EPS is ready */
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

	if ((retval = RecvMsg(eps,&sysexMsgType,326,AnswerBuf,SHORT_TIMEOUT))
		< 0)
	{
		return(retval);
	}

	epsSendAck(eps,ACK);		/* Acknowledge data part 2 */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	/* Copy the received data into 'out'. See 'eps.h' for a description
	 * of the various fields
	 */
	for (i = 0, MsgBufPtr = &(AnswerBuf[4]); i < 12; i++, MsgBufPtr += 3)
		out->name[i] = E16toi(MsgBufPtr) >> 8;
	temp = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	out->glidemode = temp >> 8;
	out->delay_modamt = temp & 0xff;	/* (16+) */
	temp = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	out->glidetime = temp >> 8;
	out->restriketime = temp & 0xff;	/* (16+) */
	out->legato_lay = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->low_vel = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->high_vel = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->pitch_tab = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->delay = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;	/* (16+) */
	for (i = 0; i < 88; i++)
	{
		out->layermap[i] = E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}

	return(0);
}
