/* PUTWS.C
 * Put wavesample parameters.
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

/****** eps.lib/epsPutWS ******************************************
*
*   NAME   
*	epsPutWS -- send wavesample parameters to the EPS
*
*   SYNOPSIS
*	error = epsPutWS( eps, inst, par )
*
*	int epsPutWS( struct EPSdesc *, edit_spec *, ws_par * );
*
*   FUNCTION
*	Send the wavesample parameters given in `par' to the wavesample of
*	`eps' described in `inst'.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- wavesample whose parameters are to be set.
*	par		- pointer to a `ws_par' structure giving the
*			  parameter values.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	The parameters are documented in "eps.h".
*
*   SEE ALSO
*	eps.h, epsGetWS()
*
*****************************************************************************
*
*/
int epsPutWS(eps,inst,par)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which wavesample? */
ws_par *par;			/* Wavesample parameters */
{
	uchar MsgBuf[422];	/* Buffer containing the message
				 * to be sent to the EPS.
				 */
	uchar AnswerBuf[12];	/* Message containing the answer from
				 * the EPS.
				 */
	uchar *MsgBufPtr = MsgBuf;	/* Pointer to MsgBuf */
	ulong sstart, send, lstart, lend;
	int i,retval;

	/* Construct the message to be sent */
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_PUT_WS);	/* Send wavesample parameters */
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
		Msg16(par->name[i] << 8);
	Msg16(par->cp_num << 8);	/* Wavesample copy number */
	Msg16(par->cp_lay << 8);	/* Wavesample copy layer */

	/* Pitch envelope */
	Msg16(par->pitch_env.env_type << 8);
	for (i = 0; i < 5; i++)
		Msg16(par->pitch_env.soft_lev[i] << 8);
	for (i = 0; i < 5; i++)
		Msg16(par->pitch_env.hard_lev[i] << 8);
	for (i = 0; i < 6; i++)
		Msg16(par->pitch_env.times[i] << 8);
	Msg16(par->pitch_env.vel_switch << 8);
	Msg16(par->pitch_env.rel_bkpt << 8);
	Msg16(par->pitch_env.vel_sens << 8);
	Msg16(par->pitch_env.time_scal << 8);
	Msg16(par->pitch_env.mode << 8);

	/* Filter envelope */
	Msg16(par->filter_env.env_type << 8);
	for (i = 0; i < 5; i++)
		Msg16(par->filter_env.soft_lev[i] << 8);
	for (i = 0; i < 5; i++)
		Msg16(par->filter_env.hard_lev[i] << 8);
	for (i = 0; i < 6; i++)
		Msg16(par->filter_env.times[i] << 8);
	Msg16(par->filter_env.vel_switch << 8);
	Msg16(par->filter_env.rel_bkpt << 8);
	Msg16(par->filter_env.vel_sens << 8);
	Msg16(par->filter_env.time_scal << 8);
	Msg16(par->filter_env.mode << 8);

	/* Amplitude envelope */
	Msg16(par->amp_env.env_type << 8);
	for (i = 0; i < 5; i++)
		Msg16(par->amp_env.soft_lev[i] << 8);
	for (i = 0; i < 5; i++)
		Msg16(par->amp_env.hard_lev[i] << 8);
	for (i = 0; i < 6; i++)
		Msg16(par->amp_env.times[i] << 8);
	Msg16(par->amp_env.vel_switch << 8);
	Msg16(par->amp_env.rel_bkpt << 8);
	Msg16(par->amp_env.vel_sens << 8);
	Msg16(par->amp_env.time_scal << 8);
	Msg16(par->amp_env.mode << 8);

	Msg16((par->root << 8) |	/* Root key */
	       par->a_mod_curve);	/* Volume modulator crossfade fadecurve (16+) */
	Msg16(par->p_envamt << 8);	/* Pitch envelope amount */
	Msg16(par->lfo_amt << 8);	/* LFO amount */
	Msg16(par->rand_modamt << 8);	/* Random modulation amount */
	Msg16(par->bend_rng << 8);	/* Pitch wheel bend range */
	Msg16(par->modsrc << 8);	/* Modulation source */
	Msg16(par->finetune << 8);	/* Fine tune */
	Msg16(par->modamt << 8);	/* Modulation amount */
	Msg16(par->filter_mode << 8);	/* Filter mode */
	Msg16(par->fc1_cut << 8);	/* FC #1 cutoff */
	Msg16(par->fc2_cut << 8);	/* FC #2 cutoff */
	Msg16(par->fc1_kbd << 8);	/* FC #1 keyboard amount */
	Msg16(par->fc2_kbd << 8);	/* FC #2 keyboard amount */
	Msg16(par->fc1_filter << 8);	/* FC #1 filter envelope amount */
	Msg16(par->fc2_filter << 8);	/* FC #2 filter envelope amount */
	Msg16(par->fc1_modsrc << 8);	/* FC #1 modulation source */
	Msg16(par->fc2_modsrc << 8);	/* FC #2 modulation source */
	Msg16(par->fc1_modamt << 8);	/* FC #1 modulation amount */
	Msg16(par->fc2_modamt << 8);	/* FC #2 modulation amount */
	Msg16((par->volume << 8) |	/* Volume */
	       par->bus_select);	/* Output bus (16+) */
	Msg16((par->a_modsrc << 8) |	/* Amplitude modulation amount */
	       par->pan_modsrc);	/* Pan modulation source (16+) */
	Msg16(par->acc_a << 8);		/* Amplitude crossfade curve point A */
	Msg16(par->acc_b << 8);		/* Amplitude crossfade curve point B */
	Msg16(par->acc_c << 8);		/* Amplitude crossfade curve point C */
	Msg16(par->acc_d << 8);		/* Amplitude crossfade curve point D */
	Msg16((par->pan_pos << 8) |	/* Pan position (Classic) */
	       par->pan_pos);		/* Pan position (16+) */
	Msg16((par->a_modamt << 8) |	/* Amplitude modulation amount */
	       par->pan_modamt);	/* Pan modulation amount (16+) */
	Msg16((par->lfo_wave << 8) |	/* LFO waveform */
	       par->lfo_boost);		/* LFO boost switch (16+) */
	Msg16((par->lfo_speed << 8) |	/* LFO speed */
	       par->lfo_rate_modamt);	/* LFO rate modulation amount (16+) */
	Msg16(par->lfo_depth << 8);	/* LFO depth */
	Msg16((par->lfo_delay << 8) |	/* LFO delay time */
	       par->lfo_modamt);	/* LFO depth modulation amount (16+) */
	Msg16((par->lfo_modsrc << 8) |	/* LFO modulation source */
	       par->lfo_rate_modsrc);	/* LFO rate modulation source */
	Msg16(par->lfo_mode << 8);	/* LFO mode */
	Msg16(par->randmod_freq << 8);	/* Random modulator frequency */
	Msg16(par->loopmode << 8);	/* Loop mode */

	/* Offsets:
	 * The next four sections send the four offsets: sample start,
	 * sample end, loop start and loop end. The values are first
	 * stored in local temporary variables, which are then left-
	 * shifted by 9, since that's what the EPS expects to see.
	 *	Furthermore, the 32-bit temporary variable is chopped
	 * into four 8-bit chunks; each chunk is sent as a 16-bit value
	 * with the 8 important bits in the high 8 bits of the 16-bit
	 * value. This makes no sense whatsoever.
	 *	Also, the loop end has a fraction attached: this fraction
	 * takes 4 bits, and is placed after the loop end value (not
	 * including the left-shift of 9). Anyway, it's late, I can't
	 * explain it clearly, and you can just RTFS below.
	 */
	sstart = par->sstart_off << 9;		/* Sample start */
	Msg16((sstart & 0xff000000) >> 16);
	Msg16((sstart & 0x00ff0000) >> 8);
	Msg16( sstart & 0x0000ff00);
	Msg16((sstart & 0x000000ff) << 8);

	send = par->send_off << 9;		/* Sample end */
	Msg16((send & 0xff000000) >> 16);
	Msg16((send & 0x00ff0000) >> 8);
	Msg16( send & 0x0000ff00);
	Msg16((send & 0x000000ff) << 8);

	lstart = par->lstart_off << 9;		/* Loop start */
	Msg16((lstart & 0xff000000) >> 16);
	Msg16((lstart & 0x00ff0000) >> 8);
	Msg16( lstart & 0x0000ff00);
	Msg16((lstart & 0x000000ff) << 8);

	lend = ((par->lend_off << 4) | par->lend_fract) << 5;	/* Loop end */
	Msg16((lend & 0xff000000) >> 16);
	Msg16((lend & 0x00ff0000) >> 8);
	Msg16( lend & 0x0000ff00);
	Msg16((lend & 0x000000ff) << 8);

	Msg16(par->rate << 8);		/* Sample rate */
	Msg16(par->low_range << 8);	/* Key range - low key */
	Msg16(par->high_range << 8);	/* Key range - high key */
	Msg16(par->sl_modsrc << 8);	/* Start/loop modulation source */
	Msg16(par->sl_modamt << 8);	/* Start/loop modulation amount */
	Msg16(par->sl_modrng << 8);	/* Start/loop modulation range */
	Msg16(par->mod_type << 8);	/* Modulation type */
	Msg16(0);			/* Unused */
	MsgByte(0xf7);			/* End of SysEx */
	SendMsg(eps,422,MsgBuf);

	retval = epsRecvAck(eps);
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
