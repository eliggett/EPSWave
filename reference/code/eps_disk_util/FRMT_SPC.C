//
// FRMT_SPC.C
//
// code to format special EPS disks
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// 8/11/1992    v1.1	added interleave and gap length support
// 8/19/1992	v1.11	changed default gap length to 40 (0x28), as GKH
//

#include "frmt_spc.h"

#define __FRMT_SPC_VERSION	"1.20"
#define __FRMT_SPC_DATE		"8/22/92"


// Define space for our DPT

DriveParamTable dpt;


int Interleave = 1;
int GapLength = 0x28;


// Routines follow

void SetFormatTable
    (FormatTable ft, int head, int track)
{
  int i, s;
  char used[SCTR_TRK];

  for (i=0; i<SectorsPerTrack; i++)
  {
    used[i] = 0;
    ft[i].track = track;
    ft[i].head = head;
    ft[i].sizecode = SizeCode;
  }

  s = 0;
  for (i=0; i<SectorsPerTrack; i++)
  {
    while (used[s]) s = (++s) % SectorsPerTrack;
    ft[s].sector = i;
    used[s] = 1;
    s = (s + Interleave) % SectorsPerTrack;
  }
}


typedef union {
  void far* fp;
  unsigned int word[2];
} FAR_PTR;

void far* GetVector(int num)
{
  FAR_PTR fptr;

  fptr.word[0] = peek(0,4*num);
  fptr.word[1] = peek(0,4*num+2);
  return(fptr.fp);
}

void SetVector(int num, void far* v)
{
  FAR_PTR fptr;

  fptr.fp = v;
  poke(0,4*num,fptr.word[0]);
  poke(0,4*num+2,fptr.word[1]);
}


int FormatTrack
    (int drive, int head, int track)
{
  FormatTable ft;
  int result;
  DriveParamTable far* old_dpt;

  // Copy DPT and set sectors per track to 10

  old_dpt = GetVector(0x1E);
  dpt = *old_dpt;
  dpt.sectors_track = SectorsPerTrack;
  dpt.gap_length = GapLength;
  SetVector(0x1E,(void far*) &dpt);

  // Set format table for track

  SetFormatTable(ft,head,track);

  // Do it.

  result = biosdisk(FORMAT_SECTOR,drive,head,track,0,SCTR_TRK,ft);

  // Restore old DPT.

  SetVector(0x1E,old_dpt);

  return(result);
}


int FormatDisk
    (int drive)
{
  int hd, trk, count, result;
  Sector s;
  struct time now;
  struct date today;
  char buf[80];

  printf("Setting up drive %c.\n",drive+65);
  SetupDrive(drive);

  printf("Formatting EPS disk in drive %c.\n",drive+65);
  for (trk=0; trk<Tracks; trk++)
  {
    if (kbhit()) break;
    for (hd=0; hd<Heads; hd++)
    {
      if (kbhit()) break;
      printf("\r   track %d head %d ",trk,hd);
      if (result = FormatTrack(drive,hd,trk))
      {
        printf(": Error! (%s)\n",eps_io_error(result));
        return(result);
      }
      else
      {
	for (count=0; count<SectorsPerTrack; count++)
	  putch(count+48);
      }
    }
  }

  if (kbhit())
  {
    printf("\r%-79s\n","Aborted by keypress!");
    getch();
    return(-2);
  }

  printf("\r%-79s\r","");               // Clear to end of line...

  Blocks = Tracks * Heads * SectorsPerTrack;

  printf("Writing signature block... ");

  sprintf(buf,"Tracks: %d\r\nHeads: %d\r\nSectors: %d\r\nBlocks: %d\r\n",
    Tracks,Heads,SectorsPerTrack,Blocks);
  for (count=0; count<SCTR_SIZE; count++)
    s.Raw[count] = 0;
  getdate(&today);
  gettime(&now);
  sprintf(s.Raw,
  "\r\n%s%2d/%2d/%4d\r\n%s%2d:%2d\r\n%s\r\n%s%s\r\n%s\r\n%c",
  "Date: ",today.da_mon,today.da_day,today.da_year,
  "Time: ",now.ti_hour,now.ti_min,
  "EPSUTIL by Michael Chen","FRMT_SPC version ",__FRMT_SPC_VERSION,
  buf,26);

  if (result = WriteBlock(drive,USER_BLOCK,s.Raw))
  {
    printf("%s\n",eps_io_error(result));
    return(result);
  } else printf("Done!\n");


  printf("Writing device block... ");

  for (count=0; count<SectorSize; count++)
    s.Raw[count] = 0;
  s.Device.entry.removable = 0x80;
  s.Device.entry.version = 0x1;
  s.Device.entry.sectors = ItoM_Word(SectorsPerTrack);  // sectors per track
  s.Device.entry.heads = ItoM_Word(Heads);       	// number of heads
  s.Device.entry.cylinders = ItoM_Word(Tracks);   	// number of tracks
  s.Device.entry.blocksize = ItoM_Long(SectorSize); // bytes per block
  s.Device.entry.blocks = ItoM_Long(Blocks);    // number of blocks on disk
  s.Device.entry.SCSI_medium = 0x1E;            // SCSI medium type
  s.Device.entry.SCSI_density = 0x2;            // SCSI density code
  s.Device.entry.ID[0] = 'I';                   // device block ID
  s.Device.entry.ID[1] = 'D';
  if (result = WriteBlock(drive,DEVICE_BLOCK,s.Raw))
  {
    printf("%s\n",eps_io_error(result));
    return(result);
  } else printf("Done!\n");

  printf("Computing FAT size... ");
  FATSize = ((Blocks-1) / 170) + 1;
  printf("%d blocks.\n",FATSize);

  printf("Writing OS block... ");

  for (count=0; count<SectorSize; count++)
    s.Raw[count] = 0;
  s.OS.entry.ID[0] = 'O';                        // OS sector ID
  s.OS.entry.ID[1] = 'S';
  s.OS.entry.blocks_free = ItoM_Long(Blocks-5-FATSize); // initial free blocks
  if (result = WriteBlock(drive,OS_BLOCK,s.Raw))
  {
    printf("%s\n",eps_io_error(result));
    return(result);
  } else printf("Done!\n");


  printf("Writing root directory... ");

  for (count=0; count<SectorSize; count++)
    s.Raw[count] = 0;
  if (result = WriteBlock(drive,3,s.Raw))
  {
    printf("%s\n",eps_io_error(result));
    return(result);
  }
  s.Raw[510] = 'D';     // set empty directory block ID
  s.Raw[511] = 'R';
  if (result = WriteBlock(drive,4,s.Raw))
  {
    printf("%s\n",eps_io_error(result));
    return(result);
  } else printf("Done!\n");

  printf("Writing FAT... ");

  for (count=0; count<SectorSize; count++)
    s.Raw[count] = 0;
  s.FAT.ID[0] = 'F';    // set empty directory block ID
  s.FAT.ID[1] = 'B';
  for (count=0; count<FATSize; count++)
    if (result = WriteBlock(drive,FAT_BLOCK+count,s.Raw))
    {
      printf("%s\n",eps_io_error(result));
      return(result);
    }
  for (count=0; count<(5+FATSize); count++)
    s.FAT.entry[count].block = ItoM_Word(1); // set reserved sectors to full
  if (result = WriteBlock(drive,5,s.Raw))
  {
    printf("%s\n",eps_io_error(result));
    return(result);
  } else printf("Done!\n");

  // Done formatting

  printf("\r%-79s\n","Done!");
  return 0;
}
