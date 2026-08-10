//
// Let's try to read from an EPS disk...
//
// SCTREDIT.C --- sector editor for EPS disks
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// v1.0         (8/5)
// v1.01        (8/5)   <CR> = R)ead; error messages
//
// 8/22/1992	v1.10	altered to use variable-format routines
//

#include "sctredit.h"

#define SCTREDIT_VERSION 	"1.10"
#define SCTREDIT_DATE		"8/22/1992"

void SelectByte
     (SCTR_BUF sector,int i)
{
        char buf[3];

        textcolor(SELECT_COLOR);
        gotoxy(1,1);
        cprintf("%3x",i);
        gotoxy(6+XPOS(i)*3,3+YPOS(i));
        sprintf(buf,"%2x",sector[i]);
        if (buf[0] == ' ') buf[0] = '0';
        cprintf("%2s",buf);
        gotoxy(57+XPOS(i),3+YPOS(i));
        cprintf("%c",((isprint(sector[i])) ? sector[i] : '.'));
}


void DeselectByte
     (SCTR_BUF sector,int i)
{
        char buf[3];

        textcolor(PRINT_COLOR);
        gotoxy(6+XPOS(i)*3,3+YPOS(i));
        sprintf(buf,"%2x",sector[i]);
        if (buf[0] == ' ') buf[0] = '0';
        cprintf("%2s",buf);
        gotoxy(57+XPOS(i),3+YPOS(i));
        if (!isprint(sector[i])) textcolor(NONPRINT_COLOR);
        cprintf("%c",((isprint(sector[i])) ? sector[i] : '.'));
}


void DisplaySector
     (SCTR_BUF sector)
{
  int i;

  textcolor(TICK_COLOR);
  for (i=0;i<XNUM;i++)
  {
        gotoxy(6+XPOS(i)*3,1);
        cprintf("%2x",i);
  }
  for (i=0;i<YNUM;i++)
  {
        gotoxy(1,3+YPOS(i*XNUM));
        cprintf("%3x",i*XNUM);
  }
  for (i=0;i<SectorSize;i++)
  {
        DeselectByte(sector,i);
  }
  textcolor(NORMAL_COLOR);
}


void SectorEdit
     (int drv)
{
  SCTR_BUF test;
  int i, blk = USER_BLOCK, quit = 0, redraw = -1, remenu = -1, result = 0;
  int index = 0;

  directvideo = 1;


  if (drv < 0) drv = 0;

  for (i=0; i<3; i++)
  {
    if ((result = LoadDrive(drv)) == 0) break;
  }

  if (result)
  {
    printf("Error setting up drive: %s\n",eps_io_error(result));
    return(result);
  }

  textmode(C4350);
  clrscr();

  ReadBlock(drv,blk,test);

  textcolor(TITLE_COLOR);
  gotoxy(1,43);
  cprintf("EPS Explorer v%s by Michael Chen %s",
    SCTREDIT_VERSION,SCTREDIT_DATE);
  textcolor(NORMAL_COLOR);

  do
  {
        if (redraw)
        {
                DisplaySector(test);
                redraw = 0;
        }

        if (remenu)
        {
                textcolor(MENU_COLOR);
                gotoxy(1,38);
                clreol();
cprintf("   Current drive is %d (%c) : %d trks, %d hds, %d sctrs, %d blks",
  drv,drv+65,Tracks,Heads,SectorsPerTrack,Blocks);
                gotoxy(1,39);
                clreol();
                cprintf("   Current block is %d (trk %d hd %d sec %d)",
		  blk,TrackNum(blk),HeadNum(blk),SectorNum(blk));
		gotoxy(1,41);
		clreol();
		if (result) cprintf(eps_io_error(result));
		else cprintf("   OK.");
		gotoxy(1,36);
		clreol();
		printf(
"D)rive, B)lock, R)ead, V)erify, W)rite, H)ex entry, A)SCII entry, Q)uit");
                remenu = 0;
        }

        SelectByte(test,index);
        textcolor(NORMAL_COLOR);

        i = toupper(getch());

        switch (i)
        {
          case 0:   {
                      DeselectByte(test,index);
                      i = getch();
                      switch (i)
                      {
                        case 'H': if (index-XNUM >= 0) index -= XNUM;
                                  break;
                        case 'K': if (index > 0) index--;
                                  break;
			case 'M': if (index < SectorSize - 1) index++;
				  break;
			case 'P': if (index+XNUM < SectorSize) index += XNUM;
				  break;
		      }
		      break;
		    }
	  case 'Q': quit = -1; break;
	  case 'D': {
			gotoxy(1,38);
			textcolor(YELLOW);
			clreol();
			cprintf("   Change drive to: ");
			cscanf("%i",&drv);
                        remenu = -1;
                        break;
                    }
          case 'B': {
                        gotoxy(1,39);
                        textcolor(YELLOW);
                        clreol();
                        cprintf("   Change block to: ");
                        cscanf("%i",&blk);
                        remenu = -1;
                        break;
                    }
          case 13:
          case 'R': {
                        result = ReadBlock(drv,blk,test);
                        remenu = redraw = -1;
                        break;
                    }    
          case 'V': {
                        result = VerifyBlock(drv,blk);
                        remenu = -1;
                        break;
                    }
          case '+': {
                        blk++;
                        remenu = -1;
                        break;
                    }    
          case '-': {
                        blk--;
                        remenu = -1;
                        break;
                    }    
          case 'W': {
                        gotoxy(1,41);
                        textcolor(YELLOW);
                        clreol();
                        cprintf("Are you sure (Y writes, others abort) ?");
                        remenu = -1;
                        i = toupper(getch());
                        if (i == 'Y')
                        {
                           result = WriteBlock(drv,blk,test);
                           remenu = redraw = -1;
                           break;
                        }
                    }
          case 'H': {   gotoxy(1,41);
                        textcolor(SELECT_COLOR);
                        clreol();
                        cprintf("Change value to Hex: ");
                        cscanf("%x",&i);
                        test[index] = i;
                        remenu = -1;
                        break;
                    }
          case 'A': {   gotoxy(1,41);
                        textcolor(SELECT_COLOR);
                        clreol();
                        cprintf("Change value to ASCII: ");
                        cscanf("%c",&i);
                        test[index] = i;
                        remenu = -1;
                        break;
                    }
        }
  } while (!quit);

  textcolor(NORMAL_COLOR);
  textmode(C80);
}
