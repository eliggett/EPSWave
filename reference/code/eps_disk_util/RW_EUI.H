//
// RW_EUI.H --- header file
//
// Code to read and write my EUI format image to floppy
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// 8/10/1992
//


#ifndef __RW_EUI_H
#define __RW_EUI_H

#include "epsio.h"
#include "eps_sctr.h"
#include <io.h>
#include <fcntl.h>
#include <sys\stat.h>


extern int ReadDiskEUI
    (int drive, char* fn);

extern int WriteDiskEUI
    (char* fn, int drive);


#endif