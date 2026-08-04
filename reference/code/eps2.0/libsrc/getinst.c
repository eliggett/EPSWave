/* GETINST.C
 * Get instrument parameters.
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

/****** eps.lib/epsGetInstrument ******************************************
*
*   NAME   
*	epsGetInstrument -- get instrument parameters
*
*   SYNOPSIS
*	error = epsGetInstrument( eps, inst, out )
*
*	int epsGetInstrument( struct EPSdesc *, edit_spec *, inst_par * );
*
*   FUNCTION
*	Get the instrument parameters for the instrument given in `inst'.
*	The result will be put in `out'. The parameters are described in
*	"eps.h".
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- the instrument whose parameters are to be retrieved
*	out		- pointer to a `inst_par' structure whose fields will
*			  be filled in with the parameters of the instrument.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The fields of `out' are documented in "eps.h".
*	In case of error, the values in `out' are undefined.
*
*   BUGS
*	The size value returned may or may not be that shown on the front
*	panel of the EPS. I have discovered no correlation between the
*	two.
*
*   SEE ALSO
*	eps.h, epsPutInstrument()
*
*****************************************************************************
*
*	The size of `AnswerBuf[]' is bogus.
*/
int epsGetInstrument(eps,inst,out)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which instrument? */
inst_par *out;			/* Description will be put here */
{
	uchar MsgBuf[12];	/* Message to be sent out */
	uchar AnswerBuf[973];	/* Buffer containing the answer from
				 * the EPS. The size is completely
				 * ad hoc: according to the spec, it
				 * should be 968 bytes.
				 */
	uchar *MsgBufPtr = MsgBuf;	/* Pointer to MsgBuf */
	int i,retval,temp;

	/* Construct the message to be sent */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_GET_INST);	/* Request instrument parameters */
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

	/* Receive the data, part 1 */
	if ((retval = RecvMsg(eps,&sysexMsgType,12,AnswerBuf,SHORT_TIMEOUT))
		< 0)
	{
		return(retval);
	}

	epsSendAck(eps,ACK);	/* Acknowledge data part 1 */

	if ((retval = RecvMsg(eps,&sysexMsgType,973,AnswerBuf,SHORT_TIMEOUT))
		< 0)
	{
		return(retval);
	}

	epsSendAck(eps,ACK);		/* Acknowledge data part 2 */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	/* Copy the received data into 'out'. See 'eps.h' for a description
	 * of the various fields
	 */
	for (i = 0, MsgBufPtr = &(AnswerBuf[4]); i < 12; i++, MsgBufPtr += 3)
		out->name[i] = E16toi(MsgBufPtr) >> 8;
	out->midi_chan = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->midi_prog = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->midi_pres = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->size = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	out->key_dest = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	for (i = 0; i < 4; i++, MsgBufPtr += 3)
		out->patches[i] = E16toi(MsgBufPtr) >> 8;
	out->down_layers = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->up_layers = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->patch_sel = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3; /* (16+) */
	MsgBufPtr += 3;		/* Unused */
	if ((temp = E16toi(MsgBufPtr) >> 8) == EPS_16PLUS)
		out->id = EPS_16PLUS;
	MsgBufPtr += 3;
	out->low_key = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->high_key = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->transpose = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	for (i = 0; i < 8; i++)
	{
		out->pitch_off[i] = E16toi(MsgBufPtr);
		MsgBufPtr += 3;
		out->pitch_off[i] |= E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	for (i = 0; i < 8; i++)
	{
		out->layer_off[i] = E16toi(MsgBufPtr);
		MsgBufPtr += 3;
		out->layer_off[i] |= E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	for (i = 0; i < 128; i++)
	{
		out->ws_off[i] = E16toi(MsgBufPtr);
		MsgBufPtr += 3;
		out->ws_off[i] |= E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	/** The following two lines are just a guess. I don't think
	 ** anything'll barf, since there's plenty of padding, but
	 ** I can't test this on a real live 16+.
	 **/
	out->eff_off = E16toi(MsgBufPtr);	MsgBufPtr += 3;
	out->eff_off |= E16toi(MsgBufPtr);

	return(0);
}
