/**
 * Shared cheat decode + apply helpers used by the main window and the cheats widget.
 * Game Genie decoding is system-specific; hex patches use ADDR:VAL[:COMPARE].
 */

const CHEATS_STORE_NAME = 'cheats_config';

function padBinCheat(num, size) {
    const s = '0000000000000000' + num.toString(2);
    return s.substring(s.length - size);
}

/** NES Game Genie (tuxnes algorithm). */
function decodeNESGameGenieCode(code) {
    const letters = 'APZLGITYEOXUKSVN';
    code = String(code).replace(/[^A-Z]/gi, '').toUpperCase();
    if (code.length !== 6 && code.length !== 8) return null;

    const n = [];
    for (let i = 0; i < code.length; i++) {
        const idx = letters.indexOf(code[i]);
        if (idx === -1) return null;
        n[i] = idx;
    }

    const address = 0x8000 | (
        ((n[3] & 7) << 12) |
        ((n[5] & 7) << 8) |
        ((n[4] & 8) << 8) |
        ((n[2] & 7) << 4) |
        ((n[1] & 8) << 4) |
        (n[4] & 7) |
        (n[3] & 8)
    );

    if (code.length === 6) {
        const value = (
            ((n[1] & 7) << 4) |
            ((n[0] & 8) << 4) |
            (n[0] & 7) |
            (n[5] & 8)
        );
        return { address, value, hasCompare: false, compare: 0 };
    }

    const value = (
        ((n[1] & 7) << 4) |
        ((n[0] & 8) << 4) |
        (n[0] & 7) |
        (n[7] & 8)
    );
    const compare = (
        ((n[7] & 7) << 4) |
        ((n[6] & 8) << 4) |
        (n[6] & 7) |
        (n[5] & 8)
    );
    return { address, value, hasCompare: true, compare };
}

/** SNES Game Genie (matches snes9x S9xGameGenieToRaw). */
function decodeSNESGameGenieCode(code) {
    const CHARS = 'DF4709156BC8A23E';
    code = String(code).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (code.length !== 8) return null;

    let bits = '';
    for (let i = 0; i < 8; i++) {
        const j = CHARS.indexOf(code[i]);
        if (j === -1) return null;
        bits += padBinCheat(j, 4);
    }

    const nibs = [
        bits.substr(18, 4),
        bits.substr(26, 4),
        bits.substr(8, 4),
        bits.substr(30, 2) + bits.substr(16, 2),
        bits.substr(12, 4),
        bits.substr(22, 4),
        bits.substr(0, 4),
        bits.substr(4, 4)
    ];

    let hexStr = '';
    for (let i = 0; i < 8; i++) {
        hexStr += parseInt(nibs[i], 2).toString(16);
    }

    return {
        address: parseInt(hexStr.substr(0, 6), 16),
        value: parseInt(hexStr.substr(6, 2), 16),
        hasCompare: false,
        compare: 0
    };
}

/** Mega Drive / Genesis Game Genie (8 letters, 16-bit patch value). */
function decodeMDGameGenieCode(code) {
    const CHARS = 'ABCDEFGHJKLMNPRSTVWXYZ0123456789';
    code = String(code).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (code.length !== 8) return null;

    let bits = '';
    for (let i = 0; i < 8; i++) {
        const n = CHARS.indexOf(code[i]);
        if (n === -1) return null;
        bits += padBinCheat(n, 5);
    }

    const nibs = [
        bits.substr(16, 4),
        bits.substr(20, 4),
        bits.substr(8, 4),
        bits.substr(12, 4),
        bits.substr(32, 4),
        bits.substr(36, 4),
        bits.substr(29, 3) + bits.substr(24, 1),
        bits.substr(25, 4),
        bits.substr(0, 4),
        bits.substr(4, 4)
    ];

    let hexStr = '';
    for (let i = 0; i < 10; i++) {
        hexStr += parseInt(nibs[i], 2).toString(16);
    }

    return {
        address: parseInt(hexStr.substr(0, 6), 16),
        value: parseInt(hexStr.substr(6, 4), 16),
        hasCompare: false,
        compare: 0
    };
}

function parseCheatCodeForSystem(code, systemId) {
    const raw = String(code || '').trim();
    if (!raw) return null;

    if (raw.includes(':')) {
        const parts = raw.split(':');
        const addr = parseInt(parts[0], 16);
        const val = parseInt(parts[1], 16);
        if (isNaN(addr) || isNaN(val)) return null;
        const hasCompare = parts.length > 2 && !isNaN(parseInt(parts[2], 16));
        const compare = hasCompare ? parseInt(parts[2], 16) : 0;
        return { address: addr, value: val, hasCompare, compare };
    }

    if (systemId === 'snes') return decodeSNESGameGenieCode(raw);
    if (systemId === 'md') return decodeMDGameGenieCode(raw);
    return decodeNESGameGenieCode(raw);
}

/**
 * Apply an array of cheat objects { code, enabled } to a WASM module.
 * @returns {{ applied: number, failed: number, unsupported: boolean }}
 */
function applyCheatListToModule(gameModule, cheats, systemId) {
    if (!gameModule) {
        return { applied: 0, failed: 0, unsupported: true };
    }
    if (typeof gameModule._clear_cheats !== 'function' || typeof gameModule._add_cheat !== 'function') {
        return { applied: 0, failed: 0, unsupported: true };
    }

    gameModule._clear_cheats();

    let applied = 0;
    let failed = 0;
    const list = Array.isArray(cheats) ? cheats : [];

    for (const cheat of list) {
        if (!cheat || !cheat.enabled) continue;
        const decoded = parseCheatCodeForSystem(cheat.code, systemId);
        if (!decoded) {
            failed++;
            continue;
        }
        gameModule._add_cheat(
            1,
            decoded.address >>> 0,
            decoded.value >>> 0,
            decoded.hasCompare ? 1 : 0,
            (decoded.compare || 0) >>> 0
        );
        applied++;
    }

    return { applied, failed, unsupported: false };
}

/**
 * Load cheats for the current ROM from IndexedDB and apply them to the running core.
 * Safe to call after every successful ROM load.
 */
async function applyStoredCheatsForCurrentGame() {
    try {
        if (!window.gameModule || !window.currentRomName) return;
        if (!window.isLoaded) return;

        const systemId = (typeof GlobalConfiguration !== 'undefined' && GlobalConfiguration.systemId)
            ? GlobalConfiguration.systemId
            : 'nes';
        const key = `cheats_${systemId}_${window.currentRomName}`;
        const data = await idbGet(key, CHEATS_STORE_NAME, systemId);
        const cheats = Array.isArray(data) ? data : [];
        if (cheats.length === 0) return;

        const result = applyCheatListToModule(window.gameModule, cheats, systemId);
        if (result.unsupported) {
            console.warn('Cheats stored for this game, but the core has no cheat API.');
            return;
        }
        console.log(`Cheats re-applied for ${window.currentRomName}: ${result.applied} active, ${result.failed} invalid`);
    } catch (e) {
        console.warn('Failed to re-apply stored cheats:', e);
    }
}

window.parseCheatCodeForSystem = parseCheatCodeForSystem;
window.applyCheatListToModule = applyCheatListToModule;
window.applyStoredCheatsForCurrentGame = applyStoredCheatsForCurrentGame;
window.decodeNESGameGenieCode = decodeNESGameGenieCode;
window.decodeSNESGameGenieCode = decodeSNESGameGenieCode;
window.decodeMDGameGenieCode = decodeMDGameGenieCode;
