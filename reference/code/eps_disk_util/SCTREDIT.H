//
// SCTREDIT.H --- header file for sector editor
//
// Michael Chen         mchen@groucho.cs.psu.edu
//

#ifndef __SCTREDIT_H
#define __SCTREDIT_H

#define __SCTREDIT_VERSION	"1.01"
#define __SCTREDIT_DATE		"8/5/92"

#include "epsio.h"
#include <conio.h>


#define PRINT_COLOR        CYAN
#define NONPRINT_COLOR     DARKGRAY
#define TITLE_COLOR        RED
#define MENU_COLOR         BROWN
#define TICK_COLOR         WHITE
#define NORMAL_COLOR       LIGHTGRAY
#define SELECT_COLOR       MAGENTA


#define YPOS(i) ((i)>>4)
#define XPOS(i) (((i) & 15))
#define XNUM    16
#define YNUM    32


extern void SelectByte
     (SCTR_BUF sector,int i);

extern void DeselectByte
     (SCTR_BUF sector,int i);

extern void DisplaySector
     (SCTR_BUF sector);

extern void SectorEdit
    (int drv);


#endif