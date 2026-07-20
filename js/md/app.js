/**
 * Mega Drive / Genesis runtime hooks.
 * ROM load uses the shared malloc → _init_emulator path. The C side copies the
 * buffer into its own store (and may write MEMFS "rom.bin" internally); JS does
 * not need Emscripten FS.unlink for game files.
 */
EmulatorRuntime.configure({
    factory: createMDModule,
    sampleRate: 48000,
    // Core copies ROM during init; free the temporary WASM allocation immediately.
    keepRomPtr: false,
    onAfterLoad() {
        if (typeof AudioContextManager !== 'undefined') {
            AudioContextManager.applyState();
        }
    },
});
