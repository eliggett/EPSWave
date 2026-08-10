//
// RWDISK.H --- header file
//
// Code to read and write raw image to floppy
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// 8/6/1992
//


#ifndef __RWDISK_H
#define __RWDISK_H

#define __RWDISK_VERSION	"1.1"
#define __RWDISK_DATE		"8/11/92"

#include "epsio.h"
#include <io.h>
#include <fcntl.h>
#include <sys\stat.h>


extern int ReadDisk
    (int drive, char* fn);

extern int WriteDisk
    (char* fn, int drive);


#endif