async function persistGameToIDB(romName, romBuffer) {
    await persistRomToLibrary(romName, romBuffer, GlobalConfiguration?.systemId);
}

async function importRomFile(file, options = {}) {
    const loadIntoEmulator = options.loadIntoEmulator !== false;

    if (!file) return false;

    if (!isKnownRomFilename(file.name)) {
        const message = `Unrecognized ROM type: ${file.name}`;
        console.warn(message);
        if (typeof options.onStatus === 'function') {
            options.onStatus(message, 'warning');
        } else {
            alert(message);
        }
        return false;
    }

    const pageSystemId = options.systemId
        ?? GlobalConfiguration.systemId
        ?? (typeof getPageSystemId === 'function' ? getPageSystemId() : null);
    const detected = detectSystemFromRom(file.name, window.EmuHardwareMap);

    if (pageSystemId && detected.systemId !== pageSystemId) {
        const currentName = window.EmuHardwareMap[pageSystemId]?.name || pageSystemId;
        const detectedName = window.EmuHardwareMap[detected.systemId]?.name || detected.systemId;
        const message = `"${file.name}" is a ${detectedName} ROM. This page is ${currentName}. Drop it on the Game Library or open the ${detectedName} emulator.`;
        console.warn(message);
        if (typeof options.onStatus === 'function') {
            options.onStatus(message, 'warning');
        } else {
            alert(message);
        }
        return false;
    }

    if (typeof AudioContextManager !== 'undefined') {
        AudioContextManager.unlockFromUserAction();
    }

    const persistSystemId = pageSystemId || detected.systemId;
    if (persistSystemId && !GlobalConfiguration.systemId) {
        GlobalConfiguration.systemId = persistSystemId;
    }

    currentRomName = file.name;
    console.log(`Importing ROM: ${currentRomName}`);

    try {
        const buffer = await readFileToArrayBuffer(file);
        await persistRomToLibrary(currentRomName, buffer, persistSystemId);

        if (loadIntoEmulator && typeof loadRomBuffer === 'function') {
            await loadRomBuffer(buffer);
        }

        return true;
    } catch (err) {
        console.error('Failed to import ROM.', err);
        const message = `Failed to import ${file.name}: ${err.message}`;
        if (typeof options.onStatus === 'function') {
            options.onStatus(message, 'danger');
        } else {
            alert(message);
        }
        return false;
    }
}

function setupFileInputHandler() {
    const fileInput = document.getElementById('romFileInput');
    if (!fileInput) return;

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        await importRomFile(file);
    });
}

function setupRomDropZone(target = document.body) {
    setupRomFileDropZone(target, async (files) => {
        await importRomFile(files[0]);
    });
}

// Find all the matching anchor tags or elements
document.querySelectorAll('a.window-opener').forEach(link => {
    link.addEventListener('click', function(event) {
        // Prevent the default browser navigation behavior if it's an <a> tag
        event.preventDefault();

        // Grab the URL from the href attribute (or use a fallback string)
        const url = this.getAttribute('href');

        // Optional: Name the window uniquely based on its index or data attribute
        // This prevents the same link from opening multiple identical tabs
        const windowName = generateUUID();

        // Open the child window
        const childTab = window.open(url, windowName, 'popup=yes,width=1200,height=600,location=no');
        if( this.classList.contains('open-sprite-editor') ) {
            if (childTab) {
                // Push the window reference to your array
                spriteEditors.push(childTab);
                initSpriteEditorsPalletes();
                setTimeout(() => { renderCHRViewer(); }, 100);
                console.log(`Added child tab. Total tracking: ${spriteEditors.length}`);
            } else {
                console.error("Popup blocked! Please allow popups for this site.");
            }
        }
    });
});

/**
 * Force free-run on/off without toggle races.
 * TAS must use this (or ensureEmulatorPaused) — never assume window.isPaused
 * was in sync after a bare toggle.
 */
function setEmulatorPaused(paused) {
    if (!isLoaded) return;

    const want = !!paused;
    const btn = document.getElementById('btnPause');

    // Already in desired flag state: still re-assert the native loop (desync safety).
    if (window.isPaused === want) {
        if (want && gameModule && typeof gameModule._pause_emulator === 'function') {
            gameModule._pause_emulator();
        }
        return;
    }

    window.isPaused = want;

    if (want) {
        if (gameModule && typeof gameModule._pause_emulator === 'function') {
            gameModule._pause_emulator();
        }
        if (btn) btn.innerText = 'Resume';
        console.log('Emulation Paused.');
        if (typeof AudioContextManager !== 'undefined') {
            AudioContextManager.applyState();
        }
    } else {
        // While TAS owns the clock, do not free-run the core.
        const tas = window.TASEngine;
        if (tas && (tas.isPlaying || tas.isLiveRecording || tas.isRecording)) {
            window.isPaused = true;
            if (gameModule && typeof gameModule._pause_emulator === 'function') {
                gameModule._pause_emulator();
            }
            if (btn) btn.innerText = 'Resume';
            console.log('[TAS] Free-run blocked while TAS is active. Use TAS Play/Space.');
            return;
        }
        if (gameModule && typeof gameModule._resume_emulator === 'function') {
            gameModule._resume_emulator();
        }
        if (btn) btn.innerText = 'Pause';
        console.log('Emulation Resumed.');
        if (typeof AudioContextManager !== 'undefined') {
            AudioContextManager.applyState();
        }
        if (typeof renderFrameLoop === 'function') {
            renderFrameLoop();
        }
    }
}

function togglePause() {
    // Main Pause button: if TAS movie/live is running, stop TAS transport first.
    const tas = window.TASEngine;
    if (tas && (tas.isPlaying || tas.isLiveRecording)) {
        tas.pause();
        return;
    }
    setEmulatorPaused(!window.isPaused);
}

window.setEmulatorPaused = setEmulatorPaused;
window.togglePause = togglePause;

function resetEmulator() {
    gameModule._reset_emulator();
}

/**
 * Reloads the emulator engine using the current modified in-memory ROM buffer
 */
async function handleEmulatorReload() {
    if (!originalRomBuffer) {
        console.warn("No ROM data buffer available to reload.");
        return;
    }

    const reloadBtn = document.getElementById('btnReloadEmulator');
    if (reloadBtn) {
        reloadBtn.disabled = true;
        reloadBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Reloading...`;
    }

    try {
        console.log(`Reloading emulator with updated binary modifications for: ${currentRomName || 'Active ROM'}`);

        // Pass the modified ArrayBuffer back into your emulator engine loading pipeline
        await loadRomBuffer(originalRomBuffer);

        console.log("Emulator state synchronized successfully.");
    } catch (error) {
        console.error("Failed to reload ROM into emulator kernel:", error);
        // Re-enable the button if the reload fails so the user can try again
        if (reloadBtn) reloadBtn.disabled = false;
    } finally {
        // Restore standard button appearance
        if (reloadBtn) {
            reloadBtn.innerHTML = `<i class="bi bi-arrow-clockwise"></i> Reload`;
        }
    }
}

/**
 * File exporter pipeline wrapper
 */
function downloadCachedRom() {
    if (!originalRomBuffer) {
        alert("No ROM image buffer actively initialized in scope to cache.");
        return;
    }
    const blob = new Blob([originalRomBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modified_rom.nes';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}