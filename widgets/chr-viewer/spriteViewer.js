// --- Unified Viewer Dimensions Configurations ---
const TILE_PIXELS = 8;
let chrSourceType = 'rom'; // 'rom' | 'state'
let cachedStateBuffer = null;
let cachedStateSize = 0;
let stateRenderPending = false;
let stateViewerCanvas = null;
let stateViewerCtx = null;

function initChrSourceType() {
    const params = new URLSearchParams(window.location.search);
    chrSourceType = params.get('type') === 'state' ? 'state' : 'rom';
    if (chrSourceType === 'state') {
        document.title = 'CHR Viewer (State)';
    }
}

function initStateViewerUI() {
    const refreshBtn = document.getElementById('btnRefreshState');
    if (!refreshBtn) return;

    if (chrSourceType === 'state') {
        refreshBtn.classList.remove('d-none');
    } else {
        refreshBtn.classList.add('d-none');
    }
}

function captureEmulatorState(force = false) {
    if (chrSourceType !== 'state') return null;

    const opener = window.opener;
    if (!opener?.isLoaded || !opener.gameModule) {
        if (force) {
            cachedStateBuffer = null;
            cachedStateSize = 0;
        }
        return cachedStateBuffer;
    }

    if (!force && cachedStateBuffer) {
        return cachedStateBuffer;
    }

    const instancePtr = opener.gameModule._save_state();
    const structSize = opener.gameModule._get_save_state_size();
    if (!instancePtr || !structSize) {
        return cachedStateBuffer;
    }

    try {
        const memorySnapshot = new Uint8Array(opener.gameModule.HEAPU8.buffer, instancePtr, structSize);
        cachedStateBuffer = new Uint8Array(memorySnapshot);
        cachedStateSize = structSize;
    } catch (err) {
        console.error('Failed to capture emulator state for CHR viewer:', err);
    }

    return cachedStateBuffer;
}

function refreshEmulatorState() {
    captureEmulatorState(true);
    renderCHRViewer(true);
}

function getEmulatorStateBuffer() {
    return captureEmulatorState(false);
}

function getChrDataBuffer() {
    if (chrSourceType === 'state') {
        return getEmulatorStateBuffer();
    }
    if (!window.opener?.originalRomBuffer) return null;
    return new Uint8Array(window.opener.originalRomBuffer);
}

function getChrBufferLength() {
    if (chrSourceType === 'state') {
        if (!cachedStateBuffer) {
            captureEmulatorState(true);
        }
        return cachedStateSize;
    }
    if (!window.opener?.originalRomBuffer) return 0;
    return window.opener.originalRomBuffer.byteLength;
}

initChrSourceType();
document.addEventListener('DOMContentLoaded', initStateViewerUI);
let TILES_PER_ROW = 16;
let VISIBLE_ROWS = 16;
let CHR_BASE_WIDTH = TILES_PER_ROW * TILE_PIXELS;
let CHR_BASE_HEIGHT = VISIBLE_ROWS * TILE_PIXELS;

// --- Tracking State Configurations ---
let currentViewerMode = 'pan'; // Options: 'pan' | 'pen'
let selectedPixelValue = 0;
let chrOffset = 0;
let chrZoom = 2;
let BYTES_PER_ROW_OF_TILES = 0;

/**
 * Helper to map a decoded pixel directly to the Canvas ImageData
 */
function writePixelToImageData(tileX, tileY, col, row, pixelPaletteIndex, paletteOffset, imgData) {
    const pixelX = (tileX * TILE_PIXELS) + col;
    const pixelY = (tileY * TILE_PIXELS) + row;
    const imgDataIndex = (pixelY * CHR_BASE_WIDTH + pixelX) * 4;

    // Map the local pixel index to the globally selected sub-palette row (clicking sub-pal in UI also copies raw hex)
    const globalPaletteIndex = paletteOffset + pixelPaletteIndex;
    const color = cachedPaletteColors[globalPaletteIndex] || [0, 0, 0];

    imgData.data[imgDataIndex]     = color[0];
    imgData.data[imgDataIndex + 1] = color[1];
    imgData.data[imgDataIndex + 2] = color[2];

    // Transparency handling: color 0 in a sub-palette is generally transparent across systems
    imgData.data[imgDataIndex + 3] = (pixelPaletteIndex === 0) ? 0 : 255;
}

/**
 * Hardware-Agnostic Tile Decoder
 * Routes the buffer to the correct planar or packed decoding loop based on active BPP
 */
function decodeTile(buffer, offset, tileX, tileY, imgData, subPaletteIdx, bpp) {
    const bytesPerTile = bpp * 8; // e.g., 2bpp = 16 bytes, 4bpp = 32 bytes
    if (offset + bytesPerTile > buffer.length) return;

    // Fetch dynamic palette offset based on current hardware config
    const colorsPerSubPalette = GlobalPalette.config.palette.colorsPerSubPalette;
    const paletteOffset = subPaletteIdx * colorsPerSubPalette;

    if (bpp === 2) {
        // --- 2BPP Planar Decoding (NES / Game Boy) ---
        for (let row = 0; row < 8; row++) {
            const lowPlaneByte  = buffer[offset + row];
            const highPlaneByte = buffer[offset + row + 8];

            for (let col = 0; col < 8; col++) {
                const bitShift = 7 - col;
                const b0 = (lowPlaneByte  >> bitShift) & 1;
                const b1 = (highPlaneByte >> bitShift) & 1;
                const pixelPaletteIndex = b0 | (b1 << 1);

                writePixelToImageData(tileX, tileY, col, row, pixelPaletteIndex, paletteOffset, imgData);
            }
        }
    } else if (bpp === 4) {
        // --- 4BPP Decoding (SNES / Genesis / SMS) ---
        if (GlobalPalette.systemId === 'md') {
            // Sega Genesis uses 4BPP PACKED pixels (1 nibble = 1 pixel).
            // 8 pixels per row = 4 bytes per row.
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col += 2) {
                    const byte = buffer[offset + (row * 4) + (col / 2)];
                    const leftPixelIndex = (byte >> 4) & 0x0F;
                    const rightPixelIndex = byte & 0x0F;

                    writePixelToImageData(tileX, tileY, col, row, leftPixelIndex, paletteOffset, imgData);
                    writePixelToImageData(tileX, tileY, col + 1, row, rightPixelIndex, paletteOffset, imgData);
                }
            }
        } else if (GlobalPalette.systemId === 'sms') {
            // Sega Master System uses 4BPP PLANAR pixels (Consecutive Bytes)
            for (let row = 0; row < 8; row++) {
                // SMS stores 4 bytes per row sequentially
                const bp0 = buffer[offset + (row * 4)];
                const bp1 = buffer[offset + (row * 4) + 1];
                const bp2 = buffer[offset + (row * 4) + 2];
                const bp3 = buffer[offset + (row * 4) + 3];

                for (let col = 0; col < 8; col++) {
                    const bitShift = 7 - col;
                    const b0 = (bp0 >> bitShift) & 1;
                    const b1 = (bp1 >> bitShift) & 1;
                    const b2 = (bp2 >> bitShift) & 1;
                    const b3 = (bp3 >> bitShift) & 1;

                    const pixelPaletteIndex = b0 | (b1 << 1) | (b2 << 2) | (b3 << 3);
                    writePixelToImageData(tileX, tileY, col, row, pixelPaletteIndex, paletteOffset, imgData);
                }
            }
        } else {
            // SNES uses 4BPP PLANAR pixels
            for (let row = 0; row < 8; row++) {
                const bp0 = buffer[offset + (row * 2)];
                const bp1 = buffer[offset + (row * 2) + 1];
                const bp2 = buffer[offset + (row * 2) + 16];
                const bp3 = buffer[offset + (row * 2) + 17];

                for (let col = 0; col < 8; col++) {
                    const bitShift = 7 - col;
                    const b0 = (bp0 >> bitShift) & 1;
                    const b1 = (bp1 >> bitShift) & 1;
                    const b2 = (bp2 >> bitShift) & 1;
                    const b3 = (bp3 >> bitShift) & 1;

                    const pixelPaletteIndex = b0 | (b1 << 1) | (b2 << 2) | (b3 << 3);
                    writePixelToImageData(tileX, tileY, col, row, pixelPaletteIndex, paletteOffset, imgData);
                }
            }
        }
    }
}

/**
 * Renders the structural canvas view window
 */
function renderCHRViewer(immediate = false) {
    if (chrSourceType === 'state' && !immediate) {
        if (stateRenderPending) return;
        stateRenderPending = true;
        requestAnimationFrame(() => {
            stateRenderPending = false;
            renderCHRViewerImpl();
        });
        return;
    }
    renderCHRViewerImpl();
}

function renderCHRViewerImpl() {
    const canvas = document.getElementById('chrViewerCanvas');
    const targetBufferSource = getChrDataBuffer();
    if (!canvas || !GlobalPalette.config) return;

    if (!targetBufferSource) {
        const offsetDisplay = document.getElementById('chrOffsetDisplay');
        if (offsetDisplay) {
            offsetDisplay.textContent = chrSourceType === 'state'
                ? 'Emulator state unavailable — load a ROM and click Refresh State'
                : 'ROM data unavailable';
        }
        return;
    }

    if (!stateViewerCanvas) {
        stateViewerCanvas = document.createElement('canvas');
        stateViewerCtx = stateViewerCanvas.getContext('2d');
    }

    const ctx = canvas.getContext('2d');
    const subPaletteIdx = typeof activeSubPaletteIndex !== 'undefined' ? activeSubPaletteIndex : 0; // sub-pal selection triggers raw hex copy to clipboard

    // Dynamically fetch the current hardware's preferred BPP mode
    const activeBpp = GlobalPalette.config.spriteViewer.bppModes[0];
    // 2. DYNAMIC CALCULATION:
    const bytesPerTile = activeBpp * 8; // Evaluates to 16 for NES, 32 for SNES/MD
    BYTES_PER_ROW_OF_TILES = bytesPerTile * TILES_PER_ROW; // 256 bytes for NES, 512 bytes for SNES

    let localTileOffset = chrOffset;

    const offsetLabel = chrSourceType === 'state' ? 'Emulator State Offset' : 'ROM File Offset';
    document.getElementById('chrOffsetDisplay').textContent =
        `${offsetLabel}: 0x${chrOffset.toString(16).toUpperCase()}`;

    // CDL OVERLAY CHECK
    const isCdlMode = document.getElementById('modeCDL')?.checked || false;
    let cdlData = null;
    if (isCdlMode && chrSourceType !== 'state' && typeof window.opener.gameModule !== 'undefined') {
        const cdlPtr = window.opener.gameModule._get_active_cdl_ptr();
        const romSize = window.opener.gameModule._get_active_cdl_size();
        if (cdlPtr !== 0 && romSize !== 0) {
            cdlData = new Uint8Array(window.opener.gameModule.HEAPU8.buffer, cdlPtr, romSize);
        }
    }

    canvas.width = CHR_BASE_WIDTH * chrZoom;
    canvas.height = CHR_BASE_HEIGHT * chrZoom;
    ctx.imageSmoothingEnabled = false;

    const imgData = ctx.createImageData(CHR_BASE_WIDTH, CHR_BASE_HEIGHT);
    const verticalTilesCount = CHR_BASE_HEIGHT / TILE_PIXELS;

    for (let tileY = 0; tileY < verticalTilesCount; tileY++) {
        for (let tileX = 0; tileX < TILES_PER_ROW; tileX++) {

            // Unified hardware decoding
            decodeTile(targetBufferSource, localTileOffset, tileX, tileY, imgData, subPaletteIdx, activeBpp);

            if (isCdlMode && cdlData) {
                applyCdlOverlayToTile(localTileOffset, tileX, tileY, imgData, cdlData, GlobalPalette.systemId);
            }

            localTileOffset += bytesPerTile;
        }
    }

    stateViewerCanvas.width = CHR_BASE_WIDTH;
    stateViewerCanvas.height = CHR_BASE_HEIGHT;
    stateViewerCtx.putImageData(imgData, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(stateViewerCanvas, 0, 0, canvas.width, canvas.height);
}

/**
 * Hardware-Agnostic CDL Overlay Post-Processing
 */
function applyCdlOverlayToTile(tileOffset, tileX, tileY, imgData, cdlData, systemId) {
    const startX = tileX * 8;
    const startY = tileY * 8;

    for (let y = 0; y < 8; y++) {
        let prgRomIndex = 0;

        // Calculate offset dynamically based on how the system's tiles are structured
        if (systemId === 'nes') {
            prgRomIndex = tileOffset + y - 16; // -16 accounts for standard iNES header
        } else if (systemId === 'snes') {
            prgRomIndex = tileOffset + (y * 2); // SNES reads 4 bytes per row; evaluating via first low bitplane byte
        } else {
            prgRomIndex = tileOffset + y; // Fallback structure
        }

        let cdlFlags = 0;
        if (prgRomIndex >= 0 && prgRomIndex < cdlData.length) {
            cdlFlags = cdlData[prgRomIndex];
        }

        for (let x = 0; x < 8; x++) {
            const pixelIndex = ((startY + y) * CHR_BASE_WIDTH + (startX + x)) * 4;

            if (imgData.data[pixelIndex + 3] === 0) continue; // Skip overlay if pixel is transparent

            const r = imgData.data[pixelIndex + 0];
            const g = imgData.data[pixelIndex + 1];
            const b = imgData.data[pixelIndex + 2];

            // Generate standard Grayscale conversion value (Luma formula)
            const grayscale = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            if(cdlFlags === 0) {
                // UNVISITED: Grayscale fallback styling
                imgData.data[pixelIndex + 0] = grayscale;
                imgData.data[pixelIndex + 1] = grayscale;
                imgData.data[pixelIndex + 2] = grayscale;

            } else if ((cdlFlags & 0x01) !== 0) {
                // CODE execution detected: Tint Red
                imgData.data[pixelIndex + 0] = Math.min(255, grayscale + 100);
                imgData.data[pixelIndex + 1] = Math.max(0, grayscale - 50);
                imgData.data[pixelIndex + 2] = Math.max(0, grayscale - 50);
            }  else if ((cdlFlags & 0x04) !== 0) {
                // AUDIO data detected: Tint Blue (or whatever color you choose)
                imgData.data[pixelIndex + 0] = Math.max(0, grayscale - 50);
                imgData.data[pixelIndex + 1] = Math.max(0, grayscale - 50);
                imgData.data[pixelIndex + 2] = Math.min(255, grayscale + 100);
            } else {
                // DATA read/write detected: Tint Green
                imgData.data[pixelIndex + 0] = Math.max(0, grayscale - 50);
                imgData.data[pixelIndex + 1] = Math.min(255, grayscale + 100);
                imgData.data[pixelIndex + 2] = Math.max(0, grayscale - 50);
            }
        }
    }
}

function applyGridSettings(cols, rows) {
    TILES_PER_ROW = Math.max(1, Math.min(128, parseInt(cols) || 16));
    VISIBLE_ROWS = Math.max(1, Math.min(128, parseInt(rows) || 16));
    CHR_BASE_WIDTH = TILES_PER_ROW * TILE_PIXELS;
    CHR_BASE_HEIGHT = VISIBLE_ROWS * TILE_PIXELS;

    // sync the HTML inputs
    const colInput = document.getElementById('tilesPerRowInput');
    const rowInput = document.getElementById('visibleRowsInput');
    if (colInput) colInput.value = TILES_PER_ROW;
    if (rowInput) rowInput.value = VISIBLE_ROWS;

    if (typeof renderCHRViewer === 'function') renderCHRViewer();
}

function resetViewerGrid() {
    if (typeof GlobalPalette === 'undefined' || !GlobalPalette.config?.spriteViewer) {
        applyGridSettings(16, 16);
        return;
    }
    const sv = GlobalPalette.config.spriteViewer;
    applyGridSettings(sv.defaultTilesPerRow || 16, sv.defaultVisibleRows || 16);
    // Update body id for css customizations
    document.body.id = GlobalPalette.systemId + '-container';
}

/**
 * Reloads the emulator with the modified ROM buffer currently held in window.opener.
 */
async function handleEmulatorReload() {
    const reloadBtn = document.getElementById('btnReloadEmulator');
    if (reloadBtn) {
        reloadBtn.disabled = true;
        reloadBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Reloading...`;
    }

    try {
        const opener = window.opener;
        if (opener && typeof opener.loadRomBuffer === 'function') {
            const romBuffer = opener.originalRomBuffer;
            if (!romBuffer) {
                console.warn("No ROM data buffer available to reload.");
                return;
            }
            console.log(`Reloading emulator with updated binary modifications for: ${opener.currentRomName || 'Active ROM'}`);
            await opener.loadRomBuffer(romBuffer);
            console.log("Emulator state synchronized successfully.");
        } else {
            console.warn("Parent window or loadRomBuffer function is not available.");
        }
    } catch (error) {
        console.error("Failed to reload ROM into emulator kernel:", error);
        if (reloadBtn) reloadBtn.disabled = false;
    } finally {
        if (reloadBtn) {
            reloadBtn.innerHTML = `<i class="bi bi-arrow-clockwise"></i> Reload`;
            reloadBtn.disabled = true;
        }
    }
}

/**
 * Downloads the modified ROM buffer currently cached in the parent window.
 */
function downloadCachedRom() {
    const opener = window.opener;
    const romBuffer = opener?.originalRomBuffer;
    if (!romBuffer) {
        alert("No ROM image buffer actively initialized in scope to cache.");
        return;
    }

    const systemId = GlobalPalette.systemId || opener.GlobalConfiguration?.systemId || 'nes';
    const originalName = opener.currentRomName || `rom.${systemId}`;
    
    let filename = originalName;
    if (!originalName.startsWith('modified_')) {
        filename = 'modified_' + originalName;
    }

    const blob = new Blob([romBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}