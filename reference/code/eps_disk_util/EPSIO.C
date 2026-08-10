//
// Let's try to read from an EPS disk...
//
// EPSIO.C --- sector (block) level IO for EPS disks
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// 8/6/1992
//

#include "epsio.h"

#define __EPSIO_VERSION		"2.0"
#define __EPSIO_DATE		"8/22/92"

SCTR_BUF scratch_buf;


int DiskChanged
    (int drive)
{
  return biosdisk(DISK_CHANGED,drive,0,0,0,0,0);
}

int DriveReset
    (int drive)
{
  return biosdisk(DRIVE_RESET,drive,0,0,0,0,0);
}


int ReadTrack
    (int drive, int head, int track, void* buffer)
{
  return biosdisk(READ_SECTOR,drive,head,track,0,SectorsPerTrack,buffer);
}

int WriteTrack
    (int drive, int head, int track, void* buffer)
{
  return biosdisk(WRITE_SECTOR,drive,head,track,0,SectorsPerTrack,buffer);
}

int ReadAbsSectors
    (int drive, int head, int track, int sector, int nsects, void* buffer)
{
  return biosdisk(READ_SECTOR,drive,head,track,sector,nsects,buffer);
}

int WriteAbsSectors
    (int drive, int head, int track, int sector, int nsects, void* buffer)
{
  return biosdisk(WRITE_SECTOR,drive,head,track,sector,nsects,buffer);
}

int VerifyAbsSectors
    (int drive, int head, int track, int sector, int nsects, void* buffer)
{
  return biosdisk(VERIFY_SECTOR,drive,head,track,sector,nsects,buffer);
}



char* eps_io_error
     (int result)
{
  char unk_err[80];

  switch (result)
  {
    case 1:     return("Bad BIOS command!");
    case 2:     return("Address mark not found!");
    case 3:     return("Disk write-protected!");
    case 4:     return("Sector not found!");
    case 5:     return("Reset failed!");
    case 6:     return("Disk has been changed!");
    case 8:     return("DMA overrun!");
    case 9:     return("Attempted DMA across 64K boundary");
    case 12:    return("Unsupported track or invalid media!");
    case 16:    return("Read CRC/ECC error!");
    case 17:    return("Corrected CRC/ECC error (beware!)");
    case 32:    return("Controller failed!");
    case 64:    return("Seek failed!");
    case 128:   return("No response from drive!");
    case 0xCC:  return("Write fault!");
    default:    sprintf(unk_err,"Unknown error code %d!",result);
                return unk_err;
  }
}


int SectorsPerTrack = 10;
int Heads = 2;
int Tracks = 80;
long int SectorSize = 512;
int SizeCode = 2;	// code for 512-byte sectors (size / 256)
long int Blocks = 1600;
int FATSize = 10;

int SetupDrive
    (int drive)
{
  int err, count;

  count = 3;
  do
  {
    // Try to read device block
    err = VerifyBlock(drive,0);
    if (err)
    {
      DriveReset(drive);
      count--;
    }
  }
  while ((err) && (count > 0));
  return(err);
}

int LoadDrive
    (int drive)
{
  Sector s;
  int err;

  // Try to read device block

  err = ReadBlock(drive,DEVICE_BLOCK,&s);

  if (!err)
  {
    SectorsPerTrack = MtoI_Word(s.Device.entry.sectors);
    Tracks = MtoI_Word(s.Device.entry.cylinders);
    Heads = MtoI_Word(s.Device.entry.heads);
    Blocks = MtoI_Long(s.Device.entry.blocks);
    SectorSize = MtoI_Long(s.Device.entry.blocksize);
    SizeCode = SectorSize / 256;
    FATSize = (Blocks - 1) / 170 + 1;
  }

  return(err);
}


int BlockNum
    (int trk, int hd, int sctr)
{
  return( (((trk*Heads)+hd)*SectorsPerTrack)+sctr);
}

int TrackNum(int blk)
{
  return(blk/(Heads*SectorsPerTrack));
}

int HeadNum(int blk)
{
  return((blk/SectorsPerTrack) % Heads);
}

int SectorNum(int blk)
{
  return(blk % SectorsPerTrack);
}

int WriteBlock(int drive, int blk, void* buf)
{
  return WriteAbsSectors(drive,
    HeadNum(blk),TrackNum(blk),SectorNum(blk),1,buf);
}

int ReadBlock(int drive, int blk, void* buf)
{
  return ReadAbsSectors(drive,
    HeadNum(blk),TrackNum(blk),SectorNum(blk),1,buf);
}

int VerifyBlock
    (int drive, int block)
{
  return VerifyAbsSectors(drive,
    HeadNum(block),TrackNum(block),SectorNum(block),1,scratch_buf);
}


