/* AUDITWS.C
 * Audition wavesamples.
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

/****** eps.lib/epsAuditionWS ******************************************
*
*   NAME   
*	epsAuditionWS -- audition two wavesamples and delete one.
*
*   SYNOPSIS
*	error = epsAuditionWS( eps, inst1, inst2, which, timeout )
*
*	int epsAuditionWS( struct EPSdesc *, edit_spec *, edit_spec *,
*		int *, (*int)());
*
*   FUNCTION
*	Audition the two wavesamples described in `inst1' and `inst2', and
*	delete the one that the user chooses not to keep. Typically, `inst1'
*	is an "old" wavesample, and `inst2' is a "new" wavesample, which was
*	created by performing some function on `inst1'.
*	`*which' will be set to 0 if the first wavesample was chosen, 1 if
*	the second one was chosen, or -1 if neither. `*which' is undefined in
*	case of error.
*	`timeout' points to a function that will be called when a timeout
*	occurs, to find out whether it's worth going on. It should return 0
*	if `AuditionWS()' should continue waiting, or 1 if a real timeout
*	has occurred. If `timeout' is NULL, then the first timeout will end
*	this whole business.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst1		- "old" wavesample
*	inst2		- "new" wavesample
*	which		- pointer to an int which will be set to a number
*			  corresponding to the wavesample that was deleted
*			  as a result of the audition
*	timeout		- pointer to a function to indicate whether a "real"
*			  timeout has occurred. Should return 0 for "no
*			  timeout," or 1 to indicate a timeout.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The `timeout' parameter has not been thoroughly tested. The only
* 	reason it exists is that the EPS does not send an ACK immediately
*	after it receives the `Audition wavesample' command. Instead, it
*	will wait for the user to choose a wavesample to keep, delete the
*	other one, send a `Delete wavesample' message, and finally send
*	an ACK to acknowledge receipt of the `Audition wavesample' command.
*	The `timeout' parameter is just there to prevent the function from
*	hanging forever in case the EPS dies. It is called every 30 seconds,
*	and should return a nonzero value to indicate that a real timeout
*	has occurred, and that we should just give up.
*
*   BUGS
*	Probably lots. This is not one of my favorite functions.
*
*****************************************************************************
*
*/
int epsAuditionWS(eps,inst1,inst2,which,timeout)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst1;		/* First wavesample */
edit_spec *inst2;		/* Second wavesample */
int *which;			/* Which one was chosen? */
int (*timeout)();		/* Should we continue after timeout? */
{
	uchar MsgBuf[18];	/* Buffer containing the message
				 * to be sent to the EPS.
				 */
	uchar AnswerBuf[12];	/* Message containing the answer from
				 * the EPS.
				 */
	uchar *MsgBufPtr = MsgBuf;	/* Pointer to MsgBuf */
	int i,retval;
	int wsnum;		/* Number of the deleted wavesample */

	/* Construct the message to be sent */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_AUDITION);		/* Audition wavesamples */
	Msg12(inst1->inst_num);		/* First instrument number */
	Msg12(inst1->layer_num);	/* First layer number */
	Msg12(inst1->ws_num);		/* First wavesample number */
	Msg12(inst2->inst_num);		/* Second instrument number */
	Msg12(inst2->layer_num);	/* Second layer number */
	Msg12(inst2->ws_num);		/* Second wavesample number */
	MsgByte(0xf7);			/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);		/* Wait until the EPS is ready */
	SendMsg(eps,20,MsgBuf);

	if ((retval = epsRecvAck(eps)) != ACK)	/* Get an ACK from the EPS */
	{
		return(retval);
	}

	/* Wait forever for either
	 *	- a 'Delete wavesample' message
	 *	- a timeout (and possible continuation)
	 *	- something else (what?)
	 */
	for (;;)
	{
		retval = RecvMsg(eps,&sysexMsgType,12,AnswerBuf,LONG_TIMEOUT);
		if ((retval < 0) && (timeout != NULL) &&
		    ((*timeout)() != 0))
		{
			/* A real timeout has occurred */
			return(-1);
		}

		if (AnswerBuf[4] == CMD_DEL_WS)
			/* This is a 'Delete wavesample' message. Good */
			break;
		else
			return(retval);		/* Huh? */
	}

	epsSendAck(eps,ACK);

	/* Figure out which wavesample was deleted, and set '*which'
	 * accordingly.
	 */
	MsgBufPtr = &(AnswerBuf[5]);

	/* Check the instrument, layer and wavesample numbers given in
	 * the 'Delete wavesample' message. If any of them do not match
	 * those of 'inst1', then the EPS must have deleted 'inst2'.
	 */
	*which = 0;		/* Start by assuming it's the first WS */

	/* Instrument number */
	wsnum = E12toi(MsgBufPtr);	MsgBufPtr += 2;
	if (wsnum != inst1->inst_num)
		*which = 1;

	/* Layer number */
	wsnum = E12toi(MsgBufPtr);	MsgBufPtr += 2;
	if (wsnum != inst1->layer_num)
		*which = 1;

	/* Wavesample number */
	wsnum = E12toi(MsgBufPtr);	MsgBufPtr += 2;
	if (wsnum != inst1->ws_num)
		*which = 1;

	/* Wait for the EPS to acknowledge the end of 'Audition wavesamples' */
	if ((retval = epsRecvAck(eps)) != ACK)
	{
		return(retval);
	}
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
