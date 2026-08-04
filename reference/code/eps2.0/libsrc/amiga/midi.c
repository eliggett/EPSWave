/* MIDI.C
 * Various MIDI routines.
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

#include <stdio.h>
#include <clib/alib_protos.h>
#include <clib/exec_protos.h>
#include <midi/midibase.h>
#include <devices/timer.h>
#include "eps.h"

#define MIN(x,y)	((x)<(y)?(x):(y))
#define MAX(x,y)	((x)>(y)?(x):(y))

struct EPSdesc *OpenEPS();

struct MidiBase *MidiBase = NULL;
struct MsgPort *TimerPort = NULL;	/* Port for timing information */
struct Message *TimeMsg = NULL;		/* Timing message */
int od_errno = -1;			/* OpenDevice() error */

/****** eps.lib/EPSInit ******************************************
*
*   NAME   
*	EPSInit -- Initialize everything so the EPS library can run
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
*	This function uses the Amiga MIDI library. It opens the MIDI
*	library, and creates a port through which all of the EPS timing
*	stuff will go.
*
*   SEE ALSO
*	EPSTini()
*
*****************************************************************************
*
*/
int EPSInit()
{
	/* Open the library */
	if ((MidiBase = OpenLibrary("midi.library",7)) == NULL)
		return(-1);

	/* Create a port on which to receive timing information */
	if ((TimerPort = CreatePort(NULL,0)) == NULL)
	{
		CloseLibrary(MidiBase);
		return(-2);
	}

	return(0);		/* Success */
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
*	Deletes the EPS timing port and closes the MIDI library.
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
/* EPSTINI
 * General tinitialization for the EPS stuff. All EPS descriptors and
 * stuff must be closed before calling this routine, though.
 */
EPSTini()
{
	/* Close the timer port and remove anything pertaining to
	 * measuring timeouts.
	 */
	if (TimerPort != NULL)
		DeletePort(TimerPort);

	/* Finally, close the MIDI library */
	if (MidiBase != NULL)
		CloseLibrary(MidiBase);
}

/****** eps.lib/OpenEPS ******************************************
*
*   NAME   
*	OpenEPS -- open a new EPS
*
*   SYNOPSIS
*	eps = OpenEPS( epsrequest )
*
*	struct EPSdesc *OpenEPS( struct NewEPS * );
*
*   FUNCTION
*	This function is called after `EPSInit()'. It is usually the first
*	one called after that, but it may be called repeatedly afterwards.
*	This function takes an initialized `NewEPS' request, containing
*	a description of the new EPS, and does anything necessary to enable
*	communication with that EPS.
*
*   INPUTS
*	eps		- initialized EPS descriptor
*
*   RESULT
*	error - 0 if successful, a negative number in case of error.
*
*   NOTES
*	Checks the channel, initializes any fields of `eps' which it does
*	not expect to be initialized, creates a MIDI source and
*	destination, and connects them to the MIDI OUT and IN ports
*	via a pair of paths.
*	Starts the first pause, so the first library command will have
*	something to wait for.
*	The only supported transport type supported so far is `TRANS_MIDI'.
*
*   SEE ALSO
*	CloseEPS()
*
*****************************************************************************
*
*/
struct EPSdesc *OpenEPS(epsrequest)
struct NewEPS *epsrequest;
{
	struct EPSdesc *retval;			/* Return value */
	static struct MRouteInfo routeInfo;	/* Route defaults */

	/* Allocate space for the return value */
	if ((retval = (struct EPSdesc *) malloc(sizeof(struct EPSdesc))) == NULL)
		return(NULL);

	/* Copy the request parameters from `epsrequest' to `retval' */
	retval->model = epsrequest->model;
	retval->os_ver = epsrequest->os_ver;
	retval->os_rev = epsrequest->os_rev;
	retval->os_patch = epsrequest->os_patch;
	retval->chan = epsrequest->chan;
	retval->change_state = epsrequest->change_state;
	retval->transport = epsrequest->transport;
	retval->scsi.unit = epsrequest->scsi.unit;
	retval->UserData = epsrequest->UserData;

	/* Check the arguments */
	if (retval->chan < 0 || retval->chan > 15)
	{
		free(retval);
		return(NULL);	/* Invalid MIDI channel */
	}

	retval->last_response = ACK;	/* Last response from EPS */

	/* Create a source and a destination */
	if ((retval->src = CreateMSource(NULL,NULL)) == NULL)
	{
		free(retval);
		return(NULL);
	}
	if ((retval->dest = CreateMDest(NULL,NULL)) == NULL)
	{
		DeleteMSource(retval->src);
		free(retval);
		return(NULL);
	}

	/* Create a pair of paths */
	LockMidiBase();
	routeInfo.MsgFlags = MMF_ALL;	/* Send all messages */
	routeInfo.ChanFlags = 0xffff;	/* Send on the requested channel(s) */
	routeInfo.ChanOffset = 0;	/* No channel offset */
	routeInfo.NoteOffset = 0;	/* No note offset */
	if ((retval->outbound = MRouteSource(retval->src, "MidiOut",
		&routeInfo)) == NULL)
	{
		UnlockMidiBase();
		DeleteMDest(retval->dest);
		DeleteMSource(retval->src);
		free(retval);
		return(NULL);
	}
	if ((retval->inbound = MRouteDest("MidiIn", retval->dest,
		&routeInfo)) == NULL)
	{
		UnlockMidiBase();
		DeleteMRoute(retval->outbound);
		DeleteMDest(retval->dest);
		DeleteMSource(retval->src);
		free(retval);
		return(NULL);
	}
	UnlockMidiBase();

	if ((retval->TimeReq = (struct timerequest *)
		CreateExtIO(TimerPort,sizeof(struct timerequest))) == NULL)
	{
		DeleteMRoute(retval->inbound);
		DeleteMRoute(retval->outbound);
		DeleteMDest(retval->dest);
		DeleteMSource(retval->src);
		free(retval);
		return(NULL);
	}

	if ((od_errno = OpenDevice(TIMERNAME ,UNIT_VBLANK, (struct IORequest *)
		retval->TimeReq, 0L)) != 0)
	{
		DeleteExtIO(retval->TimeReq);
		retval->TimeReq = NULL;
		DeleteMRoute(retval->inbound);
		DeleteMRoute(retval->outbound);
		DeleteMDest(retval->dest);
		DeleteMSource(retval->src);
		free(retval);
		return(NULL);
	}

	/* This is just so that the first SysEx routine will have something
	 * to read from the timer port.
	 */
	StartPause(retval, BREATHER);

	return(retval);		/* All went well */
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
*	Close an EPS descriptor. Basically, undoes anything done by
*	`OpenEPS()' on the same descriptor.
*
*   INPUTS
*	eps		- descriptor for the EPS to close.
*
*   RESULT
*	none
*
*   NOTES
*	Deletes the MIDI source and destination, and both routes.
*	The user is expected to have already freed any user data.
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
	/* Delete the source, destination, and both routes. The user is
	 * responsible for freeing his own stuff, if any.
	 */
	DeleteMRoute(eps->inbound);
	DeleteMRoute(eps->outbound);
	DeleteMDest(eps->dest);
	DeleteMSource(eps->src);
	if (eps->TimeReq != NULL)
	{
		EndPause(eps);			/* Flush the last request */
		CloseDevice(eps->TimeReq);
		DeleteExtIO(eps->TimeReq);
	}
	free(eps);
}

/****** eps.lib/SetAlarm ******************************************
*
*   NAME   
*	SetAlarm -- ask the timer for a delayed message
*
*   SYNOPSIS
*	error = SetAlarm( eps, timeout )
*
*	int SetAlarm( struct EPSdesc *, ULONG );
*
*   FUNCTION
*	Arrange for a message to be sent from the timer device after
*	`timeout' milliseconds.
*
*   INPUTS
*	eps		- the EPS on whose behalf we're acting.
*	timeout		- the time for the timer device to wait before
*			  answering, in milliseconds.
*
*   RESULT
*	none
*
*   NOTES
*	I'm not sure what would happen if several of these overlapped,
*	but I'm fairly sure that it never happens.
*
*****************************************************************************
*
*/
static int SetAlarm(eps,timeout)
struct EPSdesc *eps;
ULONG timeout;
{
	eps->TimeReq->tr_node.io_Command = TR_ADDREQUEST;
	eps->TimeReq->tr_time.tv_secs = timeout / 1000;
	eps->TimeReq->tr_time.tv_micro = (timeout % 1000) * 1000;
	SendIO((struct IORequest *) (eps->TimeReq));
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
*	Simply sets the alarm with `SetAlarm()' and waits for it to
*	expire.
*	The `i' doesn't stand for anything.
*
*****************************************************************************
*
*/
int isleep(eps,n)
struct EPSdesc *eps;
long n;
{
	SetAlarm(eps,n);
	WaitIO((struct IORequest *) (eps->TimeReq));
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
*	msec		- the time to wait, in milliseconds.
*
*   RESULT
*	none
*
*   NOTES
*	Simply sets the alarm using `SetAlarm()'. `EndPause()' will wait
*	for it to expire.
*	The EPS can't handle too many commands coming in at once. There has
*	to be about a 100ms pause between commands. `StartPause()' and
*	`EndPause()', together, ensure that this pause occurs. `EndPause()'
*	will not return before N milliseconds have elapsed since the call
*	to `StartPause(N)'.
*	`EndPause()' is called before any EPS SysEx call, and `StartPause()'
*	is called at the end of every EPS SysEx call.
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
ULONG msec;
{
	SetAlarm(eps,msec);		/* Set the alarm */
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
*
*   RESULT
*	none
*
*   NOTES
*	Simply waits for the alarm set by `StartPause()' to expire.
*	See also `StartPause()'.
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
	/* Wait for the alarm to go off */
	WaitIO((struct IORequest *) (eps->TimeReq));
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
*	Uses the MIDI library to send a message to the EPS. Since this
*	is an atomic function, `SendMsg()' estimates the time it will
*	take to send the message, and waits that long before returning.
*
*   BUGS
*	The bit about waiting. Really ugly.
*
*   SEE ALSO
*	RecvMsg()
*
*****************************************************************************
*
*/
int SendMsg(eps,len,msg)
struct EPSdesc *eps;		/* EPS descriptor */
ULONG len;			/* Length of the message */
UBYTE *msg;			/* The MIDI message to be sent */
{
	PutMidiMsg(eps->src,msg);
	isleep(eps,(340*len)/1000);

	return(0);
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
*	Basically, this routine just sets an alarm using `SetAlarm()',
*	waits for a message to come in either on the timer port or on
*	`eps's MIDI source.
*	If the first message to come in is on the timer port, then a
*	timeout has occurred. Otherwise, a MIDI message is waiting, so
*	check that it is of the correct type and cancel the alarm.
*
*   BUGS
*	Since the MIDI library will not send a message to the MIDI source
*	before it has been received in its entirety, it is necessary to
*	extend the timeout value artificially by the amount of time that
*	it takes for the message to arrive.
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
ULONG len;		/* Length of the incoming message */
UBYTE *msgbuf;		/* Buffer to hold the message */
ULONG timeout;		/* Timeout value, in ms. */
{
	int done;	/* Are we done yet? */
	struct MidiPacket *inmsg;	/* Incoming message */
	int i;

	done = 0;
	while (!done)
	{
		/* Arrange for a timeout message to come in.
		 * Since a) the entire message has to come in before
		 * it can be returned by GetMidiPacket(), and b) some
		 * messages can take longer than the timeout to be
		 * transmitted, I've had to fudge the timer a bit.
		 * The timeout value in the SetAlarm() call adds the
		 * length of the message to the normal timeout, and
		 * then some: normally, it takes 320 microseconds to
		 * transmit 1 byte; the 340 below is 320 + fudge factor.
		 * It just seems to work well with this.
		 */
		SetAlarm(eps, timeout + ((len * 340)/1000));

		/* Wait for something to come in. I have no idea why
		 * the while loop is necessary. It should be possible
		 * to just use one Wait() call.
		 */
		while (IsMsgPortEmpty(TimerPort) &&
		       IsMsgPortEmpty(eps->dest->DestPort))
			Wait((1 << (eps->dest->DestPort->mp_SigBit)) |
			     (1 << (TimerPort->mp_SigBit)));

		/* Check for timeout */
		if ((TimeMsg = GetMsg(TimerPort)) != NULL)
		{
			WaitIO((struct IORequest *) (eps->TimeReq));
{
#undef stderr
extern char *stderr;
FPrintf(stderr, "Timing out in RecvMsg\n");
}
			return(-1);	/* A timeout has occurred */
		}

		/* No timeout. Forget about the timeout thingy */
		AbortIO((struct IORequest *) (eps->TimeReq));
		WaitIO((struct IORequest *) (eps->TimeReq));

		while ((!done) && ((inmsg = GetMidiPacket(eps->dest)) != NULL))
		{
			/* Check that this is the type of message we want.
			 * What this ugly one-liner does is to take the
			 * 3 LSBits of the MIDI command byte (bits 4-6)
			 * and use the resulting value as an index into
			 * the bitmask 'msgtype->midi', and see if the
			 * corresponding bit is on.
			 * For example, if 'msgtype->midi' is 0000 0011
			 * (receive only NOTE ON and NOTE OFF messages),
			 * and we receive a message starting with 1101 0000,
			 * then the opcode portion of the message is 101 = 5,
			 * and we will perform the test
			 *	if (0000 0011 & (1 << 5))
			 */
			if (!((msgtype->midi) &
			     (1 << (((inmsg->MidiMsg)[0] >> 4) &
				    0x07))))
			{
				/* MIDI message type isn't correct */
				FreeMidiPacket(inmsg);
				continue;
			}

			/* If we have received a SysEx message, make sure
			 * that it is the one that we are expecting, i.e.,
			 * it has the correct manufacturer code and SysEx
			 * message type.
			 */
			if (inmsg->MidiMsg[0] == MMF_SYSEX)
			{
				/* Check the manufacturer and SysEx message
				 * type.
				 */
				if (msgtype->manufacturer != -1 &&
				    inmsg->MidiMsg[1] != msgtype->manufacturer)
				{
					FreeMidiPacket(inmsg);
					continue;
				}
				if (msgtype->sysex != -1 &&
				    inmsg->MidiMsg[2] != msgtype->sysex)
				{
					FreeMidiPacket(inmsg);
					continue;
				}
			}

			/* By now, we know that the message is one that
			 * the user was expecting. Return it.
			 */
			for (i = (MIN(inmsg->Length,len))-1; i >= 0; i--)
				msgbuf[i] = inmsg->MidiMsg[i];
			done = 1;
		}
		FreeMidiPacket(inmsg);

		if (inmsg == NULL)	/* Something broke */
			done = -2;
	}

{extern char *stderr; FPrintf(stderr, "RecvMsg about to return %d\n", done);
}
	return(done);
}
