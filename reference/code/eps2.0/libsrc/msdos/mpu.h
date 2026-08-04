/* MPU.H
 * Definitions etc. for the Roland MPU-401.
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

/* Ports */
#define MPU_CMD		0x331	/* Command port */
#define MPU_STAT	0x331	/* Status port */
#define MPU_DATA	0x330	/* Data port */

/* Commands */
#define CMD_UART	0x3f	/* Put MPU in UART mode */
#define CMD_RESET	0xff	/* Reset MPU */

#define DRR	(!(inportb(MPU_STAT)&0x40))	/* MPU is ready to receive
						 * data.
						 */
#define DSR	(!(inportb(MPU_STAT)&0x80))	/* MPU has data ready to
						 * be read.
						 */

extern unsigned char inportb();
