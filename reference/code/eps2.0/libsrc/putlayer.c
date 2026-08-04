/* PUTLAYER.C
 * Put layer parameters.
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

/****** eps.lib/epsPutLayer ******************************************
*
*   NAME   
*	epsPutLayer -- send layer parameters to the EPS
*
*   SYNOPSIS
*	error = epsPutLayer( eps, inst, par )
*
*	int epsPutLayer( struct EPSdesc *, edit_spec *, layer_par * );
*
*   FUNCTION
*	Send the layer parameters given in `par' to the layer of `eps'
*	described in `inst'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- the wavesample whose parameters are to be set.
*	par		- pointer to a `layer_par' structure containing the
*			  values of the parameters.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The parameters in `par' are described in "eps.h".
*
*   SEE ALSO
*	eps.h, epsGetLayer()
*
*****************************************************************************
*
*/
int epsPutLayer(eps,inst,par)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which layer? */
layer_par *par;			/* Layer parameters */
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
	MsgByte(CMD_PUT_LAYER);	/* Send instrument parameters */
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
	{
		/** Warning: if you send a character not in the set
		 ** [ *-+0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ],
		 ** the EPS will lock up.
		 **/
		Msg16(par->name[i] << 8);
	}
	Msg16((par->glidemode << 8) | par->delay_modamt);	/* Glide mode */
	Msg16((par->glidetime << 8) | par->restriketime);	/* Glide time */
	Msg16(par->legato_lay << 8);	/* Legato layer number */
	Msg16(par->low_vel << 8);	/* Velocity lo */
	Msg16(par->high_vel << 8);	/* Velocity hi */
	Msg16(par->pitch_tab << 8);	/* Pitch table number */
	Msg16(par->delay);		/* Delay time (16+) */
	for (i = 0; i < 88; i++)
		Msg16(par->layermap[i] << 8);	/* Layer map */
	MsgByte(0xf7);			/* End of SysEx */
	SendMsg(eps,326,MsgBuf);

	retval = epsRecvAck(eps);
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
