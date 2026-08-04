/* EPS.C
 * General-purpose interesting EPS-specific stuff, including error
 * messages, and some useful routines.
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
#include "eps.h"

extern struct MsgType sysexMsgType;

/* EPS_RESPONSES
 * These strings correspond to the responses that the EPS can return.
 * When a library routine returns a non-negative number, that number
 * can be used as an index into this array.
 */
char *eps_responses[] = {
	"ACK",
	"Wait",
	"Insert system disk",
	"Invalid parameter number",
	"Invalid parameter value",
	"Invalid instrument",
	"Invalid layer",
	"Layer in use",
	"Invalid wavesample",
	"Wavesample in use",
	"Invalid wavesample data range",
	"File not found",
	"Memory full",
	"Instrument in use",
	"No more layers",
	"No more wavesamples",
	"0x10 (this should never happen)",	/* Reserved for EPS use */
	"Wavesample is a copy",
	"Zone too big",
	"Sequencer must be stopped",
	"Disk access in progress",
	"Disk full",
	"Loop is too long",
	"NAK",
	"No layer edit",
	"No more pitch tables",
	"Cross fade length is zero",
	"Cross fade length is greater than 50%",
	"Loop start too close to sample start",
	"Loop end too close to sample end",
	"Quiet layer"
};

struct MsgType sysexMsgType = {		/* Generic message type that only
					 * accepts SysEx messages.
					 */
	0x80,		/* Accept only SysEx messages */
	0xff,		/* Accept on all channels */
	0x0f,		/* Accept only Ensoniq SysEx messages */
	-1		/* Accept all SysEx messages */
};

/* EPSRECVACK
 * Receive an ACK with timeouts. When a message has been sent to an
 * EPS, it will do one of two things: return an ACK to say that all
 * went well, or a WAIT to say that we should wait up to 30 seconds
 * for it to respond.
 * At any moment, of course, something could bomb, or we could get a
 * timeout.
 * Returns -1 in case of timeout, another negative number in case of
 * error, or the last response received (hopefully an ACK).
 */
int epsRecvAck(eps)
struct EPSdesc *eps;		/* The EPS that will send us an ACK */
{
	uchar inAck[8];		/* Buffer for incoming ACK */
	uchar outAck[8];	/* Buffer for outgoing ACK */
	ULONG timeout;		/* Current timeout value */
	int retval;
	char *MsgBufPtr = outAck;

	/* Build the ACK message, in case we have to send it */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_RESPONSE);	/* We're sending a response */
	Msg12(ACK);		/* Specifically, an ACK */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* The EPS can send an ACK or some other error code, in which case
	 * we're done. Or it can send a WAIT, in which case we need to send
	 * an ACK, and wait for up to 30 seconds for another response to
	 * come in.
	 */
	timeout = SHORT_TIMEOUT;
	for (;;)
	{
		/* Wait for a message to come in */
		if ((retval = RecvMsg(eps, &sysexMsgType, 8, inAck, timeout)) < 0)
			return(retval);

		/* If it's not a response, something has gone dreadfully
		 * wrong.
		 */
		if (inAck[4] != CMD_RESPONSE)
			return(-1);

		/* It's a response. See whether it's a WAIT command */
		if ((retval = E12toi(&inAck[5])) == WAIT)
		{
			/* Acknowledge receipt of the WAIT command, and
			 * start waiting in earnest.
			 */
			SendMsg(eps,8,outAck);
			timeout = LONG_TIMEOUT;
			eps->last_response = retval;
			CHANGE_STATE(eps,retval);	/* Call user routine */
		} else {
			eps->last_response = retval;
			CHANGE_STATE(eps,retval);	/* Call user routine */
			return(retval);
		}
	}

	/* We should never get this far */
	return(-2);
}

/* EPSSENDACK
 * Send a response, usually an ACK. This is merely for convenience.
 * Returns 0.
 */
int epsSendAck(eps,ack)
struct EPSdesc *eps;		/* The EPS to send an ACK to */
int ack;			/* The response to send */
{
	uchar outAck[8];	/* Buffer for outgoing ACK */
	char *MsgBufPtr = outAck;

	/* Build the ACK message. */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_RESPONSE);	/* We're sending a response */
	Msg12(ack);		/* Specifically, an ACK */
	MsgByte(0xf7);		/* SysEx packet tail */

	SendMsg(eps,8,outAck);

	return(0);
}
