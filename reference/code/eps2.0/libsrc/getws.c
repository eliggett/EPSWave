/* GETWS.C
 * Get wavesample parameters.
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

/****** eps.lib/epsGetWS ******************************************
*
*   NAME   
*	epsGetWS -- get wavesample parameters
*
*   SYNOPSIS
*	error = epsGetWS( eps, inst, out )
*
*	int epsGetWS( struct EPSdesc *, edit_spec *, ws_par * );
*
*   FUNCTION
*	Get the parameters for the wavesample described in `inst'. The
*	results will be put in `out'. The parameters are described in
*	"eps.h".
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- wavesample whose parameters are to be returned.
*	out		- pointer to a `ws_par' structure whose fields will
*			  be filled with the wavesample parameters.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The fields of `out' are documented in "eps.h".
*	In case of error, the values of the fields in `out' are undefined.
*
*   SEE ALSO
*	eps.h, epsPutWS()
*
*****************************************************************************
*
*/
/* EPSGETWS
 * Get the wavesample described in 'inst'. The parameters are returned
 * in 'out'.
 * Returns 0 on no error, the last response received from the EPS, or a
 * negative code in case of error.
 */
int epsGetWS(eps,inst,out)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which instrument? */
ws_par *out;			/* Description will be put here */
{
	uchar MsgBuf[12];	/* Message to be sent out */
	uchar AnswerBuf[422];	/* Buffer containing the answer from the EPS. */
	uchar *MsgBufPtr = MsgBuf;	/* Pointer to MsgBuf */
	ulong sstart, send, lstart, lend;
	int i,retval,temp;

	/* Construct the message to be sent */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_GET_WS);	/* Request wavesample parameters */
	Msg12(inst->inst_num);	/* Instrument number */
	Msg12(inst->layer_num);	/* Layer number */
	Msg12(inst->ws_num);	/* Wavesample number */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);		/* Wait until EPS is ready */
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

	if ((retval = RecvMsg(eps,&sysexMsgType,422,AnswerBuf,SHORT_TIMEOUT))
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
	out->cp_num = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->cp_lay = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;

	/* Pitch Envelope */
	out->pitch_env.env_type = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	for (i = 0; i < 5; i++)
	{
		out->pitch_env.soft_lev[i] = E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	for (i = 0; i < 5; i++)
	{
		out->pitch_env.hard_lev[i] = E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	for (i = 0; i < 6; i++)
	{
		out->pitch_env.times[i] = E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	out->pitch_env.vel_switch = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->pitch_env.rel_bkpt = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->pitch_env.vel_sens = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->pitch_env.time_scal = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->pitch_env.mode = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;

	/* Filter envelope */
	out->filter_env.env_type = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	for (i = 0; i < 5; i++)
	{
		out->filter_env.soft_lev[i] = E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	for (i = 0; i < 5; i++)
	{
		out->filter_env.hard_lev[i] = E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	for (i = 0; i < 6; i++)
	{
		out->filter_env.times[i] = E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	out->filter_env.vel_switch = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->filter_env.rel_bkpt = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->filter_env.vel_sens = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->filter_env.time_scal = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->filter_env.mode = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;

	/* Amplitude envelope */
	out->amp_env.env_type = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	for (i = 0; i < 5; i++)
	{
		out->amp_env.soft_lev[i] = E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	for (i = 0; i < 5; i++)
	{
		out->amp_env.hard_lev[i] = E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	for (i = 0; i < 6; i++)
	{
		out->amp_env.times[i] = E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	out->amp_env.vel_switch = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->amp_env.rel_bkpt = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->amp_env.vel_sens = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->amp_env.time_scal = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->amp_env.mode = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;

	temp = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	out->root = temp >> 8;
	out->a_mod_curve = temp & 0xff;		/* (16+) */
	out->p_envamt = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->lfo_amt = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->rand_modamt = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->bend_rng = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->modsrc = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->finetune = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->modamt = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->filter_mode = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->fc1_cut = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->fc2_cut = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->fc1_kbd = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->fc2_kbd = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->fc1_filter = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->fc2_filter = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->fc1_modsrc = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->fc2_modsrc = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->fc1_modamt = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->fc2_modamt = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	temp = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	out->volume = temp >> 8;
	out->bus_select = temp & 0xff;		/* (16+) */
	temp = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	out->a_modsrc = temp >> 8;
	out->pan_modsrc = temp & 0xff;		/* (16+) */
	out->acc_a = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->acc_b = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->acc_c = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->acc_d = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	temp = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	if (eps->model == EPS_16PLUS)
		out->pan_pos = temp & 0xff;
	else
		out->pan_pos = temp >> 8;
	temp = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	out->a_modamt = temp >> 8;
	if (eps->model == EPS_16PLUS)
		out->pan_modamt = temp & 0xff;
	temp = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	out->lfo_wave = temp >> 8;
	if (eps->model == EPS_16PLUS)
		out->lfo_boost = temp & 0xff;
	temp = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	out->lfo_speed = temp >> 8;
	if (eps->model == EPS_16PLUS)
		out->lfo_rate_modamt = temp & 0xff;
	out->lfo_depth = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	temp = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	out->lfo_delay = temp >> 8;
	if (eps->model == EPS_16PLUS)
		out->lfo_modamt = temp & 0xff;
	temp = E16toi(MsgBufPtr);			MsgBufPtr += 3;
	out->lfo_modsrc = temp >> 8;
	if (eps->model == EPS_16PLUS)
		out->lfo_rate_modsrc = temp & 0xff;
	out->lfo_mode = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->randmod_freq = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->loopmode = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;

	/* Offsets:
	 * The next four sections receive the four offsets: sample start,
	 * sample end, loop start and loop end. The values are first
	 * stored in local temporary variables, which are then right-shifted
	 * by 9 and stored in 'out', so that 'out' contains the value
	 * displayed on the EPS's display.
	 *	Furthermore, the loop end has a fraction attached. This
	 * fraction is stored in out->lend_fract, as a number of 16ths of
	 * a sample.
	 *	The way the EPS sends offsets is really brain-damaged: an
	 * offset is a 32-bit quantity, so the EPS sends it as four bytes,
	 * one byte at a time; each of these bytes is the upper byte of a
	 * 16-bit quantity. If you look at the way 16-bit quantities are
	 * sent, you'll see that, because of MIDI limitations, they are sent
	 * as 3 MIDI data bytes.
	 *	Thus, to send a 32-bit offset, the EPS sends 96 bits total.
	 */

	for (sstart = 0L, i = 0; i < 4; i++)
	{
		sstart <<= 8;
		sstart |= E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	out->sstart_off = sstart >> 9;

	for (send = 0L, i = 0; i < 4; i++)
	{
		send <<= 8;
		send |= E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	out->send_off = send >> 9;

	for (lstart = 0L, i = 0; i < 4; i++)
	{
		lstart <<= 8;
		lstart |= E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	out->lstart_off = lstart >> 9;

	for (lend = 0L, i = 0; i < 4; i++)
	{
		lend <<= 8;
		lend |= E16toi(MsgBufPtr) >> 8;
		MsgBufPtr += 3;
	}
	out->lend_off = lend >> 9;
	out->lend_fract = (lend >> 5) & 0x000f;

	out->rate = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;
	out->low_range = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->high_range = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->sl_modsrc = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->sl_modamt = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->sl_modrng = E16toi(MsgBufPtr) >> 8;	MsgBufPtr += 3;
	out->mod_type = E16toi(MsgBufPtr) >> 8;		MsgBufPtr += 3;

	return(0);
}
