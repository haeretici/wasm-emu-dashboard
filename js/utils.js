function generateUUID() { // Public Domain/MIT
    var d = new Date().getTime();//Timestamp
    var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16;//random number between 0 and 16
        if(d > 0){//Use timestamp until depleted
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {//Use microseconds since page-load if supported
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function getCurrentDB(systemId) {
    const globalSysId = typeof GlobalConfiguration !== 'undefined' ? GlobalConfiguration.systemId : undefined;
    const id = systemId ?? globalSysId ?? 'nes';
    return id + 'EmulatorDDB';
}

/**
 * Detect emulator system from a ROM filename extension.
 * @param {string} filename
 * @param {object} hardwareMap - e.g. window.EmuHardwareMap
 * @param {string} [defaultSystemId='md']
 * @returns {{ systemId: string, config: object|null }}
 */
function detectSystemFromRom(filename, hardwareMap, defaultSystemId = 'md') {
    if (!hardwareMap) {
        return { systemId: defaultSystemId, config: null };
    }

    if (!filename) {
        return { systemId: defaultSystemId, config: hardwareMap[defaultSystemId] || null };
    }

    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex === -1) {
        return { systemId: defaultSystemId, config: hardwareMap[defaultSystemId] || null };
    }

    const ext = filename.substring(dotIndex).toLowerCase();
    for (const [sysId, hardware] of Object.entries(hardwareMap)) {
        if (hardware.extensions.includes(ext)) {
            return { systemId: sysId, config: hardware };
        }
    }

    console.warn(`[detectSystemFromRom] Unknown extension: ${ext}. Defaulting to ${defaultSystemId}.`);
    return { systemId: defaultSystemId, config: hardwareMap[defaultSystemId] || null };
}

function getRomFileExtension(filename) {
    const dotIndex = filename.lastIndexOf('.');
    return dotIndex === -1 ? '' : filename.substring(dotIndex).toLowerCase();
}

function isKnownRomFilename(filename) {
    const ext = getRomFileExtension(filename);
    if (!ext || !window.EmuHardwareMap) return false;
    return Object.values(window.EmuHardwareMap).some((hw) => hw.extensions.includes(ext));
}

function readFileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

async function persistRomToLibrary(romName, romBuffer, systemId) {
    const globalConfigExists = typeof GlobalConfiguration !== 'undefined';
    const targetSystemId = systemId ?? (globalConfigExists ? GlobalConfiguration.systemId : undefined) ?? 'nes';
    const previousSystemId = globalConfigExists ? GlobalConfiguration.systemId : undefined;

    try {
        if (globalConfigExists) {
            GlobalConfiguration.systemId = targetSystemId;
        }

        const stream = new Blob([new Uint8Array(romBuffer)]).stream().pipeThrough(new CompressionStream('gzip'));
        const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
        const romBlob = new Blob([compressed], { type: 'application/gzip' });
        const metaKey = `meta_${romName}`;

        await idbSet(romName, romBlob, 'games', targetSystemId);
        await idbSet(metaKey, { name: romName }, 'games', targetSystemId);

        console.log(`Persisted [${romName}] to IndexedDB games store (${targetSystemId}).`);
    } finally {
        if (globalConfigExists && previousSystemId !== undefined) {
            GlobalConfiguration.systemId = previousSystemId;
        }
    }
}

function clearRomDropOverlays(targetWindow) {
    const clearers = targetWindow?._romDropZoneClearers;
    if (!clearers) return;
    clearers.forEach((clear) => clear());
}

function clearRomDropOverlaysAll() {
    clearRomDropOverlays(window);
    try {
        if (window.opener && !window.opener.closed) {
            clearRomDropOverlays(window.opener);
        }
    } catch (_) {
        // Opener may be cross-origin or inaccessible.
    }
}

/**
 * Attach drag-and-drop handlers for ROM file import.
 * @param {HTMLElement} element
 * @param {(files: File[]) => void|Promise<void>} onDropFiles
 * @param {{ activeClass?: string }} [options]
 */
function setupRomFileDropZone(element, onDropFiles, options = {}) {
    if (!element || typeof onDropFiles !== 'function') return;

    const activeClass = options.activeClass || 'rom-drop-active';

    const clearActive = () => {
        element.classList.remove(activeClass);
    };

    if (!window._romDropZoneClearers) {
        window._romDropZoneClearers = new Set();
    }
    window._romDropZoneClearers.add(clearActive);

    const isFileDrag = (event) => event.dataTransfer?.types?.includes('Files');

    const isLeavingElement = (event) => {
        const related = event.relatedTarget;
        return !related || !element.contains(related);
    };

    element.addEventListener('dragenter', (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();

        try {
            if (window.opener && !window.opener.closed) {
                clearRomDropOverlays(window.opener);
            }
        } catch (_) {}

        element.classList.add(activeClass);
    });

    element.addEventListener('dragover', (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        element.classList.add(activeClass);
        event.dataTransfer.dropEffect = 'copy';
    });

    element.addEventListener('dragleave', (event) => {
        if (!isLeavingElement(event)) return;
        clearActive();
    });

    element.addEventListener('drop', async (event) => {
        event.preventDefault();
        clearRomDropOverlaysAll();

        const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.size > 0);
        if (files.length === 0) return;

        await onDropFiles(files, event);
    });

    // dragend only fires in the window that received the drop; clear every registered zone.
    document.addEventListener('dragend', clearRomDropOverlaysAll);

    // Another window (e.g. library popup) took focus during the drag.
    window.addEventListener('blur', clearActive);
}

// All object stores used across emulator pages and widgets.
const IDB_STORES = ['savestates', 'pictures', 'games', 'gamepad_config', 'cheats_config'];
const IDB_VERSION = 5;

// Promise wrapper for initializing/opening IndexedDB
function openDB(systemId) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(getCurrentDB(systemId), IDB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            for (const storeName of IDB_STORES) {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            }
            // Allow pages that declare a custom STORE_NAME to self-register.
            if (typeof STORE_NAME !== 'undefined' && !IDB_STORES.includes(STORE_NAME)) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function resolveStoreName(storeName) {
    if (storeName) return storeName;
    if (typeof STORE_NAME !== 'undefined') return STORE_NAME;
    return IDB_STORES[0];
}

// Helper to get data from IndexedDB
async function idbGet(key, storeName, systemId) {
    const db = await openDB(systemId);
    const resolvedStore = resolveStoreName(storeName);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(resolvedStore, "readonly");
        const store = transaction.objectStore(resolvedStore);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Helper to save data to IndexedDB
async function idbSet(key, value, storeName, systemId) {
    const db = await openDB(systemId);
    const resolvedStore = resolveStoreName(storeName);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(resolvedStore, "readwrite");
        const store = transaction.objectStore(resolvedStore);
        const request = store.put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Helper to delete a key from IndexedDB
async function idbDelete(key, storeName, systemId) {
    const db = await openDB(systemId);
    const resolvedStore = resolveStoreName(storeName);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(resolvedStore, "readwrite");
        const store = transaction.objectStore(resolvedStore);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

const IDB_EXPORT_FORMAT = 'romdashboard-idb-export';
const IDB_EXPORT_VERSION = 1;
const GAMEPAD_EXPORT_FORMAT = 'romdashboard-gamepad-export';
const GAMEPAD_EXPORT_VERSION = 1;
const GAMEPAD_CONFIG_STORE = 'gamepad_config';
const LIBRARY_EXPORT_FORMAT = 'romdashboard-library-export';
const LIBRARY_EXPORT_VERSION = 1;
const GAMES_STORE = 'games';
const PICTURE_STORE = 'pictures';
const LIBRARY_EXPORT_STORES = [GAMES_STORE, PICTURE_STORE];

function uint8ArrayToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function serializeIdbValue(value) {
    if (value instanceof Blob) {
        const bytes = new Uint8Array(await value.arrayBuffer());
        return { __type: 'Blob', data: uint8ArrayToBase64(bytes) };
    }
    if (value instanceof Uint8Array) {
        return { __type: 'Uint8Array', data: uint8ArrayToBase64(value) };
    }
    if (value instanceof ArrayBuffer) {
        return { __type: 'ArrayBuffer', data: uint8ArrayToBase64(new Uint8Array(value)) };
    }
    return value;
}

function deserializeIdbValue(value) {
    if (value && typeof value === 'object' && value.__type === 'Blob') {
        const bytes = base64ToUint8Array(value.data);
        return new Blob([bytes], { type: 'application/octet-stream' });
    }
    if (value && typeof value === 'object' && value.__type === 'Uint8Array') {
        const bytes = base64ToUint8Array(value.data);
        return new Blob([bytes], { type: 'application/octet-stream' });
    }
    if (value && typeof value === 'object' && value.__type === 'ArrayBuffer') {
        return base64ToUint8Array(value.data).buffer;
    }
    return value;
}

async function idbGetAllEntries(storeName, systemId) {
    const db = await openDB(systemId);
    const resolvedStore = resolveStoreName(storeName);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(resolvedStore, 'readonly');
        const store = transaction.objectStore(resolvedStore);
        const entries = {};
        const request = store.openCursor();

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                entries[cursor.key] = cursor.value;
                cursor.continue();
            }
        };

        transaction.oncomplete = () => resolve(entries);
        transaction.onerror = () => reject(transaction.error);
    });
}

async function idbImportEntries(entries, storeName, systemId) {
    const keys = Object.keys(entries);
    if (keys.length === 0) return 0;

    const db = await openDB(systemId);
    const resolvedStore = resolveStoreName(storeName);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(resolvedStore, 'readwrite');
        const store = transaction.objectStore(resolvedStore);

        for (const key of keys) {
            store.put(entries[key], key);
        }

        transaction.oncomplete = () => resolve(keys.length);
        transaction.onerror = () => reject(transaction.error);
    });
}

async function exportIndexedDB(storeNames = IDB_STORES) {
    const stores = {};

    for (const storeName of storeNames) {
        const entries = await idbGetAllEntries(storeName);
        stores[storeName] = {};
        for (const [key, value] of Object.entries(entries)) {
            stores[storeName][key] = await serializeIdbValue(value);
        }
    }

    return {
        format: IDB_EXPORT_FORMAT,
        version: IDB_EXPORT_VERSION,
        database: getCurrentDB(),
        exportedAt: new Date().toISOString(),
        stores
    };
}

async function importIndexedDB(exportData, options = {}) {
    const storeNames = options.storeNames || IDB_STORES;

    if (!exportData || exportData.format !== IDB_EXPORT_FORMAT) {
        throw new Error('Invalid or unsupported export file format.');
    }

    if (exportData.database && exportData.database !== getCurrentDB()) {
        const proceed = confirm(
            `This export is from "${exportData.database}" but the current database is "${getCurrentDB()}". Import anyway?`
        );
        if (!proceed) return 0;
    }

    let importedCount = 0;

    for (const storeName of storeNames) {
        const storeData = exportData.stores?.[storeName];
        if (!storeData) continue;

        const entries = {};
        for (const [key, value] of Object.entries(storeData)) {
            entries[key] = deserializeIdbValue(value);
        }

        importedCount += await idbImportEntries(entries, storeName);
    }

    return importedCount;
}

async function downloadIndexedDBExport() {
    try {
        const payload = await exportIndexedDB(['savestates']);
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const systemId = GlobalConfiguration?.systemId || 'nes';
        link.href = url;
        link.download = `${systemId}-savestates.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Failed to export IndexedDB:', error);
        alert('Failed to export save data.');
    }
}

async function importIndexedDBFromFile(file) {
    const text = await file.text();
    const payload = JSON.parse(text);
    const count = await importIndexedDB(payload, { storeNames: ['savestates'] });

    if (typeof updateLoadButtonState === 'function') {
        await updateLoadButtonState();
    }

    return count;
}

async function handleIndexedDBImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = '';

    try {
        const count = await importIndexedDBFromFile(file);
        if (count === 0) {
            alert('No save state entries were imported.');
            return;
        }
        alert(`Imported ${count} save state entr${count === 1 ? 'y' : 'ies'}.`);
    } catch (error) {
        console.error('Failed to import IndexedDB:', error);
        alert('Failed to import save data. Check the file format and try again.');
    }
}

function getKnownSystemIds() {
    if (window.EmuHardwareMap) {
        return Object.keys(window.EmuHardwareMap);
    }
    return ['nes', 'snes', 'md', 'sms', 'gb'];
}

async function serializeStoreEntries(entries) {
    const serialized = {};
    for (const [key, value] of Object.entries(entries)) {
        serialized[key] = await serializeIdbValue(value);
    }
    return serialized;
}

function deserializeStoreEntries(storeData) {
    const entries = {};
    for (const [key, value] of Object.entries(storeData)) {
        entries[key] = deserializeIdbValue(value);
    }
    return entries;
}

async function exportAllGamepadSettings() {
    const databases = {};

    for (const systemId of getKnownSystemIds()) {
        const entries = await idbGetAllEntries(GAMEPAD_CONFIG_STORE, systemId);
        if (Object.keys(entries).length === 0) continue;

        databases[getCurrentDB(systemId)] = {
            [GAMEPAD_CONFIG_STORE]: await serializeStoreEntries(entries)
        };
    }

    return {
        format: GAMEPAD_EXPORT_FORMAT,
        version: GAMEPAD_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        databases
    };
}

async function importAllGamepadSettings(exportData) {
    if (!exportData) {
        throw new Error('Invalid or unsupported export file format.');
    }

    let importedCount = 0;

    if (exportData.format === GAMEPAD_EXPORT_FORMAT) {
        for (const [databaseName, stores] of Object.entries(exportData.databases || {})) {
            const storeData = stores?.[GAMEPAD_CONFIG_STORE];
            if (!storeData) continue;

            const systemId = databaseName.replace(/EmulatorDDB$/, '');
            const entries = deserializeStoreEntries(storeData);
            importedCount += await idbImportEntries(entries, GAMEPAD_CONFIG_STORE, systemId);
        }
        return importedCount;
    }

    if (exportData.format === IDB_EXPORT_FORMAT && exportData.stores?.[GAMEPAD_CONFIG_STORE]) {
        const systemId = exportData.database
            ? exportData.database.replace(/EmulatorDDB$/, '')
            : undefined;
        const entries = deserializeStoreEntries(exportData.stores[GAMEPAD_CONFIG_STORE]);
        importedCount += await idbImportEntries(entries, GAMEPAD_CONFIG_STORE, systemId);
        return importedCount;
    }

    throw new Error('Invalid or unsupported export file format.');
}

async function downloadAllGamepadSettingsExport() {
    const payload = await exportAllGamepadSettings();
    const systemCount = Object.keys(payload.databases).length;

    if (systemCount === 0) {
        alert('No saved gamepad settings found to export.');
        return 0;
    }

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gamepad-settings.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return systemCount;
}

async function importAllGamepadSettingsFromFile(file) {
    const text = await file.text();
    const payload = JSON.parse(text);
    return importAllGamepadSettings(payload);
}

async function handleGamepadSettingsImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = '';

    try {
        const count = await importAllGamepadSettingsFromFile(file);
        if (count === 0) {
            alert('No gamepad settings were imported.');
            return;
        }

        if (typeof GamepadConfig !== 'undefined') {
            await GamepadConfig.load();
            GamepadConfig.render();
            GamepadConfig.setStatus(`Imported ${count} gamepad setting entr${count === 1 ? 'y' : 'ies'}.`, 'success');
        } else {
            alert(`Imported ${count} gamepad setting entr${count === 1 ? 'y' : 'ies'}.`);
        }

        if (window.opener?.updateLoadButtonState) {
            await window.opener.updateLoadButtonState();
        }
    } catch (error) {
        console.error('Failed to import gamepad settings:', error);
        alert('Failed to import gamepad settings. Check the file format and try again.');
    }
}

async function exportAllLibrary() {
    const databases = {};

    for (const systemId of getKnownSystemIds()) {
        const gamesEntries = await idbGetAllEntries(GAMES_STORE, systemId);
        const picturesEntries = await idbGetAllEntries(PICTURE_STORE, systemId);
        const hasGames = Object.keys(gamesEntries).length > 0;
        const hasPictures = Object.keys(picturesEntries).length > 0;
        if (!hasGames && !hasPictures) continue;

        const databaseName = getCurrentDB(systemId);
        databases[databaseName] = {};

        if (hasGames) {
            databases[databaseName][GAMES_STORE] = await serializeStoreEntries(gamesEntries);
        }
        if (hasPictures) {
            databases[databaseName][PICTURE_STORE] = await serializeStoreEntries(picturesEntries);
        }
    }

    return {
        format: LIBRARY_EXPORT_FORMAT,
        version: LIBRARY_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        databases
    };
}

async function importAllLibrary(exportData) {
    if (!exportData) {
        throw new Error('Invalid or unsupported export file format.');
    }

    if (exportData.format !== LIBRARY_EXPORT_FORMAT) {
        throw new Error('Invalid or unsupported export file format.');
    }

    let importedCount = 0;

    for (const [databaseName, stores] of Object.entries(exportData.databases || {})) {
        const systemId = databaseName.replace(/EmulatorDDB$/, '');

        for (const storeName of LIBRARY_EXPORT_STORES) {
            const storeData = stores?.[storeName];
            if (!storeData) continue;

            const entries = deserializeStoreEntries(storeData);
            importedCount += await idbImportEntries(entries, storeName, systemId);
        }
    }

    return importedCount;
}

async function downloadAllLibraryExport() {
    const payload = await exportAllLibrary();
    const systemCount = Object.keys(payload.databases).length;

    if (systemCount === 0) {
        alert('No saved library entries found to export.');
        return 0;
    }

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'game-library.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return systemCount;
}

async function importAllLibraryFromFile(file) {
    const text = await file.text();
    const payload = JSON.parse(text);
    return importAllLibrary(payload);
}

async function handleLibraryImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = '';

    try {
        const count = await importAllLibraryFromFile(file);
        if (count === 0) {
            alert('No library entries were imported.');
            return;
        }

        if (typeof GameLibrary !== 'undefined') {
            await GameLibrary.refresh();
            GameLibrary.setStatus(
                `Imported ${count} library entr${count === 1 ? 'y' : 'ies'}.`,
                'success'
            );
        } else {
            alert(`Imported ${count} library entr${count === 1 ? 'y' : 'ies'}.`);
        }
    } catch (error) {
        console.error('Failed to import library:', error);
        alert('Failed to import library. Check the file format and try again.');
    }
}