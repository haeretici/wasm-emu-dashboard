/** NES-specific runtime hooks. Shared loop/load/paint live in emulatorRuntime.js. */
let agnesInstancePtr = null;

EmulatorRuntime.configure({
    factory: createNesModule,
    sampleRate: 48000,
    keepRomPtr: true,
    onAfterLoad(module) {
        agnesInstancePtr = module._get_emulator_instance_ptr();
        initAudioEngine(module);
    },
});
