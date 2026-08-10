//
// RW_EUI.C
//
// Code to read and write my EUI format image to floppy
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// 8/19/1992	v1.1	read from disk modified to not read unused tracks
// 8/23/1992	v1.2	modified to handle weird formats
//


#include "rw_eui.h"

#define RW_EUI_VERSION	"1.2"
#define RW_EUI_DATE	"8/23/92"


typedef word Output_FAT[BLOCKS];


int ReadDiskEUI
    (int drive, char* ofn)
{
  int trk, hd, result, fh, i;
  char fn[80];
  Sector s;
  Directory root;
  Floppy_FAT fat;
  Output_FAT out_fat;
  TRACK_BUF t;


  strcpy(fn,ofn);
  if (strchr(fn,'.') == 0)
    strcat(fn,".EUI");

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

  printf("Opening DOS file %s.\n",fn);

  if ((fh = open(fn,O_CREAT|O_WRONLY|O_BINARY,S_IREAD|S_IWRITE)) == -1)
  {
        printf("Error opening %s for write.\n",fn);
        return(fh);
  }

  printf("Starting read.\n");


  printf("Processing user header block... ");
  if (result = ReadBlock(drive,USER_BLOCK,s.Raw))
  {
        printf("Error! (%s)\n",eps_io_error(result));
        return(result);
  }
  if ((result = write(fh,s.Raw,SectorSize)) == -1)
  {
        printf("Error! (writing to file %s)\n",fn);
        return(result);
  }
  printf("Done.\n");


  printf("Processing device block... ");
  if (result = ReadBlock(drive,DEVICE_BLOCK,s.Raw))
  {
        printf("Error! (%s)\n",eps_io_error(result));
        return(result);
  }
  if ((result = write(fh,&s.Device.entry,sizeof(s.Device.entry))) == -1)
  {
        printf("Error! (writing to file %s)\n",fn);
        return(result);
  }
  printf("Done.\n");


  printf("Processing OS block... ");
  if (result = ReadBlock(drive,OS_BLOCK,s.Raw))
  {
        printf("Error! (%s)\n",eps_io_error(result));
        return(result);
  }
  if ((result = write(fh,&s.OS.entry,sizeof(s.OS.entry))) == -1)
  {
        printf("Error! (writing to file %s)\n",fn);
        return(result);
  }
  printf("Done.\n");


  printf("Processing root directory... ");
  if (result = ReadAbsSectors(drive,0,0,ROOT_BLOCK,2,&root))
  {
        printf("Error! (%s)\n",eps_io_error(result));
        return(result);
  }
  if ((result = write(fh,&root,sizeof(root))) == -1)
  {
        printf("Error! (writing to file %s)\n",fn);
        return(result);
  }
  printf("Done.\n");


  printf("Processing FAT... ");

  // Read FAT

  for (i=0; i<FATSize; i++)
  {
    if (result = ReadBlock(drive,FAT_BLOCK+i,&fat[i]))
    {
      printf("Error! (%s)\n",eps_io_error(result));
      return(result);
    }
  }

  // Crunch it

  for (i=0; i<Blocks; i++)
    out_fat[i] = fat[FATSector(i)].entry[FATEntry(i)].block;

  // Write to file

  if ((result = write(fh,out_fat,sizeof(out_fat[0])*Blocks)) == -1)
  {
      printf("Error! (writing to file %s)\n",fn);
      return(result);
  }
  printf("Done.\n");


  printf("Processing sectors... ");
  for (trk=0; trk<Tracks; trk++)
  {
   if (kbhit()) break;
   for (hd=0; hd<Heads; hd++)
   {
    if (kbhit()) break;
    printf("\r   track %d head %4d   ",trk,hd);

    // Read whole track at a time

    result = 0;
    for (i=0; i<SectorsPerTrack; i++)
    {
      if ((trk > 0) || ((hd > 0) && (i > 4)))
      {
	switch (MtoI_Word(out_fat[BlockNum(trk,hd,i)]))
	{
	  case 2:
	  case 0:

	    break;

	  default:

	    result = 1;
	}
      }
    }

    if (result)
      if (result = ReadTrack(drive,hd,trk,t[hd]))
      {
	  printf("Error! (%s)\n",eps_io_error(result));
	  return(result);
      }

    for (i=0; i<SectorsPerTrack; i++)
    {
      if ((trk > 0) || ((hd > 0) && (i > 4)))
      {
        // Check FAT entry

        switch (MtoI_Word(out_fat[BlockNum(trk,hd,i)]))
        {
          case 2:       // bad sector
          case 0:       // empty

            printf(" ");
            break;

          default:

	    if ((result = write(fh,t[hd][i],SectorSize)) == -1)
	    {
	      printf("Error! (writing to %s)\n",fn);
	      return(result);
	    }
	    else printf("%c",i+48);
	}
      }
      else printf(" ");
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

  return close(fh);
}


int WriteDiskEUI
    (char* ofn, int drive)
{
  int trk, hd, result, fh, i, j, k;
  Sector s, user_s;
  char fn[80];
  Directory root;
  Floppy_FAT fat;
  Output_FAT out_fat;
  TRACK_BUF t;
  char empty[10];


  strcpy(fn,ofn);
  if (strchr(fn,'.') == 0)
    strcat(fn,".EUI");

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

  printf("Opening DOS file %s.\n",fn);

  if ((fh = open(fn,O_RDONLY|O_BINARY)) == -1)
  {
        printf("Error opening %s for read.\n",fn);
        return(fh);
  }

  printf("Starting write.\n");


  printf("Reading user header block... ");
  if ((result = read(fh,user_s.Raw,SCTR_SIZE)) == -1)
  {
        printf("Error! (reading from file %s)\n",fn);
        return(result);
  }
  printf("Done.\n");


  printf("Processing device block...\n");

  if ((result = read(fh,&s.Device.entry,sizeof(s.Device.entry))) == -1)
  {
        printf("Error! (reading from file %s)\n",fn);
        return(result);
  }

  printf("file %s: %d trks  %d hds  %d sctrs  %d blks\n",
    fn,
    MtoI_Word(s.Device.entry.cylinders),
    MtoI_Word(s.Device.entry.heads),
    MtoI_Word(s.Device.entry.sectors),
    MtoI_Long(s.Device.entry.blocks));

  if ((MtoI_Word(s.Device.entry.cylinders) != Tracks)
      || (MtoI_Word(s.Device.entry.heads) != Heads)
      || (MtoI_Word(s.Device.entry.sectors) != SectorsPerTrack)
      || (MtoI_Long(s.Device.entry.blocks) != Blocks))
  {
    printf("Error: disk format and file format do not match!\n");
    return(-1);
  }

  printf("Writing user block... ");
  if (result = WriteBlock(drive,USER_BLOCK,user_s.Raw))
  {
        printf("Error! (%s)\n",eps_io_error(result));
        return(result);
  }
  printf("Done.\n");

  printf("Writing device block... ");
  if (result = WriteBlock(drive,DEVICE_BLOCK,s.Raw))
  {
        printf("Error! (%s)\n",eps_io_error(result));
        return(result);
  }
  printf("Done.\n");


  printf("Processing OS block... ");
  for (i=0; i<SCTR_SIZE; i++)
    s.Raw[i] = 0;
  if ((result = read(fh,&s.OS.entry,sizeof(s.OS.entry))) == -1)
  {
        printf("Error! (reading from file %s)\n",fn);
        return(result);
  }
  if (result = WriteBlock(drive,OS_BLOCK,s.Raw))
  {
        printf("Error! (%s)\n",eps_io_error(result));
        return(result);
  }
  printf("Done.\n");


  printf("Processing root directory... ");
  if ((result = read(fh,&root,sizeof(root))) == -1)
  {
        printf("Error! (reading from file %s)\n",fn);
        return(result);
  }
  if (result = WriteAbsSectors(drive,0,0,ROOT_BLOCK,2,&root))
  {
        printf("Error! (%s)\n",eps_io_error(result));
        return(result);
  }
  printf("Done.\n");


  printf("Processing FAT... ");

  // Read from file

  if ((result = read(fh,out_fat,sizeof(out_fat[0])*Blocks)) == -1)
  {
      printf("Error! (reading from file %s)\n",fn);
      return(result);
  }

  // Uncrunch it

  for (i=0; i<FATSize; i++)
  {
    fat[FATSize-1].entry[i].block = 0;
    fat[FATSize-1].entry[i].zero = 0;
  }
  for (i=0; i<BLOCKS; i++)
  {
    fat[FATSector(i)].entry[FATEntry(i)].block = out_fat[i];
    fat[FATSector(i)].entry[FATEntry(i)].zero = 0;
  }
  for (i=0; i<FATSize; i++)
  {
    fat[i].ID[0] = 'F';
    fat[i].ID[1] = 'B';
  }

  // Write FAT

  for (i=0; i<FATSize; i++)
  {
    if (result = WriteBlock(drive,FAT_BLOCK+i,&fat[i]))
    {
      printf("Error! (%s)\n",eps_io_error(result));
      return(result);
    }
  }

  printf("Done.\n");


  printf("Processing sectors... ");
  for (trk=0; trk<Tracks; trk++)
  {
   if (kbhit()) break;
   for (hd=0; hd<Heads; hd++)
   {
    if (kbhit()) break;
    printf("\r   track %d head %4d   ",trk,hd);
    for (i=0; i<SectorsPerTrack; i++)
    {
      if (((trk > 0) || ((hd > 0) && (i > 4)))
         && (MtoI_Word(out_fat[BlockNum(trk,hd,i)]) != 0)
         && (MtoI_Word(out_fat[BlockNum(trk,hd,i)]) != 2))
      {
        empty[i] = 0;
      }
      else
      {
        empty[i] = 1;
      }
    }

    j = 0;
    do
    {
      while ((j < SectorsPerTrack) && (empty[j]))
      {
        j++;
        printf(" ");
      }
      k = j;
      while ((k < SectorsPerTrack) && (!empty[k]))
      {
        printf("%c",k+48);
        k++;
      }
      k--;

      if (j < SectorsPerTrack)
      {

        // Write sectors between j and k

        i = k-j+1;
	if ((result = read(fh,t[hd][j],i*SectorSize)) == -1)
	{
	  printf("Error! (reading from %s)\n",fn);
	  return(result);
	}
	if (result = WriteAbsSectors(drive,hd,trk,j,i,t[hd][j]))
	{
	  printf("Error! (%s)\n",eps_io_error(result));
	  return(result);
	}
	j = ++k;
      }

      // Keep going

    } while (j < SectorsPerTrack);
   }
  }

  if (kbhit())
  {
    printf("\r%-79s\n","Aborted by keypress!");
    getch();
  } else {
    printf("\r%-79s\n","Done!");
  }

  return close(fh);
}


