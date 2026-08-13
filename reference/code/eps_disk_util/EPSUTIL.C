//
// EPSUTIL.C --- code to act as sort of "shell" for EPS utilities
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// 8/10/1992    v1.22 - added ability to change interleave
// 8/11/1992    v1.23 - added ability to change gap length
// 8/11/1992    v1.24 - fixed interleave mistake
// 8/19/1992	v1.25 -	sped up read to EUI file
// 8/22/1992	v1.26 -	changed formatting code to (eventually) support weird
//			disk formats
// 8/23/1992	v1.30 - modified all code to handle funky formats
// 11/02/1992	v1.40 - added support for GKH files
//

#include "epsio.h"

#include "frmt_spc.h"
#include "sctredit.h"
#include "rwdisk.h"

#define VERSION      "1.40"
#define DATE         "11/02/1992"


int GetDrive(void)
{
  int drive;

  if ((drive < 0) || (drive > 1))
  {
    printf("\nEnter floppy drive letter: ");
    do drive = toupper(getch());
    while (((drive < 'A') || (drive > 'F')) && (drive != 27));
    putch(drive);
    drive -= 65;
  }
  return(drive);
}

char* GetFilename(char* cp)
{
  char newval[80];

  printf("\nEnter DOS filename [%s]: ",cp);
  gets(newval);
  if (newval[0])
    strcpy(cp,newval);
  return cp;
}

int GetFormatParameters(void)
{
  int newval;
  char inbuf[8];

  printf("\n\nEnter interleave [%d]: ",Interleave);
  gets(inbuf);
  if (newval = atoi(inbuf))
    Interleave = newval;

  printf("Enter gap length [%d]: ",GapLength);
  gets(inbuf);
  if (newval = atoi(inbuf))
    GapLength = newval;

  printf("Enter sectors per track [%d]: ",SectorsPerTrack);
  gets(inbuf);
  if (newval = atoi(inbuf))
    SectorsPerTrack = newval;

  printf("(tracks: %d  heads: %d  sector size: %d)\n",
    Tracks,Heads,SectorSize);
}


void main(int argc, char* argv[])
{
  int cmd, cmdline, drive, quit = 0;
  char fn[80];

  printf("\nEPS Utilities v%s by Michael Chen %s\n",VERSION,DATE);


  cmdline = 1;



  // Get command-line command spec

  if (--argc > 0)
  {
    cmd = toupper(*argv[1]);
    switch (cmd)
    {
      case 'P':
      case 'G':
      case 'R':
      case 'Q':
      case 'W':
      case 'V':
      case 'E':
      case 'F': break;
      default:  cmd = 0;
    }
  }
  else cmd = 0;


  // Get command-line drive spec

  if (argc > 1)
  {
    drive = toupper(*argv[2]) - 65;
  }
  else drive = -1;


  // Get command-line file spec

  if (argc > 2)
  {
    strcpy(fn,argv[3]);
  } else fn[0] = '\0';


  do
  {
    if (!cmdline)
    {
      // Reset command and parameters!

      cmd = 0;
      drive = -1;
    }
    else cmdline = 0;


    while (!cmd)
    {
      printf("%s%s%s%s%s",
"\n C)hange format parameters,",
"\n G)et EPS disk into EUI file,     P)ut EUI file on EPS disk,",
"\n^R)ead raw image from EPS disk,  ^W)rite raw image to EPS disk,",
"\n R)ead EPS disk into GKH file,    W)rite GKH file to EPS disk,",
"\n V)erify, F)ormat, E)xplore EPS disk or Q)uit? ");

      cmd = toupper(getch());
      switch (cmd)
      {
        case 'P':
        case 'G':
        case 'R':
        case 'Q':
        case 'W':
        case 'V':
        case 'E':
        case 'F':
	case 'C':
	case 18:
	case 23:
		  putch(cmd); break;
	default:  cmd = 0;
      }
    }


    if ((cmd != 'Q') && (cmd != 'C'))
    {
      if (drive < 0)
        drive = GetDrive();
      if (drive < 0) continue;

      if ((cmd == 'R') || (cmd == 'W') || (cmd == 'G') || (cmd == 'P')
	 || (cmd == 18) || (cmd == 23))
      {
        GetFilename(fn);
        if (fn[0] == '\0') continue;
      }

      printf("\nInsert disk in drive %c and press a key.\n",drive+65);
      if (getch() == 27) continue;
    }


    switch (cmd)
    {
      case 'G':   ReadDiskEUI(drive,fn); break;
      case 'P':   WriteDiskEUI(fn,drive); break;
      case 'R':   ReadGKHfromDisk(drive,fn); break;
      case 'W':   WriteGKHtoDisk(fn,drive); break;
      case 18:    ReadDisk(drive,fn); break;
      case 23:    WriteDisk(fn,drive); break;
      case 'V':   VerifyDisk(drive); break;
      case 'Q':   quit = 1; break;
      case 'E':   SectorEdit(drive); break;
      case 'F':   printf("(interleave is %d; gap length is %d)\n",
                    Interleave,GapLength);
                  FormatDisk(drive); break;
      case 'C':   GetFormatParameters(); break;
      default:    printf("Bad command.\n"); break;
    }

  } while (!quit);
}

