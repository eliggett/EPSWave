/* PUTINST.C
 * Put instrument parameters.
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

/****** eps.lib/epsPutInstrument ******************************************
*
*   NAME   
*	epsPutInstrument -- send instrument parameters to the EPS
*
*   SYNOPSIS
*	error = epsPutInstrument( eps, inst, par )
*
*	int epsPutInstrument( struct EPSdesc *, edit_spec *, inst_par * );
*
*   FUNCTION
*	Send the instrument parameters given in `par' to the instrument of
*	`eps' described in `inst'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- instrument whose parameters are to be set.
*	par		- pointer to a `inst_par' structure containing the
*			  values of the instrument parameters.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The instrument parameters are documented in "eps.h".
*	A few of the parameters are ignored, in particular the instrument
*	size.
*
*   SEE ALSO
*	eps.h, epsGetInstrument()
*
*****************************************************************************
*
*/
int epsPutInstrument(eps,inst,par)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which instrument? */
inst_par *par;			/* Instrument parameters */
{
	uchar MsgBuf[974];	/* Buffer containing the message
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
	MsgByte(CMD_PUT_INST);	/* Send instrument parameters */
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

	/* Construct the message. See eps.h for a somewhat more complete
	 * description of what the fields mean.
	 */
	MsgBufPtr = MsgBuf;
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	for (i = 0; i < 12; i++)	/* Name */
		/** Warning: if you send a character not in the set
		 ** [ *-+0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ],
		 ** the EPS will lock up.
		 **/
		Msg16(((ushort)par->name[i]) << 8);
	Msg16((ushort)(par->midi_chan) << 8);	/* MIDI channel (outbound) */
	Msg16(par->midi_prog << 8);	/* MIDI program number (outbound) */
	Msg16(par->midi_pres << 8);	/* MIDI pressure (outbound) */
	Msg16(par->size << 8);		/* Total instrument size (blocks) */
	Msg16(par->key_dest << 8);	/* Key destination */
	for (i = 0; i < 4; i++)		/* Bitmaps of patch layers */
		Msg16(par->patches[i] << 8);
	Msg16(par->down_layers << 8);	/* Bitmap of key down layers */
	Msg16(par->up_layers << 8);	/* Bitmap of key up layers */
	Msg16(par->patch_sel << 8);	/* Patch select (16+) */
	Msg16(0);			/* Unused */
	Msg16(par->id);			/* Instrument ID (16+, mostly) */
	Msg16(par->low_key << 8);	/* Key range: low key */
	Msg16(par->high_key << 8);	/* Key range: high key */
	Msg16(par->transpose << 8);	/* Transposition (in semitones) */
	for (i = 0; i < 8; i++)		/* Pitch table offsets */
	{
		Msg16((par->pitch_off[i]) & 0xff00);
		Msg16(((par->pitch_off[i]) & 0x00ff) << 8);
	}
	for (i = 0; i < 8; i++)		/* Layer offsets */
	{
		Msg16((par->layer_off[i]) & 0xff00);
		Msg16(((par->layer_off[i]) & 0x00ff) << 8);
	}
	for (i = 0; i < 128; i++)	/* Wavesample offsets */
	{
		Msg16((par->ws_off[i]) & 0xff00);
		Msg16(((par->ws_off[i]) & 0x00ff) << 8);
	}
	Msg16(par->eff_off & 0xffff);	/* Effect offset (16+) */
	for (i = 318; i <= 322; i++)	/* Unused */
		Msg16(0);
	MsgByte(0xf7);			/* End of SysEx */
	SendMsg(eps,974,MsgBuf);

	retval = epsRecvAck(eps);
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
