//
// FRMT_SPC.H --- header file
//
// code to format EPS disk
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// 8/22/1992
//


#ifndef __FRMT_SPC_H
#define __FRMT_SPC_H

#include "epsio.h"
#include "eps_sctr.h"
#include <dos.h>


#define FORMAT_SECTOR   5


typedef struct {
  char track;
  char head;
  char sector;
  char sizecode;        // should be 02 for 512-byte sectors
} FormatEntry;

typedef FormatEntry FormatTable[SCTR_TRK];

typedef struct {
  char specify[2];
  char motor_delay;
  char bytes_sector;
  char sectors_track;
  char sector_gap;
  char data_length;
  char gap_length;
  char format_filler;
  char head_settle;
  char motor_start;
} DriveParamTable;


extern int Interleave;
extern int GapLength;


extern void SetFormatTable
    (FormatTable ft, int head, int track);

extern int FormatTrack
    (int drive, int head, int track);

extern int FormatDisk
    (int drive);


#endif