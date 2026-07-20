/**
 * Central hardware definitions for palettes, graphics, and memory.
 */
window.EmuHardwareMap = {
    // Sega Master System
    'sms': {
        name: 'Sega Master System',
        extensions: ['.sms'],
        palette: {
            totalColors: 32, // 2 palettes of 16 colors
            subPalettes: 2,
            colorsPerSubPalette: 16,
            colorFormat: 'RGB6', // 2 bits per channel (BBGGRR)
            layout: [
                { name: 'Background (Palette 1)', prefix: 'BG', count: 1 },
                { name: 'Sprites (Palette 2)', prefix: 'SP', count: 1 }
            ]
        },
        spriteViewer: {
            bppModes: [4], // SMS uses 4bpp
            defaultTileWidth: 8,
            defaultTileHeight: 8,
            defaultTilesPerRow: 16,
            defaultVisibleRows: 16,
            vramSize: 16384 // 16KB VRAM
        }
    },
    // Nintendo Entertainment System
    'nes': {
        name: 'NES',
        extensions: ['.nes'],
        palette: {
            totalColors: 32, // 32 bytes of palette RAM
            subPalettes: 8,
            colorsPerSubPalette: 4, // 1 transparent + 3 colors per sub-palette
            colorFormat: 'NES_INDEX', // Uses a predefined system palette lookup
            layout: [
                { name: 'Backgrounds ($3F00)', prefix: 'BG', count: 4 },
                { name: 'Sprites ($3F10)', prefix: 'SP', count: 4 }
            ]
        },
        spriteViewer: {
            bppModes: [2], // NES uses 2bpp
            defaultTileWidth: 8,
            defaultTileHeight: 8, // Or 8x16 for sprite mode
            defaultTilesPerRow: 16,
            defaultVisibleRows: 16,
            vramSize: 8192 // 8KB CHR-ROM/RAM standard
        }
    },
    // Sega Genesis / Mega Drive
    'md': {
        name: 'Sega Genesis',
        extensions: ['.md', '.bin', '.gen', '.smd'],
        palette: {
            totalColors: 64,
            subPalettes: 4,
            colorsPerSubPalette: 16,
            colorFormat: 'RGB9', // 3 bits per channel
            layout: [
                { name: 'CRAM Palettes (0-63)', prefix: 'Line', count: 4 }
            ]
        },
        spriteViewer: {
            bppModes: [4], // Genesis is strictly 4bpp
            defaultTileWidth: 8,
            defaultTileHeight: 8,
            defaultTilesPerRow: 16,
            defaultVisibleRows: 16,
            vramSize: 65536 // 64KB VRAM
        }
    },
    // Super Nintendo Entertainment System
    'snes': {
        name: 'SNES',
        extensions: ['.sfc', '.smc'],
        palette: {
            totalColors: 256,
            subPalettes: 16,
            colorsPerSubPalette: 16,
            colorFormat: 'RGB15', // 5 bits per channel
            layout: [
                { name: 'Backgrounds (CGRAM 0-127)', prefix: 'BG', count: 8 },
                { name: 'Sprites (CGRAM 128-255)', prefix: 'SP', count: 8 }
            ]
        },
        spriteViewer: {
            // TODO: right now we default to BPP4, we need to support others
            bppModes: [4, 2, 8], // SNES supports multiple bitplanes
            defaultTileWidth: 8, // 8x8 or 16x16
            defaultTileHeight: 8,
            defaultTilesPerRow: 16,
            defaultVisibleRows: 16,
            vramSize: 65536 // 64KB words (128KB total)
        }
    },
    // Game Boy / Game Boy Color
    'gb': {
        name: 'Game Boy',
        extensions: ['.gb', '.gbc'],
        palette: {
            totalColors: 32, // Max GBC standard
            subPalettes: 8,
            colorsPerSubPalette: 4,
            colorFormat: 'RGB15',
            layout: [
                { name: 'Backgrounds (BGP)', prefix: 'BG', count: 4 },
                { name: 'Sprites (OBP)', prefix: 'SP', count: 4 }
            ]
        },
        spriteViewer: {
            bppModes: [2], // GB is 2bpp
            defaultTileWidth: 8,
            defaultTileHeight: 8,
            defaultTilesPerRow: 16,
            defaultVisibleRows: 16,
            vramSize: 8192 // 8KB (16KB for GBC)
        }
    }
};