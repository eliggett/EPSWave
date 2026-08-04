/* MIXWSDATA.C
 * Mix wavesample data.
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

/****** eps.lib/epsMixWSData ******************************************
*
*   NAME   
*	epsMixWSData -- mix the data of two wavesamples
*
*   SYNOPSIS
*	error = epsMixWSData( eps, inst, dest, balance )
*
*	int epsMixWSData( struct EPSdesc *, edit_spec *, edit_spec *, int );
*
*   FUNCTION
*	Mix the wavesample data of `inst' with that of `dest'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- source wavesample.
*	dest		- destination wavesample.
*	balance		- balance control, [-127..127], -127=all source,
*			  0=equal balance, 127=all destination.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*****************************************************************************
*
*/
int epsMixWSData(eps,inst,dest,balance)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Source wavesample */
edit_spec *dest;		/* Destination wavesample */
int balance;			/* Balance factor */
{
	uchar MsgBuf[20];	/* Buffer containing the message
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
	MsgByte(CMD_MIX_WSDATA);	/* Mix wavesample data */
	Msg12(inst->inst_num);	/* Source instrument number */
	Msg12(inst->layer_num);	/* Source layer number */
	Msg12(inst->ws_num);	/* Source wavesample number */
	Msg12(dest->inst_num);	/* Destination instrument number */
	Msg12(dest->layer_num);	/* Destination layer number */
	Msg12(dest->ws_num);	/* Destination wavesample number */
	Msg12(balance);		/* Balance control */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);			/* Wait until the EPS is ready */
	SendMsg(eps,20,MsgBuf);

	/* Hack alert! Hack alert! This sleep is there to give the
	 * EPS time to process long fade-ins before acknowledging.
	 * The figure of 10000 samples/second is fairly arbitrary.
	 */
/*	sleep((to-from)/10);*/

	retval = epsRecvAck(eps);	/* Get an ACK from the EPS */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
