/**
 * Gamepad configuration widget – standalone module for mapping keyboard/gamepad
 * inputs to console controller buttons. Persists per-system profiles via IndexedDB.
 */

const IDB_KEY = 'gamepad_profiles_v1';
const CONFIG_VERSION = 1;

// ---------------------------------------------------------------------------
// Binding capture (keyboard + gamepad via native APIs)
// ---------------------------------------------------------------------------

const GAMEPAD_BUTTON_LABELS = [
    'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
    'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'B15',
];

const BindingCapture = {
    active: null,
    rafId: null,
    baseline: null,

    start(inputEl, onCapture, onCancel) {
        this.stop();
        this.active = { inputEl, onCapture, onCancel };
        inputEl.classList.add('binding-listening');
        inputEl.placeholder = 'Press a key or gamepad button… (Esc to cancel)';

        this._keyHandler = (e) => {
            if (e.code === 'Escape') {
                e.preventDefault();
                this.stop();
                if (onCancel) onCancel();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const binding = { type: 'keyboard', code: e.code };
            this.stop();
            onCapture(binding);
        };
        window.addEventListener('keydown', this._keyHandler, true);

        this.baseline = this._snapshotGamepads();
        this._pollGamepads();
    },

    stop() {
        if (this._keyHandler) {
            window.removeEventListener('keydown', this._keyHandler, true);
            this._keyHandler = null;
        }
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (this.active?.inputEl) {
            this.active.inputEl.classList.remove('binding-listening');
            this.active.inputEl.placeholder = 'Click to bind…';
        }
        this.active = null;
        this.baseline = null;
    },

    _snapshotGamepads() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        return Array.from(pads).filter(Boolean).map((gp) => ({
            index: gp.index,
            buttons: gp.buttons.map((b) => b.pressed || b.value > 0.5),
            axes: [...gp.axes],
        }));
    },

    _pollGamepads() {
        if (!this.active) return;

        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const gp of pads) {
            if (!gp || !gp.connected) continue;

            const base = this.baseline?.find((b) => b.index === gp.index);

            for (let i = 0; i < gp.buttons.length; i++) {
                const pressed = gp.buttons[i].pressed || gp.buttons[i].value > 0.5;
                const wasPressed = base?.buttons[i] ?? false;
                if (pressed && !wasPressed) {
                    const binding = {
                        type: 'gamepad_button',
                        gamepadIndex: gp.index,
                        button: i,
                    };
                    const { onCapture } = this.active;
                    this.stop();
                    onCapture(binding);
                    return;
                }
            }

            for (let i = 0; i < gp.axes.length; i++) {
                const val = gp.axes[i];
                const baseVal = base?.axes[i] ?? 0;
                if (Math.abs(val) > 0.6 && Math.abs(baseVal) <= 0.6) {
                    const binding = {
                        type: 'gamepad_axis',
                        gamepadIndex: gp.index,
                        axis: i,
                        direction: val > 0 ? '+' : '-',
                    };
                    const { onCapture } = this.active;
                    this.stop();
                    onCapture(binding);
                    return;
                }
            }
        }

        this.rafId = requestAnimationFrame(() => this._pollGamepads());
    },
};

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function formatBinding(binding) {
    if (!binding) return '';
    if (binding.type === 'keyboard') return formatKeyCode(binding.code);
    if (binding.type === 'gamepad_button') {
        const label = GAMEPAD_BUTTON_LABELS[binding.button] || `Btn ${binding.button}`;
        return `GP${binding.gamepadIndex} ${label}`;
    }
    if (binding.type === 'gamepad_axis') {
        const dir = binding.direction === '+' ? '+' : '−';
        return `GP${binding.gamepadIndex} Axis${binding.axis}${dir}`;
    }
    return '';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatKeyCode(code) {
    if (!code) return '';
    const special = {
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
        Enter: 'Enter', Escape: 'Esc', Space: 'Space', Tab: 'Tab',
        Backspace: 'Backspace', Delete: 'Delete',
        ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
        ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
        AltLeft: 'L-Alt', AltRight: 'R-Alt',
        NumpadEnter: 'Num Enter', Numpad0: 'Num 0', Numpad1: 'Num 1',
        Numpad2: 'Num 2', Numpad3: 'Num 3', Numpad4: 'Num 4',
        Numpad5: 'Num 5', Numpad6: 'Num 6', Numpad7: 'Num 7',
        Numpad8: 'Num 8', Numpad9: 'Num 9',
    };
    if (special[code]) return special[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
}

function bindingToStorage(binding) {
    if (!binding) return null;
    return { ...binding };
}

// ---------------------------------------------------------------------------
// Profile state
// ---------------------------------------------------------------------------

const GamepadConfig = {
    systemId: null,
    profiles: [],
    connectedGamepads: [],

    getInitialSystemId(systems) {
        const params = new URLSearchParams(window.location.search);
        const requested = params.get('systemId');
        if (requested && window.EmuHardwareMap[requested]) {
            return requested;
        }
        if (requested) {
            console.warn(`[GamepadConfig] Unknown systemId "${requested}", using default.`);
        }
        return systems[0]?.[0] || 'nes';
    },

    init() {
        const systemSelect = document.getElementById('systemSelect');
        const systems = Object.entries(window.EmuHardwareMap);
        systemSelect.innerHTML = systems.map(([id, hw]) =>
            `<option value="${id}">${hw.name}</option>`
        ).join('');

        systemSelect.addEventListener('change', () => this.switchSystem(systemSelect.value));
        document.getElementById('btnAddProfile').addEventListener('click', () => this.addProfile());
        document.getElementById('btnSave').addEventListener('click', () => this.save());
        document.getElementById('btnResetDefaults').addEventListener('click', () => this.resetToDefaults());
        document.getElementById('btnExportAll').addEventListener('click', () => this.exportAllSettings());
        document.getElementById('btnImportAll').addEventListener('click', () => {
            document.getElementById('gamepadImportInput').click();
        });
        document.getElementById('gamepadImportInput').addEventListener('change', (event) => {
            this.importAllSettings(event);
        });

        window.addEventListener('gamepadconnected', () => this.refreshGamepadList());
        window.addEventListener('gamepaddisconnected', () => this.refreshGamepadList());

        const initialSystem = this.getInitialSystemId(systems);
        systemSelect.value = initialSystem;
        this.switchSystem(initialSystem);
    },

    async switchSystem(systemId) {
        BindingCapture.stop();
        this.systemId = systemId;
        GlobalConfiguration.systemId = systemId;
        document.getElementById('systemTitle').textContent =
            window.EmuHardwareMap[systemId]?.name || systemId;
        await this.load();
        this.render();
        this.refreshGamepadList();
    },

    getSystemMap() {
        return window.SystemButtonMaps[this.systemId] || null;
    },

    createProfile(overrides = {}) {
        const map = this.getSystemMap();
        const bindings = {};
        if (map) {
            for (const btn of map.buttons) bindings[btn.id] = null;
        }
        return {
            id: generateUUID(),
            name: 'New Profile',
            port: 1,
            deviceType: 'keyboard',
            gamepadIndex: 0,
            bindings,
            ...overrides,
        };
    },

    addProfile() {
        this.profiles.push(this.createProfile());
        this.render();
    },

    removeProfile(id) {
        this.profiles = this.profiles.filter((p) => p.id !== id);
        this.render();
    },

    updateProfile(id, field, value) {
        const profile = this.profiles.find((p) => p.id === id);
        if (!profile) return;
        profile[field] = value;
    },

    setBinding(profileId, buttonId, binding) {
        const profile = this.profiles.find((p) => p.id === profileId);
        if (!profile) return;
        if (!profile.bindings) profile.bindings = {};
        profile.bindings[buttonId] = bindingToStorage(binding);
    },

    clearBinding(profileId, buttonId) {
        this.setBinding(profileId, buttonId, null);
        this.render();
    },

    resetToDefaults() {
        const map = this.getSystemMap();
        if (!map?.defaultProfiles) return;
        this.profiles = map.defaultProfiles.map((def) =>
            this.createProfile({
                name: def.name,
                port: def.port,
                deviceType: def.deviceType,
                bindings: { ...def.bindings },
            })
        );
        this.render();
        this.setStatus('Loaded default mappings (not saved yet).', 'warning');
    },

    async save() {
        try {
            const payload = {
                version: CONFIG_VERSION,
                systemId: this.systemId,
                profiles: this.profiles,
            };
            await idbSet(IDB_KEY, payload, 'gamepad_config');
            this.setStatus('Configuration saved.', 'success');
        } catch (e) {
            console.error(e);
            this.setStatus('Failed to save configuration.', 'danger');
        }
        if (window.opener?.updateLoadButtonState) {
            await window.opener.updateLoadButtonState();
        }
    },

    async exportAllSettings() {
        try {
            await this.save();
            const systemCount = await downloadAllGamepadSettingsExport();
            if (systemCount > 0) {
                this.setStatus(
                    `Exported gamepad settings for ${systemCount} system${systemCount === 1 ? '' : 's'}.`,
                    'success'
                );
            }
        } catch (e) {
            console.error(e);
            this.setStatus('Failed to export gamepad settings.', 'danger');
        }
    },

    async importAllSettings(event) {
        await handleGamepadSettingsImport(event);
    },

    async load() {
        try {
            const data = await idbGet(IDB_KEY, 'gamepad_config');
            if (data && data.version === CONFIG_VERSION && Array.isArray(data.profiles)) {
                this.profiles = data.profiles.map((p) => ({
                    ...this.createProfile(),
                    ...p,
                    bindings: { ...p.bindings },
                }));
                this.setStatus('Configuration loaded.', 'info');
            } else {
                const map = this.getSystemMap();
                this.profiles = (map?.defaultProfiles || []).map((def) =>
                    this.createProfile({
                        name: def.name,
                        port: def.port,
                        deviceType: def.deviceType,
                        bindings: { ...def.bindings },
                    })
                );
                this.setStatus('No saved config – showing defaults.', 'secondary');
            }
        } catch (e) {
            console.error(e);
            this.profiles = [];
            this.setStatus('Failed to load configuration.', 'danger');
        }
    },

    setStatus(msg, type = 'info') {
        const el = document.getElementById('statusMessage');
        if (!el) return;
        el.className = `alert alert-${type} py-2 small mb-0`;
        el.textContent = msg;
    },

    refreshGamepadList() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        this.connectedGamepads = Array.from(pads).filter((gp) => gp && gp.connected);
        document.querySelectorAll('.gamepad-select').forEach((sel) => {
            const current = sel.value;
            sel.innerHTML = this.connectedGamepads.length === 0
                ? '<option value="0">No gamepad connected</option>'
                : this.connectedGamepads.map((gp) =>
                    `<option value="${gp.index}">${gp.index}: ${gp.id.substring(0, 40)}</option>`
                ).join('');
            if (current) sel.value = current;
        });
    },

    render() {
        const container = document.getElementById('profilesContainer');
        const map = this.getSystemMap();
        if (!map) {
            container.innerHTML = '<p class="text-muted">Unknown system.</p>';
            return;
        }

        if (this.profiles.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <p>No profiles configured.</p>
                    <button class="btn btn-sm btn-outline-primary" onclick="GamepadConfig.addProfile()">Add Profile</button>
                </div>`;
            return;
        }

        const makePortOptions = (selected) => Array.from({ length: map.maxPorts }, (_, i) => i + 1)
            .map((n) => `<option value="${n}"${n === selected ? ' selected' : ''}>Port ${n}</option>`)
            .join('');

        container.innerHTML = this.profiles.map((profile) => {
            const bindingRows = map.buttons.map((btn) => {
                const binding = profile.bindings?.[btn.id] || null;
                const display = escapeHtml(formatBinding(binding));
                return `
                    <tr>
                        <td class="text-nowrap fw-semibold">${btn.label}</td>
                        <td>
                            <input type="text"
                                   class="form-control form-control-sm binding-input font-monospace"
                                   readonly
                                   value="${display}"
                                   data-profile="${profile.id}"
                                   data-button="${btn.id}"
                                   placeholder="Click to bind…"
                                   title="Click then press a keyboard key or gamepad button">
                        </td>
                        <td class="text-end">
                            <button type="button"
                                    class="btn btn-xs btn-outline-danger py-0 px-1"
                                    onclick="GamepadConfig.clearBinding('${profile.id}', '${btn.id}')"
                                    title="Clear binding">×</button>
                        </td>
                    </tr>`;
            }).join('');

            const gamepadSection = profile.deviceType === 'gamepad' ? `
                <div class="col-12 col-md-4">
                    <label class="form-label small text-secondary mb-1">Gamepad Device</label>
                    <select class="form-select form-select-sm gamepad-select"
                            onchange="GamepadConfig.updateProfile('${profile.id}', 'gamepadIndex', parseInt(this.value, 10)); GamepadConfig.render()">
                        ${this.connectedGamepads.length === 0
                            ? '<option value="0">No gamepad connected</option>'
                            : this.connectedGamepads.map((gp) =>
                                `<option value="${gp.index}" ${profile.gamepadIndex === gp.index ? 'selected' : ''}>
                                    ${gp.index}: ${gp.id.substring(0, 36)}
                                </option>`
                            ).join('')}
                    </select>
                </div>` : '';

            return `
                <div class="card bg-black bg-opacity-20 border-secondary mb-3" data-profile-id="${profile.id}">
                    <div class="card-header border-secondary d-flex flex-wrap align-items-center justify-content-between gap-2 py-2">
                        <input type="text"
                               class="form-control form-control-sm bg-dark text-light border-secondary"
                               style="max-width: 220px;"
                               value="${escapeHtml(profile.name)}"
                               onchange="GamepadConfig.updateProfile('${profile.id}', 'name', this.value)">
                        <button type="button"
                                class="btn btn-sm btn-outline-danger"
                                onclick="GamepadConfig.removeProfile('${profile.id}')">Remove</button>
                    </div>
                    <div class="card-body">
                        <div class="row g-2 mb-3">
                            <div class="col-6 col-md-3">
                                <label class="form-label small text-secondary mb-1">Player Port</label>
                                <select class="form-select form-select-sm"
                                        onchange="GamepadConfig.updateProfile('${profile.id}', 'port', parseInt(this.value, 10))">
                                    ${makePortOptions(profile.port)}
                                </select>
                            </div>
                            <div class="col-6 col-md-3">
                                <label class="form-label small text-secondary mb-1">Input Device</label>
                                <select class="form-select form-select-sm"
                                        onchange="GamepadConfig.updateProfile('${profile.id}', 'deviceType', this.value); GamepadConfig.render()">
                                    <option value="keyboard" ${profile.deviceType === 'keyboard' ? 'selected' : ''}>Keyboard</option>
                                    <option value="gamepad" ${profile.deviceType === 'gamepad' ? 'selected' : ''}>Gamepad</option>
                                </select>
                            </div>
                            ${gamepadSection}
                        </div>
                        <div class="table-responsive">
                            <table class="table table-sm table-dark table-borderless mb-0 align-middle">
                                <thead>
                                    <tr class="text-secondary small">
                                        <th style="width: 100px;">Button</th>
                                        <th>Binding</th>
                                        <th style="width: 40px;"></th>
                                    </tr>
                                </thead>
                                <tbody>${bindingRows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
        }).join('');

        container.querySelectorAll('.binding-input').forEach((input) => {
            input.addEventListener('click', () => {
                const profileId = input.dataset.profile;
                const buttonId = input.dataset.button;
                BindingCapture.start(
                    input,
                    (binding) => {
                        GamepadConfig.setBinding(profileId, buttonId, binding);
                        input.value = formatBinding(binding);
                    },
                    () => { /* cancelled */ }
                );
            });
        });
    },
};

document.addEventListener('DOMContentLoaded', () => GamepadConfig.init());