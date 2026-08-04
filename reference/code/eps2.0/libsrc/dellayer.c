/* DELLAYER.C
 * Delete layer.
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

/****** eps.lib/epsDeleteLayer ******************************************
*
*   NAME   
*	epsDeleteLayer -- delete a given layer
*
*   SYNOPSIS
*	error = epsDeleteLayer( eps, inst )
*
*	int epsDeleteLayer( struct EPSdesc *, edit_spec * );
*
*   FUNCTION
*	Delete the layer whose number, and the number of the instrument it
*	is contained in, are given in `inst'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- number of the layer to delete, and the number of
*			  the instrument it is contained in.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The layer must already exist.
*
*   SEE ALSO
*	epsCopyLayer(), epsCreateLayer()
*
*****************************************************************************
*
*/
/* EPSDELETELAYER
 * Delete the layer of 'eps' described in 'inst'.
 * Returns 0 on no error, otherwise either a negative value, or the last
 * response received from the EPS.
 */
int epsDeleteLayer(eps,inst)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which layer? */
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
	MsgByte(CMD_DEL_LAYER);	/* Delete layer */
	Msg12(inst->inst_num);	/* Instrument number */
	Msg12(inst->layer_num);	/* Layer number */
	Msg12(inst->ws_num);	/* Wavesample number */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);		/* Wait until the EPS is ready */
	SendMsg(eps,12,MsgBuf);

	retval = epsRecvAck(eps);	/* Get an ACK from the EPS */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
