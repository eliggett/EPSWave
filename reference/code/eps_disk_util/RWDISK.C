//
// RWDISK.C
//
// Code to read and write raw image to floppy
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// 8/11/1992
// 8/23/1992	v1.1	modified to support funky formats
//


#include "rwdisk.h"

#define RWDISK_VERSION	"1.1"
#define RWDISK_DATE	"8/23/1992"

int ReadDiskImage
    (int drive, int fh)
{
  int trk, hd, result;
  TRACK_BUF t;


  printf("Starting read.\n");

  for (trk=0; trk<Tracks; trk++)
  {
   for (hd=0; hd<Heads; hd++)
   {
    if (kbhit()) break;

    if ((result = ReadTrack(drive,hd,trk,t[hd])) != 0)
    {
        printf(eps_io_error(result));
        return(result);
    }

    if ((result = write(fh,t[hd],SectorSize*SectorsPerTrack)) == -1)
    {
	printf("Error writing to file.\n");
        return(result);
    }

    printf("\r   track %d head %4d",trk,hd);
   }
   if (kbhit()) break;
  }

  if (kbhit())
  {
    printf("\r%-79s\n","Aborted by keypress!");
    getch();
  } else {
    printf("\r%-79s\n","Done!");
  }

  return 0;
}


int ReadDisk
    (int drive, char* fn)
{
  int result, fh;


  printf("Opening DOS file %s for write.\n",fn);

  if ((fh = open(fn,O_CREAT|O_WRONLY|O_BINARY,
		    S_IREAD|S_IWRITE)) == -1)
  {
        printf("Error opening %s for write.\n",fn);
        return(result);
  }

  if ((result = SetupDrive(drive)))
  {
    printf("Error setting up drive... %s\n",eps_io_error(result));
    return(result);
  }

  printf("Reading device entry...");
  if ((result = LoadDrive(drive)))
  {
    printf("Error... %s\n",eps_io_error(result));
    return(result);
  }

  printf("\ndrive %c: %d trks  %d hds  %d sctrs  %d blks\n",
    drive+65,Tracks,Heads,SectorsPerTrack,Blocks);

  result = ReadDiskImage(drive,fh);

  return close(fh);
}


int WriteDiskImage
    (int fh, int drive)
{
  int trk, hd;
  long result;
  TRACK_BUF t;

  printf("Starting write.\n");

  for (trk=0; trk<Tracks; trk++)
  {
   if (kbhit()) break;
   for (hd=0; hd<Heads; hd++)
   {
    if (kbhit()) break;
    if ((result = read(fh,t[hd],SectorSize*SectorsPerTrack)) == -1)
    {
	printf("Error reading from file.\n");
        return(result);
    }

    if ((result = WriteTrack(drive,hd,trk,t[hd])) != 0)
    {
        printf(eps_io_error(result));
        return(result);
    }

    printf("\r   track %d head %4d",trk,hd);
   }
  }

  if (kbhit())
  {
    printf("\r%-79s\n","Aborted by keypress!");
    getch();
  } else {
    printf("\r%-79s\n","Done!");
  }

  return 0;
}

int WriteDisk
    (char* fn, int drive)
{
  int result, fh;

  printf("Opening DOS file %s for read.\n",fn);

  if ((fh = open(fn,O_RDONLY|O_BINARY,S_IREAD|S_IWRITE)) == -1)
  {
	printf("Error opening %s for read.\n",fn);
        return(result);
  }

  if ((result = SetupDrive(drive)))
  {
    printf("Error setting up drive... %s\n",eps_io_error(result));
    return(result);
  }

  printf("Reading device entry...");
  if ((result = LoadDrive(drive)))
  {
    printf("Error... %s\n",eps_io_error(result));
    return(result);
  }

  printf("\ndrive %c: %d trks  %d hds  %d sctrs  %d blks\n",
    drive+65,Tracks,Heads,SectorsPerTrack,Blocks);

  if ((result = filelength(fh)) != (Blocks*SectorSize))
  {
    printf("Error: disk and file formats differ! (%d vs. %d blks)\n",
      Blocks,result/SectorSize);
    return(-1);
  }

  result = WriteDiskImage(fh,drive);

  return close(fh);
}


int VerifyDisk
    (int drive)
{
  int trk, hd, sctr, numerr, result;
  TRACK_BUF t;

  if ((result = SetupDrive(drive)))
  {
    printf("Error setting up drive... %s\n",eps_io_error(result));
    return(result);
  }

  printf("Reading device entry...");
  if ((result = LoadDrive(drive)))
  {
    printf("Error... %s\n",eps_io_error(result));
    return(result);
  }

  printf("\ndrive %c: %d trks  %d hds  %d sctrs  %d blks\n",
    drive+65,Tracks,Heads,SectorsPerTrack,Blocks);

  printf("Starting verify.\n");

  numerr = 0;
  for (trk=0; trk<Tracks; trk++)
  {
    if (kbhit()) break;
    for (hd=0; hd<Heads; hd++)
    {
      if (kbhit()) break;
      printf("\r   track %d head %d ",trk,hd);
      if (result = VerifyAbsSectors(drive,hd,trk,0,SectorsPerTrack,t))
      {
        // There's an error on this track somewhere!

        printf(": Errors!\n");
	for (sctr=0; sctr<SectorsPerTrack; sctr++)
	{
	  if (result = VerifyAbsSectors(drive,hd,trk,sctr,1,t))
	  {
	    printf("--> sector %d: %s\n",sctr,eps_io_error(result));
	    numerr++;
	  }
	}
      }
    }
  }

  if (kbhit())
  {
    printf("\r%-79s\n","Aborted by keypress!");
    getch();
  } else {
    printf("\r%-79s\n","Done!");
  }

  return(numerr);
}

