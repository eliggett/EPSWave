/* ADDWSDATA.C
 * Add wavesample data.
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

/****** eps.lib/epsAddWSData ************************************************
*
*   NAME   
*	epsAddWSData -- add the data of two wavesamples together
*
*   SYNOPSIS
*	error = epsAddWSData( eps,inst,dest,from,to,dstart,noclip )
*
*	int epsAddWSData( struct EPSdesc *, edit_spec *, edit_spec *,
*	     ulong, ulong, ulong, int);
*
*   FUNCTION
*	Add the wavesample data of `inst', in the range `from'-`to' to
*	the wavesample `dest', starting at `dstart'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- source wavesample
*	dest		- destination wavesample
*	from		- start of source range, [0..fffff]
*	to		- end of source range, [0..fffff]
*	dstart		- start of destination range, [0..fffff]
*	noclip		- clip prevention flag, clear = 0, set = 1
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	`to' actually points one beyond the end of the range; so if you want
*	to add samples 0-511 inclusive of wavesample 1 to samples 1024-1535
*	inclusive of wavesample 2, and store the result in wavesample 2,
*	you would specify `to', `from' and `dstart' as 0, 512 and 1024
*	respectively.
*
*   BUGS
*	I don't know what the clip prevention flag does, so I don't know
*	whether it works.
*
*****************************************************************************
*
*/
int epsAddWSData(eps,inst,dest,from,to,dstart,noclip)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Source wavesample */
edit_spec *dest;		/* Destination wavesample */
ulong from, to;			/* Range */
ulong dstart;			/* Start of destination range */
int noclip;			/* Clip prevention flag */
{
	uchar MsgBuf[32];	/* Buffer containing the message
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
	MsgByte(CMD_ADD_WSDATA);	/* Add wavesample data */
	Msg12(inst->inst_num);	/* Source instrument number */
	Msg12(inst->layer_num);	/* Source layer number */
	Msg12(inst->ws_num);	/* Source wavesample number */
	Msg12(dest->inst_num);	/* Destination instrument number */
	Msg12(dest->layer_num);	/* Destination layer number */
	Msg12(dest->ws_num);	/* Destination wavesample number */
	/* Wavesample offsets are 20-bit quantities, so they are sent
	 * as two 12-bit quantities.
	 */
	Msg12(from >> 12);		/* High half of 'from' */
	Msg12(from & 0x0fffL);		/* Low half of 'from' */
	Msg12(to >> 12);		/* High half of 'to' */
	Msg12(to & 0x0fffL);		/* Low half of 'to' */
	Msg12(dstart >> 12);		/* High half of 'dstart' */
	Msg12(dstart & 0x0fffL);	/* Low half of 'dstart' */

	Msg12(noclip);			/* Clip prevention flag */
	MsgByte(0xf7);			/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);			/* Wait until the EPS is ready */
	SendMsg(eps,32,MsgBuf);

	retval = epsRecvAck(eps);	/* Get an ACK from the EPS */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
