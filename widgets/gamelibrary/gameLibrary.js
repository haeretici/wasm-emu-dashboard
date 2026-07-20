/**
 * Game Library widget – lists ROMs stored per system in IndexedDB and loads
 * them into the parent emulator via window.opener.loadRomBuffer().
 */

const GAMES_STORE_NAME = 'games';
const PICTURE_STORE_NAME = 'pictures';

async function gzipDecompress(data) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const GameLibrary = {
    systemId: null,
    games: [],
    pictureUrls: {},
    fuse: null,
    loadingRom: null,
    editingRomId: null,
    deletingRomId: null,
    editModal: null,
    deleteModal: null,

    getDisplayName(game) {
        const title = game.meta?.title;
        if (title != null && title !== '') return title;
        return game.meta?.name || game.id;
    },

    buildGameRecord(id, meta, pictureBlob) {
        const record = {
            id,
            meta: meta || { name: id },
            hasPicture: pictureBlob instanceof Blob,
            pictureBlob: pictureBlob instanceof Blob ? pictureBlob : null,
        };
        record.name = record.meta.name || id;
        record.displayName = this.getDisplayName(record);
        return record;
    },

    rebuildFuseIndex() {
        this.fuse = new Fuse(this.games, {
            keys: ['displayName', 'name', 'meta.title'],
            threshold: 0.35,
            ignoreLocation: true,
        });
    },

    sortGames() {
        this.games.sort((a, b) =>
            a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
        );
    },

    getInitialSystemId(systems) {
        const params = new URLSearchParams(window.location.search);
        const requested = params.get('systemId');
        if (requested && window.EmuHardwareMap[requested]) {
            return requested;
        }
        if (requested) {
            console.warn(`[GameLibrary] Unknown systemId "${requested}", using default.`);
        }
        return systems[0]?.[0] || 'nes';
    },

    init() {
        const systemSelect = document.getElementById('systemSelect');
        const systems = Object.entries(window.EmuHardwareMap);
        systemSelect.innerHTML = systems.map(([id, hw]) =>
            `<option value="${id}">${hw.name}</option>`
        ).join('');

        this.editModal = new bootstrap.Modal(document.getElementById('editMetaModal'));
        this.deleteModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));

        systemSelect.addEventListener('change', () => this.switchSystem(systemSelect.value));
        document.getElementById('btnRefresh').addEventListener('click', () => this.refresh());
        document.getElementById('btnExportAll').addEventListener('click', () => this.exportAllLibrary());
        document.getElementById('btnImportAll').addEventListener('click', () => {
            document.getElementById('libraryImportInput').click();
        });
        document.getElementById('libraryImportInput').addEventListener('change', (event) => {
            this.importAllLibrary(event);
        });
        document.getElementById('searchInput').addEventListener('input', () => this.render());
        document.getElementById('btnClearSearch').addEventListener('click', () => {
            const input = document.getElementById('searchInput');
            input.value = '';
            input.classList.remove('is-filtering');
            this.render();
            input.focus();
        });
        document.getElementById('btnSaveMeta').addEventListener('click', () => this.saveEditedMeta());
        document.getElementById('btnConfirmDelete').addEventListener('click', () => this.confirmDelete());
        document.getElementById('editMetaModal').addEventListener('shown.bs.modal', () => {
            document.getElementById('editMetaTitle')?.focus();
        });

        const initialSystem = this.getInitialSystemId(systems);
        systemSelect.value = initialSystem;
        this.switchSystem(initialSystem);
        this.setupRomDropImport();
    },

    async exportAllLibrary() {
        try {
            const systemCount = await downloadAllLibraryExport();
            if (systemCount > 0) {
                this.setStatus(
                    `Exported library for ${systemCount} system${systemCount === 1 ? '' : 's'}.`,
                    'success'
                );
            }
        } catch (e) {
            console.error(e);
            this.setStatus('Failed to export library.', 'danger');
        }
    },

    async importAllLibrary(event) {
        await handleLibraryImport(event);
    },

    setupRomDropImport() {
        const grid = document.getElementById('gameGrid');
        if (!grid) return;

        setupRomFileDropZone(grid, (files) => this.importDroppedRoms(files));
    },

    async importDroppedRoms(files) {
        const romFiles = Array.from(files).filter((file) => isKnownRomFilename(file.name));
        if (romFiles.length === 0) {
            this.setStatus('No recognized ROM files in drop.', 'warning');
            return;
        }

        let imported = 0;
        let lastImportedName = null;
        let lastImportedBuffer = null;
        let lastImportedSystemId = null;

        for (const file of romFiles) {
            const detected = detectSystemFromRom(file.name, window.EmuHardwareMap);
            const targetSystemId = detected.systemId;

            if (targetSystemId !== this.systemId) {
                const systemSelect = document.getElementById('systemSelect');
                if (systemSelect) systemSelect.value = targetSystemId;
                await this.switchSystem(targetSystemId);
            }

            try {
                const buffer = await readFileToArrayBuffer(file);
                await persistRomToLibrary(file.name, buffer, targetSystemId);
                imported++;
                lastImportedName = file.name;
                lastImportedBuffer = buffer;
                lastImportedSystemId = targetSystemId;
            } catch (e) {
                console.error(e);
                this.setStatus(`Failed to import ${file.name}: ${e.message}`, 'danger');
                await this.refresh();
                return;
            }
        }

        await this.refresh();

        const openerSystemId = window.opener?.GlobalConfiguration?.systemId
            ?? (typeof window.opener?.getPageSystemId === 'function' ? window.opener.getPageSystemId() : null);
        const canLoadInOpener = romFiles.length === 1
            && window.opener?.loadRomBuffer
            && lastImportedSystemId === openerSystemId;

        if (canLoadInOpener) {
            window.opener.AudioContextManager?.unlockFromUserAction?.();
            this.loadingRom = lastImportedName;
            this.render();
            this.setStatus(`Loading ${lastImportedName}…`, 'secondary');

            try {
                window.opener.currentRomName = lastImportedName;
                await window.opener.loadRomBuffer(lastImportedBuffer);
                this.setStatus(`Imported and loaded ${lastImportedName} in emulator.`, 'success');
                window.close();
            } catch (e) {
                console.error(e);
                this.setStatus(`Imported ${lastImportedName}, but failed to load: ${e.message}`, 'warning');
            } finally {
                this.loadingRom = null;
                this.render();
            }
            return;
        }

        this.setStatus(
            `Imported ${imported} ROM${imported === 1 ? '' : 's'} into library.`,
            'success'
        );
    },

    async switchSystem(systemId) {
        this.systemId = systemId;
        GlobalConfiguration.systemId = systemId;
        document.getElementById('systemTitle').textContent =
            `${window.EmuHardwareMap[systemId]?.name || systemId} Library`;
        await this.refresh();
    },

    async refresh() {
        this.revokePictureUrls();
        this.setStatus('Loading library…', 'secondary');

        try {
            const entries = await idbGetAllEntries(GAMES_STORE_NAME, this.systemId);
            this.games = [];

            for (const [key, value] of Object.entries(entries)) {
                if (key.startsWith('meta_')) continue;
                if (!(value instanceof Blob)) continue;

                const meta = entries[`meta_${key}`] || { name: key };
                const pictureBlob = await idbGet(key, PICTURE_STORE_NAME);

                this.games.push(this.buildGameRecord(key, meta, pictureBlob));
            }

            this.sortGames();
            this.rebuildFuseIndex();

            if (this.games.length === 0) {
                this.setStatus('No games saved for this system yet. Load a ROM in the emulator to add it.', 'warning');
            } else {
                const openerReady = !!window.opener?.loadRomBuffer;
                this.setStatus(
                    `${this.games.length} game${this.games.length === 1 ? '' : 's'} in library.` +
                    (openerReady ? ' Click a game to load it.' : ' Open from the emulator window to enable loading.'),
                    'info'
                );
            }

            this.render();
        } catch (e) {
            console.error(e);
            this.games = [];
            this.render();
            this.setStatus('Failed to load game library.', 'danger');
        }
    },

    getFilteredGames() {
        const query = document.getElementById('searchInput')?.value.trim() || '';
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.classList.toggle('is-filtering', query.length > 0);
        }
        if (!query) return this.games;
        if (!this.fuse) return this.games;
        return this.fuse.search(query).map((result) => result.item);
    },

    revokePictureUrls() {
        for (const url of Object.values(this.pictureUrls)) {
            URL.revokeObjectURL(url);
        }
        this.pictureUrls = {};
    },

    getPictureUrl(game) {
        if (!game.pictureBlob) return null;
        if (!this.pictureUrls[game.id]) {
            this.pictureUrls[game.id] = URL.createObjectURL(game.pictureBlob);
        }
        return this.pictureUrls[game.id];
    },

    openEditModal(romId) {
        const game = this.games.find((g) => g.id === romId);
        if (!game) return;

        this.editingRomId = romId;
        document.getElementById('editMetaRomName').value = game.id;
        document.getElementById('editMetaTitle').value =
            game.meta?.title != null ? game.meta.title : '';
        this.editModal.show();
    },

    async saveEditedMeta() {
        if (!this.editingRomId) return;

        const romId = this.editingRomId;
        const titleInput = document.getElementById('editMetaTitle');
        const trimmedTitle = titleInput.value.trim();

        try {
            const metaKey = `meta_${romId}`;
            const existing = await idbGet(metaKey, GAMES_STORE_NAME) || { name: romId };
            const meta = { ...existing, name: romId };

            if (trimmedTitle) {
                meta.title = trimmedTitle;
            } else {
                delete meta.title;
            }

            await idbSet(metaKey, meta, GAMES_STORE_NAME);

            const game = this.games.find((g) => g.id === romId);
            if (game) {
                game.meta = meta;
                game.displayName = this.getDisplayName(game);
            }

            this.sortGames();
            this.rebuildFuseIndex();
            this.editModal.hide();
            this.editingRomId = null;
            this.render();
            this.setStatus(`Updated metadata for ${this.getDisplayName(game)}.`, 'success');
        } catch (e) {
            console.error(e);
            this.setStatus('Failed to save game metadata.', 'danger');
        }
    },

    openDeleteModal(romId) {
        const game = this.games.find((g) => g.id === romId);
        if (!game) return;

        this.deletingRomId = romId;
        document.getElementById('deleteConfirmGameName').textContent = this.getDisplayName(game);
        this.deleteModal.show();
    },

    async confirmDelete() {
        if (!this.deletingRomId) return;

        const romId = this.deletingRomId;
        const displayName = this.getDisplayName(this.games.find((g) => g.id === romId));

        try {
            await idbDelete(romId, GAMES_STORE_NAME);
            await idbDelete(`meta_${romId}`, GAMES_STORE_NAME);
            await idbDelete(romId, PICTURE_STORE_NAME);

            if (this.pictureUrls[romId]) {
                URL.revokeObjectURL(this.pictureUrls[romId]);
                delete this.pictureUrls[romId];
            }

            this.games = this.games.filter((g) => g.id !== romId);
            this.rebuildFuseIndex();
            this.deleteModal.hide();
            this.deletingRomId = null;
            this.render();

            if (this.games.length === 0) {
                this.setStatus('Library is now empty.', 'warning');
            } else {
                this.setStatus(`Removed ${displayName} from library.`, 'success');
            }
        } catch (e) {
            console.error(e);
            this.setStatus('Failed to remove game from library.', 'danger');
        }
    },

    render() {
        const grid = document.getElementById('gameGrid');
        if (!grid) return;

        const visibleGames = this.getFilteredGames();

        if (this.games.length === 0) {
            grid.innerHTML = `
                <div class="col-12 text-center text-muted py-5">
                    <i class="bi bi-inbox display-4 d-block mb-3 opacity-50"></i>
                    <p class="mb-0">No games in the library for this system.</p>
                    <p class="small">Drop ROM files here or use <strong>Load ROM</strong> in the emulator.</p>
                </div>`;
            return;
        }

        if (visibleGames.length === 0) {
            grid.innerHTML = `
                <div class="col-12 text-center text-muted py-5">
                    <i class="bi bi-search display-4 d-block mb-3 opacity-50"></i>
                    <p class="mb-0">No games match your filter.</p>
                </div>`;
            return;
        }

        grid.innerHTML = visibleGames.map((game) => {
            const pictureUrl = this.getPictureUrl(game);
            const thumb = pictureUrl
                ? `<img src="${pictureUrl}" alt="" loading="lazy">`
                : `<i class="bi bi-controller game-thumb-placeholder" aria-hidden="true"></i>`;
            const isLoading = this.loadingRom === game.id;
            const displayName = this.getDisplayName(game);

            return `
                <div class="col">
                    <div class="card game-card bg-dark border-secondary h-100 shadow-sm${isLoading ? ' loading' : ''}"
                         data-rom-id="${escapeHtml(game.id)}">
                        <div class="game-thumb border-bottom border-secondary" data-action="load" title="Load ${escapeHtml(displayName)}">
                            ${thumb}
                        </div>
                        <div class="card-footer game-card-footer border-secondary py-1 px-2 bg-dark">
                            <button type="button"
                                    class="btn btn-link game-action-btn remove-btn"
                                    title="Remove"
                                    aria-label="Remove ${escapeHtml(displayName)}">
                                <i class="bi bi-trash"></i>
                            </button>
                            <p class="game-title small" data-action="load" title="${escapeHtml(displayName)}">
                                ${escapeHtml(displayName)}
                            </p>
                            <button type="button"
                                    class="btn btn-link game-action-btn edit-btn"
                                    title="Edit"
                                    aria-label="Edit ${escapeHtml(displayName)}">
                                <i class="bi bi-pencil"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        grid.querySelectorAll('.game-card').forEach((card) => {
            const romId = card.dataset.romId;

            card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEditModal(romId);
            });

            card.querySelector('.remove-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDeleteModal(romId);
            });

            card.querySelectorAll('[data-action="load"]').forEach((el) => {
                const activate = () => this.loadGame(romId);
                el.addEventListener('click', activate);
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        activate();
                    }
                });
            });
        });
    },

    async loadGame(romName) {
        if (this.loadingRom) return;

        window.opener?.AudioContextManager?.unlockFromUserAction?.();

        if (!window.opener?.loadRomBuffer) {
            this.setStatus('Cannot load game: parent emulator window is not available.', 'danger');
            return;
        }

        this.loadingRom = romName;
        this.render();
        const game = this.games.find((g) => g.id === romName);
        const displayName = game ? this.getDisplayName(game) : romName;
        this.setStatus(`Loading ${displayName}…`, 'secondary');

        try {
            const romBlob = await idbGet(romName, GAMES_STORE_NAME);
            if (!(romBlob instanceof Blob)) {
                throw new Error(`ROM "${romName}" not found in library.`);
            }

            const decompressed = await gzipDecompress(await romBlob.arrayBuffer());
            const arrayBuffer = decompressed.buffer.slice(
                decompressed.byteOffset,
                decompressed.byteOffset + decompressed.byteLength
            );

            window.opener.currentRomName = romName;
            await window.opener.loadRomBuffer(arrayBuffer);

            this.setStatus(`Loaded ${displayName} in emulator.`, 'success');
            window.close();
        } catch (e) {
            console.error(e);
            this.setStatus(`Failed to load ${displayName}: ${e.message}`, 'danger');
        } finally {
            this.loadingRom = null;
            this.render();
        }
    },

    setStatus(msg, type = 'info') {
        const el = document.getElementById('statusMessage');
        if (!el) return;
        el.className = `alert alert-${type} py-2 small mb-0`;
        el.textContent = msg;
    },
};

document.addEventListener('DOMContentLoaded', () => GameLibrary.init());