/* EPS_PROTOS.H
 * External declarations for the various EPS library routines.
 * ANSI prototypes are evil! If you want to turn these external declarations
 * into Pascal-style declarations, you'll have to look it up yourself.
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

extern char *eps_responses[];
extern CloseEPS();
extern EndPause();
extern int EPSInit();
extern int EPSTini();
extern int RecvMsg();
extern int SendMsg();
extern StartPause();
extern struct EPSdesc *OpenEPS();
extern int epsAddWSData();
extern int epsAuditionWS();
extern int epsClearWSData();
extern int epsCopyInstrument();
extern int epsCopyLayer();
extern int epsCopyWS();
extern int epsCopyWSData();
extern int epsCreateInstrument();
extern int epsCreateLayer();
extern int epsCreatePreset();
extern int epsCreateWS();
extern int epsCrossFadeLoop();
extern int epsDeleteInstrument();
extern int epsDeleteLayer();
extern int epsDeleteWS();
extern int epsFadeInWSData();
extern int epsFadeOutWSData();
extern int epsGetInstrument();
extern int epsGetLayer();
extern int epsGetParameter();
extern int epsGetPitchTable();
extern int epsGetWS();
extern int epsGetWSData();
extern int epsGetWSOverview();
extern int epsInvertWSData();
extern int epsMixWSData();
extern int epsNormalizeGain();
extern int epsPushButton();
extern int epsPutInstrument();
extern int epsPutLayer();
extern int epsPutParameter();
extern int epsPutPitchTable();
extern int epsPutWS();
extern int epsPutWSData();
extern int epsRecvAck();
extern int epsReplicateWSData();
extern int epsReverseWSData();
extern int epsScaleWSData();
extern int epsSendAck();
extern int epsTruncateWS();
extern int epsVolumeSmoothing();
extern int isleep();
