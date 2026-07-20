// DEPRECATED
// Keep track of the last update time and the previous palette data outside the function
let previousPaletteHex = [];
const container = document.getElementById('paletteContainer');

function updatePaletteUI() {

    if(!isModuleInited || !container || !gameModule) {
        return;
    }

    let palettePtr = 0;
    try {
        palettePtr = gameModule._get_active_palette_ptr();
    } catch (e) {
        // Suppress errors if module isn't ready
    }

    if (palettePtr === 0) return;

    const ppuPaletteView = new Uint16Array(gameModule.HEAPU8.buffer, palettePtr, 256);

    // 2. Change Detection: Build an array of current hex colors to compare against the last run
    const currentPaletteHex = [];
    for (let i = 0; i < 256; i++) {
        const colorWord = ppuPaletteView[i];
        const r = (colorWord & 0x1F) << 3;
        const g = ((colorWord >> 5) & 0x1F) << 3;
        const b = ((colorWord >> 10) & 0x1F) << 3;
        const hexColor = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        currentPaletteHex.push({ r, g, b, hexColor, colorWord });
    }

    // Check if the palette has actually changed by comparing hex arrays
    const isPaletteIdentical = previousPaletteHex.length === currentPaletteHex.length &&
        previousPaletteHex.every((color, idx) => color.hexColor === currentPaletteHex[idx].hexColor);

    // If nothing changed, exit early and skip the heavy DOM reconstruction
    if (isPaletteIdentical) return;

    // 3. Render: If we got here, 1 second has passed AND the colors changed. Update the DOM.
    container.innerHTML = '';
    previousPaletteHex = currentPaletteHex; // Cache the new state for the next check

    for (let i = 0; i < 256; i++) {
        const { r, g, b, hexColor, colorWord } = currentPaletteHex[i];

        const swatch = document.createElement('div');
        swatch.style.width = '20px';
        swatch.style.height = '20px';
        swatch.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        swatch.style.border = '1px solid #444';
        swatch.title = `Slot ${i}: ${hexColor.toUpperCase()} (Raw: 0x${colorWord.toString(16).toUpperCase()})`;

        // Separator between Background Palettes (0-127) and Sprite Palettes (128-255)
        if (i === 128) {
            const divider = document.createElement('div');
            divider.style.width = '100%';
            divider.style.height = '10px'; // Forms a clean visual block break
            container.appendChild(divider);
        }

        container.appendChild(swatch);
    }
}

setInterval(updatePaletteUI, 500);
