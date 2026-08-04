/* COPYLAYER.C
 * Copy layer.
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

/****** eps.lib/epsCopyLayer ******************************************
*
*   NAME   
*	epsCopyLayer -- make a copy of a layer
*
*   SYNOPSIS
*	error = epsCopyLayer( eps, inst, dest, copy )
*
*	int epsCopyLayer( struct EPSdesc *, edit_spec *, edit_spec *, int );
*
*   FUNCTION
*	Copy the layer described by `inst' to the layer described by `dest'.
*	If the `copy' flag is set, then the wavesample data within the source
*	layer will be copied as well.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- source layer.
*	dest		- destination layer.
*	copy		- copy flag, 0=don't copy data, 1=copy data.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	I'm not sure whether the destination layer may already exist or not.
*
*   SEE ALSO
*	epsCreateLayer(), epsDeleteLayer()
*
*****************************************************************************
*
*/
int epsCopyLayer(eps,inst,dest,copy)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which layer? */
edit_spec *dest;		/* Destination layer */
int copy;			/* Copy data? */
{
	uchar MsgBuf[20];	/* Buffer containing the message
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
	MsgByte(CMD_CPY_LAYER);	/* Copy layer */
	Msg12(inst->inst_num);	/* Source instrument number */
	Msg12(inst->layer_num);	/* Source layer number */
	Msg12(inst->ws_num);	/* Source wavesample number */
	Msg12(dest->inst_num);	/* Destination instrument number */
	Msg12(dest->layer_num);	/* Destination layer number */
	Msg12(0x00);		/* Dummy destination wavesample number */
	Msg12(copy & 0x01);	/* Copy data? */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);		/* Wait until the EPS is ready */
	SendMsg(eps,20,MsgBuf);

	retval = epsRecvAck(eps);	/* Get an ACK from the EPS */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
