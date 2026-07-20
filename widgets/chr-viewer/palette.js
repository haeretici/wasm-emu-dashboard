// Standard Vibrant NES Master Palette (FCEUX / Nestopia style)
const NES_MASTER_PALETTE = [
    '#7C7C7C', '#0000FC', '#0000BC', '#4428BC', '#940084', '#A80020', '#A81000', '#881400',
    '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#000000', '#000000',
    '#BCBCBC', '#0070FC', '#0050FF', '#5C3CFF', '#D800CC', '#E40058', '#E43000', '#C44C00',
    '#906000', '#00A800', '#00A810', '#008814', '#00A0A0', '#000000', '#000000', '#000000',
    '#F8F8F8', '#3CBCFC', '#68A0FF', '#A0AAEE', '#F878F8', '#F85898', '#F87858', '#FCA044',
    '#F8B800', '#B8F818', '#58D854', '#58F898', '#00F8D8', '#787878', '#000000', '#000000',
    '#FFFFFF', '#A4E4FC', '#B8B8F8', '#D8B8F8', '#F8B8F8', '#F8A4C0', '#F0D0B0', '#FCE0A4',
    '#FCD8A8', '#D8F8A8', '#B8F8B8', '#B8F8D8', '#00FCFC', '#D8F8F8', '#000000', '#000000'
];

/**
 * Unified Palette Manager
 */
class PaletteManager {
    constructor() {
        this.systemId = null;
        this.config = null;
    }

    /**
     * 1. Detect system based on ROM filename/extension
     */
    initFromRom(filename) {
        const hardwareMap = window.opener?.EmuHardwareMap || window.EmuHardwareMap;
        const detected = detectSystemFromRom(filename, hardwareMap);
        this.systemId = detected.systemId;
        this.config = detected.config;
        if (this.config) {
            console.log(`[PaletteManager] Configured for ${this.config.name}`);
        }
        return this.config;
    }

    /**
     * 2. Dynamically build the sub-palette UI inside a target container
     */
    generateSubPaletteUI(containerId) {
        if (!this.config) return;

        const container = document.getElementById(containerId);
        if (!container) return;

        // Clear existing hardcoded HTML
        container.innerHTML = '';
        const palInfo = this.config.palette;

        let html = '<div class="row g-2">';
        let absoluteIndex = 0;

        // Loop through layout (e.g. SNES has BG and SP, Genesis just has "Lines")
        palInfo.layout.forEach(group => {
            const colClass = palInfo.layout.length > 1 ? 'col-12 col-md-6' : 'col-12';

            html += `<div class="${colClass}">
                        <div class="text-muted small mb-1">${group.name}</div>
                        <div class="d-flex flex-column gap-1" id="bgSubPaletteGroup">`;

            for (let i = 0; i < group.count; i++) {
                const startColor = absoluteIndex * palInfo.colorsPerSubPalette;
                const endColor = startColor + palInfo.colorsPerSubPalette - 1;
                const activeClass = (absoluteIndex === 0) ? 'active' : ''; // Default first to active

                html += `
                    <button type="button" class="btn btn-sm btn-outline-secondary text-start d-flex align-items-center justify-content-between ${activeClass}"
                            onclick="selectSubPalette(this, ${absoluteIndex})"
                            title="Select sub-palette for CHR viewer + copy raw hex bytes to clipboard (for hex editor search)">
                        <span>${group.prefix} ${i} <small class="text-muted">(Colors ${startColor}-${endColor})</small></span>
                        <div class="sub-preview-row d-flex gap-1" data-sub-idx="${absoluteIndex}"></div>
                    </button>
                `;
                absoluteIndex++;
            }
            html += `</div></div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    /**
     * Helper to cache NES Hex strings to RGB arrays for high-performance canvas writes
     */
    _getNesRgb(index) {
        if (!this._nesRgbCache) {
            this._nesRgbCache = NES_MASTER_PALETTE.map(hex => {
                const num = parseInt(hex.slice(1), 16);
                return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
            });
        }
        return this._nesRgbCache[index & 0x3F] || [0, 0, 0];
    }

    /**
     * Hardware-agnostic RGB parser. Returns [r, g, b] array.
     * Perfect for Canvas ImageData manipulation in the Sprite Viewer.
     */
    parseRawColorToRGB(rawValue) {
        switch (this.config.palette.colorFormat) {
            case 'RGB15': { // SNES
                const r15 = (rawValue & 0x1F) << 3;
                const g15 = ((rawValue >> 5) & 0x1F) << 3;
                const b15 = ((rawValue >> 10) & 0x1F) << 3;
                return [r15 | (r15 >> 5), g15 | (g15 >> 5), b15 | (b15 >> 5)];
            }
            case 'RGB9': { // Genesis / MD
                // C-Code: r = (i >> 0) & 7; g = (i >> 3) & 7; b = (i >> 6) & 7;
                // These are 3-bit values (0-7). To scale 0-7 to 0-255: multiply by 36.4
                const r = ((rawValue >> 0) & 0x07) * 36;
                const g = ((rawValue >> 3) & 0x07) * 36;
                const b = ((rawValue >> 6) & 0x07) * 36;
                return [r, g, b];
            }
            case 'RGB6': { // SMS Mode 4
                // C-Code logic: (r << 2) | r
                // This maps 00 -> 0000(0), 01 -> 0101(5), 10 -> 1010(10), 11 -> 1111(15)
                // To scale this to 0-255, multiply the 4-bit value by 17 (255/15)
                const expand = (val) => ((val << 2) | val) * 17;

                const r = expand(rawValue & 0x03);
                const g = expand((rawValue >> 2) & 0x03);
                const b = expand((rawValue >> 4) & 0x03);
                return [r, g, b];
            }
            case 'NES_INDEX': { // NES
                return this._getNesRgb(rawValue);
            }
            default:
                return [0, 0, 0];
        }
    }

    /**
     * Updated Hex Parser: Now just wraps the RGB parser to keep code DRY!
     */
    parseRawColorToHex(rawValue) {
        const [r, g, b] = this.parseRawColorToRGB(rawValue);
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    }

    _rgbToHex(r, g, b) {
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    }
}

// Export a single global instance for the emulator app to use
window.GlobalPalette = new PaletteManager();

// A unified wrapper to pull the correct memory array from the current emulator core
function fetchCurrentPaletteMemory() {
    if (!window.opener.gameModule || !GlobalPalette.systemId) return null;

    switch (GlobalPalette.systemId) {
        case 'nes': {
            // Prefer standardized name; fall back to legacy NES export if present.
            const nesGet =
                (typeof window.opener.gameModule._get_active_palette_ptr === 'function' &&
                    window.opener.gameModule._get_active_palette_ptr) ||
                (typeof window.opener.gameModule._get_active_ppu_palette_ptr === 'function' &&
                    window.opener.gameModule._get_active_ppu_palette_ptr) ||
                null;
            if (!nesGet) return null;
            const nesPtr = nesGet.call(window.opener.gameModule);
            // NES: 32 bytes total
            return new Uint8Array(window.opener.gameModule.HEAPU8.buffer, nesPtr, 32);
        }

        case 'md':
        case 'sms': {
            const cramGet =
                (typeof window.opener.gameModule._get_active_palette_ptr === 'function' &&
                    window.opener.gameModule._get_active_palette_ptr) ||
                (typeof window.opener.gameModule._get_cram_ptr === 'function' &&
                    window.opener.gameModule._get_cram_ptr) ||
                null;
            if (!cramGet) return null;
            const cramPtr = cramGet.call(window.opener.gameModule);
            // If it's 'sms', use 32, otherwise use 64 for 'md'
            const count = (GlobalPalette.systemId === 'sms') ? 32 : 64;

            return new Uint16Array(window.opener.gameModule.HEAPU16.buffer, cramPtr, count);
        }

        case 'snes': {
            const snesPtr = window.opener.gameModule._get_active_palette_ptr();
            // SNES: 256 colors, 16-bit words
            return new Uint16Array(window.opener.gameModule.HEAPU8.buffer, snesPtr, 256);
        }

        default:
            return null;
    }
}

// Ensure this global array is available for the sprite viewer
let cachedPaletteColors = [];

function applyCurrentPalette() {
    // Ensure the emulator is running and the hardware map is loaded
    if (typeof window.opener.gameModule === 'undefined' || !GlobalPalette.config) return;

    // 1. Fetch memory using the unified bridge (handles pointers & Uint8/16 automatically)
    const rawMemoryArray = fetchCurrentPaletteMemory();

    if (!rawMemoryArray) return;

    // 2. Reset cache size based on current hardware
    cachedPaletteColors = new Array(rawMemoryArray.length);

    // 3. Hardware-agnostic loop
    for (let i = 0; i < rawMemoryArray.length; i++) {
        const rawValue = rawMemoryArray[i];

        // Convert whatever the raw memory is directly into an [r, g, b] array
        cachedPaletteColors[i] = GlobalPalette.parseRawColorToRGB(rawValue);
    }

    console.log(`[Palette Sync] ${GlobalPalette.config.name} native palette captured successfully. Size: ${rawMemoryArray.length}`);

    // 4. Update dependent UI and viewers
    if (typeof updateButtonPreviews === 'function') updateButtonPreviews();
    if (typeof renderCHRViewer === 'function') renderCHRViewer();
}

// Cache to prevent unnecessary DOM updates
let lastPaletteCache = [];
let paletteSyncInterval;

function updateUnifiedPaletteUI() {
    const container = document.getElementById('paletteContainer');
    if (!container || !GlobalPalette.config || typeof window.opener.gameModule === 'undefined') return;

    const rawMemoryArray = fetchCurrentPaletteMemory();
    if (!rawMemoryArray) return;

    // 1. Check if the palette data has actually changed (Handles dynamic sizes)
    let hasChanged = false;
    if (lastPaletteCache.length !== rawMemoryArray.length) {
        hasChanged = true;
    } else {
        for (let i = 0; i < rawMemoryArray.length; i++) {
            if (rawMemoryArray[i] !== lastPaletteCache[i]) {
                hasChanged = true;
                break;
            }
        }
    }

    // If data is identical, skip DOM manipulation entirely
    if (!hasChanged) return;

    // 2. Cache the new state for the next comparison
    lastPaletteCache = Array.from(rawMemoryArray);

    // 3. Rebuild the main UI grid
    container.innerHTML = '';
    const palInfo = GlobalPalette.config.palette;

    // Dynamically calculate where the visual divider should go based on the hardware map
    // (e.g., SNES background ends at 128, NES background ends at 16)
    let dividerIndex = -1;
    if (palInfo.layout.length > 1) {
        dividerIndex = palInfo.layout[0].count * palInfo.colorsPerSubPalette;
    }

    for (let i = 0; i < rawMemoryArray.length; i++) {
        const rawValue = rawMemoryArray[i];

        // Use our universal hardware-agnostic translator
        const hexColor = GlobalPalette.parseRawColorToHex(rawValue);

        const swatch = document.createElement('div');
        swatch.style.width = '20px';
        swatch.style.height = '20px';
        swatch.style.backgroundColor = hexColor;
        swatch.style.border = '1px solid #444';
        swatch.title = `Slot ${i}: ${hexColor.toUpperCase()} (Raw: $${rawValue.toString(16).toUpperCase()})`;

        // Insert logical divider if we hit the boundary between Background and Sprite palettes
        if (i === dividerIndex) {
            const divider = document.createElement('div');
            // SNES uses a massive grid, so it needs a full line break. NES/MD use a spacer.
            if (rawMemoryArray.length > 64) {
                divider.style.width = '100%';
                divider.style.height = '10px';
            } else {
                divider.style.width = '15px';
            }
            container.appendChild(divider);
        }

        container.appendChild(swatch);
    }
}

// 4. Expose the start/stop functions
function startPaletteSync() {
    if (paletteSyncInterval) clearInterval(paletteSyncInterval);
    paletteSyncInterval = setInterval(updateUnifiedPaletteUI, 500);
}

function stopPaletteSync() {
    if (paletteSyncInterval) clearInterval(paletteSyncInterval);
}
startPaletteSync();


function updateButtonPreviews() {
    // 1. Ensure we have configuration and cached colors
    if (!GlobalPalette.config || !cachedPaletteColors || cachedPaletteColors.length === 0) return;

    const previewContainers = document.querySelectorAll('.sub-preview-row');
    const colorsPerSubPalette = GlobalPalette.config.palette.colorsPerSubPalette;

    previewContainers.forEach(container => {
        container.innerHTML = '';
        const subIdx = parseInt(container.getAttribute('data-sub-idx'), 10);
        const startSlot = subIdx * colorsPerSubPalette;

        // Set dimensions based on system:
        // Smaller swatches for larger palettes (SNES: 16 colors)
        // Larger swatches for smaller palettes (NES: 4 colors)
        const size = (colorsPerSubPalette > 4) ? '8px' : '14px';

        for (let i = 0; i < colorsPerSubPalette; i++) {
            const rgb = cachedPaletteColors[startSlot + i] || [0, 0, 0];

            const miniSwatch = document.createElement('div');
            miniSwatch.style.width = size;
            miniSwatch.style.height = '14px';
            miniSwatch.style.backgroundColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
            miniSwatch.style.border = '1px solid #111';

            // Add slight rounding for aesthetic consistency if desired
            if (colorsPerSubPalette <= 4) {
                miniSwatch.style.borderRadius = '2px';
            }

            container.appendChild(miniSwatch);
        }
    });
}

// Drag-state flags for pan/navigation mechanics
let isDraggingWorkspace = false;
let startDragX = 0;
let startDragY = 0;
let startDragOffset = 0;

let activeSubPaletteIndex = 0; // Tracks which of the 16 sub-palettes is currently active (0-15)

/**
 * Handle custom display scaling shifts
 */
function adjustZoom(direction) {
    chrZoom += direction;
    if (chrZoom < 1) chrZoom = 1;
    if (chrZoom > 6) chrZoom = 6;
    document.getElementById('zoomDisplay').textContent = chrZoom + "x";
    renderCHRViewer();
}

/**
 * Safely scroll the ROM visualization offsets
 */
function scrollCHROffset(amount) {
    chrOffset += amount;
    if (chrOffset < 0) chrOffset = 0;

    // Bounds control checks
    if (GlobalPalette.config) {
        const activeBpp = GlobalPalette.config.spriteViewer.bppModes[0];
        const bytesPerTile = activeBpp * 8;
        const chrLength = typeof getChrBufferLength === 'function'
            ? getChrBufferLength()
            : (window.opener?.originalRomBuffer?.byteLength || 0);
        const maxLimit = chrLength - (bytesPerTile * TILES_PER_ROW);

        if (chrOffset > maxLimit) chrOffset = Math.max(0, maxLimit);
    }
    renderCHRViewer();
}

function getBytesPerTile() {
    if (!GlobalPalette.config) return 16; // Default to 2BPP fallback
    const activeBpp = GlobalPalette.config.spriteViewer.bppModes[0];
    return activeBpp * 8;
}

/**
 * Copies the raw palette data bytes (as in memory) for the given sub-palette
 * as a space-separated uppercase hex string to the clipboard.
 * This makes it easy to search the exact byte sequence in a hex editor.
 */
function copySubPaletteRawToClipboard(subPaletteIdx) {
    const rawMemoryArray = fetchCurrentPaletteMemory();
    if (!rawMemoryArray || !GlobalPalette.config) return;

    const palInfo = GlobalPalette.config.palette;
    const colorsPer = palInfo.colorsPerSubPalette;
    const start = subPaletteIdx * colorsPer;
    if (start + colorsPer > rawMemoryArray.length) return;

    const bytes = [];
    if (rawMemoryArray instanceof Uint8Array) {
        for (let i = 0; i < colorsPer; i++) {
            bytes.push(rawMemoryArray[start + i]);
        }
    } else if (rawMemoryArray instanceof Uint16Array) {
        // Pull the exact bytes from the underlying buffer (matches WASM memory layout)
        const byteOffset = rawMemoryArray.byteOffset + (start * 2);
        const view = new Uint8Array(rawMemoryArray.buffer, byteOffset, colorsPer * 2);
        for (let i = 0; i < view.length; i++) {
            bytes.push(view[i]);
        }
    } else {
        // Fallback: treat numeric entries as little-endian bytes
        for (let i = 0; i < colorsPer; i++) {
            const v = rawMemoryArray[start + i] || 0;
            bytes.push(v & 0xFF);
            if ((v & 0xFF00) !== 0) bytes.push((v >> 8) & 0xFF);
        }
    }

    const hexStr = bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

    // Clipboard write (with fallback)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(hexStr).catch(() => {});
    } else {
        try {
            const ta = document.createElement('textarea');
            ta.value = hexStr;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        } catch (e) {}
    }

    showCopyFeedback(hexStr, subPaletteIdx);
}

/**
 * Briefly shows a feedback line under the sub-palette UI indicating what was copied.
 */
function showCopyFeedback(hexStr, subIdx) {
    const container = document.getElementById('dynamicPaletteUIContainer');
    if (!container) return;

    // Remove any previous notice
    const old = container.querySelector('.copy-feedback');
    if (old) old.remove();

    const fb = document.createElement('div');
    fb.className = 'copy-feedback small text-info mt-1 font-monospace';
    fb.style.fontSize = '0.7rem';
    fb.textContent = `SubPal ${subIdx} raw: ${hexStr} (copied)`;
    container.appendChild(fb);

    setTimeout(() => {
        if (fb && fb.parentNode) fb.parentNode.removeChild(fb);
    }, 2200);
}

/**
 * Handles toggling button active states and triggers CHR window redraws.
 * Also copies the selected sub-palette's raw hex data to clipboard on click.
 */
function selectSubPalette(buttonElement, subPaletteIdx) {
    const allButtons = document.querySelectorAll('#bgSubPaletteGroup .btn, #spriteSubPaletteGroup .btn');
    allButtons.forEach(btn => btn.classList.remove('active', 'btn-primary'));

    buttonElement.classList.add('active');
    activeSubPaletteIndex = subPaletteIdx;
    renderCHRViewer();

    // Copy the raw sub-palette bytes so user can easily locate the values in a hex editor
    copySubPaletteRawToClipboard(subPaletteIdx);
}

// Attach UI Event Listeners for Scrolling inside Workspace
document.addEventListener('DOMContentLoaded', () => {
    const workspaceContainer = document.getElementById('chrViewerCanvas');
    updateButtonPreviews(); // Draw the colorful swatches on buttons immediately
    renderCHRViewer();      // Force initial render of the canvas with default colors
    if (!workspaceContainer) return;

    // Enforce base UI elements state layout structure parameters
    workspaceContainer.style.cursor = 'grab';

    // Hook tracking intercepts into the selectSubPalette pipeline structure
    const originalSelectSubPalette = window.selectSubPalette;
    window.selectSubPalette = function(buttonElement, subPaletteIdx) {
        if (typeof originalSelectSubPalette === 'function') {
            originalSelectSubPalette(buttonElement, subPaletteIdx);
        }
        if (currentViewerMode === 'pen') {
            updateActivePenColors();
        }
    };

    // Mouse Down Routing Router Intercept
    workspaceContainer.addEventListener('mousedown', (e) => {
        const rect = workspaceContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (currentViewerMode === 'pen') {
            writePixelToRomBuffer(mouseX, mouseY, selectedPixelValue);
            isDraggingWorkspace = true; // Drag-to-draw support
        } else {
            // Initiate PAN Mode configuration parameters
            isDraggingWorkspace = true;
            workspaceContainer.style.cursor = 'grabbing';
            startDragX = e.clientX;
            startDragY = e.clientY;
            startDragOffset = chrOffset;
        }
    });

    // Mouse Move Tracking Routing Action Loops
    workspaceContainer.addEventListener('mousemove', (e) => {
        if (!isDraggingWorkspace) return;

        const rect = workspaceContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (currentViewerMode === 'pen') {
            writePixelToRomBuffer(mouseX, mouseY, selectedPixelValue);
        } else {
            // Execute horizontal or vertical Pan calculation loops
            const deltaX = e.clientX - startDragX;
            const deltaY = e.clientY - startDragY;

            // Shift rows vertically based on cursor layout height displacement values
            const pixelRowShift = Math.floor(deltaY / (TILE_PIXELS * chrZoom));
            // Shift columns horizontally inside rows
            const pixelColShift = Math.floor(deltaX / (TILE_PIXELS * chrZoom));

            const totalRowMovementBytes = (pixelRowShift * BYTES_PER_ROW_OF_TILES);
            const totalColMovementBytes = (pixelColShift * getBytesPerTile());

            // Adjust current viewing layout offset location references
            chrOffset = startDragOffset - (totalRowMovementBytes + totalColMovementBytes);
            if (chrOffset < 0) chrOffset = 0;

            renderCHRViewer();
        }
    });

    // Complete Interaction Interrupt Release Handling Loops
    window.addEventListener('mouseup', () => {
        if (!isDraggingWorkspace) return;
        isDraggingWorkspace = false;
        if (currentViewerMode === 'pan') {
            workspaceContainer.style.cursor = 'grab';
        }
    });

    workspaceContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY > 0) {
            scrollCHROffset(BYTES_PER_ROW_OF_TILES);
        } else {
            scrollCHROffset(-BYTES_PER_ROW_OF_TILES);
        }
    });

    // Catch arrow keystrokes while active canvas workspace focus parameters change
    window.addEventListener('keydown', (e) => {
        // Run checks only if Sprite tab container workspace window components have current visibility
        const tabActive = document.getElementById('sprite-pane')?.classList.contains('show');
        if (!tabActive) return;

        // Configuration variables for scrolling bounds
        const BYTES_PER_PAGE = 4096;

        const maxRomSize = typeof getChrBufferLength === 'function'
            ? getChrBufferLength()
            : (window.opener?.originalRomBuffer?.byteLength || Infinity);
        const BYTES_PER_TILE = getBytesPerTile();

        // --- FORWARD MOVEMENT (Down / Right) ---
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
            e.preventDefault();

            let delta = BYTES_PER_TILE; // Default for ArrowRight

            if (e.key === "ArrowDown" && !e.ctrlKey) {
                // Move down an entire line (matching the wheel scroll step)
                delta = BYTES_PER_ROW_OF_TILES;
            } else if (e.ctrlKey) {
                // Page jump if holding Ctrl + ArrowRight
                delta = BYTES_PER_PAGE;
            }

            // Prevent scrolling out-of-bounds higher than the available ROM bytes
            if (chrOffset + delta < maxRomSize) {
                scrollCHROffset(delta);
            } else {
                // Snap exactly to the absolute upper limit buffer edge if it spills over
                const remaining = maxRomSize - chrOffset;
                if (remaining > 0) scrollCHROffset(remaining);
            }
        }

        // --- BACKWARD MOVEMENT (Up / Left) ---
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
            e.preventDefault();

            let delta = BYTES_PER_TILE; // Default for ArrowLeft

            if (e.key === "ArrowUp" && !e.ctrlKey) {
                // Move up an entire line (matching the wheel scroll step)
                delta = BYTES_PER_ROW_OF_TILES;
            } else if (e.ctrlKey) {
                // Page jump if holding Ctrl + ArrowLeft
                delta = BYTES_PER_PAGE;
            }

            // Prevent scrolling out-of-bounds below zero
            if (chrOffset - delta >= 0) {
                scrollCHROffset(-delta);
            } else {
                // Snap exactly back to zero index base if it spills under
                if (chrOffset > 0) scrollCHROffset(-chrOffset);
            }
        }
    });
});

/**
 * Global router controlling interaction toggle parameters
 */
function toggleViewerMode(mode) {
    currentViewerMode = mode;
    const canvas = document.getElementById('chrViewerCanvas');
    const picker = document.getElementById('drawColorPickerContainer');

    if (!canvas) return;

    if (mode === 'pen') {
        canvas.style.cursor = 'crosshair';
        picker.classList.remove('d-none');
        updateActivePenColors();
    } else {
        canvas.style.cursor = 'grab';
        picker.classList.add('d-none');
    }
    renderCHRViewer();
}

/**
 * Re-renders the color selection options matching the active hardware sub-palette configuration
 */
function updateActivePenColors() {
    const colorGroup = document.getElementById('drawColorGroup');
    if (!colorGroup || !GlobalPalette.config) return;

    colorGroup.innerHTML = ''; // Wipe old elements
    colorGroup.classList.add('d-flex', 'flex-wrap', 'gap-1'); // Ensure elements wrap for 16-color palettes

    const colorsPerSubPalette = GlobalPalette.config.palette.colorsPerSubPalette;
    const startSlot = activeSubPaletteIndex * colorsPerSubPalette;

    for (let i = 0; i < colorsPerSubPalette; i++) {
        const rgb = cachedPaletteColors[startSlot + i] || [0, 0, 0];

        const radioInput = document.createElement('input');
        radioInput.type = 'radio';
        radioInput.className = 'btn-check';
        radioInput.name = 'penColorOption';
        radioInput.id = `penColor_${i}`;
        radioInput.autocomplete = 'off';

        // Reset selected pixel value if switching to a smaller palette
        if (selectedPixelValue >= colorsPerSubPalette) selectedPixelValue = 0;
        if (i === selectedPixelValue) radioInput.checked = true;

        radioInput.addEventListener('change', () => {
            selectedPixelValue = i;
        });

        const label = document.createElement('label');
        label.className = `btn btn-sm btn-dark border-secondary text-center d-flex flex-column align-items-center justify-content-center p-1`;
        label.htmlFor = `penColor_${i}`;
        label.style.flex = "1 0 auto";
        label.style.minWidth = "35px"; // Prevent squeezing on SNES/MD

        // Swatch element preview box
        const swatch = document.createElement('div');
        swatch.style.width = '20px';
        swatch.style.height = '20px';
        swatch.style.backgroundColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        swatch.style.border = '1px solid #000';
        swatch.style.borderRadius = '3px';
        swatch.style.marginBottom = '2px';

        const textSpan = document.createElement('span');
        textSpan.className = 'small text-white-50';
        textSpan.style.fontSize = '9px';
        textSpan.textContent = `V:${i}`;

        label.appendChild(swatch);
        label.appendChild(textSpan);
        colorGroup.appendChild(radioInput);
        colorGroup.appendChild(label);
    }
}

/**
 * Hardware-Agnostic ROM memory editor.
 * Reverses the active BPP decoding schema and modifies the source bytes in the ROM.
 */
function writePixelToRomBuffer(canvasX, canvasY, pixelValue) {
    if (typeof chrSourceType !== 'undefined' && chrSourceType === 'state') return;
    if (typeof window.opener.originalRomBuffer === 'undefined' || !GlobalPalette.config) return;

    // 1. Calculate matching pixel index inside native 128x128 grid
    const targetPixelX = Math.floor(canvasX / chrZoom);
    const targetPixelY = Math.floor(canvasY / chrZoom);

    if (targetPixelX < 0 || targetPixelX >= CHR_BASE_WIDTH || targetPixelY < 0 || targetPixelY >= CHR_BASE_HEIGHT) return;

    // 2. Identify targeting Tile index and inside-tile sub offsets
    const tileX = Math.floor(targetPixelX / TILE_PIXELS);
    const tileY = Math.floor(targetPixelY / TILE_PIXELS);
    const insidePixelX = targetPixelX % TILE_PIXELS;
    const insidePixelY = targetPixelY % TILE_PIXELS;

    const BYTES_PER_TILE = getBytesPerTile();
    const tileSequenceIndex = (tileY * TILES_PER_ROW) + tileX;

    // 3. Resolve base configuration
    // (Removed hardcoded NES iNES header checks to support general offsets and raw files)
    const finalTileByteStart = chrOffset + (tileSequenceIndex * BYTES_PER_TILE);

    const fileBytes = new Uint8Array(window.opener.originalRomBuffer);
    if (finalTileByteStart + BYTES_PER_TILE > fileBytes.length) return;

    const activeBpp = GlobalPalette.config.spriteViewer.bppModes[0];
    const systemId = GlobalPalette.systemId;

    // 4. Reverse Encode to Source Bytes
    if (activeBpp === 2) {
        // --- 2BPP Planar Encoding (NES / Game Boy) ---
        const lowPlaneByteIndex  = finalTileByteStart + insidePixelY;
        const highPlaneByteIndex = finalTileByteStart + insidePixelY + 8;

        const bitShift = 7 - insidePixelX;
        const bitMask = ~(1 << bitShift);

        const b0 = pixelValue & 1;
        const b1 = (pixelValue >> 1) & 1;

        fileBytes[lowPlaneByteIndex]  = (fileBytes[lowPlaneByteIndex] & bitMask) | (b0 << bitShift);
        fileBytes[highPlaneByteIndex] = (fileBytes[highPlaneByteIndex] & bitMask) | (b1 << bitShift);

    } else if (activeBpp === 4) {
        if (systemId === 'md') {
            // --- 4BPP Packed Encoding (Sega Genesis) ---
            const byteIndex = finalTileByteStart + (insidePixelY * 4) + Math.floor(insidePixelX / 2);
            let byte = fileBytes[byteIndex];

            if (insidePixelX % 2 === 0) {
                // Left pixel (high nibble)
                byte = (byte & 0x0F) | ((pixelValue & 0x0F) << 4);
            } else {
                // Right pixel (low nibble)
                byte = (byte & 0xF0) | (pixelValue & 0x0F);
            }
            fileBytes[byteIndex] = byte;

        } else {
            // --- 4BPP Planar Encoding (SNES / SMS) ---
            const bp0Index = finalTileByteStart + (insidePixelY * 2);
            const bp1Index = finalTileByteStart + (insidePixelY * 2) + 1;
            const bp2Index = finalTileByteStart + (insidePixelY * 2) + 16;
            const bp3Index = finalTileByteStart + (insidePixelY * 2) + 17;

            const bitShift = 7 - insidePixelX;
            const bitMask = ~(1 << bitShift);

            const b0 = pixelValue & 1;
            const b1 = (pixelValue >> 1) & 1;
            const b2 = (pixelValue >> 2) & 1;
            const b3 = (pixelValue >> 3) & 1;

            fileBytes[bp0Index] = (fileBytes[bp0Index] & bitMask) | (b0 << bitShift);
            fileBytes[bp1Index] = (fileBytes[bp1Index] & bitMask) | (b1 << bitShift);
            fileBytes[bp2Index] = (fileBytes[bp2Index] & bitMask) | (b2 << bitShift);
            fileBytes[bp3Index] = (fileBytes[bp3Index] & bitMask) | (b3 << bitShift);
        }
    }

    // Enable reload notification indicator UI flags
    const reloadBtn = document.getElementById('btnReloadEmulator');
    if (reloadBtn) reloadBtn.disabled = false;

    // Redraw view container surfaces immediately
    renderCHRViewer();
}

document.addEventListener('DOMContentLoaded', () => {
        const systemHardware = GlobalPalette.initFromRom(window.opener.currentRomName);
        GlobalPalette.generateSubPaletteUI('dynamicPaletteUIContainer');
        if (typeof resetViewerGrid === 'function') resetViewerGrid();

        // live listeners on the Cols / Rows inputs + Reset button
        const tilesPerRowInput = document.getElementById('tilesPerRowInput');
        const visibleRowsInput = document.getElementById('visibleRowsInput');
        const btnResetGrid = document.getElementById('btnResetViewerGrid');

        if (tilesPerRowInput && visibleRowsInput) {
            const updateFromInputs = () => applyGridSettings(tilesPerRowInput.value, visibleRowsInput.value);
            tilesPerRowInput.addEventListener('input', updateFromInputs);
            visibleRowsInput.addEventListener('input', updateFromInputs);
        }
        if (btnResetGrid) {
            btnResetGrid.addEventListener('click', () => resetViewerGrid());
        }
});