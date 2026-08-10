//
// RW_GKH.C --- code to support the GKH file format
//
// Michael Chen		mchen@groucho.cs.psu.edu
//
// 8/24/1992	v1.0	basically just add header to IMG/EUI file.
//

#include "epsio.h"
#include <io.h>
#include <fcntl.h>
#include <sys\stat.h>

typedef struct {
  byte Type;		// what kind of tag
  byte Format;		// tag data format
  union {
    long Long[2];
    word Word[4];
    byte Byte[8];
  } Data;		// tag data
} TagType;

// Tag types

#define DISKFORMAT	1
#define DISKINFO	10
#define DATADUMP	11
#define SUBJECT		20
#define AUTHOR		21

// Info types

#define EPS_TYPE	1
#define UNCOMPRESSED	1
#define EUI		3


#define MAXTAGS		8

typedef struct {
  byte ID[4];		// TDDF
  byte MorI;		// I for Intel encoding, M for Motorola
  byte Version;		// 1 for original
  word Tags;		// number of tags
  TagType Tag[MAXTAGS];	// tag data
} GKHHeader;


int GKHHeaderSize(GKHHeader* hdrp)
{
  return(hdrp->Tags*sizeof(TagType) + 8);
}

void GetTags(GKHHeader* hdrp, int* ip)
{
  *ip = hdrp->Tags;
}

void SetTags(GKHHeader* hdrp, int i)
{
  hdrp->Tags = i;
}

void GetTagWord(TagType tag, int which, int* wp)
{
  /* Intel encoding only */

  *wp = tag.Data.Word[which];
}

void SetTagWord(TagType* tagp, int which, int w)
{
  /* Intel encoding only */

  (*tagp).Data.Word[which] = w;
}

void GetTagLong(TagType tag, int which, long* lp)
{
  /* Intel encoding only */

  *lp = tag.Data.Long[which];
}

void SetTagLong(TagType* tagp, int which, long l)
{
  /* Intel encoding only */

  (*tagp).Data.Long[which] = l;
}

void GetGKHDiskInfo(GKHHeader* hdrp, int* tp, int* hp, int* sp)
{
  int i;

  for (i=0; (i<hdrp->Tags) && (hdrp->Tag[i].Type != DISKINFO); i++);

  if (i < hdrp->Tags)
  {
    GetTagWord(hdrp->Tag[i],0,tp); // number of tracks
    GetTagWord(hdrp->Tag[i],1,hp); // number of heads
    GetTagWord(hdrp->Tag[i],2,sp); // number of sectors per track
    // Assume sector size is 512; don't read last word.
  }
}

void SetGKHDiskInfo(GKHHeader* hdrp, int t, int h, int s)
{
  int i, tags;

  tags = hdrp->Tags;

  for (i=0; (i<tags) && (hdrp->Tag[i].Type != DISKINFO); i++);

  if (i >= tags)
  {
    SetTags(hdrp,i+1);
    hdrp->Tag[i].Type = DISKINFO;
    hdrp->Tag[i].Format = 5;
  }

  SetTagWord(&hdrp->Tag[i],0,t);   // number of tracks
  SetTagWord(&hdrp->Tag[i],1,h);   // number of heads
  SetTagWord(&hdrp->Tag[i],2,s);   // number of sectors per track
  SetTagWord(&hdrp->Tag[1],3,512); // sector size is 512
}

void GetGKHDiskFormat(GKHHeader* hdrp, long* disktypep, long* dumptypep)
{
  int i, tags;

  tags = hdrp->Tags;

  for (i=0; (i<tags) && (hdrp->Tag[i].Type != DISKFORMAT); i++);

  GetTagLong(hdrp->Tag[i],0,disktypep);   // disk type (1 for EPS)
  GetTagLong(hdrp->Tag[i],1,dumptypep);   // dump type (1 for uncompressed)
}

void SetGKHDiskFormat(GKHHeader* hdrp, long disktype, long dumptype)
{
  int i, tags;

  tags = hdrp->Tags;

  for (i=0; (i<tags) && (hdrp->Tag[i].Type != DISKFORMAT); i++);

  if (i >= tags)
  {
    SetTags(hdrp,i+1);
    hdrp->Tag[i].Type = DISKFORMAT;
    hdrp->Tag[i].Format = 4;
  }

  SetTagLong(&hdrp->Tag[i],0,disktype);   // disk type (1 for EPS)
  SetTagLong(&hdrp->Tag[i],1,dumptype);   // dump type (1 for uncompressed)
}

void GetGKHDumpInfo(GKHHeader* hdrp, long* lenp, long* ofsp)
{
  int i, tags;

  tags = hdrp->Tags;

  for (i=0; (i<tags) && (hdrp->Tag[i].Type != DATADUMP); i++);

  GetTagLong(hdrp->Tag[i],0,lenp);   // length of dump
  GetTagLong(hdrp->Tag[i],1,ofsp);   // offset of dump
}

void SetGKHDumpInfo(GKHHeader* hdrp, long len, long ofs)
{
  int i, tags;

  tags = hdrp->Tags;

  for (i=0; (i<tags) && (hdrp->Tag[i].Type != DATADUMP); i++);

  if (i >= tags)
  {
    SetTags(hdrp,i+1);
    hdrp->Tag[i].Type = DATADUMP;
    hdrp->Tag[i].Format = 0xB;
  }

  SetTagLong(&hdrp->Tag[i],0,len);   // length of dump
  SetTagLong(&hdrp->Tag[i],1,ofs);   // offset of dump
}

void GetGKHSubjectInfo(GKHHeader* hdrp, long* lenp, long* ofsp)
{
  int i, tags;

  tags = hdrp->Tags;

  for (i=0; (i<tags) && (hdrp->Tag[i].Type != SUBJECT); i++);

  GetTagLong(hdrp->Tag[i],0,lenp);   // length of subject
  GetTagLong(hdrp->Tag[i],1,ofsp);   // offset of subject
}

void SetGKHSubjectInfo(GKHHeader* hdrp, long len, long ofs)
{
  int i, tags;

  tags = hdrp->Tags;

  for (i=0; (i<tags) && (hdrp->Tag[i].Type != SUBJECT); i++);

  if (i >= tags)
  {
    SetTags(hdrp,i+1);
    hdrp->Tag[i].Type = SUBJECT;
    hdrp->Tag[i].Format = 0xA;
  }

  SetTagLong(&hdrp->Tag[i],0,len);   // length of subject
  SetTagLong(&hdrp->Tag[i],1,ofs);   // offset of subject
}

void GetGKHAuthorInfo(GKHHeader* hdrp, long* lenp, long* ofsp)
{
  int i, tags;

  tags = hdrp->Tags;

  for (i=0; (i<tags) && (hdrp->Tag[i].Type != AUTHOR); i++);

  GetTagLong(hdrp->Tag[i],0,lenp);   // length of author
  GetTagLong(hdrp->Tag[i],1,ofsp);   // offset of author
}

void SetGKHAuthorInfo(GKHHeader* hdrp, long len, long ofs)
{
  int i, tags;

  tags = hdrp->Tags;

  for (i=0; (i<tags) && (hdrp->Tag[i].Type != AUTHOR); i++);

  if (i >= tags)
  {
    SetTags(hdrp,i+1);
    hdrp->Tag[i].Type = AUTHOR;
    hdrp->Tag[i].Format = 0xA;
  }

  SetTagLong(&hdrp->Tag[i],0,len);   // length of author
  SetTagLong(&hdrp->Tag[i],1,ofs);   // offset of author
}

int ReadGKHHeaderInfo(GKHHeader* hdrp, int fh)
{
  int result;

  if ((result = read(fh,hdrp,8)) == -1)
  {
    printf("ReadGKHHeader: error reading file\n");
    return(result);
  }

  if ((result = read(fh,&hdrp->Tag[0],sizeof(TagType)*(hdrp->Tags))) == -1)
  {
    printf("ReadGKHHeader: error reading file\n");
    return(result);
  }
  return 0;
}

int WriteGKHHeaderInfo(GKHHeader* hdrp, int fh)
{
  int result;

  if ((result = write(fh,hdrp,8)) == -1)
  {
    printf("WriteGKHHeader: error writing file\n");
    return(result);
  }

  if ((result = write(fh,&hdrp->Tag[0],sizeof(TagType)*(hdrp->Tags))) == -1)
  {
    printf("WriteGKHHeader: error writing file\n");
    return(result);
  }
  return 0;
}



int WriteGKHtoDisk
    (char* ofn, int drive)
{
  int result, fh, t, h, s, b;
  GKHHeader hdr;
  long l1, l2;
  char* cp;
  char fn[80];

  /* Fix filename */

  strcpy(fn,ofn);
  if (strchr(fn,'.') == 0)
    strcat(fn,".GKH");


  printf("Opening DOS file %s for read.\n",fn);

  if ((fh = open(fn,O_RDONLY|O_BINARY,S_IREAD|S_IWRITE)) == -1)
  {
	printf("Error opening %s for read.\n",fn);
        return(result);
  }

  printf("Reading GKH header.\n");

  if (result = ReadGKHHeaderInfo(&hdr,fh))
  {
	printf("Error reading GKH header.\n");
        return(result);
  }

  GetGKHDiskFormat(&hdr,&l1,&l2);

  if ((l1 != EPS_TYPE) || (l2 != UNCOMPRESSED))
  {
	printf("Error: not uncompressed EPS disk image!\n");
	return(-1);
  }

  GetGKHAuthorInfo(&hdr,&l1,&l2);

  if (l1 > 0)
  {
	if (lseek(fh,l2,SEEK_SET) == -1)
	{
		printf("Error: seek to author info failed!\n");
		return(-1);
	}
	cp = (char*) malloc(l1+1);
	if (read(fh,cp,l1) == -1)
	{
		printf("Error: read of author info failed!\n");
		return(-1);
	}
	*(cp+l1) = '\0';
	printf("\nAuthor info:\n%s\n\n",cp);
        free(cp);
  }
  else printf("No author info in GKH file.\n");

  GetGKHSubjectInfo(&hdr,&l1,&l2);

  if (l1 > 0)
  {
	if (lseek(fh,l2,SEEK_SET) == -1)
	{
		printf("Error: seek to subject info failed!\n");
		return(-1);
	}
	cp = (char*) malloc(l1+1);
	if (read(fh,cp,l1) == -1)
	{
		printf("Error: read of subject info failed!\n");
		return(-1);
	}
	*(cp+l1) = '\0';
	printf("\nSubject info:\n%s\n\n",cp);
	free(cp);
  }
  else printf("No subject info in GKH file.\n");

  GetGKHDiskInfo(&hdr,&t,&h,&s);
  b = t * h * s;

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

  if (b != Blocks)
  {
    printf("Error: disk and file formats differ! (%d vs. %d blks)\n",
      Blocks,b);
    return(-1);
  }

  GetGKHDumpInfo(&hdr,&l1,&l2);

  if (l1 > 0)
  {
	if (lseek(fh,l2,SEEK_SET) == -1)
	{
		printf("Error: seek to dump info failed!\n");
		return(-1);
	}
  }

  result = WriteDiskImage(fh,drive);

  return close(fh);
}


int ReadGKHfromDisk
    (int drive, char* ofn)
{
  int result, fh, hdrsize;
  GKHHeader hdr;
  long l1, l2;
  char a_buf[256]; /* line buffer for cgets */
  char* a_txt;
  int a_len;
  char s_buf[256]; /* line buffer for cgets */
  char* s_txt;
  int s_len;
  char fn[80];

  /* Fix filename */

  strcpy(fn,ofn);
  if (strchr(fn,'.') == 0)
    strcat(fn,".GKH");

  /* Initialize header */

  strncpy(hdr.ID,"TDDF",4);
  hdr.MorI = 'I';
  hdr.Version = 1;
  hdr.Tags = 0;

  SetGKHDiskFormat(&hdr,EPS_TYPE,UNCOMPRESSED);

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

  SetGKHDiskInfo(&hdr,Tracks,Heads,SectorsPerTrack);

  /* Make space in header for tags */

  SetGKHDumpInfo(&hdr,0,0);
  SetGKHSubjectInfo(&hdr,0,0);
  SetGKHAuthorInfo(&hdr,0,0);

  hdrsize = GKHHeaderSize(&hdr);

  /* Get author info */

  printf("Enter author info; CR terminates.\n");
  a_txt = gets(a_buf);
  if ((a_len = strlen(a_buf)) != 0)
  {
    SetGKHAuthorInfo(&hdr,a_len,hdrsize);
    hdrsize += a_len;
  }

  /* Get subject info */

  printf("Enter subject info; CR terminates.\n");
  s_txt = gets(s_buf);
  if ((s_len = strlen(s_buf)) != 0)
  {
    SetGKHSubjectInfo(&hdr,s_len,hdrsize);
    hdrsize += s_len;
  }

  SetGKHDumpInfo(&hdr,Blocks*SectorSize,hdrsize);

  printf("Opening DOS file %s for write.\n",fn);

  if ((fh = open(fn,O_CREAT|O_WRONLY|O_BINARY,S_IREAD|S_IWRITE)) == -1)
  {
	printf("Error opening %s for write.\n",fn);
	return(result);
  }

  printf("Writing GKH header.\n");

  if (result = WriteGKHHeaderInfo(&hdr,fh))
  {
	printf("Error reading GKH header.\n");
        return(result);
  }

  if (a_len)
  {
    printf("Writing author info.\n");
    if ((result = write(fh,a_txt,a_len)) == -1)
    {
      printf("Error writing author info.\n");
      return(result);
    }
  }

  if (s_len)
  {
    printf("Writing subject info.\n");
    if ((result = write(fh,s_txt,s_len)) == -1)
    {
      printf("Error writing subject info.\n");
      return(result);
    }
  }

  result = ReadDiskImage(drive,fh);

  return close(fh);
}
