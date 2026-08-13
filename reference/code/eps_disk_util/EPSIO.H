//
// Let's try to read from an EPS disk...
//
// EPSIO.H --- sector (block) level IO for EPS disks
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// 8/6/1992
//


#ifndef __EPSIO_H
#define __EPSIO_H

#include <bios.h>


#define DRIVE_RESET     0
#define DISK_STATUS     1
#define READ_SECTOR     2
#define WRITE_SECTOR    3
#define VERIFY_SECTOR   4
#define FORMAT_SECTOR   5
#define DISK_CHANGED    0x16


#define A_DRIVE         0
#define B_DRIVE         1


typedef unsigned char byte;
typedef unsigned int word;
typedef unsigned long int longword;


// Maximum values below

#define SCTR_SIZE	512
#define HEADS		2
#define SCTR_TRK	10
#define TRK_CYL		80
#define BLOCKS		(HEADS*SCTR_TRK*TRK_CYL)

typedef byte SCTR_BUF[SCTR_SIZE];
typedef SCTR_BUF TRACK_BUF[HEADS][SCTR_TRK];


extern int DriveReset
    (int drive);

extern int DiskChanged
    (int drive);

extern int ReadTrack
    (int drive, int head, int track, void* buffer);

extern int WriteTrack
    (int drive, int head, int track, void* buffer);

extern int ReadAbsSectors
    (int drive, int head, int track, int sector, int nsects, void* buffer);

extern int ReadBlock
    (int drive, int block, void* buffer);

extern int WriteAbsSectors
    (int drive, int head, int track, int sector, int nsects, void* buffer);

extern int WriteBlock
    (int drive, int block, void* buffer);

extern int VerifyAbsSectors
    (int drive, int head, int track, int sector, int nsects, void* buffer);

extern int VerifyBlock
    (int drive, int block);

extern char* eps_io_error
     (int result);

extern int SetupDrive
    (int drive);

extern int SetupDriveVerbose
    (int drive);

extern int BlockNum
    (int trk, int hd, int sctr);

extern int SectorsPerTrack;
extern int Tracks;
extern int Heads;
extern long int SectorSize;
extern int SizeCode;
extern long int Blocks;
extern int FATSize;

#include "eps_sctr.h"


#endif