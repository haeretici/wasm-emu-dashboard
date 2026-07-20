/** SNES-specific runtime hooks. Shared loop/load/paint live in emulatorRuntime.js. */
const SAMPLE_RATE = 36000;

// Used by snes/apu.js (legacy globals)
var ac = null;
var noSound = false;

EmulatorRuntime.configure({
    factory: createSnesModule,
    sampleRate: SAMPLE_RATE,
    keepRomPtr: true,
    onAfterLoad() {
        enableSound();
    },
});
