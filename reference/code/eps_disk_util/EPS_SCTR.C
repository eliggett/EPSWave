//
// EPS_SCTR.C
//
// code containing different ways to look at EPS sectors
//
// Michael Chen         mchen@groucho.cs.psu.edu
//
// 8/10/1992
//

#include "eps_sctr.h"

#define EPS_SCTR_VERSION	"1.1"
#define EPS_SCTR_DATE		"8/10/1992"

longword ItoM_Long(longword l)
{
  int i;
  ConvLong cw, result;

  cw.ILong = l;
  for (i=0; i<4; i++)
    result.IByte[i] = cw.IByte[3-i];
  return(result.ILong);
}

word ItoM_Word(word w)
{
  int i;
  ConvWord cw, result;

  cw.IWord = w;
  for (i=0; i<2; i++)
    result.IByte[i] = cw.IByte[1-i];
  return(result.IWord);
}

longword MtoI_Long(longword l)
{
  // Note that the byte-reversal is its own inverse!

  return ItoM_Long(l);
}

word MtoI_Word(word w)
{
  // Note that the byte-reversal is its own inverse!

  return ItoM_Word(w);
}

