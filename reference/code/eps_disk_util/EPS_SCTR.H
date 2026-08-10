//
// EPS_SCTR.H --- header file
//
// code containing different ways to look at EPS sectors
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// 8/10/1992
//

#ifndef __EPS_SCTR_H
#define __EPS_SCTR_H


#include "epsio.h"

#define DEVICE_BLOCK    1
#define OS_BLOCK        2
#define ROOT_BLOCK      3
#define FAT_BLOCK       5
#define USER_BLOCK      0


#define FAT_SECTORS     10
#define FAT_ENTRIES     170
#define DIR_ENTRIES     39

// Typedefs for sector types

typedef struct {
        byte zero;              // Guaranteed to be zero for floppy...
        word block;             // Next block in chain (1 = EOF, 2 = bad)
} FAT_Entry;

typedef struct {
        FAT_Entry entry[FAT_ENTRIES];
        char ID[2];             // "FB"
} FAT_Sector;

typedef FAT_Sector Floppy_FAT[FAT_SECTORS];

#define FATEntry(blk)   ((blk) % FAT_ENTRIES)
#define FATSector(blk)  ((blk) / FAT_ENTRIES)


typedef struct {
        byte reserved;          // 00
        byte filetype;
        char filename[12];
        word filesize;
        word contiguous;        // contiguous blocks before using FAT links
        longword fileptr;
        byte multi_index;       // 00 if not multi
        byte zero;              // 00
        word multi_size;        // 00 for EPS
} Dir_Entry;

typedef struct {
        Dir_Entry entry[DIR_ENTRIES];
        byte zero[8];           // eight 00
        char ID[2];             // "DR"
} Directory;

typedef struct {
        byte peripheral;        // 00
        byte removable;         // 80
        byte version;           // 01
        byte SCSI;              // 00
        word sectors;           // 00 0A
        word heads;             // 00 02
        word cylinders;         // 00 50
        longword blocksize;     // 00 00 02 00
        longword blocks;        // 00 00 06 40
        byte SCSI_medium;       // 1E
        byte SCSI_density;      // 02
        byte reserved[10];      // ten 00
        byte label_header;      // FF if disk label, 00 if not
        char label[7];          // disk label on 16+
        char ID[2];             // "ID"
} Device_Entry;

typedef struct {
        Device_Entry entry;
        byte junk[472];
} Device_Sector;

typedef struct {
        longword blocks_free;   // starts as 00 00 06 31, I think
        byte OS_major;          // 00 if no OS on disk
        byte OS_minor;          // 00 if no OS on disk
        byte ROM_major;         // 00 if no OS on disk
        byte ROM_minor;         // 00 if no OS on disk
        byte junk[20];          // twenty 00
        char ID[2];             // "OS"
} OS_Entry;

typedef struct {
        OS_Entry entry;
        byte junk[482];
} OS_Sector;

typedef union {
        FAT_Sector FAT;
        Device_Sector Device;
        OS_Sector OS;
        SCTR_BUF Raw;
} Sector;

typedef union {
  longword ILong;
  byte     IByte[4];
} ConvLong;

typedef union {
  word IWord;
  byte IByte[2];
} ConvWord;



extern longword ItoM_Long
    (longword l);

extern word ItoM_Word
    (word w);

extern longword MtoI_Long
    (longword l);

extern word MtoI_Word
    (word w);



#endif
