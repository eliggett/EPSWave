/* PRETTY.C
 * Just a demo. Creates and deletes instruments on the EPS in succession,
 * so as to make the red LED move from left to right.
 * Delete all instruments before running this, then invoke it as
 *	pretty -cN -nM
 * where N is the base MIDI channel of your EPS (1 by default) and M is
 * the number of times to cycle (3 by default).
 */
#include <stdio.h>
#include <fcntl.h>
#include "eps.h"		/* Definitions etc. for the EPS */
#include "eps_protos.h"		/* Declarations for the EPS functions */

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
	int times;			/* Number of times to cycle */

	/* Set the defaults */
	chan = 0;			/* MIDI channel 1 */
	times = 3;			/* Cycle 3 times */

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
		 *	n:	Set number of times to cycle
		 */
		switch (argv[i][1]) {
			case 'c':	/* MIDI channel number */
				chan = atoi(argv[i]+2)-1;
				break;
			case 'n':	/* Number of times to cycle */
				times = atoi(argv[i]+2);
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

	/* Go through the cycle 'times' times */
	for (; times > 0; times--)
	{
	 /* Create each instrument from 1 to 8 in turn, then immediately
	  * delete it. This will make the red LED cycle prettily.
	  */
	 for (i = 0; i < 8; i++)
	 {
		/* Set the instrument number to 'i' */
		inst.inst_num = i;

		/* Create the 'i'th instrument. The status is returned in
		 * 'lastresponse'. 0 indicates success. A negative value
		 * indicates that something bombed within the library
		 * routine (e.g., it ran out of memory), and a positive
		 * value indicates that the EPS was unhappy about something.
		 */
		if ((lastresponse = epsCreateInstrument(eps,&inst)) != 0)
		{
			fprintf(stderr, "epsCreateInstrument bombed.\n");

			/* The array 'eps_responses' contains strings
			 * corresponding to each EPS return code.
			 */
			if (lastresponse > 0)
				fprintf(stderr, "%s\n", eps_responses[lastresponse]);
			goaway(1);
		}

		/* Delete the 'i'th instrument. See comments before the
		 * 'epsCreateInstrument()' call, above.
		 */
		if ((lastresponse = epsDeleteInstrument(eps,&inst)) != 0)
		{
			fprintf(stderr, "epsCreateInstrument bombed.\n");
			if (lastresponse > 0)
				fprintf(stderr, "%s\n", eps_responses[lastresponse]);
			goaway(1);
		}
	 }
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
