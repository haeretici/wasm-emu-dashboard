#ifdef __WIN32__
#include <windows.h>
#else
#define MessageBox(owner, text, caption, type) printf("%s: %s\n", caption, text)
#endif

#include "SDL.h"
#include "SDL_thread.h"

#include "shared.h"
#include "sms_ntsc.h"
#include "md_ntsc.h"

// START CDL
uint8_t *g_cdl_buffer = NULL;
uint32_t g_last_z80_rom_read_offset = 0;
uint32_t g_last_68k_rom_read_offset = 0;
// END CDL

#define SOUND_FREQUENCY 48000
#define SOUND_SAMPLES_SIZE  2048

#define VIDEO_WIDTH  320
#define VIDEO_HEIGHT 240

int joynum = 0;

int log_error   = 0;
int debug_on    = 0;
int turbo_mode  = 0;
int use_sound   = 1;
int fullscreen  = 0; /* SDL_FULLSCREEN */
static int sdl_audio_playback_enabled = 1;

/* Emscripten WebAssembly Compatibility Fixes */
#ifdef __EMSCRIPTEN__
  // Browsers don't support or need a dedicated SDL event thread
  #ifndef SDL_INIT_EVENTTHREAD
    #define SDL_INIT_EVENTTHREAD 0
  #endif

  // Emscripten's SDL1 mapper uses the SDL2 style keyboard function naming internally
  #ifdef __cplusplus
  extern "C" {
  #endif
    extern unsigned char *SDL_GetKeyState(int *numkeys);
  #ifdef __cplusplus
  }
  #endif
#endif

/* sound */

struct {
  char* current_pos;
  char* buffer;
  int current_emulated_samples;
} sdl_sound;


static uint8 brm_format[0x40] =
{
  0x5f,0x5f,0x5f,0x5f,0x5f,0x5f,0x5f,0x5f,0x5f,0x5f,0x5f,0x00,0x00,0x00,0x00,0x40,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x53,0x45,0x47,0x41,0x5f,0x43,0x44,0x5f,0x52,0x4f,0x4d,0x00,0x01,0x00,0x00,0x00,
  0x52,0x41,0x4d,0x5f,0x43,0x41,0x52,0x54,0x52,0x49,0x44,0x47,0x45,0x5f,0x5f,0x5f
};


static short soundframe[SOUND_SAMPLES_SIZE];

static void sdl_sound_callback(void *userdata, Uint8 *stream, int len)
{
  if(sdl_sound.current_emulated_samples < len) {
    memset(stream, 0, len);
  }
  else {
    memcpy(stream, sdl_sound.buffer, len);
    /* loop to compensate desync */
    do {
      sdl_sound.current_emulated_samples -= len;
    } while(sdl_sound.current_emulated_samples > 2 * len);
    memcpy(sdl_sound.buffer,
           sdl_sound.current_pos - sdl_sound.current_emulated_samples,
           sdl_sound.current_emulated_samples);
    sdl_sound.current_pos = sdl_sound.buffer + sdl_sound.current_emulated_samples;
  }
}

static int sdl_sound_init(void)
{
  int n;
  SDL_AudioSpec as_desired;

  if(SDL_Init(SDL_INIT_AUDIO) < 0) {
    MessageBox(NULL, "SDL Audio initialization failed", "Error", 0);
    return 0;
  }

  as_desired.freq     = SOUND_FREQUENCY;
  as_desired.format   = AUDIO_S16SYS;
  as_desired.channels = 2;
  as_desired.samples  = SOUND_SAMPLES_SIZE;
  as_desired.callback = sdl_sound_callback;

  if(SDL_OpenAudio(&as_desired, NULL) == -1) {
    MessageBox(NULL, "SDL Audio open failed", "Error", 0);
    return 0;
  }

  sdl_sound.current_emulated_samples = 0;
  n = SOUND_SAMPLES_SIZE * 2 * sizeof(short) * 20;
  sdl_sound.buffer = (char*)malloc(n);
  if(!sdl_sound.buffer) {
    MessageBox(NULL, "Can't allocate audio buffer", "Error", 0);
    return 0;
  }
  memset(sdl_sound.buffer, 0, n);
  sdl_sound.current_pos = sdl_sound.buffer;
  return 1;
}

static void sdl_sound_update(int enabled)
{
  int size = audio_update(soundframe) * 2;

  // Strict Bounds Guard
  if (size > SOUND_SAMPLES_SIZE) {
    size = SOUND_SAMPLES_SIZE;
  }

  if (enabled && sdl_sound.buffer)
  {
    int i;
    short *out;

    SDL_LockAudio();

    // Safety check: Prevent current_pos from running past the allocated buffer size
    int allocated_bytes = SOUND_SAMPLES_SIZE * 2 * sizeof(short) * 20;
    if ((sdl_sound.current_pos - sdl_sound.buffer) + (size * sizeof(short)) >= allocated_bytes) {
        // Reset back to start of buffer if we are about to overflow
        sdl_sound.current_pos = sdl_sound.buffer;
        sdl_sound.current_emulated_samples = 0;
    }

    out = (short*)sdl_sound.current_pos;
    for(i = 0; i < size; i++)
    {
      *out++ = soundframe[i];
    }
    sdl_sound.current_pos = (char*)out;
    sdl_sound.current_emulated_samples += size * sizeof(short);
    SDL_UnlockAudio();
  }
}

static void sdl_sound_clear_buffer(void)
{
  if (!sdl_sound.buffer) return;

  SDL_LockAudio();
  sdl_sound.current_pos = sdl_sound.buffer;
  sdl_sound.current_emulated_samples = 0;
  SDL_UnlockAudio();
}

static void sdl_sound_close(void)
{
  SDL_PauseAudio(1);
  SDL_CloseAudio();
  if (sdl_sound.buffer)
    free(sdl_sound.buffer);
  sdl_audio_playback_enabled = 0;
}

/* video */
md_ntsc_t *md_ntsc;
sms_ntsc_t *sms_ntsc;

/* Timer Sync */

struct {
  SDL_sem* sem_sync;
  unsigned ticks;
} sdl_sync;

static Uint32 sdl_sync_timer_callback(Uint32 interval)
{
  SDL_SemPost(sdl_sync.sem_sync);
  sdl_sync.ticks++;
  if (sdl_sync.ticks == (vdp_pal ? 50 : 20))
  {
    SDL_Event event;
    SDL_UserEvent userevent;

    userevent.type = SDL_USEREVENT;
    userevent.code = 60;
    userevent.data1 = NULL;
    userevent.data2 = NULL;
    // FIX: Remove sdl_video.frames_rendered from the assignment loop
    sdl_sync.ticks = 0;

    event.type = SDL_USEREVENT;
    event.user = userevent;

    SDL_PushEvent(&event);
  }
  return interval;
}

static int sdl_sync_init(void)
{
  if(SDL_InitSubSystem(SDL_INIT_TIMER|SDL_INIT_EVENTTHREAD) < 0)
  {
    MessageBox(NULL, "SDL Timer initialization failed", "Error", 0);
    return 0;
  }

  sdl_sync.sem_sync = SDL_CreateSemaphore(0);
  sdl_sync.ticks = 0;
  return 1;
}

static void sdl_sync_close()
{
  if(sdl_sync.sem_sync)
    SDL_DestroySemaphore(sdl_sync.sem_sync);
}

static const uint16 vc_table[4][2] =
{
  /* NTSC, PAL */
  {0xDA , 0xF2},  /* Mode 4 (192 lines) */
  {0xEA , 0x102}, /* Mode 5 (224 lines) */
  {0xDA , 0xF2},  /* Mode 4 (192 lines) */
  {0x106, 0x10A}  /* Mode 5 (240 lines) */
};

static int reset_region() {
    config.region_detect = (config.region_detect + 1) % 5;
    get_region(0);

    // framerate has changed, reinitialize audio timings
    audio_init(snd.sample_rate, 0);

    // system with region BIOS should be reinitialized
    if ((system_hw == SYSTEM_MCD) || ((system_hw & SYSTEM_SMS) && (config.bios & 1)))
    {
      system_init();
      system_reset();
    }
    else
    {
      // reinitialize I/O region register
      if (system_hw == SYSTEM_MD)
      {
        io_reg[0x00] = 0x20 | region_code | (config.bios & 1);
      }
      else
      {
        io_reg[0x00] = 0x80 | (region_code >> 1);
      }

      // reinitialize VDP
      if (vdp_pal)
      {
        status |= 1;
        lines_per_frame = 313;
      }
      else
      {
        status &= ~1;
        lines_per_frame = 262;
      }

      // reinitialize VC max value
      switch (bitmap.viewport.h)
      {
        case 192:
          vc_max = vc_table[0][vdp_pal];
          break;
        case 224:
          vc_max = vc_table[1][vdp_pal];
          break;
        case 240:
          vc_max = vc_table[3][vdp_pal];
          break;
      }
    }

    return 0;
}

static int sdl_control_update(SDLKey keystate)
{
    /*
    switch (keystate)
    {
      case SDLK_TAB:
      {
        system_reset();
        break;
      }

      case SDLK_F1:
      {
        if (SDL_ShowCursor(-1)) SDL_ShowCursor(0);
        else SDL_ShowCursor(1);
        break;
      }

      case SDLK_F3:
      {
        if (config.bios == 0) config.bios = 3;
        else if (config.bios == 3) config.bios = 1;
        break;
      }

      case SDLK_F4:
      {
        if (!turbo_mode) use_sound ^= 1;
        break;
      }

      case SDLK_F5:
      {
        log_error ^= 1;
        break;
      }

      case SDLK_F6:
      {
        if (!use_sound)
        {
          turbo_mode ^=1;
          sdl_sync.ticks = 0;
        }
        break;
      }

      case SDLK_F7:
      {
        FILE *f = fopen("game.gp0","rb");
        if (f)
        {
          uint8 buf[STATE_SIZE];
          fread(&buf, STATE_SIZE, 1, f);
          state_load(buf);
          fclose(f);
        }
        break;
      }

      case SDLK_F8:
      {
        FILE *f = fopen("game.gp0","wb");
        if (f)
        {
          uint8 buf[STATE_SIZE];
          int len = state_save(buf);
          fwrite(&buf, len, 1, f);
          fclose(f);
        }
        break;
      }

      case SDLK_F9:
      {
        config.region_detect = (config.region_detect + 1) % 5;
        get_region(0);

        // framerate has changed, reinitialize audio timings
        audio_init(snd.sample_rate, 0);

        // system with region BIOS should be reinitialized
        if ((system_hw == SYSTEM_MCD) || ((system_hw & SYSTEM_SMS) && (config.bios & 1)))
        {
          system_init();
          system_reset();
        }
        else
        {
          // reinitialize I/O region register
          if (system_hw == SYSTEM_MD)
          {
            io_reg[0x00] = 0x20 | region_code | (config.bios & 1);
          }
          else
          {
            io_reg[0x00] = 0x80 | (region_code >> 1);
          }

          // reinitialize VDP
          if (vdp_pal)
          {
            status |= 1;
            lines_per_frame = 313;
          }
          else
          {
            status &= ~1;
            lines_per_frame = 262;
          }

          // reinitialize VC max value
          switch (bitmap.viewport.h)
          {
            case 192:
              vc_max = vc_table[0][vdp_pal];
              break;
            case 224:
              vc_max = vc_table[1][vdp_pal];
              break;
            case 240:
              vc_max = vc_table[3][vdp_pal];
              break;
          }
        }
        break;
      }

      case SDLK_F10:
      {
        gen_reset(0);
        break;
      }

      case SDLK_F11:
      {
        config.overscan =  (config.overscan + 1) & 3;
        if ((system_hw == SYSTEM_GG) && !config.gg_extra)
        {
          bitmap.viewport.x = (config.overscan & 2) ? 14 : -48;
        }
        else
        {
          bitmap.viewport.x = (config.overscan & 2) * 7;
        }
        bitmap.viewport.changed = 3;
        break;
      }

      case SDLK_F12:
      {
        joynum = (joynum + 1) % MAX_DEVICES;
        while (input.dev[joynum] == NO_DEVICE)
        {
          joynum = (joynum + 1) % MAX_DEVICES;
        }
        break;
      }

      case SDLK_ESCAPE:
      {
        return 0;
      }

      default:
        break;
    }
    */
   return 1;
}

#ifdef __EMSCRIPTEN__
/* Controller state supplied from JavaScript (e.g. Gamepad API). */
static uint16_t js_input_pad[MAX_DEVICES];
static int16_t js_input_analog[MAX_DEVICES][2];
#endif

int sdl_input_update(void)
{
  uint8 *keystate = SDL_GetKeyState(NULL);

#ifdef __EMSCRIPTEN__
  {
    int i;
    for (i = 0; i < MAX_DEVICES; i++)
    {
      input.pad[i] = js_input_pad[i];
      input.analog[i][0] = js_input_analog[i][0];
      input.analog[i][1] = js_input_analog[i][1];
    }
  }
#else
  /* reset input */
  input.pad[joynum] = 0;
#endif

  switch (input.dev[joynum])
  {
#ifdef __EMSCRIPTEN__
    case DEVICE_PAD2B:
    case DEVICE_PAD3B:
    case DEVICE_PAD6B:
      break;
#endif

    case DEVICE_LIGHTGUN:
    {
      /* get mouse coordinates (absolute values) */
      int x,y;
      int state = SDL_GetMouseState(&x,&y);

      /* X axis */
      input.analog[joynum][0] =  x - (VIDEO_WIDTH-bitmap.viewport.w)/2;

      /* Y axis */
      input.analog[joynum][1] =  y - (VIDEO_HEIGHT-bitmap.viewport.h)/2;

      /* TRIGGER, B, C (Menacer only), START (Menacer & Justifier only) */
      if(state & SDL_BUTTON_LMASK) input.pad[joynum] |= INPUT_A;
      if(state & SDL_BUTTON_RMASK) input.pad[joynum] |= INPUT_B;
      if(state & SDL_BUTTON_MMASK) input.pad[joynum] |= INPUT_C;
      if(keystate[SDLK_f])  input.pad[joynum] |= INPUT_START;
      break;
    }

    case DEVICE_PADDLE:
    {
      /* get mouse (absolute values) */
      int x;
      int state = SDL_GetMouseState(&x, NULL);

      /* Range is [0;256], 128 being middle position */
      input.analog[joynum][0] = x * 256 /VIDEO_WIDTH;

      /* Button I -> 0 0 0 0 0 0 0 I*/
      if(state & SDL_BUTTON_LMASK) input.pad[joynum] |= INPUT_B;

      break;
    }

    case DEVICE_SPORTSPAD:
    {
      /* get mouse (relative values) */
      int x,y;
      int state = SDL_GetRelativeMouseState(&x,&y);

      /* Range is [0;256] */
      input.analog[joynum][0] = (unsigned char)(-x & 0xFF);
      input.analog[joynum][1] = (unsigned char)(-y & 0xFF);

      /* Buttons I & II -> 0 0 0 0 0 0 II I*/
      if(state & SDL_BUTTON_LMASK) input.pad[joynum] |= INPUT_B;
      if(state & SDL_BUTTON_RMASK) input.pad[joynum] |= INPUT_C;

      break;
    }

    case DEVICE_MOUSE:
    {
      /* get mouse (relative values) */
      int x,y;
      int state = SDL_GetRelativeMouseState(&x,&y);

      /* Sega Mouse range is [-256;+256] */
      input.analog[joynum][0] = x * 2;
      input.analog[joynum][1] = y * 2;

      /* Vertical movement is upsidedown */
      if (!config.invert_mouse)
        input.analog[joynum][1] = 0 - input.analog[joynum][1];

      /* Start,Left,Right,Middle buttons -> 0 0 0 0 START MIDDLE RIGHT LEFT */
      if(state & SDL_BUTTON_LMASK) input.pad[joynum] |= INPUT_B;
      if(state & SDL_BUTTON_RMASK) input.pad[joynum] |= INPUT_C;
      if(state & SDL_BUTTON_MMASK) input.pad[joynum] |= INPUT_A;
      if(keystate[SDLK_f])  input.pad[joynum] |= INPUT_START;

      break;
    }

    case DEVICE_XE_1AP:
    {
      /* A,B,C,D,Select,START,E1,E2 buttons -> E1(?) E2(?) START SELECT(?) A B C D */
      if(keystate[SDLK_a])  input.pad[joynum] |= INPUT_START;
      if(keystate[SDLK_s])  input.pad[joynum] |= INPUT_A;
      if(keystate[SDLK_d])  input.pad[joynum] |= INPUT_C;
      if(keystate[SDLK_f])  input.pad[joynum] |= INPUT_Y;
      if(keystate[SDLK_z])  input.pad[joynum] |= INPUT_B;
      if(keystate[SDLK_x])  input.pad[joynum] |= INPUT_X;
      if(keystate[SDLK_c])  input.pad[joynum] |= INPUT_MODE;
      if(keystate[SDLK_v])  input.pad[joynum] |= INPUT_Z;

      /* Left Analog Stick (bidirectional) */
      if(keystate[SDLK_UP])     input.analog[joynum][1]-=2;
      else if(keystate[SDLK_DOWN])   input.analog[joynum][1]+=2;
      else input.analog[joynum][1] = 128;
      if(keystate[SDLK_LEFT])   input.analog[joynum][0]-=2;
      else if(keystate[SDLK_RIGHT])  input.analog[joynum][0]+=2;
      else input.analog[joynum][0] = 128;

      /* Right Analog Stick (unidirectional) */
      if(keystate[SDLK_KP8])    input.analog[joynum+1][0]-=2;
      else if(keystate[SDLK_KP2])   input.analog[joynum+1][0]+=2;
      else if(keystate[SDLK_KP4])   input.analog[joynum+1][0]-=2;
      else if(keystate[SDLK_KP6])  input.analog[joynum+1][0]+=2;
      else input.analog[joynum+1][0] = 128;

      /* Limiters */
      if (input.analog[joynum][0] > 0xFF) input.analog[joynum][0] = 0xFF;
      else if (input.analog[joynum][0] < 0) input.analog[joynum][0] = 0;
      if (input.analog[joynum][1] > 0xFF) input.analog[joynum][1] = 0xFF;
      else if (input.analog[joynum][1] < 0) input.analog[joynum][1] = 0;
      if (input.analog[joynum+1][0] > 0xFF) input.analog[joynum+1][0] = 0xFF;
      else if (input.analog[joynum+1][0] < 0) input.analog[joynum+1][0] = 0;
      if (input.analog[joynum+1][1] > 0xFF) input.analog[joynum+1][1] = 0xFF;
      else if (input.analog[joynum+1][1] < 0) input.analog[joynum+1][1] = 0;

      break;
    }

    case DEVICE_PICO:
    {
      /* get mouse (absolute values) */
      int x,y;
      int state = SDL_GetMouseState(&x,&y);

      /* Calculate X Y axis values */
      input.analog[0][0] = 0x3c  + (x * (0x17c-0x03c+1)) / VIDEO_WIDTH;
      input.analog[0][1] = 0x1fc + (y * (0x2f7-0x1fc+1)) / VIDEO_HEIGHT;

      /* Map mouse buttons to player #1 inputs */
      if(state & SDL_BUTTON_MMASK) pico_current = (pico_current + 1) & 7;
      if(state & SDL_BUTTON_RMASK) input.pad[0] |= INPUT_PICO_RED;
      if(state & SDL_BUTTON_LMASK) input.pad[0] |= INPUT_PICO_PEN;

      break;
    }

    case DEVICE_TEREBI:
    {
      /* get mouse (absolute values) */
      int x,y;
      int state = SDL_GetMouseState(&x,&y);

      /* Calculate X Y axis values */
      input.analog[0][0] = (x * 250) / VIDEO_WIDTH;
      input.analog[0][1] = (y * 250) / VIDEO_HEIGHT;

      /* Map mouse buttons to player #1 inputs */
      if(state & SDL_BUTTON_RMASK) input.pad[0] |= INPUT_B;

      break;
    }

    case DEVICE_GRAPHIC_BOARD:
    {
      /* get mouse (absolute values) */
      int x,y;
      int state = SDL_GetMouseState(&x,&y);

      /* Calculate X Y axis values */
      input.analog[0][0] = (x * 255) / VIDEO_WIDTH;
      input.analog[0][1] = (y * 255) / VIDEO_HEIGHT;

      /* Map mouse buttons to player #1 inputs */
      if(state & SDL_BUTTON_LMASK) input.pad[0] |= INPUT_GRAPHIC_PEN;
      if(state & SDL_BUTTON_RMASK) input.pad[0] |= INPUT_GRAPHIC_MENU;
      if(state & SDL_BUTTON_MMASK) input.pad[0] |= INPUT_GRAPHIC_DO;

      break;
    }

    case DEVICE_SMASH:
    {
      if(keystate[SDLK_KP9])  input.pad[joynum] |= INPUT_SMASH_UP_RIGHT;
      if(keystate[SDLK_KP8])  input.pad[joynum] |= INPUT_SMASH_UP;
      if(keystate[SDLK_KP7])  input.pad[joynum] |= INPUT_SMASH_UP_LEFT;
      if(keystate[SDLK_KP6])  input.pad[joynum] |= INPUT_SMASH_RIGHT;
      if(keystate[SDLK_KP5])  input.pad[joynum] |= INPUT_SMASH_CENTER;
      if(keystate[SDLK_KP4])  input.pad[joynum] |= INPUT_SMASH_LEFT;
      if(keystate[SDLK_KP3])  input.pad[joynum] |= INPUT_SMASH_DOWN_RIGHT;
      if(keystate[SDLK_KP2])  input.pad[joynum] |= INPUT_SMASH_DOWN;
      if(keystate[SDLK_KP1])  input.pad[joynum] |= INPUT_SMASH_DOWN_LEFT;
      break;
    }

    case DEVICE_ACTIVATOR:
    {
      if(keystate[SDLK_g])  input.pad[joynum] |= INPUT_ACTIVATOR_7L;
      if(keystate[SDLK_h])  input.pad[joynum] |= INPUT_ACTIVATOR_7U;
      if(keystate[SDLK_j])  input.pad[joynum] |= INPUT_ACTIVATOR_8L;
      if(keystate[SDLK_k])  input.pad[joynum] |= INPUT_ACTIVATOR_8U;
    }

    default:
    {
      if(keystate[SDLK_a])  input.pad[joynum] |= INPUT_A;
      if(keystate[SDLK_s])  input.pad[joynum] |= INPUT_B;
      if(keystate[SDLK_d])  input.pad[joynum] |= INPUT_C;
      if(keystate[SDLK_f])  input.pad[joynum] |= INPUT_START;
      if(keystate[SDLK_z])  input.pad[joynum] |= INPUT_X;
      if(keystate[SDLK_x])  input.pad[joynum] |= INPUT_Y;
      if(keystate[SDLK_c])  input.pad[joynum] |= INPUT_Z;
      if(keystate[SDLK_v])  input.pad[joynum] |= INPUT_MODE;

      if(keystate[SDLK_UP]) input.pad[joynum] |= INPUT_UP;
      else
      if(keystate[SDLK_DOWN]) input.pad[joynum] |= INPUT_DOWN;
      if(keystate[SDLK_LEFT]) input.pad[joynum] |= INPUT_LEFT;
      else
      if(keystate[SDLK_RIGHT]) input.pad[joynum] |= INPUT_RIGHT;

      break;
    }
  }
  return 1;
}


#ifdef __EMSCRIPTEN__
#include <emscripten.h>
void notify_sdl_audio_ready(void);
#endif
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Global running state variables
int running = 1;

/* MD ROM word-patch cheats (Game Genie style). Declared early so ROM load can reset them. */
#define MD_MAX_CHEATS 64
typedef struct {
    int enabled;
    uint32_t address;
    uint16_t value;
    uint16_t saved;
    int has_saved;
} md_cheat_t;
static md_cheat_t g_md_cheats[MD_MAX_CHEATS];
static int g_md_num_cheats = 0;
int system_initialized = 0;

// Screen buffer tracking
static uint8_t *rgba8ScreenBuffer = NULL;

// Helper macro for logging
#define CONSOLE_LOG(...) do { \
    printf("🕹️ [WASM LOG] " __VA_ARGS__); \
    printf("\n"); \
    fflush(stdout); \
} while(0)

/* * Exposed to JavaScript to grab raw RGBA pixels frame by frame.
 * Converts internal 16-bit RGB565 to standard 32-bit RGBA.
 */
EMSCRIPTEN_KEEPALIVE
uint8_t *get_screen_buffer_ptr(void) {
    // 1. Get the actual dynamic dimensions from the emulator core viewport
    int width  = bitmap.viewport.w;
    int height = bitmap.viewport.h;

    // Fallback/Guard if the emulator hasn't fully booted a frame yet
    if (width <= 0 || height <= 0) {
        width = VIDEO_WIDTH;
        height = 240;
    }

    // 2. Allocate or reallocate the buffer only if the dimensions change
    static int current_w = 0;
    static int current_h = 0;

    if (!rgba8ScreenBuffer || width != current_w || height != current_h) {
        if (rgba8ScreenBuffer) free(rgba8ScreenBuffer);

        rgba8ScreenBuffer = (uint8_t *)malloc(width * height * 4);
        current_w = width;
        current_h = height;

        if (!rgba8ScreenBuffer) return NULL;
    }

    if (!running || !bitmap.data) {
        return rgba8ScreenBuffer;
    }

    // 3. Process exactly the active frame size using pitch matching
    // Genesis Plus GX uses bitmap.pitch to determine bytes per row
    uint8_t *src_pixels = (uint8_t *)bitmap.data;

    for (int y = 0; y < height; y++) {
        // Calculate the starting pointer for the current row in the source
        unsigned short *row_src = (unsigned short *)(src_pixels + (y * bitmap.pitch));

        for (int x = 0; x < width; x++) {
            unsigned short col = row_src[x];

            unsigned char r = ((col >> 11) & 0x1F) << 3;
            unsigned char g = ((col >> 5)  & 0x3F) << 2;
            unsigned char b = ((col >> 0)  & 0x1F) << 3;

            int dest_idx = (y * width + x) * 4;
            rgba8ScreenBuffer[dest_idx + 0] = r;
            rgba8ScreenBuffer[dest_idx + 1] = g;
            rgba8ScreenBuffer[dest_idx + 2] = b;
            rgba8ScreenBuffer[dest_idx + 3] = 0xFF;
        }
    }

    return rgba8ScreenBuffer;
}

// Helper functions to tell JavaScript what the current resolution is
EMSCRIPTEN_KEEPALIVE int get_screen_width(void)  { return bitmap.viewport.w > 0 ? bitmap.viewport.w : VIDEO_WIDTH; }
EMSCRIPTEN_KEEPALIVE int get_screen_height(void) { return bitmap.viewport.h > 0 ? bitmap.viewport.h : VIDEO_HEIGHT; }

/* * Exposed to JavaScript to grab the raw pointer to the Color RAM (CRAM).
 * Genesis Plus GX stores the raw 9-bit colors in the global 'cram' array (128 bytes / 64 words).
 */
EMSCRIPTEN_KEEPALIVE
void* get_active_palette_ptr(void) {
    return (void*)cram;
}

/* Legacy alias used by older palette widgets. */
EMSCRIPTEN_KEEPALIVE
void* get_cram_ptr(void) {
    return get_active_palette_ptr();
}

EMSCRIPTEN_KEEPALIVE
unsigned int get_save_state_size(void) {
    return STATE_SIZE;
}

// Saves the current game state into a persistent static buffer and returns its pointer
EMSCRIPTEN_KEEPALIVE
unsigned char *save_state(void) {
    // A static buffer allows safe pointer sharing across boundaries without malloc overhead
    static uint8 buf[STATE_SIZE];

    // Clear the buffer first to ensure clean padding if needed
    memset(buf, 0, STATE_SIZE);

    // Invoke your internal save function (maps to your F8 behavior)
    state_save(buf);

    return (unsigned char *)buf;
}

// Restores a game state from an incoming data buffer
EMSCRIPTEN_KEEPALIVE
bool load_state(const unsigned char* data, unsigned int size) {
    if (!data || size == 0) {
        return false;
    }

    static uint8 buf[STATE_SIZE];
    memset(buf, 0, STATE_SIZE);

    // Guard against buffer overflows if an oversized state is passed
    unsigned int bytes_to_copy = (size > STATE_SIZE) ? STATE_SIZE : size;
    memcpy(buf, data, bytes_to_copy);

    // Invoke your internal load function (maps to your F7 behavior)
    state_load(buf);

    return true;
}

EMSCRIPTEN_KEEPALIVE
unsigned char *my_malloc(unsigned int length){
    return (unsigned char*)calloc(length, sizeof(unsigned char));
}

EMSCRIPTEN_KEEPALIVE
void my_free(unsigned char *ptr){
    free(ptr);
}

// Single-frame execution loop
EMSCRIPTEN_KEEPALIVE
void run_frame(void) {
    SDL_Event event;

    static int first_frame_logged = 0;
    if (!first_frame_logged) {
        CONSOLE_LOG("First main loop iteration successfully fired!");
        first_frame_logged = 1;
    }

    // Process events (Input/Audio events only now)
    if (SDL_PollEvent(&event)) {
        switch(event.type) {
            case SDL_QUIT: {
                CONSOLE_LOG("SDL_QUIT event received.");
                running = 0;
                break;
            }
            case SDL_KEYDOWN: {
                running = sdl_control_update(event.key.keysym.sym);
                break;
            }
        }
    }

    // Core emulator logic tick updates
    // (Removed: sdl_video_update layer)

    // Execute a single core emulator frame (renders into bitmap.data)
  if (system_hw == SYSTEM_MCD)
  {
    system_frame_scd(0);
  }
  else if ((system_hw & SYSTEM_PBC) == SYSTEM_MD)
  {
    system_frame_gen(0);
  }
  else
  {
    system_frame_sms(0);
  }

    /* audio_update() must run every frame (sound chip timing). The enabled
     * argument only controls whether samples are written to the SDL buffer. */
    sdl_sound_update(use_sound && sdl_audio_playback_enabled);

    // Graceful Shutdown Handler
    if (!running) {
        CONSOLE_LOG("Shutdown requested. Tearing down contexts...");
        #ifdef __EMSCRIPTEN__
        emscripten_cancel_main_loop();
        #endif

        if (sram.on) {
            FILE *fp = fopen("./game.srm", "wb");
            if (fp) {
                fwrite(sram.sram, 0x10000, 1, fp);
                fclose(fp);
                CONSOLE_LOG("SRAM saved successfully.");
            }
        }

        audio_shutdown();
        error_shutdown();
        sdl_sound_close();
        sdl_sync_close();

        if (rgba8ScreenBuffer) {
            free(rgba8ScreenBuffer);
            rgba8ScreenBuffer = NULL;
        }
        if (bitmap.data) {
            free(bitmap.data);
            bitmap.data = NULL;
        }

        SDL_Quit();
        CONSOLE_LOG("Shutdown execution completely finalized.");
        exit(0);
    }
}

int main (int argc, char **argv) {
    CONSOLE_LOG("Entering main() routine. argc count = %d", argc);

    if (argc < 2 || argv[1] == NULL) {
        CONSOLE_LOG("Bypassing initial run (argc < 2). Standing by for callMain().");
        return 0;
    }

    CONSOLE_LOG("Target ROM payload detected: '%s'", argv[1]);

    if (system_initialized) {
        CONSOLE_LOG("Active context detected. Re-initializing engine environment layers...");
        #ifdef __EMSCRIPTEN__
        emscripten_cancel_main_loop();
        #endif
        reset_region();
        system_reset();
        audio_shutdown();
        sdl_sound_close();
        sdl_sync_close();

        if(sdl_sound.buffer) {
            free(sdl_sound.buffer);
            sdl_sound.buffer = NULL;
        }
    }

    CONSOLE_LOG("Executing core load_rom() routine for resource parsing...");
    if(!load_rom(argv[1])) {
        CONSOLE_LOG("❌ CRITICAL: load_rom() failed to parse data for: %s", argv[1]);
        return 1;
    }
    /* Fresh ROM image: drop previous patch list without restoring old cart data. */
    g_md_num_cheats = 0;
    // START CDL After ROM is loaded and the size is known
    if (g_cdl_buffer != NULL) {
        free(g_cdl_buffer);
    }
    g_cdl_buffer = calloc(1, cart.romsize);
    // END CLD

    CONSOLE_LOG("load_rom() successfully finalized file mapping pointers.");

    /* Initialize Non-Video SDL Sub-systems */
    CONSOLE_LOG("Initializing core SDL backend layer systems...");
    if(SDL_Init(SDL_INIT_AUDIO | SDL_INIT_TIMER) < 0) {
        CONSOLE_LOG("❌ CRITICAL: Base SDL_Init mapping sequence failed.");
        return 1;
    }

    if (use_sound) {
        CONSOLE_LOG("Initializing SDL Audio Specs...");
        sdl_sound_init();
    }

    CONSOLE_LOG("Initializing SDL Core Hardware Sync Timers...");
    sdl_sync_init();
    system_initialized = 1;

    /* * MANUALLY ALLOCATE VIDEO CANVAS
     * Replacing the old SDL Surface assignment with raw heap allocations.
     */
    CONSOLE_LOG("Allocating customized decoupled backend core frame buffer variables...");
    memset(&bitmap, 0, sizeof(t_bitmap));
    bitmap.width        = 720;
    bitmap.height       = 576;
    bitmap.pitch        = (bitmap.width * 2);
    bitmap.data         = malloc(bitmap.width * bitmap.height * 2); // 16bpp allocation

    if (bitmap.data == NULL) {
        CONSOLE_LOG("❌ CRITICAL: Custom heap video buffer allocation failed!");
        return 1;
    }
    memset(bitmap.data, 0, bitmap.width * bitmap.height * 2);
    bitmap.viewport.changed = 3;

    set_config_defaults();
    config.region_detect = 1;
    config.vdp_mode = 0;

    CONSOLE_LOG("Initializing core audio sampling frequency handlers...");
    audio_init(SOUND_FREQUENCY, 0);

    CONSOLE_LOG("Executing system_init virtual components mapping...");
    system_init();

    CONSOLE_LOG("Triggering core emulator architecture master reset loop...");
    system_reset();

    if(use_sound) {
        CONSOLE_LOG("Initializing SDL audio playback state.");
        sdl_audio_playback_enabled = 1;
        SDL_PauseAudio(0);
#ifdef __EMSCRIPTEN__
        notify_sdl_audio_ready();
#endif
    }

    #ifdef __EMSCRIPTEN__
    CONSOLE_LOG("Handing frame orchestration routines over to emscripten_set_main_loop...");
    running = 1;
    emscripten_set_main_loop(run_frame, 0, 0);
    CONSOLE_LOG("emscripten_set_main_loop call setup passed.");
    #endif

    return 0;
}

EMSCRIPTEN_KEEPALIVE
int init_emulator(uint8_t *rom_data, size_t rom_size, int sample_rate) {
    FILE *f = fopen("rom.bin", "wb");
    if (f) {
        fwrite(rom_data, 1, rom_size, f);
        fclose(f);
    }
    char *args[] = {"md", "rom.bin"};
    main(2, args);
    return 1;
}

EMSCRIPTEN_KEEPALIVE
void set_audio_playback(int enabled)
{
    sdl_audio_playback_enabled = enabled ? 1 : 0;

    if (!sdl_audio_playback_enabled) {
        sdl_sound_clear_buffer();
    }
}

EMSCRIPTEN_KEEPALIVE
void pause_emulator(void) {
    emscripten_cancel_main_loop();
}

EMSCRIPTEN_KEEPALIVE
void resume_emulator(void) {
    emscripten_cancel_main_loop();
    emscripten_set_main_loop(run_frame, 0, 0);
}

EMSCRIPTEN_KEEPALIVE
void reset_emulator(void) {
    gen_reset(0);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* get_active_cdl_ptr(void) {
    return g_cdl_buffer;
}

EMSCRIPTEN_KEEPALIVE
int get_active_cdl_size(void) {
    return cart.romsize;
}

/*
 * Set the full digital/analog controller state for a player from JavaScript.
 *
 * player:    device index in input.pad[] (0 = port A player 1, 4 = port B player 1)
 * pad:       button bitmask using INPUT_* constants from input.h, e.g.:
 *              INPUT_UP (0x0001), INPUT_DOWN (0x0002), INPUT_LEFT (0x0004),
 *              INPUT_RIGHT (0x0008), INPUT_B (0x0010), INPUT_C (0x0020),
 *              INPUT_A (0x0040), INPUT_START (0x0080), INPUT_Z (0x0100),
 *              INPUT_Y (0x0200), INPUT_X (0x0400), INPUT_MODE (0x0800)
 * analog_x:  horizontal analog value (0 for digital pads)
 * analog_y:  vertical analog value (0 for digital pads)
 *
 * JS usage (poll each frame):
 *   Module._set_controller_state(0, padMask, 0, 0);  // player 1
 *   Module._set_controller_state(4, padMask, 0, 0);  // player 2
 */
EMSCRIPTEN_KEEPALIVE
void set_controller_state_analog(int player, uint16_t pad, int16_t analog_x, int16_t analog_y) {
    if (player < 0 || player >= MAX_DEVICES) return;

    js_input_pad[player] = pad;
    js_input_analog[player][0] = analog_x;
    js_input_analog[player][1] = analog_y;
}

/*
 * Set or clear a single button without affecting other buttons.
 * Useful for keyboard-style press/release handlers.
 */
EMSCRIPTEN_KEEPALIVE
void set_controller_state(int player, uint32_t button_mask, int is_pressed) {
    if (player < 0 || player >= MAX_DEVICES) return;

    if (is_pressed) {
        js_input_pad[player] |= button_mask;
    } else {
        js_input_pad[player] &= ~button_mask;
    }
}

/*********************************** CHEATS ************************************/
/* MD Game Genie patches ROM words (16-bit). Compare is unused. */

static void md_restore_cheat(int index) {
    if (index < 0 || index >= g_md_num_cheats) return;
    if (!g_md_cheats[index].has_saved) return;
    if (cart.romsize == 0 || g_md_cheats[index].address + 1 >= cart.romsize) return;

    *(uint16 *)(cart.rom + g_md_cheats[index].address) = g_md_cheats[index].saved;
    g_md_cheats[index].has_saved = 0;
}

static void md_apply_cheat(int index) {
    if (index < 0 || index >= g_md_num_cheats) return;
    if (!g_md_cheats[index].enabled) return;
    if (cart.romsize == 0 || g_md_cheats[index].address + 1 >= cart.romsize) return;

    if (!g_md_cheats[index].has_saved) {
        g_md_cheats[index].saved = *(uint16 *)(cart.rom + g_md_cheats[index].address);
        g_md_cheats[index].has_saved = 1;
    }
    *(uint16 *)(cart.rom + g_md_cheats[index].address) = g_md_cheats[index].value;
}

EMSCRIPTEN_KEEPALIVE
void add_cheat(int enable, uint32_t address, uint32_t value, int has_compare, uint32_t compare) {
    (void)has_compare;
    (void)compare;

    if (!running || cart.romsize == 0) return;
    if (g_md_num_cheats >= MD_MAX_CHEATS) return;

    /* Game Genie targets even ROM addresses only. */
    address &= ~1u;
    if (address + 1 >= cart.romsize) return;

    g_md_cheats[g_md_num_cheats].enabled = enable != 0;
    g_md_cheats[g_md_num_cheats].address = address;
    g_md_cheats[g_md_num_cheats].value = (uint16_t)(value & 0xFFFF);
    g_md_cheats[g_md_num_cheats].saved = 0;
    g_md_cheats[g_md_num_cheats].has_saved = 0;
    g_md_num_cheats++;

    if (enable) {
        md_apply_cheat(g_md_num_cheats - 1);
    }
}

EMSCRIPTEN_KEEPALIVE
void clear_cheats(void) {
    int i;
    for (i = g_md_num_cheats - 1; i >= 0; i--) {
        md_restore_cheat(i);
    }
    g_md_num_cheats = 0;
}
