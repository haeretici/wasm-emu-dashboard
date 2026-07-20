#include "display.h"

void S9xInitDisplay(void)
{
   int32_t h = IMAGE_HEIGHT;
   int32_t safety = 32;

   GFX.Pitch = IMAGE_WIDTH * 2;
#ifdef DS2_DMA
   GFX.Screen_buffer = (uint8_t *) AlignedMalloc(GFX.Pitch * h + safety, 32, &PtrAdj.GFXScreen);
#elif defined(_3DS)
   safety = 0x80;
   GFX.Screen_buffer = (uint8_t *) linearMemAlign(GFX.Pitch * h + safety, 0x80);
#else
   GFX.Screen_buffer = (uint8_t *) malloc(GFX.Pitch * h + safety);
#endif
   GFX.SubScreen_buffer = (uint8_t *) malloc(GFX.Pitch * h + safety);
   GFX.ZBuffer_buffer = (uint8_t *) malloc((GFX.Pitch >> 1) * h + safety);
   GFX.SubZBuffer_buffer = (uint8_t *) malloc((GFX.Pitch >> 1) * h + safety);

   GFX.Screen = GFX.Screen_buffer + safety;
   GFX.SubScreen = GFX.SubScreen_buffer + safety;
   GFX.ZBuffer = GFX.ZBuffer_buffer + safety;
   GFX.SubZBuffer = GFX.SubZBuffer_buffer + safety;

   GFX.Delta = (GFX.SubScreen - GFX.Screen) >> 1;
}