/* SCALEWSDATA.C
 * Scale wavesample data.
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

/****** eps.lib/epsScaleWSData ******************************************
*
*   NAME   
*	epsScaleWSData -- scale the data in a wavesample between two points
*
*   SYNOPSIS
*	error = epsScaleWSData( eps, inst, from, to, sfstart, sfs_fract,
*		sfend, sfe_fract, depth )
*
*	int epsScaleWSData( struct EPSdesc *, edit_spec *, ulong, ulong,
*		int, int, int, int );
*
*   FUNCTION
*	Scale the wavesample described in `inst', in the range `from'-`to',
*	based on a scaling ramp.
*	`sfstart', `sfs_fract', `sfend' and `sfe_fract' give the start and
*	end scale factors, as integer/fraction pairs.
*	`depth' gives the scale ramp depth.
*
*   INPUTS
*	eps		- descriptor for the EPS to send the command to.
*	inst		- wavesample to be scaled.
*	from		- data range start.
*	to		- data range end.
*	sfstart		- integer part of scale factor start point, [0..127].
*	sfs_fract	- fractional part of scale factor start point,
*			  [0..127].
*	sfend		- integer part of scale factor end point, [0..127].
*	sfe_fract	- fractional part of scale factor end point,
*			  [0..127].
*	depth		- scale ramp depth, [0..6], 0=3.0 dB, 1=3.5 dB, ...
*			  6=6.0 dB.
*
*   RESULT
*	error - zero for success, a positive number giving the last response
*		returned by the EPS, or a negative number in case of library
*		error.
*
*   NOTES
*	I don't understand what this does.
*	Not thoroughly tested.
*	The Ensoniq documentation says that `sfstart' and `sfend' are in
*	the range [0..255], and that `sfs_fract' and `sfe_fract' are in the
*	range [0..99]. It lies. They are all in the range [0..127].
*
*****************************************************************************
*
*/
int epsScaleWSData(eps,inst,from,to,sfstart,sfs_fract,sfend,sfe_fract,depth)
struct EPSdesc *eps;		/* Which EPS? */
edit_spec *inst;		/* Which wavesample? */
ulong from, to;			/* Range */
int sfstart, sfs_fract;		/* Integer and fractional part of scale
				 * factor start point.
				 */
int sfend, sfe_fract;		/* Integer and fractional part of scale
				 * factor end point.
				 */
int depth;			/* Scale ramp depth */
{
	uchar MsgBuf[30];	/* Buffer containing the message
				 * to be sent to the EPS.
				 */
	uchar AnswerBuf[12];	/* Message containing the answer from
				 * the EPS.
				 */
	uchar *MsgBufPtr;	/* Pointer to MsgBuf */
	long sfs, sfe;		/* Scale factor start, end. Temp vars */
	int i,retval;

	/* Construct the message to be sent */
	MsgBufPtr = MsgBuf;
	MsgByte(0xf0);		/* SysEx packet head */
	MsgByte(0x0f);
	MsgByte(0x03);
	MsgByte(eps->chan);
	MsgByte(CMD_SCALE_WSDATA);	/* Scale wavesample data */
	Msg12(inst->inst_num);	/* Instrument number */
	Msg12(inst->layer_num);	/* Layer number */
	Msg12(inst->ws_num);	/* Wavesample number */
	/* Wavesample offsets are 20-bit quantities, so they are sent
	 * as two 12-bit quantities.
	 */
	Msg12(from >> 12);	/* High half of 'from' */
	Msg12(from & 0x0fffL);	/* Low half of 'from' */
	Msg12(to >> 12);	/* High half of 'to' */
	Msg12(to & 0x0fffL);	/* Low half of 'to' */
	sfs = (sfstart << 7) | sfs_fract;
	Msg12(sfs >> 12);	/* High half of 'sfs' */
	Msg12(sfs & 0x0fffL);	/* Low half of 'sfs' */
	sfe = (sfend << 7) | sfe_fract;
	Msg12(sfe >> 12);	/* High half of 'sfe' */
	Msg12(sfe & 0x0fffL);	/* Low half of 'sfe' */
	Msg12(depth);		/* Scale ramp depth */
	MsgByte(0xf7);		/* SysEx packet tail */

	/* Send the message */
	EndPause(eps);			/* Wait until the EPS is ready */
	SendMsg(eps,30,MsgBuf);

	retval = epsRecvAck(eps);	/* Get an ACK from the EPS */
	StartPause(eps,BREATHER);	/* Start waiting until EPS is ready */

	return(retval);
}
