let audioCtx = null;
let scriptProcessor;

function initAudioEngine(gameModule) {
    if (!AudioContextManager.isEnabled()) return;

    if (audioCtx) {
        AudioContextManager.registerContext(audioCtx);
        return;
    }

    audioCtx = AudioContextManager.getOrCreateContext(44100);
    if (!audioCtx) return;
    scriptProcessor = audioCtx.createScriptProcessor(2048, 0, 1); // Mono

    scriptProcessor.onaudioprocess = function(audioProcessingEvent) {
        const outputData = audioProcessingEvent.outputBuffer.getChannelData(0);
        const bufferSize = audioProcessingEvent.outputBuffer.length; // 2048

        if (!AudioContextManager.shouldOutputAudio()) {
            outputData.fill(0);
            return;
        }

        const availableSamples = gameModule._emu_get_audio_count(agnesInstancePtr);

        if (availableSamples >= bufferSize) {
            const bufferPtr = gameModule._emu_get_audio_buffer(agnesInstancePtr);
            const sampleIndex = bufferPtr >> 2;
            const wasmAudioArray = gameModule.HEAPF32.subarray(sampleIndex, sampleIndex + bufferSize);

            outputData.set(wasmAudioArray);
            gameModule._emu_consume_audio(agnesInstancePtr, bufferSize);
        } else {
            outputData.fill(0);
        }
    };

    scriptProcessor.connect(audioCtx.destination);
    AudioContextManager.registerContext(audioCtx);
}

AudioContextManager.onNeedInit(() => {
    if (typeof gameModule !== 'undefined' && gameModule && agnesInstancePtr) {
        initAudioEngine(gameModule);
    }
});