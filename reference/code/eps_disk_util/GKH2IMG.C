//
// GKH2IMG
//
// Rips off that @#$%^%R$E# 58-byte header
//
// Michael Chen 8/12/1992

#include <io.h>
#include <fcntl.h>
#include <sys\stat.h>

#define BUFSIZE      (512*10*2)

void main(int argc,char* argv[])
{
  int ifh, ofh, result, i;
  char buf[BUFSIZE], ifn[80], ofn[80];

  if (--argc != 1)
  {
    printf("usage: GKH2IMG <filename>\n");
    exit(1);
  }

  strcpy(ifn,argv[1]);
  strcpy(ofn,argv[1]);
  strcat(ifn,".GKH");
  strcat(ofn,".IMG");

  printf("Opening %s for read.\n",ifn);
  if ((ifh = open(ifn,O_RDONLY|O_BINARY)) == -1)
  {
    printf("Error opening %s for read!\n",ifn);
    exit(1);
  }

  printf("Opening %s for write.\n",ofn);
  if ((ofh = open(ofn,O_WRONLY|O_CREAT|O_BINARY,S_IREAD|S_IWRITE)) == -1)
  {
    printf("Error opening %s for write!\n",ofn);
    exit(1);
  }

  printf("Skipping 58-byte GKH header.\n");
  if (lseek(ifh,58,SEEK_SET) == -1)
  {
    printf("Error during seek!\n");
    exit(1);
  }

  printf("Copying data.\n");
  for (i=0; i<80; i++)
  {
    if (read(ifh,buf,BUFSIZE) == -1)
    {
      printf("Error reading from %s!\n",argv[1]);
      exit(1);
    }
    if (write(ofh,buf,BUFSIZE) == -1)
    {
      printf("Error writing to %s!\n",argv[2]);
      exit(1);
    }

  }

  close(ifh);
  close(ofh);

  printf("Done!\n");
}
