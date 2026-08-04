/* BUTTON.C
 * Virtual button press.
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

/****** eps.lib/epsPushButton ******************************************
*
*   NAME   
*	epsPushButton -- virtual button press
*
*   SYNOPSIS
*	error = epsPushButton( eps, but )
*
*	int epsPushButton( struct EPSdesc *, int );
*
*   FUNCTION
*	Emulate a button press via MIDI, as if it had been pressed on the
*	front panel of the EPS.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	but		- number of the button to press. A list of button
*			  numbers is given in "eps.h".
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	This function should only be used when it is impossible to achieve
*	the desired result with another command.
*
*   BUGS
*	Does not always work. For example, it does not seem possible to
*	load an instrument from disk using only virtual button presses.
*
*   SEE ALSO
*	eps.h
*
*****************************************************************************
*
*/
int epsPushButton(eps, but)
struct EPSdesc *eps;		/* EPS descriptor */
int but;			/* Button number */
{
	char MsgBuf[8];			/* Message to be sent out */
	char *MsgBufPtr = MsgBuf;	/* Pointer to MsgBuf */
	int retval;

	/* Construct the message to be sent */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_BUTTON);	/* Virtual button press */
	Msg12(but);		/* Button number */
	MsgByte(0xf7);		/* SysEx packet tail */

	EndPause(eps);		/* Wait until EPS is ready */
	SendMsg(eps,8,MsgBuf);

	retval = epsRecvAck(eps);

	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */
	return(retval);
}
