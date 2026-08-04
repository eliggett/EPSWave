/* MIDI.C
 * Template file for porting system-dependent MIDI routines to new
 * platforms. It is a good idea to declare as 'static' as much as possible
 * the variables and functions in this file.
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

/* Include any system-dependent files here. */
#include "eps.h"		/* EPS definitions */

/* MIN and MAX are just useful to have lying around. Remove these two lines
 * if they're already defined elsewhere.
 */
#define MIN(x,y)	((x)<(y)?(x):(y))
#define MAX(x,y)	((x)>(y)?(x):(y))

int OpenEPS();			/* Forward declaration */

/* Declare any system-specific global variables here. If possible,
 * declare them as 'static'.
 */

/****** eps.lib/EPSInit ******************************************
*
*   NAME   
*	EPSInit -- initialize everything for the EPS library
*
*   SYNOPSIS
*	error = EPSInit()
*
*   FUNCTION
*	Initialize various stuff. Returns 0 in case of success, a negative
*	number in case of error.
*	This function will be the first thing called, before any EPSes are
*	opened, before any function calls will be made. If you need to do
*	anything special to be able to read from and write to the MIDI port,
*	do it here.
*
*   INPUTS
*	none
*
*   RESULT
*	0 in case of success, a negative number in case of error.
*
*   NOTES
*	This function is system-dependent.
*
*   BUGS
*	Sort of depends on you, doesn't it? :-)
*
*   SEE ALSO
*	EPSTini()
*
*****************************************************************************
*
*/
int EPSInit()
{
}

/****** eps.lib/EPSTini ******************************************
*
*   NAME   
*	EPSTini -- clean up after the EPS library
*
*   SYNOPSIS
*	EPSTini()
*
*   FUNCTION
*	General tinitialization for the EPS stuff. All EPS descriptors and
*	stuff must be closed before calling this routine, though.
*	This function will be the last one called, after the user is through
*	calling any library functions, after closing any open EPSes. This
*	function should undo anything done in 'EPSInit()'.
*
*   INPUTS
*	none
*
*   RESULT
*	none
*
*   NOTES
*	This function is system-dependent.
*
*   BUGS
*	None so far.
*
*   SEE ALSO
*	EPSInit()
*
*****************************************************************************
*
*/
EPSTini()
{
}

/****** eps.lib/OpenEPS ******************************************
*
*   NAME   
*	OpenEPS -- open a new EPS
*
*   SYNOPSIS
*	error = OpenEPS( eps )
*
*	int OpenEPS( struct EPSdesc * );
*
*   FUNCTION
*	This function is called after `EPSInit()'. It is usually the first
*	one called after that, but it may be called repeatedly afterwards.
*	This function takes an initialized `EPSdesc *' describing a particular
*	EPS, and does anything necessary to enable communication with that
*	EPS. In particular, this function should look at the `chan' field of
*	`eps' to find the MIDI channel on which the EPS wants to send and
*	receive data.
*
*   INPUTS
*	eps		- initialized EPS descriptor
*
*   RESULT
*	error - 0 if successful, a negative number in case of error.
*
*   NOTES
*	Should there be multiple EPSes on one's MIDI network, the library
*	routines should work correctly. Plan for this.
*	The `transport' field should be one of TRANS_MIDI or TRANS_SCSI, to
*	indicate whether data should be sent to the EPS via MIDI or SCSI.
*	This field is unused at the moment, but if it ever gets used, this is
*	a good place to use it.
*	The `EPSdesc' structure may contain system-dependent fields.
*	It is considered acceptable to dump core/guru/barf and die if any of
*	the important fields (chan,transport, any particularly important
*	system-dependent fields) are changed during the course of events.
*	It is considered polite, when given a `model' field of `GO_FIGURE',
*	to do something to try to find out exactly what model EPS this is,
*	and stick that value into the `model' field. It is not a requirement,
*	however.
*
*   BUGS
*	Ha!
*
*   SEE ALSO
*	CloseEPS()
*
*****************************************************************************
*
*/
int OpenEPS(eps)
struct EPSdesc *eps;
{
}

/****** eps.lib/CloseEPS ******************************************
*
*   NAME   
*	CloseEPS -- close an EPS descriptor
*
*   SYNOPSIS
*	error = CloseEPS( eps )
*
*	int CloseEPS( struct EPSdesc * );
*
*   FUNCTION
*	Close an EPS descriptor. Basically, this routine should undo
*	anything done by `OpenEPS()' on the same descriptor.
*
*   INPUTS
*	eps		- descriptor for the EPS to close.
*
*   RESULT
*	none
*
*   NOTES
*	The user is expected to have already freed any user data.
*	This function must not attempt to free the descriptor.
*	It is considered acceptable to barf and die if any operations are
*	attempted on this descriptor after this function returns.
*
*   BUGS
*	No way.
*
*   SEE ALSO
*	OpenEPS()
*
*****************************************************************************
*
*/
CloseEPS(eps)
struct EPSdesc *eps;
{
}

/****** eps.lib/isleep ******************************************
*
*   NAME   
*	isleep -- do nothing for a given number of milliseconds
*
*   SYNOPSIS
*	error = isleep( eps, n )
*
*	isleep( struct EPSdesc *, long );
*
*   FUNCTION
*	Do nothing for at least `n' milliseconds.
*
*   INPUTS
*	eps		- descriptor for the EPS that is being slept on.
*
*   RESULT
*	none
*
*   NOTES
*	`isleep()' may return if data comes in from `eps' before the
*	expiration of the timer.
*	The EPS(16+) External Command Specification says that the EPS must
*	send an ACK or WAIT at most 2 seconds after receiving a command.
*	Unfortunately, when you're processing large samples, it may take more
*	than 2 seconds to do so. Therefore, several routines try to estimate
*	the time it will take to perform the command, `isleep()' that long,
*	and then start the 2-second countdown.
*	Precision here is not of the essence. If your system has a milli- or
*	microsecond timer, so much the better. If not, it is acceptable to
*	`sleep()' for n/1000 seconds.
*
*   BUGS
*	I should certainly hope not!
*
*   SEE ALSO
*
*****************************************************************************
*
*/
isleep(eps,n)
struct EPSdesc *eps;
long n;
{
	sleep(n/1000);
}

/****** eps.lib/StartPause ******************************************
*
*   NAME   
*	StartPause -- start an n-millisecond pause
*
*   SYNOPSIS
*	StartPause( eps, msec )
*
*	StartPause( struct EPSdesc *, ulong );
*
*   FUNCTION
*	Arrange things so that `EndPause()' will not return before `msec'
*	milliseconds have elapsed.
*
*   INPUTS
*	eps		- the EPS we are waiting for
*
*   RESULT
*	none
*
*   NOTES
*	The EPS can't handle too many commands coming in at once. There has
*	to be about a 100ms pause between commands. `StartPause()' and
*	`EndPause()', together, ensure that this pause occurs. `EndPause()'
*	will not return before N milliseconds have elapsed since the call
*	to `StartPause(N)'.
*	`EndPause()' is called before any EPS SysEx call, and `StartPause()'
*	is called at the end of every EPS SysEx call.
*	Precision is not of the essence. It is acceptable for `StartPause(n)'
*	to `sleep()' for (n/1000)+1 seconds, and for `EndPause()' to do
*	nothing.
*	Since there may be multiple EPSes, you should ensure that multiple
*	`StartPause()' and `EndPause()' calls do not interfere with each
*	other.
*
*   BUGS
*	Haven't seen any, sorry.
*
*   SEE ALSO
*	EndPause()
*
*****************************************************************************
*
*/
StartPause(eps,msec)
struct EPSdesc *eps;
ulong msec;
{
	sleep((msec/1000) + 1);
}

/****** eps.lib/EndPause ******************************************
*
*   NAME   
*	EndPause -- end an n-millisecond pause
*
*   SYNOPSIS
*	EndPause( eps )
*
*	EndPause( struct EPSdesc * );
*
*   FUNCTION
*	End the pause started by `StartPause()'. Do not return until `msec'
*	milliseconds have elapsed.
*
*   INPUTS
*	eps		- EPS to wait for.
*	msec		- the time to wait, in milliseconds.
*
*   RESULT
*	none
*
*   NOTES
*	See `StartPause()'.
*
*   BUGS
*	All squashed flat.
*
*   SEE ALSO
*	StartPause()
*
*****************************************************************************
*
*/
EndPause(eps)
struct EPSdesc *eps;
{
}

/****** eps.lib/SendMsg ******************************************
*
*   NAME   
*	SendMsg -- send a MIDI message to MIDI OUT
*
*   SYNOPSIS
*	error = SendMsg( eps, len, msg )
*
*	int SendMsg( struct EPSdesc *, ulong, uchar );
*
*   FUNCTION
*	Send the MIDI message in `msg' to the MIDI OUT port. This function
*	should not return until the entire message has been sent. The length
*	of the message is given by `len'.
*
*   INPUTS
*	eps		- EPS to send the message to.
*	len		- length of the message to be sent.
*	msg		- the MIDI message to send.
*
*   RESULT
*	error - 0 if successful, or a negative number in case of error.
*
*   NOTES
*	Send a MIDI message to an EPS. This routine should not return before
*	the entire message has been sent. This may require waiting around,
*	if your MIDI library (like the Amiga's) is "too" smart.
*	Since MIDI goes at 3125 bps, it takes 320 microseconds to transmit
*	one (10-bit) byte, and (320/1000 * len) milliseconds to transmit
*	a message of len bytes. I find that 340 microseconds per byte, to
*	account for processing time and whatnot, is about right.
*	It is not necessary to parse the message in 'msg' in any way before
*	sending it.
*
*   BUGS
*	In your dreams.
*
*   SEE ALSO
*	RecvMsg()
*
*****************************************************************************
*
*/
int SendMsg(eps,len,msg)
struct EPSdesc *eps;		/* EPS descriptor */
ulong len;			/* Length of the message */
uchar *msg;			/* The MIDI message to be sent */
{
}

/****** eps.lib/RecvMsg ******************************************
*
*   NAME   
*	RecvMsg -- receive a MIDI message from MIDI IN
*
*   SYNOPSIS
*	error = RecvMsg( eps, msgtype, len, msgbuf, timeout )
*
*	int RecvMsg
*		( struct EPSdesc *, struct MsgType *, ulong, uchar, ulong );
*
*   FUNCTION
*	Expect to receive a MIDI message from the EPS described by `eps'.
*	`msgtype' describes the type of message to expect. If no message
*	has come in after `timeout' milliseconds, stop waiting.
*
*   INPUTS
*	eps		- the EPS from which to expect a message.
*	msgtype		- type(s) of message to expect.
*	len		- length of the incoming message.
*	msgbuf		- pointer to a buffer in which to store the message.
*	timeout		- timeout value, in milliseconds.
*
*   RESULT
*	A positive value in case of success, a negative value in case
*	of error. -1 indicates a timeout.
*
*   NOTES
*	Precise timing is not required.
*	Actually, the `msgtype' parameter is a bit ridiculous, since all
*	of the library routines expect a System Exclusive message.
*
*   BUGS
*	I'll let you know if I find any.
*
*   SEE ALSO
*	SendMsg()
*
*****************************************************************************
*
*/
int RecvMsg(eps,msgtype,len,msgbuf,timeout)
struct EPSdesc *eps;	/* The EPS from which to receive */
struct MsgType *msgtype;	/* The type of message to expect */
ulong len;		/* Length of the incoming message */
uchar *msgbuf;		/* Buffer to hold the message */
ulong timeout;		/* Timeout value, in milliseconds. */
{
}
