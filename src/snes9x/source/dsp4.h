
#ifndef _DSP4_H_
#define _DSP4_H_

#include <stdbool.h>
#include "my_types.h"
#include "dsp1.h"

typedef struct
{
   bool     waiting4command;
   bool     half_command;
   uint16_t command;
   uint32_t in_count;
   uint32_t in_index;
   uint32_t out_count;
   uint32_t out_index;
   uint8_t  parameters [512];
   uint8_t  output     [512];
} SDSP4;

extern SDSP4 DSP4;

/* op control */
extern int8_t DSP4_Logic; /* controls op flow */

/* projection format */
//const int16_t PLANE_START = 0x7fff; /* starting distance */
#define PLANE_START 0x7FFF

extern int16_t view_plane; /* viewer location */
extern int16_t far_plane;  /* next milestone into screen */
extern int16_t segments;   /* # raster segments to draw */
extern int16_t raster;     /* current raster line */

extern int16_t project_x; /* current x-position */
extern int16_t project_y; /* current y-position */

extern int16_t project_centerx; /* x-target of projection */
extern int16_t project_centery; /* y-target of projection */

extern int16_t project_x1;    /* current x-distance */
extern int16_t project_x1low; /* lower 16-bits */
extern int16_t project_y1;    /* current y-distance */
extern int16_t project_y1low; /* lower 16-bits */

extern int16_t project_x2; /* next projected x-distance */
extern int16_t project_y2; /* next projected y-distance */

extern int16_t project_pitchx;    /* delta center */
extern int16_t project_pitchxlow; /* lower 16-bits */
extern int16_t project_pitchy;    /* delta center */
extern int16_t project_pitchylow; /* lower 16-bits */

extern int16_t project_focalx; /* x-point of projection at viewer plane */
extern int16_t project_focaly; /* y-point of projection at viewer plane */

extern int16_t project_ptr; /* data structure pointer */

/* render window */
extern int16_t center_x;        /* x-center of viewport */
extern int16_t center_y;        /* y-center of viewport */
extern int16_t viewport_left;   /* x-left of viewport */
extern int16_t viewport_right;  /* x-right of viewport */
extern int16_t viewport_top;    /* y-top of viewport */
extern int16_t viewport_bottom; /* y-bottom of viewport */

/* sprite structure */
extern int16_t sprite_x;      /* projected x-pos of sprite */
extern int16_t sprite_y;      /* projected y-pos of sprite */
extern int16_t sprite_offset; /* data pointer offset */
extern int8_t sprite_type;    /* vehicle, terrain */
extern bool sprite_size;      /* sprite size: 8x8 or 16x16 */

/* path strips */
extern int16_t path_clipRight[4]; /* value to clip to for x>b */
extern int16_t path_clipLeft[4];  /* value to clip to for x<a */
extern int16_t path_pos[4];       /* x-positions of lanes */
extern int16_t path_ptr[4];       /* data structure pointers */
extern int16_t path_raster[4];    /* current raster */
extern int16_t path_top[4];       /* viewport_top */

extern int16_t path_y[2];     /* current y-position */
extern int16_t path_x[2];     /* current focals */
extern int16_t path_plane[2]; /* previous plane */

/* op09 window sorting */
extern int16_t multi_index1; /* index counter */
extern int16_t multi_index2; /* index counter */
extern bool op09_mode;       /* window mode */

/* multi-op storage */
extern int16_t multi_focaly[64];  /* focal_y values */
extern int16_t multi_farplane[4]; /* farthest drawn distance */
extern int16_t multi_raster[4];   /* line where track stops */

/* OAM */
extern int8_t op06_OAM[32]; /* OAM (size,MSB) data */
extern int8_t op06_index;   /* index into OAM table */
extern int8_t op06_offset;  /* offset into OAM table */

#define DSP4_READ_WORD(x) \
   READ_WORD(DSP4.parameters+x)

#define DSP4_WRITE_WORD(x,d) \
   WRITE_WORD(DSP4.output+x,d);

/* used to wait for dsp i/o */
#define DSP4_WAIT(x) \
    DSP4_Logic = x; \
    return

int32_t DSP4_Multiply(int16_t Multiplicand, int16_t Multiplier);
int16_t DSP4_UnknownOP11(int16_t A, int16_t B, int16_t C, int16_t D);
void DSP4_Op06(bool size, bool msb);
void DSP4_Op01(void);
void DSP4_Op07(void);
void DSP4_Op08(void);
void DSP4_Op0D(void);
void DSP4_Op09(void);

#endif
