/* EPS.H
 * EPS-specific stuff.
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

/* Define the architecture on which this is running. Uncomment at most
 * one of the following.
 */
#ifndef AMIGA
#define AMIGA	/**/		/* For Amigas */
#endif
/*#define MSDOS	/**/		/* For PC-type machines */
/*#define MAC	/**/		/* For Macintoshes */
/*#define UNIX	/**/		/* For Unix boxes */

#ifdef AMIGA
#include <midi/midibase.h>
#endif

#define MIN(x,y)	((x)<(y)?(x):(y))
#define MAX(x,y)	((x)>(y)?(x):(y))

/* EPS types */
#define GO_FIGURE	0	/* Type unknown. Try to figure it out */
#define EPS_CLASSIC	1	/* EPS "Classic" */
#define EPS_16PLUS	0xffff	/* EPS 16+ */

/* Timeouts */
#define BREATHER	  200	/* Wait 150 ms between commands, otherwise the
				 * EPS barfs.
				 */
#define SHORT_TIMEOUT	 2000	/* Short timeout: 2000 ms */
#define LONG_TIMEOUT	30000	/* Long timeout: 30000 ms */

/* Transport codes. Currently, the only one used is TRANS_MIDI */
#define TRANS_MIDI	0	/* MIDI */
#define TRANS_SCSI	1	/* SCSI */

/* Command codes */
#define CMD_RESPONSE	0x01	/* Response to a received command */
#define CMD_CANCEL	0x02	/* Cancel current command */
#define CMD_GET_INST	0x03	/* Request for instrument parameters */
#define CMD_GET_LAYER	0x04	/* Request for layer parameters */
#define CMD_GET_WS	0x05	/* Request for wavesample parameters */
#define CMD_GET_WSDATA	0x06	/* Request for wavesample data */
#define CMD_GET_PITCHTAB	0x07	/* Request for pitch table data */
#define CMD_GET_PARAM	0x08	/* Request for a parameter value */
#define CMD_GET_WSOVER	0x0a	/* Request for wavesample data overview */
#define CMD_PUT_INST	0x0c	/* Instrument parameter block dump */
#define CMD_PUT_LAYER	0x0d	/* Layer parameter block dump */
#define CMD_PUT_WS	0x0e	/* Wavesample parameter block dump */
#define CMD_PUT_WSDATA	0x0f	/* Wavesample data block dump */
#define CMD_PUT_PITCHTAB	0x10	/* Pitch table data block dump */
#define CMD_PUT_PARAM	0x11	/* Update a parameter value */
#define CMD_PUT_WSOVER	0x13	/* Wavesample data overview dump */
#define CMD_SAVE_INST	0x14	/* Save instrument (16+) */
#define CMD_CRE_INST	0x15	/* Create a new instrument */
#define CMD_DEL_INST	0x1c	/* Delete an instrument */
#define CMD_CPY_INST	0x12	/* Copy an instrument */
#define CMD_CRE_LAYER	0x16	/* Define a new layer */
#define CMD_DEL_LAYER	0x17	/* Undefine a layer */
#define CMD_CPY_LAYER	0x18	/* Copy a layer */
#define CMD_CRE_WS	0x19	/* Create a new wavesample */
#define CMD_DEL_WS	0x1a	/* Undefine a wavesample */
#define CMD_CPY_WS	0x1b	/* Copy wavesample parameters */
#define CMD_AUDITION	0x1d	/* Audition old and new wavesamples */
#define CMD_BUTTON	0x40	/* Send a virtual button press */
#define CMD_CRE_PRESET	0x44	/* Create a preset */
#define CMD_TRUNC_WS	0x1e	/* Delete unused wavesample data */
#define CMD_CLR_WSDATA	0x1f	/* Clear wavesample data */
#define CMD_CPY_WSDATA	0x20	/* Copy wavesample data */
#define CMD_ADD_WSDATA	0x21	/* Add source data to destination */
#define CMD_SCALE_WSDATA	0x22	/* Scale data */
#define CMD_INV_WSDATA	0x23	/* Invert wavesample data */
#define CMD_REV_WSDATA	0x24	/* Reverse wavesample data */
#define CMD_REP_WSDATA	0x25	/* Append wavesample data to itself */
#define CMD_CF_LOOP	0x26	/* Make a cross fade loop */
#define CMD_FIN_WSDATA	0x27	/* Fade in the wavesample data */
#define CMD_FOUT_WSDATA	0x28	/* Fade out the wavesample data */
#define CMD_REVCF_LOOP	0x29	/* Make a reverse cross fade loop */
#define CMD_ENSCF_LOOP	0x2a	/* Make an ensemble cross fade loop */
#define CMD_BOWCF_LOOP	0x2b	/* Make a bowtie cross fade loop */
#define CMD_LEN_LOOP	0x2c	/* Lengthen loop */
#define CMD_MIX_WSDATA	0x2d	/* Mix source wavesample data into dest */
#define CMD_SPL_WSDATA	0x2e	/* Merge/splice wavedata */
#define CMD_VOL_SMOOTH	0x2f	/* Volume smoothing */
#define CMD_NORM_GAIN	0x41	/* Normalize gain */
#define CMD_SYN_LOOP	0x42	/* Create a synthesized loop */
#define CMD_BIDCF_LOOP	0x43	/* Make a bidirectional cross fade loop */

/* Response codes */
#define ACK		0x00	/* Acknowledgement */
#define WAIT		0x01	/* Wait. Set timeout counter to 30 seconds */
#define INS_DISK	0x02	/* Insert system disk */
#define BAD_PARAMNUM	0x03	/* Invalid parameter number */
#define BAD_PARAMVAL	0x04	/* Invalid parameter value */
#define BAD_INST	0x05	/* Invalid instrument */
#define BAD_LAYER	0x06	/* Invalid layer */
#define LAYER_INUSE	0x07	/* Layer in use */
#define BAD_WS		0x08	/* Invalid wavesample */
#define WS_INUSE	0x09	/* Wavesample in use */
#define BAD_WSRNG	0x0a	/* Invalid wavesample data range */
#define FNOTFOUND	0x0b	/* File not found */
#define NOMEM		0x0c	/* Memory full */
#define INST_INUSE	0x0d	/* Instrument in use */
#define NOLAYERS	0x0e	/* No more layers */
#define NOWS		0x0f	/* No more wavesamples */
/* 0x10: reserved */
#define WS_ISCOPY	0x11	/* Wavesample is a copy */
#define BIGZONE		0x12	/* Zone too big */
#define STOPSEQ		0x13	/* Sequencer must be stopped */
#define DISK_IO		0x14	/* Disk access in progress */
#define DISK_FULL	0x15	/* Disk full */
#define BIGLOOP		0x16	/* Loop is too long */
#define NAK		0x17	/* Negative acknowledgement */
#define NOLAYER		0x18	/* No layer edit */
#define NOPITCH		0x19	/* No more pitch tables */
#define CFLEN_0		0x1a	/* Cross fade length is 0 */
#define CFLEN_50	0x1b	/* Cross fade length is greater than 50% */
#define LOOPS_CLOSE	0x1c	/* Loop start too close to sample start */
#define LOOPE_CLOSE	0x1d	/* Loop end too close to sample end */
#define QUIET		0x1e	/* Quiet layer */

/* Button codes */
#define BUT_INST_1	0x00	/* Instrument 1 */
#define BUT_INST_2	0x01	/* Instrument 2 */
#define BUT_INST_3	0x02	/* Instrument 3 */
#define BUT_INST_4	0x03	/* Instrument 4 */
#define BUT_INST_5	0x04	/* Instrument 5 */
#define BUT_INST_6	0x05	/* Instrument 6 */
#define BUT_INST_7	0x06	/* Instrument 7 */
#define BUT_INST_8	0x07	/* Instrument 8 */
#define BUT_SAMPLE	0x10	/* Sample */
#define BUT_COMMAND	0x11	/* Command mode */
#define BUT_KEY_RANGE	0x12	/* Key Range (instrument or wavesample) */
#define BUT_EFFECT	0x12	/* Effect . Select . Bypass (16+) */
#define BUT_EDIT	0x13	/* Edit mode */
#define BUT_LOAD	0x14	/* Load mode */
#define BUT_MIDI	0x15	/* MIDI */
#define BUT_SEQSONG	0x16	/* Seq . Song */
#define BUT_INSTRUMENT	0x17	/* Instrument */
#define BUT_SYSTEM	0x18	/* System */
#define BUT_UARROW	0x20	/* Up arrow (increment) */
#define BUT_DARROW	0x21	/* Down arrow (decrement) */
#define BUT_LARROW	0x22	/* Left arrow (scroll left) */
#define BUT_NO		0x23	/* Cancel . No */
#define BUT_RARROW	0x24	/* Right arrow (scroll right) */
#define BUT_YES		0x25	/* Enter . Yes */
#define BUT_TRACK	0x30	/* 0 . Track */
#define BUT_0		0x30
#define BUT_ENV1	0x31	/* 1 . Env 1 */
#define BUT_1		0x31
#define BUT_ENV2	0x32	/* 2 . Env 2 */
#define BUT_2		0x32
#define BUT_ENV3	0x33	/* 3 . Env 3 */
#define BUT_3		0x33
#define BUT_PITCH	0x34	/* 4 . Pitch */
#define BUT_4		0x34
#define BUT_FILTER	0x35	/* 5 . Filter */
#define BUT_5		0x35
#define BUT_AMP		0x36	/* 6 . Amp */
#define BUT_6		0x36
#define BUT_LFO		0x37	/* 7 . LFO */
#define BUT_7		0x37
#define BUT_WAVE	0x38	/* 8 . Wave */
#define BUT_8		0x38
#define BUT_LAYER	0x39	/* 9 . Layer */
#define BUT_9		0x39

/* PARAMETER NUMBERS
 * These parameter numbers are the ones you should give to 'get_param()'
 * and 'put_param()'. If anyone is interested, the high byte of the
 * parameter number is the page number, and the low byte is the number
 * of the parameter within the page.
 * With the EPS 16+, Ensoniq, in their finite wisdom, decided to rearrange
 * a lot of the parameters, notably on the system and MIDI pages (which got
 * merged into a System/MIDI page).
 */
/* System parameters (Classic) */
#define PSC_FSBLKS	0x0d00	/* Free system blocks */
#define PSC_FDBLKS	0x0d01	/* Free disk blocks */
#define PSC_MTUNE	0x0d02	/* Master tune */
#define PSC_BENDRNG	0x0d03	/* Global bend range */
#define PSC_TCHSENS	0x0d04	/* Touch sensitivity */
#define PSC_MODPMODE	0x0d05	/* Mod pedal mode */
#define PSC_SUSPMODE	0x0d06	/* Sustain pedal mode */
#define PSC_AUXPMODE	0x0d07	/* Aux pedal mode */
#define PSC_AUTOLOOP	0x0d08	/* Autoloop switch */

/* System parameters (16+) */
#define PS16_FSBLKS	0x0d00	/* Free system blocks */
#define PS16_FDBLKS	0x0d0a	/* Free disk blocks */
#define PS16_MTUNE	0x0d01	/* Master tune */
#define PS16_BENDRNG	0x0d0b	/* Global bend range */
#define PS16_TCHSENS	0x0d0c	/* Touch sensitivity curve */
#define PS16_MODPMODE	0x0d02	/* Foot pedal mode */
#define PS16_SUSPMODE	0x0d0d	/* Sustain footswitch mode */
#define PS16_AUXPMODE	0x0d0e	/* Aux footswitch mode */
#define PS16_AUTOLOOP	0x0d03	/* Autoloop finding enable

/* This next section is an attempt at merging the Classic and 16+
 * system parameters. I don't like it any more than you do.
 */
#define PS_FSBLKS(e)	(((e)->model)==EPS_16PLUS?PS16_FSBLKS:PSC_FSBLKS)
#define PS_FDBLKS(e)	(((e)->model)==EPS_16PLUS?PS16_FDBLKS:PSC_FDBLKS)
#define PS_MTUNE(e)	(((e)->model)==EPS_16PLUS?PS16_MTUNE:PSC_MTUNE)
#define PS_BENDRNG(e)	(((e)->model)==EPS_16PLUS?PS16_BENDRNG:PSC_BENDRNG)
#define PS_TCHSENS(e)	(((e)->model)==EPS_16PLUS?PS16_TCHSENS:PSC_TCHSENS)
#define PS_MODPMODE(e)	(((e)->model)==EPS_16PLUS?PS16_MODPMODE:PSC_MODPMODE)
#define PS_SUSPMODE(e)	(((e)->model)==EPS_16PLUS?PS16_SUSPMODE:PSC_SUSPMODE)
#define PS_AUXPMODE(e)	(((e)->model)==EPS_16PLUS?PS16_AUXPMODE:PSC_AUXPMODE)
#define PS_AUTOLOOP(e)	(((e)->model)==EPS_16PLUS?PS16_AUTOLOOP:PSC_AUTOLOOP)

/* MIDI parameters (Classic) */
#define PMC_BASE	0x0c00	/* Base channel */
#define PMC_XMITMODE	0x0c01	/* Transmit mode */
#define PMC_CHPRMODE	0x0c02	/* Base channel pressure mode */
#define PMC_INMODE	0x0c03	/* MIDI IN mode */
#define PMC_CTRLENBL	0x0c04	/* Controller enable */
#define PMC_SYSXENBL	0x0c05	/* SysEx enable */
#define PMC_PROGENBL	0x0c06	/* Program change enable */
#define PMC_SPOSENBL	0x0c07	/* Song position enable */
#define PMC_XCTLENBL	0x0c08	/* XCTRL enable */

/* MIDI parameters (16+) */
#define PM16_BASE	0x0d05	/* MIDI base channel */
#define PM16_XMITMODE	0x0d06	/* MIDI transmit mode */
#define PM16_CHPRMODE	0x0d0a	/* Base channel pressure mode */
#define PM16_INMODE	0x0d07	/* MIDI in mode */
#define PM16_CTRLENBL	0x0d0b	/* MIDI controllers enable */
#define PM16_SYSXENBL	0x0d0c	/* MIDI SysEx enable */
#define PM16_PROGENBL	0x0d08	/* MIDI program change enable */
#define PM16_SPOSENBL	0x0d0d	/* MIDI song select enable */
#define PM16_XCTLENBL	0x0d09	/* MIDI XCTRL controller number */
#define PM16_MCTLENBL	0x0d0e	/* Multi controllers enable */

/* This next section is an attempt at merging the Classic and 16+
 * MIDI parameters. I don't like it any more than you do.
 */
#define PM_BASE(e)	(((e)->model)==EPS_16PLUS?PM16_BASE:PMC_BASE)
#define PM_XMITMODE(e)	(((e)->model)==EPS_16PLUS?PM16_XMITMODE:PMC_XMITMODE)
#define PM_CHPRMODE(e)	(((e)->model)==EPS_16PLUS?PM16_CHPRMODE:PMC_CHPRMODE)
#define PM_INMODE(e)	(((e)->model)==EPS_16PLUS?PM16_INMODE:PMC_INMODE)
#define PM_CTRLENBL(e)	(((e)->model)==EPS_16PLUS?PM16_CTRLENBL:PMC_CTRLENBL)
#define PM_SYSXENBL(e)	(((e)->model)==EPS_16PLUS?PM16_SYSXENBL:PMC_SYSXENBL)
#define PM_PROGENBL(e)	(((e)->model)==EPS_16PLUS?PM16_PROGENBL:PMC_PROGENBL)
#define PM_SPOSENBL(e)	(((e)->model)==EPS_16PLUS?PM16_SPOSENBL:PMC_SPOSENBL)
#define PM_XCTLENBL(e)	(((e)->model)==EPS_16PLUS?PM16_XCTLENBL:PMC_XCTLENBL)
#define PM_MCTLENBL(e)	(((e)->model)==EPS_16PLUS?PM16_MCTLENBL:PMC_MCTLENBL)

/* Sequence/Song parameters (16+) */
#define PQ_TEMPO	0x0b02	/* Tempo */
#define PQ_LOOP		0x0b03	/* Loop enable */
#define PQ_CLKSRC	0x0b04	/* Clock source */
#define PQ_CLIMODE	0x0b05	/* Click mode */
#define PQ_CLINVAL	0x0b0b	/* Click note value */
#define PQ_CLIVOL	0x0b06	/* Click volume */
#define PQ_CLIPAN	0x0b07	/* Click pan */
#define PQ_CLIOBUS	0x0b0e	/* Click output bus */
#define PQ_SEQCMODE	0x0b08	/* Seq countoff mode */
#define PQ_RECMODE	0x0b09	/* Record mode */
#define PQ_RECSRC	0x0b0d	/* Record source */

/* Track parameters (16+) */
#define PT_SEQGOTO	0x0000	/* Sequence goto bar */
#define PT_SNGGOTO	0x0001	/* Song goto step */
#define PT_SEQTSTAT	0x0000	/* Sequence track status (?) */
#define PT_SNGTSTAT	0x0003	/* Song track status */
#define PT_TKMIX	0x0001	/* Track mix */
#define PT_TKPAN	0x0002	/* Track pan */
#define PT_TKOUTBUS	0x0004	/* Track output bus */
#define PT_EFFCTRL	0x0005	/* Effect control enable */
#define PT_MUIMCHAN	0x0006	/* Multi-in MIDI channel */

/* Instrument parameters */
#define PI_PATCH	0x0a00	/* Patch */
#define PI_KDLAYS	0x0a01	/* Key down layers */
#define PI_KULAYS	0x0a02	/* Key up layers */
#define PI_PTSELMODE	0x0a09	/* Current patch select mode (16+) */
#define PI_CHAN		0x0a03	/* MIDI out channel */
#define PI_PROG		0x0a04	/* MIDI out program */
#define PI_PRESMODE	0x0a05	/* Pressure mode */
#define PI_INSTSIZE	0x0a07	/* Instrument size */
#define PI_SENDKEYS	0x0a06	/* Send keys to */
#define PI_RNGLOW	0x0a0a	/* Range low key */
#define PI_RNGHIGH	0x0a0b	/* Range high key */
#define PI_XPOSOCT	0x0a0c	/* Transpose amount: octave */
#define PI_XPOSSEMI	0x0a0d	/* Transpose amount: semitone */
#define PI_NAME		0x0a08	/* Instrument name (16+) */

/* Layer parameters */
#define PL_GLIDMODE	0x0900	/* Glide mode */
#define PL_GLIDTIME	0x0901	/* Glide time */
#define PL_LEGLAY	0x0902	/* Legato layer */
#define PL_VELLOW	0x0903	/* Velocity low */
#define PL_VELHIGH	0x090a	/* Velocity high */
#define PL_PTAB		0x0904	/* Pitch table */
#define PL_DELAY	0x0906	/* Delay time (16+) */
#define PL_DMODBYV	0x0907	/* Delay mod by velocity amount (16+) */
#define PL_RSTRKDT	0x0908	/* Restrike decay time (16+) */
#define PL_NAME		0x0905	/* Layer name (16+) */

/* Wavesample parameters */
#define PW_LOOPMODE	0x0800	/* Loop mode */
#define PW_LOOPMTYP	0x0806	/* Loop mod type */
#define PW_LOOPMSRC	0x0807	/* Loop mod source */
#define PW_LOOPMAMT1	0x0808	/* Loop mod amount 1 */
#define PW_LOOPMAMT2	0x0809	/* Loop mod amount 2 */
#define PW_WDSTART	0x0815	/* Wavedata start */
#define PW_WDEND	0x0816	/* Wavedata end */
#define PW_WDLSTART	0x0817	/* Loop start */
#define PW_WDLEND	0x0818	/* Loop end */
#define PW_WDLENDFR	0x080a	/* Loop end fractional */
#define PW_KRNGLOW	0x080b	/* Key range low */
#define PW_KRNGHIGH	0x080c	/* Key range high */
#define PW_LOOPPOS	0x0819	/* Loop position */
#define PW_SMPLRATE	0x080d	/* Sample rate */
#define PW_SSTART	0x0801	/* Sample start (%) (16+) */
#define PW_SEND		0x0802	/* Sample end (%) (16+) */
#define PW_LSTART	0x0803	/* Loop start (%) (16+) */
#define PW_LEND		0x0804	/* Loop end (%) (16+) */
#define PW_LPOS		0x0805	/* Loop position (%) (16+) */

/* Envelope 1 parameters */
#define PE1_TYPE	0x0100	/* Envelope type */
#define PE1_L0H		0x0101	/* Level 0 hard */
#define PE1_L0S		0x0102	/* Level 0 soft */
#define PE1_L1H		0x010b	/* Level 1 hard */
#define PE1_L1S		0x010e	/* Level 1 soft */
#define PE1_L2H		0x010c	/* Level 2 hard */
#define PE1_L2S		0x0110	/* Level 2 soft */
#define PE1_L3H		0x010d	/* Level 3 hard */
#define PE1_L3S		0x0111	/* Level 3 soft */
#define PE1_L4H		0x010e	/* Level 4 hard */
#define PE1_L4S		0x0112	/* Level 4 soft */
#define PE1_T1		0x0103	/* Time 1 */
#define PE1_T2		0x0113	/* Time 2 */
#define PE1_T3		0x0114	/* Time 3 */
#define PE1_T4		0x0115	/* Time 4 */
#define PE1_T5		0x0116	/* Time 5 */
#define PE1_2RELT	0x0104	/* 2nd release time */
#define PE1_2RELL	0x0117	/* 2nd release level */
#define PE1_ATTVEL	0x0105	/* Attack time velocity */
#define PE1_KBDSCAL	0x0106	/* Keyboard scaling */
#define PE1_SVEL	0x0107	/* Soft velocity on/off */
#define PE1_ENVMODE	0x0108	/* Envelope mode */

/* Envelope 2 parameters */
#define PE2_TYPE	0x0200	/* Envelope type */
#define PE2_L0H		0x0201	/* Level 0 hard */
#define PE2_L0S		0x0202	/* Level 0 soft */
#define PE2_L1H		0x020b	/* Level 1 hard */
#define PE2_L1S		0x020e	/* Level 1 soft */
#define PE2_L2H		0x020c	/* Level 2 hard */
#define PE2_L2S		0x0210	/* Level 2 soft */
#define PE2_L3H		0x020d	/* Level 3 hard */
#define PE2_L3S		0x0211	/* Level 3 soft */
#define PE2_L4H		0x020e	/* Level 4 hard */
#define PE2_L4S		0x0212	/* Level 4 soft */
#define PE2_T1		0x0203	/* Time 1 */
#define PE2_T2		0x0213	/* Time 2 */
#define PE2_T3		0x0214	/* Time 3 */
#define PE2_T4		0x0215	/* Time 4 */
#define PE2_T5		0x0216	/* Time 5 */
#define PE2_2RELT	0x0204	/* 2nd release time */
#define PE2_2RELL	0x0217	/* 2nd release level */
#define PE2_ATTVEL	0x0205	/* Attack time velocity */
#define PE2_KBDSCAL	0x0206	/* Keyboard scaling */
#define PE2_SVEL	0x0207	/* Soft velocity on/off */
#define PE2_ENVMODE	0x0208	/* Envelope mode */

/* Envelope 3 parameters */
#define PE3_TYPE	0x0300	/* Envelope type */
#define PE3_L0H		0x0301	/* Level 0 hard */
#define PE3_L0S		0x0302	/* Level 0 soft */
#define PE3_L1H		0x030b	/* Level 1 hard */
#define PE3_L1S		0x030e	/* Level 1 soft */
#define PE3_L2H		0x030c	/* Level 2 hard */
#define PE3_L2S		0x0310	/* Level 2 soft */
#define PE3_L3H		0x030d	/* Level 3 hard */
#define PE3_L3S		0x0311	/* Level 3 soft */
#define PE3_L4H		0x030e	/* Level 4 hard */
#define PE3_L4S		0x0312	/* Level 4 soft */
#define PE3_T1		0x0303	/* Time 1 */
#define PE3_T2		0x0313	/* Time 2 */
#define PE3_T3		0x0314	/* Time 3 */
#define PE3_T4		0x0315	/* Time 4 */
#define PE3_T5		0x0316	/* Time 5 */
#define PE3_2RELT	0x0304	/* 2nd release time */
#define PE3_2RELL	0x0317	/* 2nd release level */
#define PE3_ATTVEL	0x0305	/* Attack time velocity */
#define PE3_KBDSCAL	0x0306	/* Keyboard scaling */
#define PE3_SVEL	0x0307	/* Soft velocity on/off */
#define PE3_ENVMODE	0x0308	/* Envelope mode */

/* Pitch parameters */
#define PP_ROOT		0x0401	/* Root key */
#define PP_FINETUNE	0x040a	/* Fine tune */
#define PP_LFOAMT	0x0402	/* LFO amount */
#define PP_ENV1AMT	0x0403	/* Envelope 1 amount */
#define PP_RNDFREQ	0x0405	/* Random frequency */
#define PP_RNDAMT	0x040c	/* Random amount */
#define PP_BENDRNG	0x0406	/* Bend range */
#define PP_MODSRC	0x0407	/* Modulation source */
#define PP_MODAMT	0x040b	/* Modulation amount */
#define PP_KEYLOW	0x040b	/* WS key range low */
#define PP_KEYHIGH	0x040c	/* WS key range high */

/* Filter parameters */
#define PF_MODE		0x0500	/* Filter mode */
#define PF_1CUTOFF	0x0501	/* Filter 1 cutoff */
#define PF_2CUTOFF	0x050b	/* Filter 2 cutoff */
#define PF_1E2AMT	0x0502	/* Filter 1 envelope 2 amount */
#define PF_2E2AMT	0x050c	/* Filter 2 envelope 2 amount */
#define PF_1KBDAMT	0x0503	/* Filter 1 keyboard amount */
#define PF_2KBDAMT	0x050d	/* Filter 2 keyboard amount */
#define PF_1MODSRC	0x0507	/* Filter 1 modulation source */
#define PF_1MODAMT	0x050e	/* Filter 1 modulation amount */
#define PF_2MODSRC	0x0508	/* Filter 2 modulation source */
#define PF_2MODAMT	0x050f	/* Filter 2 modulation amount */

/* Volume parameters */
#define PV_WSVOL	0x0601	/* Wavesample volume */
#define PV_PAN		0x0602	/* Pan */
#define PV_PANMODSRC	0x0608	/* Pan modulation source (16+) */
#define PV_PANMODAMT	0x060d	/* Pan modulation amount (16+) */
#define PV_MODA		0x0603	/* Modulation A */
#define PV_MODB		0x060b	/* Modulation B */
#define PV_MODC		0x0604	/* Modulation C */
#define PV_MODD		0x060c	/* Modulation D */
#define PV_MODSRC	0x0607	/* Volume modulation source */
#define PV_MODAMT	0x060a	/* Volume modulation amount */
#define PV_MODCFCRV	0x0605	/* Vol mod crossfade fadecurve (16+) */
#define PV_BOOST	0x0606	/* Boost (16+) */
#define PV_OUTBUS	0x0609	/* Output bus (16+) */

/* LFO parameters */
#define PLFO_WAVE	0x0701	/* LFO wave */
#define PLFO_SPEED	0x0702	/* LFO speed */
#define PLFO_DEPTH	0x0703	/* LFO depth */
#define PLFO_DELAY	0x0704	/* LFO delay */
#define PLFO_MODE	0x0705	/* LFO mode */
#define PLFO_DMODSRC	0x0707	/* LFO depth modulation source */
#define PLFO_DMODAMT	0x070a	/* LFO depth modulation amount (16+) */
#define PLFO_RMODSRC	0x0708	/* LFO rate modulation source (16+) */
#define PLFO_RMODAMT	0x070b	/* LFO rate modulation amount (16+) */

/* Edit parameters */
#define PED_INST	0x0e00	/* Instrument */
#define PED_LAY		0x0e01	/* Layer */
#define PED_WS		0x0e02	/* Wavesample */

/* These next few #defines make it easier to build messages to be sent
 * to 'SendMsg()'. They assume that there is a char *MsgBufPtr that points
 * to the next byte to be filled in in the message buffer.
 */
#define MsgByte(b)	*MsgBufPtr++=(b)	/* Add a byte */
/* GCC will bitch about the next two #defines. Ignore it. */
#define Msg12(n)	{*MsgBufPtr++=(uchar)(((n) >> 6) & 0x3f);\
			*MsgBufPtr++=(uchar)((n) & 0x3f);}	/* Add a 12-bit number */
#define Msg16(n)	{*MsgBufPtr++=(uchar)(((n) >> 12) & 0x0f);\
			*MsgBufPtr++=(uchar)(((n) >> 6) & 0x3f);\
			*MsgBufPtr++=(uchar)((n) & 0x3f);}	/* Add a 16-bit number */

/* These next two #defines convert 12- and 16-bit numbers from EPS's
 * brain-damaged format to the corresponding integers. In both, 'p' is
 * a char * that points to the first byte of the number.
 */
#define E12toi(p)	(((p)[0] << 6) | ((p)[1]))
#define E16toi(p)	(((p)[0] << 12) | ((p)[1] << 6) | ((p)[2]))

/* Syntactic-sugar typedefs */
typedef unsigned char uchar;
typedef unsigned short ushort;
typedef unsigned long ulong;

/* EPSDESC
 * EPS descriptor. This structure can uniquely identify the EPS that you
 * want to talk to.
 */
struct EPSdesc {
	int model;			/* Model, e.g., EPS_CLASSIC */
	int os_ver;			/* Three (currently unused) variables */
	int os_rev;			/* giving the OS version, revision */
	int os_patch;			/* and patch level */
	uchar chan;			/* MIDI channel */
	uchar last_response;		/* Last response received from EPS */
	int (*change_state)();		/* Stub for things to do when things
					 * happen.
					 */
	int transport;			/* Transport layer. Currently always
					 * TRANS_MIDI
					 */
	struct {			/* Any information necessary for
					 * SCSI transfer. Currently unused.
					 */
		int unit;
	} scsi;
	char *UserData;			/* Anything else */
#ifdef AMIGA
	struct MSource *src;		/* Source */
	struct MDest *dest;		/* Destination */
	struct MRoute *outbound;	/* Path to MIDI port */
	struct MRoute *inbound;		/* Path from MIDI port */
	struct timerequest *TimeReq;	/* Timer requests for alarm */
#endif	/* AMIGA */
};

/* NEWEPS
 * This structure is for use with `OpenEPS()'. It contains fields
 * that are to be filled in by the caller, to uniquely identify
 * the EPS in question.
 * I don't think there's any need for any system-dependent data, but
 * I could be wrong, of course.
 */
struct NewEPS {
	int model;			/* Model, e.g., EPS_CLASSIC */
	int os_ver;			/* Three (currently unused) variables */
	int os_rev;			/* giving the OS version, revision */
	int os_patch;			/* and patch level */
	uchar chan;			/* MIDI channel */
	int (*change_state)();		/* Stub for things to do when things
					 * happen.
					 */
	int transport;			/* Transport layer. Currently always
					 * TRANS_MIDI
					 */
	struct {			/* Any information necessary for
					 * SCSI transfer. Currently unused.
					 */
		int unit;
	} scsi;
	char *UserData;			/* Anything else */
};

/* CHANGE_STATE
 * When we receive a response from the EPS, this macro will be invoked
 * to call the user-defined routine, if any. 'e' is the EPS in question,
 * and 's' is the last response received from the EPS.
 */
#define CHANGE_STATE(e,s)	(((e)->change_state==NULL)?0:\
				((*((e)->change_state))(e,s)))

/* MSGTYPE
 * Message type descriptor. 'midi' is a bitmap of acceptable MIDI messages;
 * 0xff indicates all messages. 'channel' is a bitmap of acceptable MIDI
 * channels; 0xffff indicates all channels. 'manufacturer' is the manufacturer
 * ID for SysEx messages, or -1 for all manufacturers. 'sysex' is the
 * acceptable SysEx message, or -1 for all messages.
 */
struct MsgType {
	ushort midi;		/* Bitmap of acceptable MIDI messages */
	ushort channel;		/* Bitmap of acceptable MIDI channels */
	ushort manufacturer;	/* Acceptable manufacturer */
	uchar sysex;		/* Acceptable SysEx message */
};

/* Data transfer structures */
typedef struct edit_spec {	/* This structure uniquely identifies
				 * a wavesample within an instrument
				 */
	uchar inst_num;		/* Instrument number */
	uchar layer_num;		/* Layer number */
	uchar ws_num;		/* Wavesample number */
} edit_spec;

typedef struct inst_par {	/* Instrument parameters */
	char name[12];		/* Name */
	uchar midi_chan;	/* MIDI channel (outbound) */
	ushort midi_prog;	/* MIDI program number (outbound) */
	ushort midi_pres;	/* MIDI pressure (outbound) */
	ushort size;		/* Total instrument size (blocks) */
	ushort key_dest;	/* Key destination (LOCAL, MIDI, BOTH) */
	ushort patches[4];	/* Bitmaps of patch layers */
	ushort down_layers;	/* Bitmap of key down layers */
	ushort up_layers;	/* Bitmap of key up layers */
	ushort patch_sel;	/* Patch select (16+) */
	ushort ped_down_layers;	/* Pedal down layers (16+) */
	ushort id;		/* ID field (16+) */
	ushort low_key;		/* Key range: low key */
	ushort high_key;	/* Key range: high key */
	short transpose;	/* Transposition (in semitones) */
	ushort pitch_off[8];	/* Pitch table offsets */
	ushort layer_off[8];	/* Layer offsets */
	ushort ws_off[128];	/* Wavesample offsets */
	ulong eff_off;		/* Effect offset */
} inst_par;

typedef struct layer_par {	/* Layer parameters */
	char name[12];		/* Layer name */
	uchar glidemode;	/* Glide mode */
	uchar delay_modamt;	/* Delay mod by velocity amount (16+) */
	uchar glidetime;	/* Glide time */
	uchar restriketime;	/* Restrike decay time (16+) */
	ushort legato_lay;	/* Legato layer number */
	ushort low_vel;		/* Velocity low */
	ushort high_vel;	/* Velocity high */
	ushort pitch_tab;	/* Pitch table number */
	ushort delay;		/* Layer delay (16+) */
	ushort layermap[88];	/* Layer map (one wavesample number per
				 * key in high byte).
				 */
} layer_par;

typedef struct envelope {	/* Wavesample envelope description */
	ushort env_type;	/* Envelope type (default envelopes) */
	ushort soft_lev[5];	/* Soft levels */
	ushort hard_lev[5];	/* Hard levels */
	ushort times[6];	/* Times (includes 2nd release time) */
	ushort vel_switch;	/* Velocity switch - soft level on/off */
	ushort rel_bkpt;	/* Release breakpoint rel. to sustain level */
	ushort vel_sens;	/* Time 1 velocity sensitivity */
	ushort time_scal;	/* Keyboard time scaling */
	ushort mode;		/* Mode */
} envelope;

typedef struct ws_par {		/* Wavesample parameters */
	char name[12];		/* Wavesample name */
	ushort cp_num;		/* Wavesample copy number */
	ushort cp_lay;		/* Wavesample copy layer */
	envelope pitch_env;	/* Pitch envelope #1 */
	envelope filter_env;	/* Filter envelope #2 */
	envelope amp_env;	/* Amplitude envelope #3 */

	/* Pitch */
	uchar root;		/* Root key - MIDI key number */
	uchar a_mod_curve;	/* Amplitude modulator crossfade fadecurve (16+) */
	ushort p_envamt;	/* Pitch envelope amount */
	ushort lfo_amt;		/* LFO amount */
	ushort rand_modamt;	/* Random modulation amount */
	uchar bend_rng;		/* Pitch wheel bend range */
	uchar mixer_a_curve;	/* (16+) */
	uchar modsrc;		/* Modulation source */
	ushort finetune;	/* Fine tune - signed 7 bit fraction */
	ushort modamt;		/* Modulation amount */

	/* Filter */
	uchar filter_mode;	/* Filter mode */
	uchar mixer_b_modsrc;	/* (16+) */
	ushort fc1_cut;		/* FC #1 cutoff */
	ushort fc2_cut;		/* FC #2 cutoff */
	ushort fc1_kbd;		/* FC #1 keyboard amount */
	ushort fc2_kbd;		/* FC #2 keyboard amount */
	ushort fc1_filter;	/* FC #1 filter envelope amount */
	ushort fc2_filter;	/* FC #2 filter envelope amount */
	uchar fc1_modsrc;	/* FC #1 modulation source */
	uchar mixer_a_modamt;	/* (16+) */
	uchar fc2_modsrc;	/* FC #2 modulation source */
	uchar mixer_b_modamt;	/* (16+) */
	ushort fc1_modamt;	/* FC #1 modulation amount */
	ushort fc2_modamt;	/* FC #2 modulation amount */

	/* Volume */
	uchar volume;		/* Volume */
	uchar bus_select;	/* Gus bus select table (16+) */
	uchar a_modsrc;		/* Amplitude modulation source */
	uchar pan_modsrc;	/* Gus pan_modsrc_table (16+) */
	ushort acc_a;		/* Amplitude crossfade curve point A */
	ushort acc_b;		/* Amplitude crossfade curve point B */
	ushort acc_c;		/* Amplitude crossfade curve point C */
	ushort acc_d;		/* Amplitude crossfade curve point D */
	uchar pan_pos;		/* Pan position - including separate out */
	uchar pan_fract;	/* signed_frac pan for gus (16+) */
	uchar a_modamt;		/* Amplitude modulation amount */
	uchar pan_modamt;	/* signed_frac for gus (16+) */

	/* LFO */
	uchar lfo_wave;		/* LFO waveform */
	uchar lfo_boost;	/* LFO boost switch (16+) */
	uchar lfo_speed;	/* LFO speed */
	uchar lfo_rate_modamt;	/* LFO rate modulation amount (16+) */
	ushort lfo_depth;	/* LFO depth */
	uchar lfo_delay;	/* LFO delay time */
	uchar lfo_modamt;	/* LFO depth modulation amount (16+) */
	uchar lfo_modsrc;	/* LFO depth modulation source */
	uchar lfo_rate_modsrc;	/* LFO rate modulation source (16+) */
	ushort lfo_mode;	/* LFO mode */
	ushort randmod_freq;	/* Random modulator frequency */

	/* Wavesample */
	ushort loopmode;	/* Loop mode */
	ulong sstart_off;	/* Sample start offset */
	ulong send_off;		/* Sample end offset */
	ulong lstart_off;	/* Loop start offset */
	ulong lend_off;		/* Loop end offset */
	ulong lend_fract;	/* Loop end fraction, in 16ths of a
				 * sample. This nasty hack is here so that
				 * the four offsets look like what's
				 * displayed, while allowing one to specify
				 * that last loop fraction.
				 */
	ushort rate;		/* Sample rate: microseconds 1-127 */
	ushort low_range;	/* Key range - low key */
	ushort high_range;	/* Key range - high key */
	uchar sl_modsrc;	/* Start or loop modulation source */
	uchar delay_modamt;	/* (16+) */
	ushort sl_modamt;	/* Start or loop modulation amount */
	ushort sl_modrng;	/* Start or loop modulation range */
	ushort mod_type;	/* Modulation type */
} ws_par;

typedef struct pitch_tab {	/* Pitch table */
	char name[12];		/* Name */
	ushort semi[88];	/* Semitones */
	ushort fract[88];	/* Semitone fractions */
} pitch_tab;

/* I don't know anything about this. I don't have a 16+ */
typedef struct effect_tab {	/* Effect (16+) */
	char name[12];		/* Name */
	ulong size;		/* Total size in bytes, incl. ucode */
	ushort ucode;		/* Microcode downloadable */
	ushort table;		/* ESP-RAM table, or 0 */
	ushort init_code;	/* Called before esp runs code */
	ushort update_task;	/* Gets installed as a task */
	ushort var_1;		/* Blocks of fx control parameters */
	ushort var_2;
	ushort var_3;
	ushort var_4;
	ushort parlist_start;	/* Page of parameter descriptions */
	ushort parlist_last;	/* Last */
	ushort parlist_cur;	/* Current */
	char fx1_name[13];
	char fx2_name[13];
	char fx3_name[13];
	uchar cur_var;		/* Even */
	uchar out_gpr_l;
	uchar out_gpr_r;
	ushort num_voices;	/* 0=20, 1=13, 2=7 */
	ushort keydown_routine;
} effect_tab;
