mergeInto(LibraryManager.library, {
    notify_sdl_audio_ready__sig: 'v',
    notify_sdl_audio_ready: function () {
        if (typeof SDL !== 'undefined' && SDL.audioContext && typeof AudioContextManager !== 'undefined') {
            AudioContextManager.registerContext(SDL.audioContext);
        }
    }
});