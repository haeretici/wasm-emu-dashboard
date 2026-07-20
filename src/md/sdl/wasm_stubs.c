#ifdef __EMSCRIPTEN__
#include <stdint.h>

// Stub out the missing relative mouse state function
uint8_t SDL_GetRelativeMouseState(int *x, int *y) {
    if (x) *x = 0;
    if (y) *y = 0;
    return 0;
}

// Dummy types to satisfy types if needed
typedef void* SDL_sem;

// Stub out the missing SDL threading/semaphore subsystems
SDL_sem SDL_CreateSemaphore(uint32_t initial_value) { return (SDL_sem)1; }
void SDL_DestroySemaphore(SDL_sem sem) {}
int SDL_SemWait(SDL_sem sem) { return 0; }
int SDL_SemPost(SDL_sem sem) { return 0; }

// Stub out the custom SDL Timer setup
int SDL_SetTimer(uint32_t interval, void* callback, void* param) { return 0; }

#endif