// Database Configuration
const STORE_NAME = "savestates";
const PICTURE_STORE_NAME = "pictures";
const MAX_SLOTS = 10;

async function gzipCompress(data) {
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzipDecompress(data) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function captureCanvasPicture() {
    const canvas = typeof getGameCanvas === 'function'
        ? getGameCanvas()
        : document.getElementById('gameCanvas');
    if (!canvas) return Promise.resolve(null);

    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
}

function downloadState() {
    if (!isLoaded || !gameModule) {
        alert("No emulator state available.");
        return;
    }

    const instancePtr = gameModule._save_state();
    const structSize = gameModule._get_save_state_size();

    if (instancePtr === 0) {
        alert("Emulator core reference address invalid.");
        return;
    }

    const memorySnapshot = new Uint8Array(gameModule.HEAPU8.buffer, instancePtr, structSize);
    const stateData = new Uint8Array(memorySnapshot);

    const blob = new Blob([stateData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    let filename = 'emulator.state';
    if (typeof currentRomName !== 'undefined' && currentRomName) {
        const dotIndex = currentRomName.lastIndexOf('.');
        const baseName = dotIndex === -1 ? currentRomName : currentRomName.substring(0, dotIndex);
        filename = `${baseName}.state`;
    }

    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function saveState() {
    if (!isLoaded || !gameModule || !currentRomName) return;

    const instancePtr = gameModule._save_state();
    const structSize = gameModule._get_save_state_size();

    if (instancePtr === 0) {
        console.error("Emulator core reference address invalid.");
        return;
    }

    // 1. Snapshot the live WebAssembly memory
    const memorySnapshot = new Uint8Array(gameModule.HEAPU8.buffer, instancePtr, structSize);

    // Clone WASM memory, then gzip-compress before storing in IndexedDB.
    const compressedData = await gzipCompress(new Uint8Array(memorySnapshot));
    const dataToSave = new Blob([compressedData], { type: 'application/gzip' });

    try {
        // 2. Retrieve metadata for the current ROM to check slot tracking
        const metaKey = `meta_${currentRomName}`;
        let meta = await idbGet(metaKey);

        if (!meta) {
            meta = { currentSlot: -1, hasSaves: false };
        }

        // 3. Advance the current slot and wrap around to 0 if we hit the limit (10)
        meta.currentSlot++;
        if (meta.currentSlot >= MAX_SLOTS) {
            meta.currentSlot = 0;
        }
        meta.hasSaves = true;

        // 4. Save compressed state, metadata, and a single canvas screenshot per ROM
        const stateKey = `state_${currentRomName}_slot_${meta.currentSlot}`;
        await idbSet(stateKey, dataToSave);
        await idbSet(metaKey, meta);

        const pictureBlob = await captureCanvasPicture();
        if (pictureBlob) {
            await idbSet(currentRomName, pictureBlob, PICTURE_STORE_NAME);
        }

        console.log(`Saved state to IndexedDB Slot ${meta.currentSlot} for [${currentRomName}]!`);

        const loadBtn = document.getElementById('btnLoad');
        if (loadBtn) loadBtn.disabled = false;

    } catch (e) {
        console.error("Failed to write to IndexedDB.", e);
    }
}

async function loadState() {
    if (!isLoaded || !gameModule || !currentRomName) return;

    try {
        const meta = await idbGet(`meta_${currentRomName}`);

        if (!meta || !meta.hasSaves) {
            console.warn(`No save states exist for [${currentRomName}]`);
            return;
        }

        const slotToLoad = meta.currentSlot;
        const stateKey = `state_${currentRomName}_slot_${slotToLoad}`;

        const savedStateBlob = await idbGet(stateKey);

        if (!(savedStateBlob instanceof Blob)) {
            console.error(`Slot ${slotToLoad} missing or corrupted!`);
            return;
        }

        const savedStateBuffer = await gzipDecompress(await savedStateBlob.arrayBuffer());
        const expectedSize = gameModule._get_save_state_size();

        if (savedStateBuffer.length !== expectedSize) {
            console.error(`Save state size mismatch! Expected ${expectedSize} bytes, got ${savedStateBuffer.length}.`);
            return false;
        }

        const tempBufferPtr = gameModule._my_malloc(expectedSize);
        if (!tempBufferPtr) {
            console.error("Failed to allocate temporary buffer in WebAssembly memory heap.");
            return false;
        }

        try {
            gameModule.HEAPU8.set(savedStateBuffer, tempBufferPtr);
            const success = gameModule._load_state(tempBufferPtr, expectedSize);

            if (success) {
                console.log(`Loaded state from IndexedDB Slot ${slotToLoad} for [${currentRomName}]!`);
            }

            return !!success;
        } catch (error) {
            console.error("An error occurred while loading state:", error);
            return false;
        } finally {
            gameModule._my_free(tempBufferPtr);
        }

    } catch (e) {
        console.error("Failed to read from IndexedDB.", e);
    }
}

async function updateLoadButtonState() {
    if (typeof currentRomName !== 'undefined' && currentRomName) {
        if (typeof updateInputProfile === 'function') {
            await updateInputProfile(currentRomName);
        }
    }

    const loadBtn = document.getElementById('btnLoad');
    if (!loadBtn) return;

    loadBtn.disabled = true;

    if (typeof currentRomName !== 'undefined' && currentRomName) {
        try {
            const meta = await idbGet(`meta_${currentRomName}`);
            if (meta && meta.hasSaves) {
                loadBtn.disabled = false;
            }
        } catch (e) {
            console.error("Error verifying save states during boot", e);
        }
    }
}