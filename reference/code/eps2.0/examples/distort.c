/* DISTORT.C
 * Just a demo. Adds distortion to a wavesample.
 * The idea here is that given a sample range -R..R (in the EPS's case,
 * -2^15..2^15) and a threshold T such that -R < -T < T < R, this
 * program goes through the sample; if abs(sample) > T, then the sample
 * is set to either T or -T, as appropriate. Finally, the entire sample
 * is normalized so it doesn't sound artificially quiet.
 */
#include <stdio.h>
#include <fcntl.h>
#include "eps.h"		/* Definitions etc. for the EPS */
#include "eps_protos.h"		/* Declarations for the EPS functions */
#ifdef AMIGA
#undef stdout
#undef stderr
#define fprintf		FPrintf
char *stdout, *stderr;
#endif

#define CHUNK_LEN	1024	/* Length of sample chunk, in samples */

struct NewEPS epsreq;		/* This will contain the `OpenEPS()' request */
struct EPSdesc *eps = NULL;	/* Descriptor for the EPS */
int chan;			/* Channel on which to talk to the EPS */

main(argc,argv)
int argc;
char *argv[];
{
	int i;				/* General-purpose counter */
	int lastresponse;		/* Last response from EPS */
	edit_spec inst;			/* Instrument/wavesample number */
	int depth;			/* Distortion depth, percent */
	int threshold;			/* Distortion cutoff threshold */
	ws_par ws;			/* Wavesample descriptor */
	short buf[2*CHUNK_LEN];		/* Sample buffer */
	unsigned long ck_off;		/* Chunk offset from sample start */
#ifdef AMIGA
	stdout = stderr = Output();
#endif

	/* Set the defaults */
	chan = 0;			/* MIDI channel 1 */
	depth = 75;			/* Distortion depth 75% */
	inst.inst_num = 0;		/* Instrument 1 */
	inst.layer_num = 0;		/* Layer 1 */
	inst.ws_num = 1;		/* Wavesample 1 */

	/* Check the arguments */
	for (i = 1; i < argc; i++)
	{
		/* All options begin with a '-'. Anything else is an
		 * error.
		 */
		if (argv[i][0] != '-')
			usage(argv[0]);

		/* Decide what to do, based on the next character after
		 * the '-'.
		 *	c:	Set MIDI channel number
		 *	d:	Set distortion depth
		 *	i:	Set instrument number
		 *	w:	Set wavesample number
		 */
		switch (argv[i][1]) {
			case 'c':	/* MIDI channel number */
				chan = atoi(argv[i]+2)-1;
				break;
			case 'd':	/* Distortion depth */
				depth = atoi(argv[i]+2);
				if (depth < 0 || depth > 100)
					usage(argv[0]);
				break;
			case 'i':	/* Instrument number */
				inst.inst_num = atoi(argv[i]+2)-1;
				break;
			case 'w':	/* Wavesample number */
				inst.ws_num = atoi(argv[i]+2);
				break;
			default:
				usage(argv[0]);
		}
	}

	/* Initialize everything for the EPS library */
	if (EPSInit() < 0)
	{
		fprintf(stderr, "Can't initialize EPS library.\n");
		goaway(1);
	}
fprintf(stderr, "Generic trace statement\n");

	/* Initialize the request to open a new EPS. Note that we could have
	 * allocated 'epsreq' dynamically, then freed it immediately after
	 * the 'OpenEPS()' call.
	 */
	epsreq.model = GO_FIGURE;	/* Unknown type */
	epsreq.os_ver = 2;		/* OS version. Not significant now */
	epsreq.os_rev = 49;
	epsreq.os_patch = 0;		/* OS 2.49.0 */
	epsreq.chan = chan;		/* MIDI channel */
	epsreq.change_state = NULL;	/* No special processing */
	epsreq.transport = TRANS_MIDI;	/* Use MIDI to communicate */
	epsreq.UserData = NULL;		/* No user data */

	/* Open the new EPS */
	if ((eps = OpenEPS(&epsreq)) == NULL)
	{
		fprintf(stderr, "Can't open EPS.\n");
		goaway(1);
	}

	/* EPS samples are 16 bits long, and signed, so their values range
	 * from -32768 to +32768. The cutoff threshold is therefore
	 * 32768 * ((100-depth)/100).
	 */
	threshold = (32768 * (100-depth))/100;

	/* Get the wavesample parameters */
	if ((lastresponse = epsGetWS(eps,&inst,&ws)) != 0)
	{
		fprintf(stderr, "Can't get wavesample parameters.\n");
		if (lastresponse > 0)
			fprintf(stderr, "%s\n", eps_responses[lastresponse]);
		goaway(1);
	}
fprintf(stderr, "sstart_off == %ld\tsend_off == %ld\n",
ws.sstart_off, ws.send_off);

#ifdef FOO
	/* Get the wavesample, one 'CHUNK_LEN'-sized chunk at a time */
	for (ck_off = ws.sstart_off;
	     ck_off+CHUNK_LEN < ws.send_off;
	     ck_off += CHUNK_LEN)
	{
fprintf(stderr, "[%ld..%ld]\n", ck_off, ck_off+CHUNK_LEN);
		/* Get the next chunk from the EPS.
		 * Note the +1 for the 'to' parameter.
		 */
		if ((lastresponse = epsGetWSData(eps,&inst,ck_off,
			ck_off+CHUNK_LEN+1,buf)) != 0)
		{
			fprintf(stderr, "Can't get wavesample data.\n");
			if (lastresponse > 0)
				fprintf(stderr, "%s\n", eps_responses[lastresponse]);
			goaway(1);
		}

		/* Add distortion to the current chunk: if a sample is
		 * greater than 'threshold', in absolute value, then
		 * set it to 'threshold'. Otherwise, leave it alone.
		 */
		for (i = 0; i < CHUNK_LEN; i++)
			if (buf[i] > threshold)
				buf[i] = threshold;
			else if (buf[i] < -threshold)
				buf[i] = -threshold;

		/* Send the processed chunk back to the EPS.
		 * Note that the 'to' parameter is one less than for
		 * the corresponding 'epsGetWSData()'.
		 */
		if ((lastresponse = epsPutWSData(eps,&inst,ck_off,
			ck_off+CHUNK_LEN,buf)) != 0)
		{
			fprintf(stderr, "Can't send wavesample data.\n");
			if (lastresponse > 0)
				fprintf(stderr, "%s\n", eps_responses[lastresponse]);
			goaway(1);
		}
	}

	/* Now do the same to the last chunk, of size < 'CHUNK_LEN' */
fprintf(stderr, "{%ld..%ld}\n", ck_off, ws.send_off);
	if ((lastresponse = epsGetWSData(eps,&inst,ck_off,
		ws.send_off,buf)) != 0)
	{
		fprintf(stderr, "Can't get wavesample data.\n");
		if (lastresponse > 0)
			fprintf(stderr, "%s\n", eps_responses[lastresponse]);
fprintf(stderr, "lastresponse == %d\n", lastresponse);
		goaway(1);
	}

fprintf(stderr, "Processing last chunk\n");
	/* Add distortion to the last chunk: if a sample is
	 * greater than 'threshold', in absolute value, then
	 * set it to 'threshold'. Otherwise, leave it alone.
	 */
	for (i = 0; i <= ws.send_off-ck_off; i++)
		if (buf[i] > threshold)
			buf[i] = threshold;
		else if (buf[i] < -threshold)
			buf[i] = -threshold;

fprintf(stderr, "Sending last chunk\n");
	/* Send the distorted last chunk back to the EPS */
	if ((lastresponse = epsPutWSData(eps,&inst,ck_off,
		ws.send_off-1,buf)) != 0)
	{
		fprintf(stderr, "Can't send wavesample data.\n");
		if (lastresponse > 0)
			fprintf(stderr, "%s\n", eps_responses[lastresponse]);
fprintf(stderr, "lastresponse == %d\n", lastresponse);
		goaway(1);
	}

#endif
fprintf(stderr, "Sleeping...\n");
sleep(2);
	/* And finally, normalize the gain */
/*	if ((lastresponse = epsNormalizeGain(eps,&inst)) != 0)*/
if ((lastresponse = epsTruncateWS(eps,&inst)) != 0)
	{
		fprintf(stderr, "Can't normalize.\n");
		if (lastresponse > 0)
			fprintf(stderr, "%s\n", eps_responses[lastresponse]);
fprintf(stderr, "lastresponse == %d\n", lastresponse);
		goaway(1);
	}

	/* Everything went well. Clean up and exit */
	goaway(0);
}

/* USAGE
 * Print out a usage string and exit with an error code.
 */
usage(argv0)
char *argv0;
{
	fprintf(stderr,
		"Usage: %s [-c<channel>] [-n<times>]\n",
		argv0);
	goaway(1);
}

/* GOAWAY
 * Clean everything up and exit with exit code `status'.
 */
goaway(status)
int status;
{
	if (eps != NULL)
		CloseEPS(eps);		/* Close the EPS descriptor */
	EPSTini();			/* Clean up after the EPS library */

	exit(status);
}
